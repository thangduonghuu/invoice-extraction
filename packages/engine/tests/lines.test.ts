import { describe, expect, it } from "vitest";
import { groupLines, countNonWhitespaceChars } from "../src/lines.js";
import type { RawTextItem } from "../src/types.js";

function item(str: string, x: number, y: number): RawTextItem {
  return { str, x, y };
}

describe("groupLines", () => {
  it("groups items within the y tolerance into one line, sorted by x", () => {
    const items = [
      item("world", 50, 100),
      item("hello", 10, 101),
      item("!", 90, 99),
    ];
    const lines = groupLines(items);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toBe("hello world !");
  });

  it("splits items into separate lines when y differs by more than the tolerance", () => {
    const items = [item("line one", 10, 200), item("line two", 10, 150)];
    const lines = groupLines(items, 2);
    expect(lines).toHaveLength(2);
  });

  it("orders lines top to bottom (PDF y grows upward)", () => {
    const items = [item("bottom", 10, 100), item("top", 10, 500)];
    const lines = groupLines(items);
    expect(lines.map((l) => l.text)).toEqual(["top", "bottom"]);
  });

  it("ignores whitespace-only items", () => {
    const items = [item("hello", 10, 100), item("   ", 40, 100)];
    const lines = groupLines(items);
    expect(lines[0]?.text).toBe("hello");
  });
});

describe("countNonWhitespaceChars", () => {
  it("strips whitespace before counting", () => {
    expect(countNonWhitespaceChars([item("a b\tc\n", 0, 0)])).toBe(3);
  });

  it("returns 0 for an empty page (scanned image, no text layer)", () => {
    expect(countNonWhitespaceChars([])).toBe(0);
  });
});
