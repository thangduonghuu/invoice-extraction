import type { ColumnKey, ColumnRange, Line } from "./types.js";

const KNOWN_HEADERS: Array<{ key: ColumnKey; pattern: RegExp }> = [
  { key: "code", pattern: /^(code|item\s*(no\.?|code)?)$/i },
  { key: "description", pattern: /^description$/i },
  { key: "unitPrice", pattern: /^unit\s*price$/i },
  { key: "qty", pattern: /^(qty|quantity)$/i },
  { key: "weight", pattern: /^weight$/i },
  { key: "unit", pattern: /^unit$/i },
  { key: "amount", pattern: /^amount$/i },
];

interface RawMatch {
  key: ColumnKey;
  x: number;
  label: string;
}

function detectColumns(line: Line): ColumnRange[] {
  const items = line.items;
  const matches: RawMatch[] = [];

  for (let i = 0; i < items.length; i++) {
    const current = items[i];
    if (!current) continue;
    const next = items[i + 1];
    const two = next ? `${current.str} ${next.str}`.trim() : null;
    const twoMatch = two ? KNOWN_HEADERS.find((h) => h.pattern.test(two)) : undefined;
    if (twoMatch) {
      matches.push({ key: twoMatch.key, x: current.x, label: two! });
      i++;
      continue;
    }
    const oneMatch = KNOWN_HEADERS.find((h) => h.pattern.test(current.str.trim()));
    if (oneMatch) {
      matches.push({ key: oneMatch.key, x: current.x, label: current.str.trim() });
    }
  }

  matches.sort((a, b) => a.x - b.x);

  return matches.map((m, idx) => ({
    key: m.key,
    label: m.label,
    xStart: idx === 0 ? Number.NEGATIVE_INFINITY : m.x,
    xEnd: idx + 1 < matches.length ? matches[idx + 1]!.x : Number.POSITIVE_INFINITY,
  }));
}

/**
 * The header line is the one that names the columns (Code, Description, Qty
 * ...). We require at least a description column plus one of qty/weight,
 * since those are the two shapes seen in the sample invoices (amount-based
 * and weight-based line items).
 */
export function findHeaderLine(lines: Line[]): { lineIndex: number; columns: ColumnRange[] } | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const columns = detectColumns(line);
    const keys = new Set(columns.map((c) => c.key));
    if (keys.has("description") && (keys.has("qty") || keys.has("weight"))) {
      return { lineIndex: i, columns };
    }
  }
  return null;
}

const NON_BILLABLE_KEYWORDS = ["summary", "freight", "credit note", "delivery confirmation"];

export function isNonBillableSection(sectionTitle: string | null): boolean {
  if (!sectionTitle) return false;
  const lower = sectionTitle.toLowerCase();
  return NON_BILLABLE_KEYWORDS.some((kw) => lower.includes(kw));
}

/**
 * Every page opens with two fixed lines: the company letterhead, then the
 * section title (e.g. "Tax Invoice", "Invoice 1 of 4 - Materials", or
 * "Statement Summary") - confirmed against all 6 sample layouts, and matches
 * the prompt's own "second header line" description. Metadata lines
 * (Document No, Date, Bill to) and narrative fact sentences ("Summary: 9
 * cartons dispatched...") come after it, closer to the table, so picking
 * "the nearest line above the table header" (an earlier approach) grabbed
 * the wrong line - either a date, or a narrative line that only coincidentally
 * contains a NON_BILLABLE_KEYWORDS word.
 */
export function findSectionTitle(lines: Line[]): string | null {
  const title = lines[1]?.text.trim();
  return title ? title : null;
}
