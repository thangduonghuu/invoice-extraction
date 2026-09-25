import type { Item } from "../../../shared/index.js";
import { describe, expect, it } from "vitest";
import { findConflictingStatements, reconcileTotals } from "../rules.js";
import type { CountStatement, DocFact, DocFacts } from "../types.js";

function fact(valueCents: number, rawValue: string, page = 1): DocFact {
  return { page, sourceText: `x ${rawValue}`, rawValue, valueCents };
}

function item(amountCents: number | null, id = "p1-r1"): Item {
  return {
    id,
    page: 1,
    code: "PL-201",
    description: "Widget",
    qty: 1,
    unit: "ea",
    unitPriceCents: amountCents,
    amountCents,
    weightRaw: null,
    status: "ok",
    evidence: { page: 1, method: "text_layer", sourceText: "x", fields: {} },
    flags: [],
  };
}

describe("reconcileTotals", () => {
  it("reports NOTHING_TO_RECONCILE when neither subtotal nor total is stated", () => {
    const { conflicts, docRefusals } = reconcileTotals({}, [item(1000)]);
    expect(conflicts).toEqual([]);
    expect(docRefusals).toHaveLength(1);
    expect(docRefusals[0]!.code).toBe("NOTHING_TO_RECONCILE");
  });

  it("reports no conflicts when subtotal, GST and total all reconcile", () => {
    const facts: DocFacts = {
      subtotal: fact(325900, "$3,259.00"),
      gst: fact(48885, "$488.85"),
      total: fact(374785, "$3,747.85"),
    };
    const items = [item(325900)];
    const { conflicts, docRefusals } = reconcileTotals(facts, items);
    expect(conflicts).toEqual([]);
    expect(docRefusals).toEqual([]);
  });

  it("flags SUBTOTAL_MISMATCH when items don't sum to the stated subtotal", () => {
    const facts: DocFacts = { subtotal: fact(100000, "$1,000.00") };
    const { conflicts } = reconcileTotals(facts, [item(50000)]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.code).toBe("SUBTOTAL_MISMATCH");
    expect(conflicts[0]!.derived).toEqual({ value: "500.00", inputs: ["p1-r1"] });
  });

  it("flags GST_MISMATCH when GST isn't ~15% of the subtotal", () => {
    const facts: DocFacts = { subtotal: fact(100000, "$1,000.00"), gst: fact(1000, "$10.00") };
    const { conflicts } = reconcileTotals(facts, [item(100000)]);
    expect(conflicts.map((c) => c.code)).toContain("GST_MISMATCH");
  });

  it("flags TOTAL_MISMATCH but never lets the derived sum leak in as a real value", () => {
    const facts: DocFacts = {
      subtotal: fact(127000, "$1,270.00"),
      gst: fact(19050, "$190.50"),
      total: fact(150180, "$1,501.80"),
    };
    const { conflicts } = reconcileTotals(facts, [item(127000)]);
    const totalMismatch = conflicts.find((c) => c.code === "TOTAL_MISMATCH");
    expect(totalMismatch).toBeDefined();
    expect(totalMismatch!.derived).toEqual({ value: "1460.50", inputs: ["subtotal", "gst"] });
  });

  it("flags TOTAL_BASIS_UNCLEAR for a bare Total with no GST line", () => {
    const facts: DocFacts = { subtotal: fact(205000, "$2,050.00"), total: fact(205000, "$2,050.00") };
    const { docRefusals } = reconcileTotals(facts, [item(205000)]);
    expect(docRefusals.map((r) => r.code)).toContain("TOTAL_BASIS_UNCLEAR");
  });
});

describe("findConflictingStatements", () => {
  it("flags two different counts for the same fact and picks neither", () => {
    const statements: CountStatement[] = [
      { key: "cartons", page: 1, sourceText: "Header says 9 cartons dispatched", rawValue: "9", value: 9 },
      { key: "cartons", page: 2, sourceText: "Warehouse notes say 11 cartons picked", rawValue: "11", value: 11 },
    ];
    const conflicts = findConflictingStatements(statements);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.code).toBe("CONFLICTING_STATEMENTS");
    expect(conflicts[0]!.message).toContain("9 cartons");
    expect(conflicts[0]!.message).toContain("11 cartons");
  });

  it("does not flag when every statement agrees", () => {
    const statements: CountStatement[] = [
      { key: "cartons", page: 1, sourceText: "9 cartons dispatched", rawValue: "9", value: 9 },
      { key: "cartons", page: 2, sourceText: "9 cartons received", rawValue: "9", value: 9 },
    ];
    expect(findConflictingStatements(statements)).toEqual([]);
  });
});
