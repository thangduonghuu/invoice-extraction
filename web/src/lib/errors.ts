import type { ErrorCode } from "@invoice-extractor/schema";
import type { InvalidFileReason } from "./validateFile";

interface CatalogEntry {
  title: string;
  message: string;
  retryable: boolean;
}

/** Message catalog keyed by code. Every failure path goes through toUserError() below - never "An error occurred". */
const CATALOG: Record<ErrorCode, CatalogEntry> = {
  NOT_PDF: { title: "Not a PDF", message: "This file isn't a PDF. Please upload the invoice as a PDF.", retryable: true },
  NOT_A_PDF: { title: "Not a PDF", message: "This file isn't a PDF. Please upload the invoice as a PDF.", retryable: true },
  TOO_LARGE: { title: "File too large", message: "This file is over 10 MB. Try a smaller export of the document.", retryable: true },
  EMPTY_FILE: { title: "Empty file", message: "This file is empty, so there's nothing to read.", retryable: true },
  UPLOAD_LINK_EXPIRED: {
    title: "Upload link expired",
    message: "The upload link expired before the file finished sending. Please try again.",
    retryable: true,
  },
  OFFLINE: { title: "You're offline", message: "You appear to be offline. Nothing was uploaded.", retryable: true },
  PDF_ENCRYPTED: { title: "Password protected", message: "This PDF is password-protected, so we can't open it.", retryable: false },
  PDF_CORRUPT: {
    title: "Corrupt PDF",
    message: "This PDF couldn't be opened - it looks like it might be corrupted.",
    retryable: false,
  },
  PROCESSING_FAILED: {
    title: "Couldn't finish processing",
    message: "We couldn't finish reading this document after a few tries.",
    retryable: true,
  },
  SLOW: {
    title: "Still working",
    message: "Still reading your document - this one is taking longer than usual.",
    retryable: false,
  },
  RESPONSE_SHAPE_INVALID: {
    title: "Unexpected response",
    message: "We got a response we didn't expect.",
    retryable: false,
  },
  UNKNOWN: { title: "Something went wrong", message: "Something went wrong on our end - it isn't your file.", retryable: true },
};

export interface UserFacingError {
  code: ErrorCode;
  title: string;
  message: string;
  retryable: boolean;
  detail?: string;
  jobId?: string;
}

export function toUserError(code: ErrorCode, opts: { detail?: string; jobId?: string } = {}): UserFacingError {
  const entry = CATALOG[code] ?? CATALOG.UNKNOWN;
  return { code, title: entry.title, message: entry.message, retryable: entry.retryable, detail: opts.detail, jobId: opts.jobId };
}

const REASON_TO_CODE: Record<InvalidFileReason, ErrorCode> = {
  not_pdf: "NOT_PDF",
  too_large: "TOO_LARGE",
  empty: "EMPTY_FILE",
};

export function invalidFileError(reason: InvalidFileReason): UserFacingError {
  return toUserError(REASON_TO_CODE[reason]);
}
