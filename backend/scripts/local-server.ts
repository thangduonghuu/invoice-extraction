import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extract, FileLevelError } from "../engine/index.js";
import { CreateJobRequestSchema, CreateJobResponseSchema, JobRecordSchema, type JobRecord } from "../../shared/index.js";
import { ulid } from "ulid";

/**
 * Local mode: the same three-call HTTP contract (POST /jobs, PUT the
 * uploadUrl, GET /jobs/{id}) as the deployed API, but everything runs
 * synchronously in one process against an in-memory store. No AWS account
 * needed - this is what `npm run dev:api` runs so a reviewer can try the
 * whole thing without deploying.
 */

const PORT = Number(process.env.PORT ?? 8787);
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

const jobs = new Map<string, JobRecord>();

function withCors(res: ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  withCors(res);
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function handleCreateJob(req: IncomingMessage, res: ServerResponse) {
  const raw = await readBody(req);
  let payload: unknown;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return sendJson(res, 400, { error: "INVALID_REQUEST", message: "Request body was not valid JSON." });
  }

  const parsed = CreateJobRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return sendJson(res, 400, { error: "INVALID_REQUEST", message: parsed.error.message });
  }
  if (parsed.data.size > MAX_SIZE_BYTES) {
    return sendJson(res, 400, { error: "TOO_LARGE", message: "File exceeds the 10 MB limit." });
  }

  const jobId = ulid();
  const now = new Date().toISOString();
  jobs.set(jobId, { jobId, status: "AWAITING_UPLOAD", fileName: parsed.data.fileName, createdAt: now, updatedAt: now });

  const response = CreateJobResponseSchema.parse({
    jobId,
    uploadUrl: `http://localhost:${PORT}/upload/${jobId}`,
  });
  sendJson(res, 200, response);
}

async function handleUpload(req: IncomingMessage, res: ServerResponse, jobId: string) {
  const job = jobs.get(jobId);
  if (!job) return sendJson(res, 404, { error: "NOT_FOUND", message: `No job found with id ${jobId}.` });

  const bytes = await readBody(req);
  const now = () => new Date().toISOString();
  jobs.set(jobId, { ...job, status: "PROCESSING", updatedAt: now() });

  try {
    const result = await extract(new Uint8Array(bytes), jobId);
    jobs.set(jobId, { ...job, status: "COMPLETED", updatedAt: now(), result });
  } catch (err) {
    if (err instanceof FileLevelError) {
      jobs.set(jobId, { ...job, status: "FAILED", updatedAt: now(), errorCode: err.code, errorDetail: err.message });
    } else {
      const detail = err instanceof Error ? err.message : String(err);
      jobs.set(jobId, { ...job, status: "FAILED", updatedAt: now(), errorCode: "PROCESSING_FAILED", errorDetail: detail });
    }
  }

  sendJson(res, 200, {});
}

function handleGetJob(res: ServerResponse, jobId: string) {
  const job = jobs.get(jobId);
  if (!job) return sendJson(res, 404, { error: "NOT_FOUND", message: `No job found with id ${jobId}.` });
  sendJson(res, 200, JobRecordSchema.parse(job));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    withCors(res);
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "POST" && url.pathname === "/jobs") {
    return void handleCreateJob(req, res).catch((err) => sendJson(res, 500, { error: "INTERNAL", message: String(err) }));
  }

  const uploadMatch = /^\/upload\/([^/]+)$/.exec(url.pathname);
  if (req.method === "PUT" && uploadMatch?.[1]) {
    return void handleUpload(req, res, uploadMatch[1]).catch((err) => sendJson(res, 500, { error: "INTERNAL", message: String(err) }));
  }

  const jobMatch = /^\/jobs\/([^/]+)$/.exec(url.pathname);
  if (req.method === "GET" && jobMatch?.[1]) {
    return handleGetJob(res, jobMatch[1]);
  }

  sendJson(res, 404, { error: "NOT_FOUND", message: `No route for ${req.method} ${url.pathname}` });
});

server.listen(PORT, () => {
  console.log(`Local API (no AWS) listening on http://localhost:${PORT}`);
});
