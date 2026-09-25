import type { Item, Refusal, RuleCode } from "../../shared/index.js";
import { CODE_RE, looksLikeWeight, parseMoneyToCents, parseQty, parseUnit, parseUnitPriceCell } from "./parsers.js";
import { rowUnparseableRefusal } from "./refusals.js";
import type { ColumnKey, ColumnRange, Line } from "./types.js";

const STOP_PATTERNS = [/^subtotal\b/i, /^total\b/i, /^page\s+\d+\s+of\s+\d+/i, /^notes?\b[:.]/i];

type Cells = Partial<Record<ColumnKey, string>>;

function assignRowToColumns(line: Line, columns: ColumnRange[]): Cells {
  const buckets = new Map<ColumnKey, string[]>();
  for (const col of columns) buckets.set(col.key, []);
  for (const item of line.items) {
    const col = columns.find((c) => item.x >= c.xStart && item.x < c.xEnd);
    if (col) buckets.get(col.key)?.push(item.str);
  }
  const cells: Cells = {};
  for (const col of columns) {
    const text = (buckets.get(col.key) ?? [])
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) cells[col.key] = text;
  }
  return cells;
}

function buildItem(
  line: Line,
  cells: Cells,
  page: number,
  rowIndex: number,
  hasColumn: (key: ColumnKey) => boolean,
): { item: Item } | { refusal: Refusal } {
  const code = cells.code;
  const description = cells.description?.trim();
  if (!code || !description) {
    return { refusal: rowUnparseableRefusal(page, line.text) };
  }

  const fields: Record<string, string> = {};
  const flags: RuleCode[] = [];

  let qty: number | null = null;
  if (hasColumn("qty") && cells.qty) {
    const parsed = parseQty(cells.qty);
    if (parsed === null) return { refusal: rowUnparseableRefusal(page, line.text) };
    qty = parsed;
    fields.qty = cells.qty;
  }

  let unit: Item["unit"] = null;
  if (hasColumn("unit") && cells.unit) {
    const parsed = parseUnit(cells.unit);
    if (parsed === null) return { refusal: rowUnparseableRefusal(page, line.text) };
    unit = parsed;
  }

  let unitPriceCents: number | null = null;
  if (hasColumn("unitPrice") && cells.unitPrice) {
    const parsed = parseUnitPriceCell(cells.unitPrice);
    if (parsed === null) return { refusal: rowUnparseableRefusal(page, line.text) };
    unitPriceCents = parsed.cents;
    fields.unitPrice = parsed.priceRaw;
    if (parsed.suffixUnit) {
      if (!unit) unit = parsed.suffixUnit;
      flags.push("UNIT_FROM_PRICE_SUFFIX");
    }
  }

  let amountCents: number | null = null;
  if (hasColumn("amount")) {
    if (cells.amount) {
      const parsed = parseMoneyToCents(cells.amount);
      if (parsed === null) return { refusal: rowUnparseableRefusal(page, line.text) };
      amountCents = parsed;
      fields.amount = cells.amount;
    } else {
      flags.push("AMOUNT_NOT_STATED");
    }
  } else {
    flags.push("AMOUNT_NOT_STATED");
  }

  let weightRaw: string | null = null;
  if (hasColumn("weight") && cells.weight) {
    if (!looksLikeWeight(cells.weight)) return { refusal: rowUnparseableRefusal(page, line.text) };
    weightRaw = cells.weight;
    fields.weight = cells.weight;
    flags.push("WEIGHT_BASIS_AMBIGUOUS");
  }

  let status: Item["status"] = "ok";
  if (qty !== null && unitPriceCents !== null && amountCents !== null) {
    const expected = Math.round(qty * unitPriceCents);
    if (expected !== amountCents) {
      status = "conflict";
      flags.push("LINE_MATH_MISMATCH");
    }
  }

  const item: Item = {
    id: `p${page}-r${rowIndex}`,
    page,
    code,
    description,
    qty,
    unit,
    unitPriceCents,
    amountCents,
    weightRaw,
    status,
    evidence: {
      page,
      method: "text_layer",
      sourceText: line.text,
      fields,
    },
    flags,
  };

  return { item };
}

interface RowExtractionResult {
  items: Item[];
  refusals: Refusal[];
}

/**
 * Data rows are the lines between the header and the first Subtotal / Total
 * / "Page n of m" / notes line, restricted to rows whose code cell matches
 * the product-code pattern - this is what keeps a stray narrative line
 * ("9 cartons dispatched") from being misread as a line item.
 */
export function extractRows(lines: Line[], headerLineIndex: number, columns: ColumnRange[], page: number): RowExtractionResult {
  const items: Item[] = [];
  const refusals: Refusal[] = [];
  const hasColumn = (key: ColumnKey) => columns.some((c) => c.key === key);
  let rowIndex = 0;

  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    if (STOP_PATTERNS.some((re) => re.test(line.text))) break;

    const cells = assignRowToColumns(line, columns);
    if (!cells.code || !CODE_RE.test(cells.code)) continue;

    rowIndex++;
    const outcome = buildItem(line, cells, page, rowIndex, hasColumn);
    if ("refusal" in outcome) refusals.push(outcome.refusal);
    else items.push(outcome.item);
  }

  return { items, refusals };
}
