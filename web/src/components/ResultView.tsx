import type { ExtractionResult } from "@invoice-extractor/schema";
import { ConflictsList } from "./ConflictsList";
import { ItemsTable } from "./ItemsTable";
import { RefusalsList } from "./RefusalsList";

function summarise(result: ExtractionResult): string {
  const parts: string[] = [`${result.items.length} line${result.items.length === 1 ? "" : "s"} read`];

  const unreadablePages = result.pages.filter((p) => p.status === "refused").length;
  if (unreadablePages > 0) {
    parts.push(`${unreadablePages} page${unreadablePages === 1 ? "" : "s"} couldn't be read`);
  }

  if (result.conflicts.length > 0) {
    parts.push(`${result.conflicts.length} number${result.conflicts.length === 1 ? "" : "s"} that don't add up`);
  }

  const needsReview = result.items.filter((i) => i.status === "needs_review").length;
  if (needsReview > 0) {
    parts.push(`${needsReview} line${needsReview === 1 ? "" : "s"} need review`);
  }

  return parts.join(" · ");
}

export function ResultView({ result, onReset }: { result: ExtractionResult; onReset: () => void }) {
  return (
    <div className="result-view">
      <div className={`summary-banner summary-${result.outcome}`}>
        <p>{summarise(result)}</p>
        <button type="button" className="btn-primary" onClick={onReset}>
          Upload another
        </button>
      </div>

      <ItemsTable items={result.items} />
      <RefusalsList refusals={result.refusals} />
      <ConflictsList conflicts={result.conflicts} />
    </div>
  );
}
