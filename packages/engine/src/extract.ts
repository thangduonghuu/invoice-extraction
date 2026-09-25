import { ExtractionResultSchema, type ExtractionResult, type Item, type PageResult, type Refusal } from "@invoice-extractor/schema";
import { loadDocument } from "./document.js";
import { captureFacts, mergeFacts } from "./facts.js";
import { findSectionTitle, findHeaderLine, isNonBillableSection } from "./header.js";
import { countNonWhitespaceChars, getPageTextItems, groupLines } from "./lines.js";
import { noTextLayerRefusal, pageProcessingErrorRefusal, tableHeaderNotFoundRefusal } from "./refusals.js";
import { findConflictingStatements, reconcileTotals } from "./rules.js";
import { extractRows } from "./rows.js";
import type { CountStatement, DocFacts, PdfDocumentLike } from "./types.js";

const TEXT_LAYER_MIN_CHARS = 20;

interface PageProcessResult {
  pageResult: PageResult;
  items: Item[];
  refusals: Refusal[];
  facts: Partial<DocFacts>;
  countStatements: CountStatement[];
}

async function processPage(doc: PdfDocumentLike, pageNumber: number): Promise<PageProcessResult> {
  const rawItems = await getPageTextItems(doc, pageNumber);

  if (countNonWhitespaceChars(rawItems) < TEXT_LAYER_MIN_CHARS) {
    return {
      pageResult: { page: pageNumber, status: "refused", method: null, sectionTitle: null },
      items: [],
      refusals: [noTextLayerRefusal(pageNumber)],
      facts: {},
      countStatements: [],
    };
  }

  const lines = groupLines(rawItems);
  const { facts, countStatements } = captureFacts(lines, pageNumber);
  const header = findHeaderLine(lines);

  if (!header) {
    return {
      pageResult: { page: pageNumber, status: "refused", method: "text_layer", sectionTitle: null },
      items: [],
      refusals: [tableHeaderNotFoundRefusal(pageNumber)],
      facts,
      countStatements,
    };
  }

  const sectionTitle = findSectionTitle(lines);
  const { items: rowItems, refusals } = extractRows(lines, header.lineIndex, header.columns, pageNumber);

  const nonBillable = isNonBillableSection(sectionTitle);
  const items = nonBillable
    ? rowItems.map((item) => ({
        ...item,
        status: item.status === "conflict" ? item.status : ("needs_review" as const),
        flags: item.flags.includes("NON_BILLABLE_SECTION") ? item.flags : [...item.flags, "NON_BILLABLE_SECTION" as const],
      }))
    : rowItems;

  return {
    pageResult: { page: pageNumber, status: "ok", method: "text_layer", sectionTitle },
    items,
    refusals,
    facts,
    countStatements,
  };
}

/**
 * Pure extraction: PDF bytes in, a schema-validated ExtractionResult out.
 * No AWS. File-level problems (not a PDF, encrypted, corrupt) throw
 * FileLevelError - callers translate that into a failed job. Every other
 * problem is contained to its own page/row and shows up as a refusal or
 * conflict inside a normal, successful result.
 */
export async function extract(pdfBytes: Uint8Array, jobId: string): Promise<ExtractionResult> {
  const doc = await loadDocument(pdfBytes);

  const pages: PageResult[] = [];
  const items: Item[] = [];
  const refusals: Refusal[] = [];
  const docFacts: DocFacts = {};
  const countStatements: CountStatement[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    try {
      const result = await processPage(doc, pageNumber);
      pages.push(result.pageResult);
      items.push(...result.items);
      refusals.push(...result.refusals);
      countStatements.push(...result.countStatements);
      mergeFacts(docFacts, result.facts);
    } catch (err) {
      pages.push({ page: pageNumber, status: "refused", method: null, sectionTitle: null });
      const detail = err instanceof Error ? err.message : String(err);
      refusals.push(pageProcessingErrorRefusal(pageNumber, detail));
    }
  }

  const { conflicts: reconciliationConflicts, docRefusals } = reconcileTotals(docFacts, items);
  const conflicts = [...reconciliationConflicts, ...findConflictingStatements(countStatements)];
  refusals.push(...docRefusals);

  const hasIssues = refusals.length > 0 || conflicts.length > 0 || items.some((item) => item.status !== "ok");

  const result: ExtractionResult = {
    jobId,
    status: "completed",
    outcome: hasIssues ? "has_issues" : "clean",
    pages,
    items,
    refusals,
    conflicts,
  };

  return ExtractionResultSchema.parse(result);
}
