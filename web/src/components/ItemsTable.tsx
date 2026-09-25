"use client";

import type { Item } from "@invoice-extractor/schema";
import { Fragment, useState, type ReactNode } from "react";
import { ruleTitle } from "@/lib/ruleCatalog";

const STATUS_LABEL: Record<Item["status"], string> = { ok: "OK", needs_review: "Needs review", conflict: "Conflict" };

function formatMoney(cents: number | null): string {
  if (cents === null) return "-";
  const negative = cents < 0;
  const abs = Math.abs(cents);
  return `${negative ? "-" : ""}$${(abs / 100).toFixed(2)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Wraps every raw evidence value found in the source line so a reviewer can see exactly what was read. */
function highlightSource(sourceText: string, fields: Record<string, string>): ReactNode {
  const values = [...new Set(Object.values(fields).filter(Boolean))];
  if (values.length === 0) return sourceText;
  const pattern = new RegExp(`(${values.map(escapeRegExp).join("|")})`, "g");
  const parts = sourceText.split(pattern);
  return parts.map((part, i) => (values.includes(part) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>));
}

export function ItemsTable({ items }: { items: Item[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (items.length === 0) {
    return <p>No line items were read from this document.</p>;
  }

  return (
    <div className="table-card">
      <table className="items-table">
        <caption>Line items</caption>
        <thead>
          <tr>
            <th scope="col">Code</th>
            <th scope="col">Description</th>
            <th scope="col">Qty</th>
            <th scope="col">Unit</th>
            <th scope="col">Unit price</th>
            <th scope="col">Amount</th>
            <th scope="col">Weight</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="visually-hidden">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isOpen = expanded.has(item.id);
            return (
              <Fragment key={item.id}>
                <tr>
                  <td>{item.code}</td>
                  <td>{item.description}</td>
                  <td>{item.qty ?? "-"}</td>
                  <td>{item.unit ?? "-"}</td>
                  <td>{formatMoney(item.unitPriceCents)}</td>
                  <td>{formatMoney(item.amountCents)}</td>
                  <td>{item.weightRaw ?? "-"}</td>
                  <td>
                    <span className={`badge badge-${item.status}`}>{STATUS_LABEL[item.status]}</span>
                  </td>
                  <td>
                    <button type="button" className="btn-sm" onClick={() => toggle(item.id)} aria-expanded={isOpen}>
                      {isOpen ? "Hide" : "Details"}
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="detail-row">
                    <td colSpan={9}>
                      <p>
                        Page {item.page} - <span className="mono">{highlightSource(item.evidence.sourceText, item.evidence.fields)}</span>
                      </p>
                      {item.flags.length > 0 && <p className="flags">Flags: {item.flags.map(ruleTitle).join(", ")}</p>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
