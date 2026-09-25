import { ConditionalCheckFailedException, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import type { ErrorCode, ExtractionResult, JobRecord, JobStatus } from "@invoice-extractor/schema";

const TABLE_NAME = process.env.TABLE_NAME ?? "Jobs";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

function jobKey(jobId: string): { PK: string; SK: "META" } {
  return { PK: `JOB#${jobId}`, SK: "META" };
}

function pageKey(jobId: string, page: number) {
  return { PK: `JOB#${jobId}`, SK: `PAGE#${String(page).padStart(4, "0")}` };
}

function docKey(jobId: string) {
  return { PK: `JOB#${jobId}`, SK: "DOC" };
}

interface MetaItem {
  PK: string;
  SK: "META";
  status: JobStatus;
  fileName: string;
  s3Key: string;
  sha256?: string;
  pageCount?: number;
  errorCode?: ErrorCode;
  errorDetail?: string;
  createdAt: string;
  updatedAt: string;
  ttl: number;
}

export async function createJobMeta(jobId: string, fileName: string, s3Key: string): Promise<void> {
  const now = new Date().toISOString();
  const item: MetaItem = {
    ...jobKey(jobId),
    status: "AWAITING_UPLOAD",
    fileName,
    s3Key,
    createdAt: now,
    updatedAt: now,
    ttl: Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}

/**
 * Status transitions use a ConditionExpression on the current status so an
 * SQS retry (or an out-of-order DLQ write) can never overwrite a job that
 * already reached a terminal state.
 */
export async function transitionStatus(
  jobId: string,
  from: JobStatus,
  to: JobStatus,
  extra: Partial<Pick<MetaItem, "errorCode" | "errorDetail" | "pageCount" | "sha256">> = {},
): Promise<boolean> {
  const names: Record<string, string> = { "#status": "status", "#updatedAt": "updatedAt" };
  const values: Record<string, unknown> = { ":from": from, ":to": to, ":now": new Date().toISOString() };
  const sets = ["#status = :to", "#updatedAt = :now"];

  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) continue;
    names[`#${key}`] = key;
    values[`:${key}`] = value;
    sets.push(`#${key} = :${key}`);
  }

  try {
    await client.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: jobKey(jobId),
        ConditionExpression: "#status = :from",
        UpdateExpression: `SET ${sets.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );
    return true;
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return false;
    throw err;
  }
}

/**
 * Used by the DLQ handler: a job must never stay "processing" forever, but
 * we don't know which state it died in, so this only refuses to clobber a
 * job that already reached a terminal state (avoids a race with a
 * late-arriving successful write).
 */
export async function forceFailIfNotTerminal(jobId: string, errorCode: ErrorCode, errorDetail: string): Promise<void> {
  try {
    await client.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: jobKey(jobId),
        ConditionExpression: "#status <> :completed AND #status <> :failed",
        UpdateExpression: "SET #status = :failed, #errorCode = :errorCode, #errorDetail = :errorDetail, #updatedAt = :now",
        ExpressionAttributeNames: {
          "#status": "status",
          "#errorCode": "errorCode",
          "#errorDetail": "errorDetail",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":completed": "COMPLETED",
          ":failed": "FAILED",
          ":errorCode": errorCode,
          ":errorDetail": errorDetail,
          ":now": new Date().toISOString(),
        },
      }),
    );
  } catch (err) {
    if (err instanceof ConditionalCheckFailedException) return;
    throw err;
  }
}

/** Fans an ExtractionResult out into one PAGE# item per page plus one DOC item, per the single-table design. */
export async function writeExtractionResult(jobId: string, result: ExtractionResult): Promise<void> {
  const writes: Promise<unknown>[] = [];

  for (const page of result.pages) {
    const pageItems = result.items.filter((item) => item.page === page.page);
    const pageRefusals = result.refusals.filter((r) => r.scope !== "doc" && r.page === page.page);
    writes.push(
      client.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            ...pageKey(jobId, page.page),
            page: page.page,
            pageStatus: page.status,
            method: page.method,
            sectionTitle: page.sectionTitle,
            items: pageItems,
            refusals: pageRefusals,
          },
        }),
      ),
    );
  }

  const docRefusals = result.refusals.filter((r) => r.scope === "doc" || r.scope === "file");
  writes.push(
    client.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { ...docKey(jobId), conflicts: result.conflicts, refusals: docRefusals },
      }),
    ),
  );

  await Promise.all(writes);
}

interface PageItem {
  SK: string;
  page: number;
  pageStatus: "ok" | "refused";
  method: string | null;
  sectionTitle: string | null;
  items: ExtractionResult["items"];
  refusals: ExtractionResult["refusals"];
}

interface DocItem {
  SK: "DOC";
  conflicts: ExtractionResult["conflicts"];
  refusals: ExtractionResult["refusals"];
}

/** Pure reassembly of the single Query's items back into a JobRecord. No AWS calls - easy to unit test. */
export function assembleJobRecord(jobId: string, dynamoItems: Array<Record<string, unknown>>): JobRecord {
  const meta = dynamoItems.find((i) => i.SK === "META") as unknown as MetaItem | undefined;
  if (!meta) {
    throw new Error(`No META item found for job ${jobId}`);
  }

  const base: JobRecord = {
    jobId,
    status: meta.status,
    fileName: meta.fileName,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  };

  if (meta.status === "FAILED") {
    return { ...base, errorCode: meta.errorCode, errorDetail: meta.errorDetail };
  }

  if (meta.status !== "COMPLETED") {
    return base;
  }

  const pageItems = dynamoItems
    .filter((i) => typeof i.SK === "string" && i.SK.startsWith("PAGE#"))
    .map((i) => i as unknown as PageItem)
    .sort((a, b) => a.page - b.page);
  const docItem = dynamoItems.find((i) => i.SK === "DOC") as unknown as DocItem | undefined;

  const result: ExtractionResult = {
    jobId,
    status: "completed",
    outcome: "clean",
    pages: pageItems.map((p) => ({ page: p.page, status: p.pageStatus, method: p.method as never, sectionTitle: p.sectionTitle })),
    items: pageItems.flatMap((p) => p.items),
    refusals: [...pageItems.flatMap((p) => p.refusals), ...(docItem?.refusals ?? [])],
    conflicts: docItem?.conflicts ?? [],
  };
  const hasIssues = result.refusals.length > 0 || result.conflicts.length > 0 || result.items.some((i) => i.status !== "ok");
  result.outcome = hasIssues ? "has_issues" : "clean";

  return { ...base, result };
}

export async function getJobRecord(jobId: string): Promise<JobRecord | undefined> {
  const res = await client.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `JOB#${jobId}` },
    }),
  );
  if (!res.Items || res.Items.length === 0) return undefined;
  return assembleJobRecord(jobId, res.Items);
}
