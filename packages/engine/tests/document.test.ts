import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { loadDocument } from "../src/document.js";
import { FileLevelError } from "../src/types.js";

describe("loadDocument", () => {
  it("refuses a file that doesn't start with the PDF magic bytes (NOT_A_PDF)", async () => {
    const notAPdf = new TextEncoder().encode("this is a plain text file, not a PDF");
    await expect(loadDocument(notAPdf)).rejects.toMatchObject({ code: "NOT_A_PDF" });
    await expect(loadDocument(notAPdf)).rejects.toBeInstanceOf(FileLevelError);
  });

  it("refuses a file with the right magic bytes but unparseable content (PDF_CORRUPT)", async () => {
    const truncated = new TextEncoder().encode("%PDF-1.7\nnot actually a valid PDF body");
    await expect(loadDocument(truncated)).rejects.toMatchObject({ code: "PDF_CORRUPT" });
  });

  it("loads a well-formed PDF", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([612, 792]);
    const bytes = await doc.save();

    const loaded = await loadDocument(bytes);
    expect(loaded.numPages).toBe(1);
  });

  // PDF_ENCRYPTED relies on pdf.js reporting a PasswordException, which needs
  // a real password-protected PDF - pdf-lib can't produce one, and none of
  // the fixtures are described as encrypted. Untested; see README.
});
