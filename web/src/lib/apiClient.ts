import { CreateJobResponseSchema, JobRecordSchema, type CreateJobResponse, type ErrorCode, type JobRecord } from "@invoice-extractor/schema";
import { API_BASE_URL } from "./config";

export class AppError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && "onLine" in navigator && !navigator.onLine;
}

export async function createJob(file: File): Promise<CreateJobResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName: file.name, size: file.size, contentType: "application/pdf" }),
    });
  } catch {
    throw new AppError(isOffline() ? "OFFLINE" : "UNKNOWN", "Could not reach the server to start the upload.");
  }

  if (!res.ok) {
    throw new AppError("UNKNOWN", `The server rejected the upload request (status ${res.status}).`);
  }

  const parsed = CreateJobResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new AppError("RESPONSE_SHAPE_INVALID", parsed.error.message);
  }
  return parsed.data;
}

export function uploadFile(uploadUrl: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("content-type", "application/pdf");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      if (xhr.status === 403) return reject(new AppError("UPLOAD_LINK_EXPIRED", "The upload link had expired (403)."));
      reject(new AppError("UNKNOWN", `Upload failed with status ${xhr.status}.`));
    };
    xhr.onerror = () => reject(new AppError(isOffline() ? "OFFLINE" : "UNKNOWN", "The upload failed to send."));

    xhr.send(file);
  });
}

export async function getJob(jobId: string): Promise<JobRecord> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/jobs/${jobId}`);
  } catch {
    throw new AppError(isOffline() ? "OFFLINE" : "UNKNOWN", "Could not reach the server while checking job status.");
  }

  if (!res.ok) {
    throw new AppError("UNKNOWN", `The server returned an unexpected status (${res.status}) for this job.`);
  }

  const parsed = JobRecordSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new AppError("RESPONSE_SHAPE_INVALID", parsed.error.message);
  }
  return parsed.data;
}
