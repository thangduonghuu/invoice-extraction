import { parseMoneyToCents } from "./parsers.js";
import type { CountStatement, DocFact, DocFacts, Line } from "./types.js";

const MONEY = String.raw`-?\$\d{1,3}(?:,\d{3})*\.\d{2}`;
const SUBTOTAL_RE = new RegExp(`^subtotal:?\\s*(${MONEY})`, "i");
const GST_RE = new RegExp(`^gst\\b[^:]*:\\s*(${MONEY})`, "i");
const TOTAL_RE = new RegExp(`^total\\b[^:]*:\\s*(${MONEY})`, "i");
const CARTONS_RE = /(\d+)\s*cartons?\b/gi;

interface FactCaptureResult {
  facts: Partial<DocFacts>;
  countStatements: CountStatement[];
}

function toFact(page: number, sourceText: string, rawValue: string): DocFact | null {
  const valueCents = parseMoneyToCents(rawValue);
  if (valueCents === null) return null;
  return { page, sourceText, rawValue, valueCents };
}

/** Labelled facts (Subtotal / GST / Total) and count statements ("9 cartons dispatched"), scanned doc-wide. */
export function captureFacts(lines: Line[], page: number): FactCaptureResult {
  const facts: Partial<DocFacts> = {};
  const countStatements: CountStatement[] = [];

  for (const line of lines) {
    const text = line.text.trim();

    if (!facts.subtotal) {
      const match = SUBTOTAL_RE.exec(text);
      if (match?.[1]) {
        const fact = toFact(page, text, match[1]);
        if (fact) facts.subtotal = fact;
      }
    }

    if (!facts.total) {
      const match = TOTAL_RE.exec(text);
      if (match?.[1]) {
        const fact = toFact(page, text, match[1]);
        if (fact) facts.total = fact;
      }
    }

    if (!facts.gst) {
      const match = GST_RE.exec(text);
      if (match?.[1]) {
        const fact = toFact(page, text, match[1]);
        if (fact) facts.gst = fact;
      }
    }

    for (const match of text.matchAll(CARTONS_RE)) {
      const raw = match[1];
      if (!raw) continue;
      countStatements.push({ key: "cartons", page, sourceText: text, rawValue: raw, value: Number(raw) });
    }
  }

  return { facts, countStatements };
}

export function mergeFacts(target: DocFacts, source: Partial<DocFacts>): void {
  if (!target.subtotal && source.subtotal) target.subtotal = source.subtotal;
  if (!target.gst && source.gst) target.gst = source.gst;
  if (!target.total && source.total) target.total = source.total;
}
