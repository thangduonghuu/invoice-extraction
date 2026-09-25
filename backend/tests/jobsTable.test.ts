import { describe, expect, it } from "vitest";
import { assembleJobRecord } from "../src/jobsTable.js";

describe("assembleJobRecord", () => {
  it("returns just the status for a job still awaiting upload", () => {
    const record = assembleJobRecord("job1", [
      { PK: "JOB#job1", SK: "META", status: "AWAITING_UPLOAD", fileName: "a.pdf", createdAt: "t0", updatedAt: "t0" },
    ]);
    expect(record).toEqual({ jobId: "job1", status: "AWAITING_UPLOAD", fileName: "a.pdf", createdAt: "t0", updatedAt: "t0" });
  });

  it("surfaces errorCode/errorDetail for a failed job", () => {
    const record = assembleJobRecord("job1", [
      {
        PK: "JOB#job1",
        SK: "META",
        status: "FAILED",
        fileName: "a.pdf",
        createdAt: "t0",
        updatedAt: "t1",
        errorCode: "PDF_ENCRYPTED",
        errorDetail: "The PDF is password-protected.",
      },
    ]);
    expect(record.status).toBe("FAILED");
    expect(record.errorCode).toBe("PDF_ENCRYPTED");
  });

  it("reassembles pages/items/refusals/conflicts from PAGE# and DOC items, sorted by page", () => {
    const meta = { PK: "JOB#job1", SK: "META", status: "COMPLETED", fileName: "a.pdf", createdAt: "t0", updatedAt: "t1" };
    const page2 = {
      PK: "JOB#job1",
      SK: "PAGE#0002",
      page: 2,
      pageStatus: "ok",
      method: "text_layer",
      sectionTitle: null,
      items: [{ id: "p2-r1", page: 2, status: "ok" }],
      refusals: [],
    };
    const page1 = {
      PK: "JOB#job1",
      SK: "PAGE#0001",
      page: 1,
      pageStatus: "refused",
      method: null,
      sectionTitle: null,
      items: [],
      refusals: [{ code: "NO_TEXT_LAYER", scope: "page", page: 1, message: "m", action: "a" }],
    };
    const doc = { PK: "JOB#job1", SK: "DOC", conflicts: [], refusals: [] };

    const record = assembleJobRecord("job1", [meta, page2, page1, doc]);

    expect(record.status).toBe("COMPLETED");
    expect(record.result?.pages.map((p) => p.page)).toEqual([1, 2]);
    expect(record.result?.items).toHaveLength(1);
    expect(record.result?.refusals).toHaveLength(1);
    expect(record.result?.outcome).toBe("has_issues");
  });

  it("throws if the META item is missing (a real bug, not a user-facing case)", () => {
    expect(() => assembleJobRecord("job1", [])).toThrow();
  });
});
