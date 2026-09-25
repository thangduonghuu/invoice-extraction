export type InvalidFileReason = "not_pdf" | "too_large" | "empty";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export function validateFile(file: File): InvalidFileReason | null {
  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf) return "not_pdf";
  if (file.size === 0) return "empty";
  if (file.size > MAX_SIZE_BYTES) return "too_large";
  return null;
}
