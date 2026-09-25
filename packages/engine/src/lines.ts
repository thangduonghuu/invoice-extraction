import type { Line, PdfDocumentLike, RawTextItem } from "./types.js";

interface PdfJsTextItem {
  str: string;
  transform: number[];
}

function isTextItem(item: unknown): item is PdfJsTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof (item as { str: unknown }).str === "string" &&
    "transform" in item &&
    Array.isArray((item as { transform: unknown }).transform)
  );
}

export async function getPageTextItems(doc: PdfDocumentLike, pageNumber: number): Promise<RawTextItem[]> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items.filter(isTextItem).map((item) => ({
    str: item.str,
    x: item.transform[4] ?? 0,
    y: item.transform[5] ?? 0,
  }));
}

export function countNonWhitespaceChars(items: RawTextItem[]): number {
  return items
    .map((i) => i.str)
    .join("")
    .replace(/\s/g, "").length;
}

/** Group items into lines by y (tolerance ±2pt), sort each line left to right. */
export function groupLines(items: RawTextItem[], tolerance = 2): Line[] {
  const meaningful = items.filter((i) => i.str.trim().length > 0);
  const sorted = [...meaningful].sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: Line[] = [];
  for (const item of sorted) {
    let line = lines.find((l) => Math.abs(l.y - item.y) <= tolerance);
    if (!line) {
      line = { y: item.y, items: [], text: "" };
      lines.push(line);
    }
    line.items.push(item);
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items
      .map((i) => i.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return lines;
}
