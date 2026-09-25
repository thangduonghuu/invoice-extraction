import type { Conflict } from "@invoice-extractor/schema";
import { ruleTitle } from "@/lib/ruleCatalog";

/** The document contradicts itself. We say what, show both pieces of evidence, and are explicit that we didn't pick one. */
export function ConflictsList({ conflicts }: { conflicts: Conflict[] }) {
  if (conflicts.length === 0) return null;

  return (
    <section aria-labelledby="conflicts-heading">
      <h2 id="conflicts-heading">Numbers that don't add up ({conflicts.length})</h2>
      <ul className="conflicts-list">
        {conflicts.map((conflict, i) => (
          <li key={i}>
            <p className="conflict-title">{ruleTitle(conflict.code)}</p>
            <p>{conflict.message}</p>
            <p className="not-picked">We haven't picked one of these for you - check the source document.</p>
            {conflict.derived && (
              <p className="derived">
                For reference only (never used as an extracted value): {conflict.derived.value}, computed from {conflict.derived.inputs.join(", ")}.
              </p>
            )}
            <p className="code">{conflict.code}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
