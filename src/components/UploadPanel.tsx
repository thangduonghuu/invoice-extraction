"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppError, createJob, getJob, uploadFile } from "@/lib/apiClient";
import { invalidFileError, toUserError } from "@/lib/errors";
import type { UploadState } from "@/lib/uploadState";
import { validateFile } from "@/lib/validateFile";
import { FailedView } from "./FailedView";
import { ResultView } from "./ResultView";
import { StatusAnnouncer } from "./StatusAnnouncer";

const POLL_INTERVAL_MS = 2000;
const SLOW_THRESHOLD_MS = 90_000;

function statusText(state: UploadState): string {
  switch (state.kind) {
    case "idle":
      return "";
    case "invalid_file":
      return invalidFileError(state.reason).message;
    case "creating":
      return "Preparing to upload...";
    case "uploading":
      return `Uploading, ${state.progress}% done.`;
    case "processing":
      return "Processing your document...";
    case "done":
      return `Done. ${state.result.items.length} lines read, ${state.result.refusals.length} things we couldn't read, ${state.result.conflicts.length} numbers that don't add up.`;
    case "failed":
      return state.message;
  }
}

export function UploadPanel() {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const jobId = state.kind === "processing" ? state.jobId : undefined;

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJob(jobId as string),
    enabled: Boolean(jobId),
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return POLL_INTERVAL_MS;
      return data.status === "COMPLETED" || data.status === "FAILED" ? false : POLL_INTERVAL_MS;
    },
  });

  useEffect(() => {
    if (state.kind !== "processing") return;
    const record = jobQuery.data;
    if (!record) return;

    if (record.status === "COMPLETED") {
      if (record.result) {
        setState({ kind: "done", result: record.result });
      } else {
        setState({ kind: "failed", ...toUserError("RESPONSE_SHAPE_INVALID", { jobId: state.jobId }) });
      }
    } else if (record.status === "FAILED") {
      setState({
        kind: "failed",
        ...toUserError(record.errorCode ?? "UNKNOWN", { detail: record.errorDetail, jobId: state.jobId }),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobQuery.data, state.kind]);

  useEffect(() => {
    if (state.kind !== "processing" || !jobQuery.error) return;
    const err = jobQuery.error;
    const userError = err instanceof AppError ? toUserError(err.code, { detail: err.message, jobId: state.jobId }) : toUserError("UNKNOWN", { jobId: state.jobId });
    setState({ kind: "failed", ...userError });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobQuery.error, state.kind]);

  const reset = useCallback(() => {
    setState({ kind: "idle" });
    void queryClient.removeQueries({ queryKey: ["job"] });
    if (inputRef.current) inputRef.current.value = "";
  }, [queryClient]);

  const handleFile = useCallback(async (file: File) => {
    const invalidReason = validateFile(file);
    if (invalidReason) {
      setState({ kind: "invalid_file", reason: invalidReason });
      return;
    }

    setState({ kind: "creating" });
    try {
      const { jobId: newJobId, uploadUrl } = await createJob(file);
      setState({ kind: "uploading", progress: 0 });
      await uploadFile(uploadUrl, file, (progress) => {
        setState((prev) => (prev.kind === "uploading" ? { kind: "uploading", progress } : prev));
      });
      setState({ kind: "processing", jobId: newJobId, since: Date.now() });
    } catch (err) {
      const userError = err instanceof AppError ? toUserError(err.code, { detail: err.message }) : toUserError("UNKNOWN");
      setState({ kind: "failed", ...userError });
    }
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const isBusy = state.kind === "creating" || state.kind === "uploading" || state.kind === "processing";
  const isSlow = state.kind === "processing" && Date.now() - state.since > SLOW_THRESHOLD_MS;

  return (
    <div className="upload-panel">
      <StatusAnnouncer text={statusText(state)} />

      {state.kind === "done" ? (
        <ResultView result={state.result} onReset={reset} />
      ) : (
        <>
          <div
            className={`dropzone${isBusy ? " dropzone-busy" : ""}${dragActive ? " dropzone-active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
          >
            <svg className="dropzone-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 16V4m0 0 4 4m-4-4-4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <label htmlFor="pdf-input">Upload an invoice (PDF, up to 10 MB)</label>
            <input
              id="pdf-input"
              ref={inputRef}
              type="file"
              accept="application/pdf"
              disabled={isBusy}
              onChange={onInputChange}
            />
            <p className="dropzone-hint">Drag and drop, or choose a file above</p>
          </div>

          {state.kind === "invalid_file" && <FailedView error={invalidFileError(state.reason)} />}

          {state.kind === "creating" && (
            <div className="status-row">
              <span className="spinner" aria-hidden="true" />
              <p>Preparing to upload...</p>
            </div>
          )}

          {state.kind === "uploading" && (
            <div className="progress" role="progressbar" aria-valuenow={state.progress} aria-valuemin={0} aria-valuemax={100}>
              <div className="progress-bar" style={{ width: `${state.progress}%` }} />
              <span>{state.progress}%</span>
            </div>
          )}

          {state.kind === "processing" && (
            <div>
              <div className="status-row">
                <span className="spinner" aria-hidden="true" />
                <p>Processing your document...</p>
              </div>
              {isSlow && <p className="slow-notice">Still reading your document - this one is taking longer than usual.</p>}
            </div>
          )}

          {state.kind === "failed" && <FailedView error={state} onRetry={reset} />}
        </>
      )}
    </div>
  );
}
