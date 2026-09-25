import type { ExtractionResult } from "../shared/index.js";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ResultView } from "@/components/ResultView";

const fixture: ExtractionResult = {
  jobId: "job-1",
  status: "completed",
  outcome: "has_issues",
  pages: [{ page: 1, status: "refused", method: null, sectionTitle: null }],
  items: [],
  refusals: [
    {
      code: "NO_TEXT_LAYER",
      scope: "page",
      page: 1,
      message: "Page 1 looks like a scanned image, so we can't read its numbers reliably.",
      action: "Check the lines on page 1 against the paper copy.",
    },
  ],
  conflicts: [],
};

describe("ResultView", () => {
  it("shows the refusal's plain-language sentence, never a generic error message", () => {
    render(<ResultView result={fixture} onReset={() => {}} />);

    expect(screen.getByText(/Page 1 looks like a scanned image, so we can't read its numbers reliably\./)).toBeInTheDocument();
    expect(screen.getByText(/Check the lines on page 1 against the paper copy\./)).toBeInTheDocument();

    expect(screen.queryByText(/error occurred/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("shows the rule code in small text alongside the plain-language message", () => {
    render(<ResultView result={fixture} onReset={() => {}} />);
    expect(screen.getByText("NO_TEXT_LAYER")).toBeInTheDocument();
  });
});
