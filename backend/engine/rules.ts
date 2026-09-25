import type { Conflict, Item, Refusal } from "../../shared/index.js";
import { nothingToReconcileRefusal, totalBasisUnclearRefusal } from "./refusals.js";
import type { CountStatement, DocFacts } from "./types.js";

const GST_RATE = 0.15;
/** Rounding a whole-dollar subtotal x 15% can land a cent either side depending on rounding mode. */
const GST_TOLERANCE_CENTS = 1;

function centsToPlain(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${dollars}.${remainder}`;
}

function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-US");
  const remainder = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars}.${remainder}`;
}

interface ReconciliationResult {
  conflicts: Conflict[];
  docRefusals: Refusal[];
}

/**
 * Doc-level reconciliation across the labelled Subtotal/GST/Total facts and
 * the items actually read. Every comparison here is "for checking only" -
 * none of these derived sums are ever written back into an item.
 */
export function reconcileTotals(facts: DocFacts, items: Item[]): ReconciliationResult {
  const conflicts: Conflict[] = [];
  const docRefusals: Refusal[] = [];

  if (!facts.subtotal && !facts.total) {
    docRefusals.push(nothingToReconcileRefusal());
    return { conflicts, docRefusals };
  }

  if (facts.subtotal) {
    const pricedItems = items.filter((item) => item.amountCents !== null);
    const summed = pricedItems.reduce((sum, item) => sum + (item.amountCents ?? 0), 0);
    if (summed !== facts.subtotal.valueCents) {
      conflicts.push({
        code: "SUBTOTAL_MISMATCH",
        evidenceRefs: ["subtotal"],
        message: `The line items add up to ${formatCents(summed)} but the stated subtotal is ${formatCents(facts.subtotal.valueCents)}.`,
        derived: { value: centsToPlain(summed), inputs: pricedItems.map((item) => item.id) },
      });
    }
  }

  if (facts.subtotal && facts.gst) {
    const expectedGst = Math.round(facts.subtotal.valueCents * GST_RATE);
    if (Math.abs(expectedGst - facts.gst.valueCents) > GST_TOLERANCE_CENTS) {
      conflicts.push({
        code: "GST_MISMATCH",
        evidenceRefs: ["subtotal", "gst"],
        message: `The GST amount (${formatCents(facts.gst.valueCents)}) doesn't match 15% of the subtotal (${formatCents(facts.subtotal.valueCents)}).`,
        derived: { value: centsToPlain(expectedGst), inputs: ["subtotal"] },
      });
    }
  }

  if (facts.subtotal && facts.gst && facts.total) {
    const expectedTotal = facts.subtotal.valueCents + facts.gst.valueCents;
    if (expectedTotal !== facts.total.valueCents) {
      conflicts.push({
        code: "TOTAL_MISMATCH",
        evidenceRefs: ["subtotal", "gst", "total"],
        message: `The invoice total (${formatCents(facts.total.valueCents)}) doesn't equal the subtotal (${formatCents(facts.subtotal.valueCents)}) plus GST (${formatCents(facts.gst.valueCents)}).`,
        derived: { value: centsToPlain(expectedTotal), inputs: ["subtotal", "gst"] },
      });
    }
  } else if (facts.total && !facts.gst) {
    docRefusals.push(totalBasisUnclearRefusal());
  }

  return { conflicts, docRefusals };
}

/** Same fact stated twice with different values (e.g. cartons dispatched vs picked) - flag both, pick neither. */
export function findConflictingStatements(statements: CountStatement[]): Conflict[] {
  const byKey = new Map<string, CountStatement[]>();
  for (const statement of statements) {
    const list = byKey.get(statement.key) ?? [];
    list.push(statement);
    byKey.set(statement.key, list);
  }

  const conflicts: Conflict[] = [];
  for (const [key, list] of byKey) {
    const distinctValues = new Set(list.map((s) => s.value));
    if (distinctValues.size <= 1) continue;

    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) continue;

    conflicts.push({
      code: "CONFLICTING_STATEMENTS",
      evidenceRefs: list.map((_, idx) => `${key}-${idx}`),
      message: `The document gives different counts for the same thing: page ${first.page} says "${first.sourceText}", but page ${last.page} says "${last.sourceText}". We haven't picked one - check with the supplier.`,
    });
  }
  return conflicts;
}
