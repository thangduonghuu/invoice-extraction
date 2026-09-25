import { getDocumentProxy } from "unpdf";
import { FileLevelError, type PdfDocumentLike } from "./types.js";

const PDF_MAGIC = "%PDF-";

/**
 * File-level checks only (the only failures allowed to fail the whole job).
 * Everything past this point is page-scoped and wrapped in its own try/catch
 * by the caller.
 */
export async function loadDocument(bytes: Uint8Array): Promise<PdfDocumentLike> {
  const header = Buffer.from(bytes.slice(0, 5)).toString("latin1");
  if (header !== PDF_MAGIC) {
    throw new FileLevelError({ code: "NOT_A_PDF", message: "File does not start with the PDF magic bytes (%PDF-)." });
  }

  try {
    const doc = await getDocumentProxy(bytes);
    return doc as unknown as PdfDocumentLike;
  } catch (err) {
    const name = err instanceof Error ? err.name : undefined;
    if (name === "PasswordException") {
      throw new FileLevelError({ code: "PDF_ENCRYPTED", message: "The PDF is password-protected." });
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new FileLevelError({ code: "PDF_CORRUPT", message: `The PDF could not be parsed: ${detail}` });
  }
}
