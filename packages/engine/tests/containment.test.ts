import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extract } from "../src/extract.js";
import * as linesModule from "../src/lines.js";

async function buildThreePagePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const rows: Array<[string, string]> = [
    ["AA-101", "Widget"],
    ["BB-202", "Gadget"],
    ["CC-303", "Gizmo"],
  ];

  for (const [code, description] of rows) {
    const page = doc.addPage([612, 792]);
    const draw = (text: string, x: number, y: number) => page.drawText(text, { x, y, size: 10, font });

    draw(`Test Invoice - ${code}`, 50, 740);

    draw("Code", 50, 700);
    draw("Description", 110, 700);
    draw("Qty", 300, 700);
    draw("Unit", 340, 700);
    draw("Unit", 390, 700);
    draw("Price", 430, 700);
    draw("Amount", 480, 700);

    draw(code, 50, 670);
    draw(description, 110, 670);
    draw("2", 300, 670);
    draw("ea", 340, 670);
    draw("$5.00", 390, 670);
    draw("$10.00", 480, 670);
  }

  return doc.save();
}

describe("page containment", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps other pages' results when one page throws an unexpected error", async () => {
    const bytes = await buildThreePagePdf();
    const original = linesModule.getPageTextItems;

    vi.spyOn(linesModule, "getPageTextItems").mockImplementation(async (doc, pageNumber) => {
      if (pageNumber === 2) {
        throw new Error("Injected fault for containment test");
      }
      return original(doc, pageNumber);
    });

    const result = await extract(bytes, "job-containment");

    expect(result.status).toBe("completed");
    expect(result.pages).toHaveLength(3);

    const page2 = result.pages.find((p) => p.page === 2);
    expect(page2?.status).toBe("refused");

    const page2Refusal = result.refusals.find((r) => r.page === 2);
    expect(page2Refusal?.code).toBe("PAGE_PROCESSING_ERROR");

    // Pages 1 and 3 were not taken down by page 2's failure.
    expect(result.items.map((i) => i.code).sort()).toEqual(["AA-101", "CC-303"]);
    expect(result.items.every((i) => i.page !== 2)).toBe(true);
    for (const item of result.items) {
      expect(item.evidence.page).toBe(item.page);
    }
  });
});
