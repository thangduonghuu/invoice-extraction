import { describe, expect, it } from "vitest";
import { EvidenceSchema, ItemSchema } from "../src/extraction.js";
import { parseMoneyToCents, parseQty } from "../src/parsers.js";

describe("parseMoneyToCents", () => {
  it("parses well-formed money strings to integer cents", () => {
    expect(parseMoneyToCents("$584.00")).toBe(58400);
    expect(parseMoneyToCents("$1,270.00")).toBe(127000);
    expect(parseMoneyToCents("-$4.50")).toBe(-450);
  });

  it("refuses anything parseFloat would happily mangle", () => {
    expect(parseMoneyToCents("584")).toBeNull();
    expect(parseMoneyToCents("$584")).toBeNull();
    expect(parseMoneyToCents("$5.8")).toBeNull();
    expect(parseMoneyToCents("584.00")).toBeNull();
  });
});

describe("parseQty", () => {
  it("parses plain numbers only", () => {
    expect(parseQty("40")).toBe(40);
    expect(parseQty("1.5")).toBe(1.5);
  });

  it("refuses descriptive numbers", () => {
    expect(parseQty("90mm")).toBeNull();
    expect(parseQty("M12x150")).toBeNull();
    expect(parseQty("3m")).toBeNull();
  });
});

describe("EvidenceSchema", () => {
  it("accepts evidence whose sourceText contains rawValue", () => {
    const result = EvidenceSchema.safeParse({
      page: 1,
      sourceText: "Subtotal: $3,259.00",
      rawValue: "$3,259.00",
      method: "text_layer",
    });
    expect(result.success).toBe(true);
  });

  it("rejects evidence that invents a value not present in the source text", () => {
    const result = EvidenceSchema.safeParse({
      page: 1,
      sourceText: "Subtotal: $3,259.00",
      rawValue: "$9,999.00",
      method: "text_layer",
    });
    expect(result.success).toBe(false);
  });
});

describe("ItemSchema", () => {
  const baseItem = {
    id: "p1-r1",
    page: 1,
    code: "PL-201",
    description: "Copper pipe 15mm, 3m length",
    qty: 40,
    unit: "length" as const,
    unitPriceCents: 1460,
    amountCents: 58400,
    weightRaw: null,
    status: "ok" as const,
    evidence: {
      page: 1,
      method: "text_layer" as const,
      sourceText: "PL-201 Copper pipe 15mm, 3m length 40 length $14.60 $584.00",
      fields: { qty: "40", unitPrice: "$14.60", amount: "$584.00" },
    },
    flags: [],
  };

  it("accepts a fully-sourced item whose values match their raw evidence", () => {
    expect(ItemSchema.safeParse(baseItem).success).toBe(true);
  });

  it("rejects an item whose amount was computed rather than read (qty x unitPrice != amount)", () => {
    const invented = { ...baseItem, amountCents: 99999 };
    const result = ItemSchema.safeParse(invented);
    expect(result.success).toBe(false);
  });

  it("rejects an item with a value but no evidence field to back it", () => {
    const noEvidence = {
      ...baseItem,
      evidence: { ...baseItem.evidence, fields: { qty: "40", unitPrice: "$14.60" } },
    };
    const result = ItemSchema.safeParse(noEvidence);
    expect(result.success).toBe(false);
  });
});
