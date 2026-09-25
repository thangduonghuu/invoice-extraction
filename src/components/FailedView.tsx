"use client";

import { useState } from "react";
import type { UserFacingError } from "@/lib/errors";

/**
 * Last-resort fallback for every failure path - the error boundary and the
 * upload panel both render through this. Always shows the real message and
 * the jobId (if any); never collapses into "An error occurred".
 */
export function FailedView({ error, onRetry }: { error: UserFacingError; onRetry?: () => void }) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="failed-view" role="alert">
      <h2>{error.title}</h2>
      <p>{error.message}</p>
      {error.jobId && (
        <p className="job-id">
          Reference: <code>{error.jobId}</code>
        </p>
      )}
      {error.detail && (
        <details onToggle={() => setShowDetail((v) => !v)}>
          <summary>{showDetail ? "Hide technical detail" : "Show technical detail"}</summary>
          <pre>{error.detail}</pre>
        </details>
      )}
      <p className="code">{error.code}</p>
      {error.retryable && onRetry && (
        <button type="button" className="btn-primary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
