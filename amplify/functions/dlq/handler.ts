import type { SQSEvent, SQSHandler } from "aws-lambda";
import { forceFailIfNotTerminal } from "../../shared/jobsTable.js";
import { parseS3EventMessage } from "../../shared/s3Event.js";

/**
 * A job must never stay "processing" forever. Once the extract function has
 * exhausted its retries (maxReceiveCount=3), SQS moves the message here and
 * we mark the job FAILED so the client stops polling.
 */
export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    try {
      const { jobId } = parseS3EventMessage(record.body);
      await forceFailIfNotTerminal(jobId, "PROCESSING_FAILED", "The document could not be processed after multiple attempts.");
    } catch (err) {
      // Can't even recover a jobId from this message - nothing more we can do for it.
      console.error("dlq handler could not process message", err);
    }
  }
};
