import type { Refusal } from "../../shared/index.js";
import { ruleTitle } from "@/lib/ruleCatalog";

/** Each entry answers what (which page/line), why, and what to do - never collapsed into "An error occurred". */
export function RefusalsList({ refusals }: { refusals: Refusal[] }) {
  if (refusals.length === 0) return null;

  return (
    <section aria-labelledby="refusals-heading">
      <h2 id="refusals-heading">What we couldn't read ({refusals.length})</h2>
      <ul className="refusals-list">
        {refusals.map((refusal, i) => (
          <li key={i}>
            <p className="refusal-title">
              {ruleTitle(refusal.code)}
              {refusal.page !== undefined && ` - page ${refusal.page}`}
            </p>
            <p>{refusal.message}</p>
            <p className="action">What to do: {refusal.action}</p>
            {refusal.detail && <p className="mono detail">"{refusal.detail}"</p>}
            <p className="code">{refusal.code}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
