import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { ulid } from "ulid";
import { CreateJobRequestSchema, CreateJobResponseSchema } from "../../../shared/index.js";
import { createJobMeta } from "../../shared/jobsTable.js";

const BUCKET_NAME = process.env.BUCKET_NAME ?? "";
const UPLOAD_URL_TTL_SECONDS = 300;
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const s3 = new S3Client({});

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  let payload: unknown;
  try {
    payload = JSON.parse(event.body ?? "{}");
  } catch {
    return jsonResponse(400, { error: "INVALID_REQUEST", message: "Request body was not valid JSON." });
  }

  const parsed = CreateJobRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonResponse(400, { error: "INVALID_REQUEST", message: parsed.error.message });
  }
  const { fileName, size, contentType } = parsed.data;

  if (size > MAX_SIZE_BYTES) {
    return jsonResponse(400, { error: "TOO_LARGE", message: "File exceeds the 10 MB limit." });
  }

  const jobId = ulid();
  const s3Key = `uploads/${jobId}.pdf`;

  await createJobMeta(jobId, fileName, s3Key);

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );

  const response = CreateJobResponseSchema.parse({ jobId, uploadUrl });
  return jsonResponse(200, response);
}
