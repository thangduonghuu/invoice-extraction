import { JobRecordSchema } from "@invoice-extractor/schema";
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { getJobRecord } from "../jobsTable.js";

function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const jobId = event.pathParameters?.id;
  if (!jobId) {
    return jsonResponse(400, { error: "INVALID_REQUEST", message: "Missing job id." });
  }

  const record = await getJobRecord(jobId);
  if (!record) {
    return jsonResponse(404, { error: "NOT_FOUND", message: `No job found with id ${jobId}.` });
  }

  // Validated against the shared schema before it ever reaches the client.
  const validated = JobRecordSchema.parse(record);
  return jsonResponse(200, validated);
}
