import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { extract, FileLevelError } from "@invoice-extractor/engine";
import type { SQSEvent, SQSHandler } from "aws-lambda";
import { transitionStatus, writeExtractionResult } from "../jobsTable.js";
import { parseS3EventMessage } from "../s3Event.js";

const s3 = new S3Client({});

async function streamToUint8Array(body: unknown): Promise<Uint8Array> {
  const bytes = await (body as { transformToByteArray(): Promise<Uint8Array> }).transformToByteArray();
  return bytes;
}

/**
 * SQS batchSize=1, so this runs once per uploaded file. Conditional status
 * updates mean a redelivered message can't reprocess (or clobber) a job
 * that already moved past AWAITING_UPLOAD.
 */
export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const { bucket, key, jobId } = parseS3EventMessage(record.body);

    const moved = await transitionStatus(jobId, "AWAITING_UPLOAD", "PROCESSING");
    if (!moved) continue; // already processed (or being processed) by an earlier delivery

    const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await streamToUint8Array(object.Body);

    try {
      const result = await extract(bytes, jobId);
      await writeExtractionResult(jobId, result);
      await transitionStatus(jobId, "PROCESSING", "COMPLETED", { pageCount: result.pages.length });
    } catch (err) {
      if (err instanceof FileLevelError) {
        await transitionStatus(jobId, "PROCESSING", "FAILED", { errorCode: err.code, errorDetail: err.message });
        continue;
      }
      // Unexpected bug, not a handled file-level failure - let SQS retry (maxReceiveCount=3) then DLQ.
      throw err;
    }
  }
};
