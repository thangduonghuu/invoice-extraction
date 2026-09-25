/**
 * Canonical strict field parsers. Shared by the Zod output schema (to verify
 * the `sourceText`/`rawValue` -> value invariants) and by the engine (to do
 * the actual extraction) so the two can never drift apart.
 */

const MONEY_RE = /^-?\$\d{1,3}(,\d{3})*\.\d{2}$/;
const QTY_RE = /^\d+(\.\d+)?$/;

export const UNITS = ["ea", "box", "pack", "kit", "length", "carton", "tub"] as const;
export type Unit = (typeof UNITS)[number];

/** Money strings only, e.g. "$1,270.00" or "-$4.50". No parseFloat. Returns integer cents. */
export function parseMoneyToCents(raw: string): number | null {
  if (!MONEY_RE.test(raw)) return null;
  const negative = raw.startsWith("-");
  const digits = raw.replace(/[-$,]/g, "");
  const [whole, frac] = digits.split(".");
  if (whole === undefined || frac === undefined) return null;
  const cents = Number(whole) * 100 + Number(frac);
  return negative ? -cents : cents;
}

export function parseQty(raw: string): number | null {
  if (!QTY_RE.test(raw)) return null;
  return Number(raw);
}

export function isKnownUnit(raw: string): raw is Unit {
  return (UNITS as readonly string[]).includes(raw);
}
