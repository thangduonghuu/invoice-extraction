import type { Refusal, RuleCode } from "@invoice-extractor/schema";

type RefusalScope = "file" | "page" | "row" | "field" | "doc";

interface RefusalInput {
  code: RuleCode;
  scope: RefusalScope;
  page?: number;
  message: string;
  action: string;
  detail?: string;
}

function refusal(input: RefusalInput): Refusal {
  return input;
}

export function noTextLayerRefusal(page: number): Refusal {
  return refusal({
    code: "NO_TEXT_LAYER",
    scope: "page",
    page,
    message: `Page ${page} looks like a scanned image, so we can't read its numbers reliably.`,
    action: `Check the lines on page ${page} against the paper copy.`,
  });
}

export function pageProcessingErrorRefusal(page: number, detail: string): Refusal {
  return refusal({
    code: "PAGE_PROCESSING_ERROR",
    scope: "page",
    page,
    message: `Something went wrong while reading page ${page}, so we skipped it rather than guess at its contents.`,
    action: `Check page ${page} against the paper copy, or re-upload the document.`,
    detail,
  });
}

export function tableHeaderNotFoundRefusal(page: number): Refusal {
  return refusal({
    code: "TABLE_HEADER_NOT_FOUND",
    scope: "page",
    page,
    message: `We couldn't find a line-item table on page ${page}, so nothing was read from it.`,
    action: `Check page ${page} against the paper copy.`,
  });
}

export function rowUnparseableRefusal(page: number, rawLine: string): Refusal {
  return refusal({
    code: "ROW_UNPARSEABLE",
    scope: "row",
    page,
    message: `A line on page ${page} didn't match the expected format, so we left it out rather than guess at its numbers.`,
    action: `Check this line on page ${page} against the paper copy.`,
    detail: rawLine,
  });
}

export function totalBasisUnclearRefusal(): Refusal {
  return refusal({
    code: "TOTAL_BASIS_UNCLEAR",
    scope: "doc",
    message: "This document states a total but has no GST line, so we can't confirm how the total was worked out.",
    action: "Confirm the total with the supplier if GST treatment matters to you.",
  });
}

export function nothingToReconcileRefusal(): Refusal {
  return refusal({
    code: "NOTHING_TO_RECONCILE",
    scope: "doc",
    message: "This document doesn't state a subtotal or total, so there's nothing to check the line items against.",
    action: "No action needed - just know the numbers haven't been cross-checked against a total.",
  });
}
