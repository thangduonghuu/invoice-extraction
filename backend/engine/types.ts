/** A single positioned character run as read from the PDF text layer. */
export interface RawTextItem {
  str: string;
  x: number;
  y: number;
}

/** Text items grouped onto one visual line, sorted left to right. */
export interface Line {
  y: number;
  items: RawTextItem[];
  text: string;
}

export type ColumnKey = "code" | "description" | "qty" | "unit" | "unitPrice" | "amount" | "weight";

export interface ColumnRange {
  key: ColumnKey;
  label: string;
  xStart: number;
  xEnd: number;
}

/** A labelled document-level fact captured from a page, e.g. "Subtotal: $3,259.00". */
export interface DocFact {
  page: number;
  sourceText: string;
  rawValue: string;
  valueCents: number;
}

export interface DocFacts {
  subtotal?: DocFact;
  gst?: DocFact;
  total?: DocFact;
}

/** A "(N) cartons ..." style count statement, collected doc-wide for conflict detection. */
export interface CountStatement {
  key: string;
  page: number;
  sourceText: string;
  rawValue: string;
  value: number;
}

export interface FileLevelErrorInfo {
  code: "NOT_A_PDF" | "PDF_ENCRYPTED" | "PDF_CORRUPT";
  message: string;
}

export class FileLevelError extends Error {
  code: FileLevelErrorInfo["code"];
  constructor(info: FileLevelErrorInfo) {
    super(info.message);
    this.name = "FileLevelError";
    this.code = info.code;
  }
}

export interface PdfPageLike {
  getTextContent(): Promise<{ items: unknown[] }>;
}

export interface PdfDocumentLike {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageLike>;
}
