import { describe, expect, it } from "vitest";
import { extractRows } from "../src/rows.js";
import type { ColumnRange, Line, RawTextItem } from "../src/types.js";

const AMOUNT_COLUMNS: ColumnRange[] = [
  { key: "code", label: "Code", xStart: -Infinity, xEnd: 55 },
  { key: "description", label: "Description", xStart: 55, xEnd: 235 },
  { key: "qty", label: "Qty", xStart: 235, xEnd: 275 },
  { key: "unit", label: "Unit", xStart: 275, xEnd: 325 },
  { key: "unitPrice", label: "Unit Price", xStart: 325, xEnd: 395 },
  { key: "amount", label: "Amount", xStart: 395, xEnd: Infinity },
];

function line(y: number, words: Array<[string, number]>): Line {
  const items: RawTextItem[] = words.map(([str, x]) => ({ str, x, y }));
  return {
    y,
    items,
    text: words.map(([str]) => str).join(" "),
  };
}

// "PL-201 Copper pipe 15mm, 3m length 40 length $14.60 $584.00"
const CLEAN_ROW = line(400, [
  ["PL-201", 10],
  ["Copper", 60],
  ["pipe", 110],
  ["15mm,", 150],
  ["3m", 190],
  ["length", 210], // still inside the description column
  ["40", 250], // qty column
  ["length", 290], // unit column
  ["$14.60", 340],
  ["$584.00", 420],
]);

const HEADER = line(450, [
  ["Code", 10],
  ["Description", 60],
  ["Qty", 250],
  ["Unit", 290],
  ["Unit", 340],
  ["Price", 341],
  ["Amount", 420],
]);

describe("extractRows - amount-style table", () => {
  it("parses a clean row and keeps numbers embedded in the description out of qty", () => {
    const lines = [HEADER, CLEAN_ROW];
    const { items, refusals } = extractRows(lines, 0, AMOUNT_COLUMNS, 1);
    expect(refusals).toEqual([]);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.code).toBe("PL-201");
    expect(item.description).toBe("Copper pipe 15mm, 3m length");
    expect(item.qty).toBe(40);
    expect(item.unit).toBe("length");
    expect(item.unitPriceCents).toBe(1460);
    expect(item.amountCents).toBe(58400);
    expect(item.status).toBe("ok");
    expect(item.evidence.sourceText).toBe(CLEAN_ROW.text);
    expect(item.evidence.sourceText.includes(item.evidence.fields.qty!)).toBe(true);
  });

  it("stops at the first Subtotal/Total/Page-n-of-m line", () => {
    const subtotalLine = line(350, [["Subtotal:", 10], ["$584.00", 340]]);
    const afterStop = line(300, [
      ["FX-118", 10],
      ["Bolt", 60],
      ["10", 250],
      ["ea", 290],
      ["$1.00", 340],
      ["$10.00", 420],
    ]);
    const { items } = extractRows([HEADER, CLEAN_ROW, subtotalLine, afterStop], 0, AMOUNT_COLUMNS, 1);
    expect(items).toHaveLength(1);
    expect(items[0]!.code).toBe("PL-201");
  });

  it("skips narrative lines that don't start with a product code, without stopping the scan", () => {
    const narrative = line(370, [["9", 10], ["cartons", 60], ["dispatched", 140]]);
    const secondRow = line(300, [
      ["FX-118", 10],
      ["Bolt", 60],
      ["10", 250],
      ["ea", 290],
      ["$1.00", 340],
      ["$10.00", 420],
    ]);
    const { items } = extractRows([HEADER, CLEAN_ROW, narrative, secondRow], 0, AMOUNT_COLUMNS, 1);
    expect(items.map((i) => i.code)).toEqual(["PL-201", "FX-118"]);
  });

  it("refuses only the row whose qty cell fails strict parsing (ROW_UNPARSEABLE)", () => {
    const badQty = line(300, [
      ["FX-118", 10],
      ["Bolt", 60],
      ["3m", 250], // not a valid qty
      ["ea", 290],
      ["$1.00", 340],
      ["$10.00", 420],
    ]);
    const { items, refusals } = extractRows([HEADER, CLEAN_ROW, badQty], 0, AMOUNT_COLUMNS, 1);
    expect(items).toHaveLength(1);
    expect(items[0]!.code).toBe("PL-201");
    expect(refusals).toHaveLength(1);
    expect(refusals[0]!.code).toBe("ROW_UNPARSEABLE");
    expect(refusals[0]!.detail).toBe(badQty.text);
  });

  it("flags LINE_MATH_MISMATCH but keeps the stated amount when qty x unitPrice != amount", () => {
    const mismatch = line(300, [
      ["FX-118", 10],
      ["Bolt", 60],
      ["10", 250],
      ["ea", 290],
      ["$1.00", 340],
      ["$50.00", 420], // should be $10.00
    ]);
    const { items } = extractRows([HEADER, mismatch], 0, AMOUNT_COLUMNS, 1);
    expect(items).toHaveLength(1);
    expect(items[0]!.status).toBe("conflict");
    expect(items[0]!.flags).toContain("LINE_MATH_MISMATCH");
    expect(items[0]!.amountCents).toBe(5000); // never "corrected" to the computed value
  });
});

describe("extractRows - weight-style table (no Amount column)", () => {
  const WEIGHT_COLUMNS: ColumnRange[] = [
    { key: "code", label: "Code", xStart: -Infinity, xEnd: 55 },
    { key: "description", label: "Description", xStart: 55, xEnd: 235 },
    { key: "qty", label: "Qty", xStart: 235, xEnd: 275 },
    { key: "weight", label: "Weight", xStart: 275, xEnd: 325 },
    { key: "unitPrice", label: "Unit Price", xStart: 325, xEnd: Infinity },
  ];
  const weightHeader = line(450, [
    ["Code", 10],
    ["Description", 60],
    ["Qty", 250],
    ["Weight", 290],
    ["Unit", 340],
    ["Price", 341],
  ]);

  it("keeps the raw weight string, never converts it, and flags AMOUNT_NOT_STATED + WEIGHT_BASIS_AMBIGUOUS", () => {
    const row = line(400, [
      ["RF-330", 10],
      ["Rebar", 60],
      ["4", 250],
      ["20kg", 290],
      ["$74.00", 340],
      ["/carton", 341],
    ]);
    const { items, refusals } = extractRows([weightHeader, row], 0, WEIGHT_COLUMNS, 1);
    expect(refusals).toEqual([]);
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.weightRaw).toBe("20kg");
    expect(item.amountCents).toBeNull();
    expect(item.flags).toEqual(expect.arrayContaining(["AMOUNT_NOT_STATED", "WEIGHT_BASIS_AMBIGUOUS", "UNIT_FROM_PRICE_SUFFIX"]));
    expect(item.unit).toBe("carton");
    expect(item.unitPriceCents).toBe(7400);
    // the "/carton" suffix must never leak into a field the schema will check as pure money
    expect(item.evidence.fields.unitPrice).toBe("$74.00");
  });
});
