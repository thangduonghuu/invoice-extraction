import { describe, expect, it } from "vitest";
import { extractFixture, fixtureExists } from "./fixtureHelpers.js";

/**
 * One test per sample file, per PROMPT.md section 5 - these are the
 * contract. Each is skipped (not failed) until the real PDF is dropped into
 * fixtures/, so `pnpm test` stays green in the meantime; see fixtures/README.md.
 */

describe.skipIf(!fixtureExists("IB-55871"))("IB-55871 - clean text PDF, everything reconciles", () => {
  it("extracts 4 ok items with no refusals or conflicts", async () => {
    const result = await extractFixture("IB-55871");
    expect(result.items).toHaveLength(4);
    expect(result.items.every((i) => i.status === "ok")).toBe(true);
    expect(result.refusals).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(result.outcome).toBe("clean");
    expect(result.items.map((i) => i.code).sort()).toEqual(["FX-118", "FX-201", "IN-045", "RF-330"].sort());
  });

  it("never reads a descriptive number (90mm, M12x150, R2.6) or a duration (20 days) as a quantity", async () => {
    const result = await extractFixture("IB-55871");
    const qtys = result.items.map((i) => i.qty);
    expect(qtys).not.toContain(90);
    expect(qtys).not.toContain(20);
    for (const item of result.items) {
      expect(item.evidence.fields.qty).not.toMatch(/mm|m12|days/i);
    }
  });
});

describe.skipIf(!fixtureExists("IB-55902"))("IB-55902 - scanned image, no text layer", () => {
  it("returns 0 items and a page-scoped NO_TEXT_LAYER refusal, without failing the job", async () => {
    const result = await extractFixture("IB-55902");
    expect(result.status).toBe("completed");
    expect(result.items).toEqual([]);
    expect(result.refusals).toContainEqual(expect.objectContaining({ code: "NO_TEXT_LAYER", scope: "page", page: 1 }));
  });
});

describe.skipIf(!fixtureExists("IB-56010"))("IB-56010 - Qty/Weight/Unit Price, no Amount or Unit column", () => {
  it("extracts 4 items with null amounts and raw, unconverted weights", async () => {
    const result = await extractFixture("IB-56010");
    expect(result.items).toHaveLength(4);
    for (const item of result.items) {
      expect(item.amountCents).toBeNull();
      expect(item.flags).toContain("AMOUNT_NOT_STATED");
      expect(item.weightRaw).not.toBeNull();
      expect(item.flags).toContain("WEIGHT_BASIS_AMBIGUOUS");
    }
  });

  it("flags UNIT_FROM_PRICE_SUFFIX for prices like $74.00 /carton", async () => {
    const result = await extractFixture("IB-56010");
    expect(result.items.some((i) => i.flags.includes("UNIT_FROM_PRICE_SUFFIX"))).toBe(true);
  });

  it("reports NOTHING_TO_RECONCILE since there are no totals", async () => {
    const result = await extractFixture("IB-56010");
    expect(result.refusals.some((r) => r.code === "NOTHING_TO_RECONCILE")).toBe(true);
  });

  it("never lets a computed weight-derived number (222, 22200) appear anywhere in items", async () => {
    const result = await extractFixture("IB-56010");
    const serialised = JSON.stringify(result.items);
    expect(serialised).not.toMatch(/\b222\b/);
    expect(serialised).not.toMatch(/\b22200\b/);
  });
});

describe.skipIf(!fixtureExists("IB-56088"))("IB-56088 - conflicting carton counts, no GST line", () => {
  it("extracts 3 ok items", async () => {
    const result = await extractFixture("IB-56088");
    expect(result.items).toHaveLength(3);
    expect(result.items.every((i) => i.status === "ok")).toBe(true);
  });

  it("flags CONFLICTING_STATEMENTS for 9 vs 11 cartons and TOTAL_BASIS_UNCLEAR for the bare total", async () => {
    const result = await extractFixture("IB-56088");
    const conflict = result.conflicts.find((c) => c.code === "CONFLICTING_STATEMENTS");
    expect(conflict).toBeDefined();
    expect(conflict!.message).toMatch(/9/);
    expect(conflict!.message).toMatch(/11/);
    expect(result.refusals.some((r) => r.code === "TOTAL_BASIS_UNCLEAR")).toBe(true);
  });
});

describe.skipIf(!fixtureExists("IB-56150"))("IB-56150 - stated total doesn't match subtotal + GST", () => {
  it("extracts 4 ok items and flags TOTAL_MISMATCH", async () => {
    const result = await extractFixture("IB-56150");
    expect(result.items).toHaveLength(4);
    expect(result.items.every((i) => i.status === "ok")).toBe(true);
    const mismatch = result.conflicts.find((c) => c.code === "TOTAL_MISMATCH");
    expect(mismatch).toBeDefined();
    expect(mismatch!.derived?.value).toBe("1460.50");
  });

  it("never lets the correct-sum $1,460.50 appear as an item value, only as a derived conflict figure", async () => {
    const result = await extractFixture("IB-56150");
    for (const item of result.items) {
      expect(item.amountCents).not.toBe(146050);
    }
  });
});

describe.skipIf(!fixtureExists("IB-STMT47"))("IB-STMT47 - 8 pages, one scanned, trailing non-billable sections", () => {
  it("returns items for pages 1-3 and 5-8 despite page 4 being unreadable", async () => {
    const result = await extractFixture("IB-STMT47");
    expect(result.pages).toHaveLength(8);

    const page4 = result.pages.find((p) => p.page === 4);
    expect(page4?.status).toBe("refused");
    expect(result.refusals.some((r) => r.code === "NO_TEXT_LAYER" && r.page === 4)).toBe(true);

    for (const pageNum of [1, 2, 3, 5, 6, 7, 8]) {
      expect(result.items.some((i) => i.page === pageNum)).toBe(true);
    }
  });

  it("marks pages 5-8 needs_review with NON_BILLABLE_SECTION, keeps 1-3 ok", async () => {
    const result = await extractFixture("IB-STMT47");
    for (const item of result.items.filter((i) => i.page <= 3)) {
      expect(item.status).toBe("ok");
    }
    for (const item of result.items.filter((i) => i.page >= 5)) {
      expect(item.status).toBe("needs_review");
      expect(item.flags).toContain("NON_BILLABLE_SECTION");
    }
  });

  it("reports NOTHING_TO_RECONCILE since there are no totals anywhere", async () => {
    const result = await extractFixture("IB-STMT47");
    expect(result.refusals.some((r) => r.code === "NOTHING_TO_RECONCILE")).toBe(true);
  });

  it("every item's evidence.page matches the page it was read from", async () => {
    const result = await extractFixture("IB-STMT47");
    for (const item of result.items) {
      expect(item.evidence.page).toBe(item.page);
    }
  });
});
