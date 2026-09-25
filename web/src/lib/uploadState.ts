import type { ExtractionResult } from "@invoice-extractor/schema";
import type { UserFacingError } from "./errors";

export type UploadState =
  | { kind: "idle" }
  | { kind: "invalid_file"; reason: "not_pdf" | "too_large" | "empty" }
  | { kind: "creating" }
  | { kind: "uploading"; progress: number }
  | { kind: "processing"; jobId: string; since: number }
  | { kind: "done"; result: ExtractionResult }
  | ({ kind: "failed" } & UserFacingError);
