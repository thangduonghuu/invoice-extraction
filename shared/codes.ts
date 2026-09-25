/** Rule engine codes — every refusal, conflict and warning carries one of these. Section 4 of PROMPT.md. */
export const RULE_CODES = [
  "NO_TEXT_LAYER",
  "PAGE_PROCESSING_ERROR",
  "TABLE_HEADER_NOT_FOUND",
  "ROW_UNPARSEABLE",
  "LINE_MATH_MISMATCH",
  "AMOUNT_NOT_STATED",
  "UNIT_FROM_PRICE_SUFFIX",
  "WEIGHT_BASIS_AMBIGUOUS",
  "SUBTOTAL_MISMATCH",
  "GST_MISMATCH",
  "TOTAL_MISMATCH",
  "CONFLICTING_STATEMENTS",
  "TOTAL_BASIS_UNCLEAR",
  "NON_BILLABLE_SECTION",
  "NOTHING_TO_RECONCILE",
] as const;
export type RuleCode = (typeof RULE_CODES)[number];

/**
 * System / job-level error codes. Used for:
 *  - the file-level failures that fail a whole job (NOT_A_PDF, PDF_ENCRYPTED, PDF_CORRUPT, PROCESSING_FAILED)
 *  - the frontend's pre-upload and transport failures (section 7's toUserError table)
 * One shared enum so the server's job.errorCode and the frontend's UploadState.failed.code
 * are always talking about the same thing.
 */
export const ERROR_CODES = [
  "NOT_A_PDF",
  "PDF_ENCRYPTED",
  "PDF_CORRUPT",
  "PROCESSING_FAILED",
  "NOT_PDF",
  "TOO_LARGE",
  "EMPTY_FILE",
  "UPLOAD_LINK_EXPIRED",
  "OFFLINE",
  "SLOW",
  "RESPONSE_SHAPE_INVALID",
  "UNKNOWN",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const JOB_STATUSES = ["AWAITING_UPLOAD", "PROCESSING", "COMPLETED", "FAILED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
