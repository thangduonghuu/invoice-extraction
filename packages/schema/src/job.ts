import { z } from "zod";
import { ERROR_CODES, JOB_STATUSES } from "./codes.js";
import { ExtractionResultSchema } from "./extraction.js";

export const JobStatusSchema = z.enum(JOB_STATUSES);
export const ErrorCodeSchema = z.enum(ERROR_CODES);

export const CreateJobRequestSchema = z.object({
  fileName: z.string().min(1),
  size: z.number().int().positive(),
  contentType: z.literal("application/pdf"),
});
export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;

export const CreateJobResponseSchema = z.object({
  jobId: z.string().min(1),
  uploadUrl: z.string().url(),
});
export type CreateJobResponse = z.infer<typeof CreateJobResponseSchema>;

/**
 * GET /jobs/{id} response. `result` is present only once status is
 * COMPLETED; `errorCode`/`errorDetail` only once status is FAILED.
 * Job-level FAILED is reserved for "could not process the file at all" —
 * refusals and conflicts inside a completed result are not failures.
 */
export const JobRecordSchema = z.object({
  jobId: z.string().min(1),
  status: JobStatusSchema,
  fileName: z.string().optional(),
  errorCode: ErrorCodeSchema.optional(),
  errorDetail: z.string().optional(),
  result: ExtractionResultSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobRecord = z.infer<typeof JobRecordSchema>;
