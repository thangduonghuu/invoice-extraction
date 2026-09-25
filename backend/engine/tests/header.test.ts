import { describe, expect, it } from "vitest";
import { findHeaderLine, findSectionTitle, isNonBillableSection } from "../header.js";
import type { Line, RawTextItem } from "../types.js";

function makeLine(y: number, words: Array<[string, number]>): Line {
  const items: RawTextItem[] = words.map(([str, x]) => ({ str, x, y }));
  return { y, items, text: words.map(([str]) => str).join(" ") };
}

describe("findHeaderLine", () => {
  it("finds the amount-style header (Code/Description/Qty/Unit/Unit Price/Amount)", () => {
    const lines: Line[] = [
      makeLine(500, [["Ironbark Trading - Invoice 1 of 4 (Materials/Fixings)", 10]]),
      makeLine(480, [
        ["Code", 10],
        ["Description", 60],
        ["Qty", 220],
        ["Unit", 260],
        ["Unit", 310],
        ["Price", 340],
        ["Amount", 400],
      ]),
      makeLine(460, [
        ["PL-201", 10],
        ["Copper", 60],
      ]),
    ];
    const header = findHeaderLine(lines);
    expect(header).not.toBeNull();
    expect(header?.lineIndex).toBe(1);
    const keys = header?.columns.map((c) => c.key).sort();
    expect(keys).toEqual(["amount", "code", "description", "qty", "unit", "unitPrice"].sort());
  });

  it("finds the weight-style header (Qty/Weight/Unit Price, no Amount column)", () => {
    const lines: Line[] = [
      makeLine(480, [
        ["Code", 10],
        ["Description", 60],
        ["Qty", 220],
        ["Weight", 260],
        ["Unit", 310],
        ["Price", 340],
      ]),
    ];
    const header = findHeaderLine(lines);
    expect(header).not.toBeNull();
    const keys = header?.columns.map((c) => c.key).sort();
    expect(keys).toEqual(["code", "description", "qty", "unitPrice", "weight"].sort());
    expect(keys).not.toContain("amount");
  });

  it("returns null when no header line is present", () => {
    const lines: Line[] = [makeLine(100, [["just", 10], ["some", 40], ["text", 70]])];
    expect(findHeaderLine(lines)).toBeNull();
  });
});

describe("findSectionTitle", () => {
  it("returns the second line on the page (right after the letterhead)", () => {
    const lines: Line[] = [
      makeLine(780, [["Ironbark Trade Merchants Ltd", 10]]),
      makeLine(760, [["Statement Summary", 10]]),
      makeLine(500, [["Date: 28 August 2026", 10]]),
      makeLine(480, [["Code", 10], ["Description", 60], ["Qty", 220]]),
    ];
    expect(findSectionTitle(lines)).toBe("Statement Summary");
  });

  it("returns null when the page has fewer than two lines", () => {
    const lines: Line[] = [makeLine(480, [["Code", 10], ["Description", 60], ["Qty", 220]])];
    expect(findSectionTitle(lines)).toBeNull();
  });
});

describe("isNonBillableSection", () => {
  it.each([
    ["Statement Summary", true],
    ["Freight Charges", true],
    ["Credit Note Reference", true],
    ["Signed Delivery Confirmation", true],
    ["Invoice 1 of 4 - Materials/Fixings", false],
    [null, false],
  ])("classifies %s as non-billable=%s", (title, expected) => {
    expect(isNonBillableSection(title)).toBe(expected);
  });
});
