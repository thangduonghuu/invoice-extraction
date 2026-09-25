import type { RuleCode } from "@invoice-extractor/schema";

/** Short human titles for known rule codes; the server's own message/action is always shown alongside. */
const RULE_TITLES: Partial<Record<RuleCode, string>> = {
  NO_TEXT_LAYER: "Scanned page",
  PAGE_PROCESSING_ERROR: "Page couldn't be read",
  TABLE_HEADER_NOT_FOUND: "No table found",
  ROW_UNPARSEABLE: "Unreadable line",
  AMOUNT_NOT_STATED: "No amount stated",
  UNIT_FROM_PRICE_SUFFIX: "Unit inferred from price",
  WEIGHT_BASIS_AMBIGUOUS: "Weight not converted",
  SUBTOTAL_MISMATCH: "Subtotal doesn't add up",
  GST_MISMATCH: "GST doesn't add up",
  TOTAL_MISMATCH: "Total doesn't add up",
  CONFLICTING_STATEMENTS: "Conflicting figures",
  TOTAL_BASIS_UNCLEAR: "Unclear how the total was calculated",
  NON_BILLABLE_SECTION: "Not a billable section",
  NOTHING_TO_RECONCILE: "Nothing to check totals against",
};

export function ruleTitle(code: RuleCode): string {
  return RULE_TITLES[code] ?? code;
}
