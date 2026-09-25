import { isKnownUnit, parseMoneyToCents, type Unit } from "@invoice-extractor/schema";

export { parseMoneyToCents, parseQty } from "@invoice-extractor/schema";

export const CODE_RE = /^[A-Z]{2}-\d{3,4}$/;

export function parseUnit(raw: string): Unit | null {
  const trimmed = raw.trim().toLowerCase();
  return isKnownUnit(trimmed) ? trimmed : null;
}

const UNIT_PRICE_WITH_SUFFIX_RE = /^(-?\$\d{1,3}(?:,\d{3})*\.\d{2})(?:\s*\/\s*([a-zA-Z]+))?$/;

interface ParsedUnitPrice {
  priceRaw: string;
  cents: number;
  suffixUnit: Unit | null;
}

/** Handles both a plain money cell and one with a unit suffix ("$74.00 /carton"). */
export function parseUnitPriceCell(raw: string): ParsedUnitPrice | null {
  const match = UNIT_PRICE_WITH_SUFFIX_RE.exec(raw.trim());
  if (!match) return null;
  const priceRaw = match[1];
  if (!priceRaw) return null;
  const cents = parseMoneyToCents(priceRaw);
  if (cents === null) return null;
  const suffix = match[2] ? match[2].toLowerCase() : null;
  return { priceRaw, cents, suffixUnit: suffix && isKnownUnit(suffix) ? suffix : null };
}

const WEIGHT_CONTAINS_RE = /\d+(\.\d+)?\s*(kg|g)\b/i;

/** We never convert or sum weights - just verify the cell looks weight-shaped and keep it verbatim. */
export function looksLikeWeight(raw: string): boolean {
  return WEIGHT_CONTAINS_RE.test(raw.trim());
}
