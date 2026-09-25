import { describe, expect, it } from "vitest";
import { captureFacts } from "../facts.js";
import type { Line } from "../types.js";

function textLine(text: string, y = 100): Line {
  return { y, items: [{ str: text, x: 10, y }], text };
}

describe("captureFacts", () => {
  it("captures Subtotal, GST (with rate suffix) and Total (incl GST) labelled facts", () => {
    const lines = [
      textLine("Subtotal: $3,259.00"),
      textLine("GST (15%): $488.85"),
      textLine("Total (incl GST): $3,747.85"),
    ];
    const { facts } = captureFacts(lines, 1);
    expect(facts.subtotal).toMatchObject({ rawValue: "$3,259.00", valueCents: 325900 });
    expect(facts.gst).toMatchObject({ rawValue: "$488.85", valueCents: 48885 });
    expect(facts.total).toMatchObject({ rawValue: "$3,747.85", valueCents: 374785 });
  });

  it("captures a bare Total: line without a GST line", () => {
    const lines = [textLine("Total: $2,050.00")];
    const { facts } = captureFacts(lines, 1);
    expect(facts.total).toMatchObject({ valueCents: 205000 });
    expect(facts.gst).toBeUndefined();
  });

  it("captures count statements like '9 cartons dispatched' anywhere on the page", () => {
    const lines = [textLine("Header says 9 cartons dispatched")];
    const { countStatements } = captureFacts(lines, 1);
    expect(countStatements).toEqual([
      { key: "cartons", page: 1, sourceText: "Header says 9 cartons dispatched", rawValue: "9", value: 9 },
    ]);
  });

  it("does not mistake Subtotal for Total", () => {
    const lines = [textLine("Subtotal: $100.00")];
    const { facts } = captureFacts(lines, 1);
    expect(facts.total).toBeUndefined();
    expect(facts.subtotal).toMatchObject({ valueCents: 10000 });
  });
});
