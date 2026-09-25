# Build prompt: Insta Quote AI take-home — PDF line-item extraction with evidence and refusals

You are a senior full-stack engineer working with me on a take-home assessment. Read this whole prompt before writing any code. Work in small steps, commit after each meaningful step with a clear message, and keep the scope tight: a smaller finished submission beats a larger unfinished one. Total budget is about 5 hours.

---

## 1. Goal

Build two parts:

- **Part A — extraction service.** Takes a PDF, returns JSON with:
  - `items`: extracted line items, each number carrying evidence (page number + exact source text it came from).
  - `refusals`: everything it refused to extract, and why.
  - `conflicts`: places where the document contradicts itself.
- **Part B — web page.** Uploads a PDF to Part A and shows the result, including refusals and conflicts, in plain language a non-technical tradesperson understands.

What the reviewers grade, in priority order:

1. Refuses in the right places and **never invents a number** to fill a gap.
2. A problem in one part of a file is **contained** (one bad page or row never takes down the rest).
3. **Every number is traceable** to a page and source text.
4. A refusal **reaches the user in plain language** — never collapsed into "An error occurred" / "Something went wrong".
5. Readable code, with tests on the refusal logic.
6. An **honest README** about uncertainty.

### The hard rule

> Never output a number you cannot point to a source for. Refusing is a correct result. Guessing is not.

Consequences you must respect everywhere:
- Never compute a value and present it as extracted (e.g. never output `qty × unitPrice` as an amount if the document has no amount column).
- Never "correct" a document (if the total is wrong, report the conflict; do not replace it with the right sum).
- Never convert units (kg ↔ g) or sum weights.
- Numbers inside descriptions (`90mm`, `M12x150`, `3m length`, `R2.6`) are never quantities.
- Computed values may be used **only for checking**. If one appears in a conflict message it must be marked `derived: true` with `inputs` pointing at the evidence it was computed from. It must never appear in `items`.

---

## 2. Stack and architecture

TypeScript everywhere. pnpm monorepo.

```
packages/schema   Zod schemas + ErrorCode / RuleCode enums, shared by API and web
packages/engine   extract(pdfBytes) → ExtractionResult. Pure, no AWS. Parsers, rule engine, tests.
apps/api          AWS Lambda handlers + infra (SST v3 or AWS CDK)
apps/web          Next.js (App Router, static export)
fixtures/         the 6 sample PDFs
```

**Principle:** the engine is a pure function that runs and is tested locally with no AWS account. Lambda handlers are thin adapters. Provide a local mode (`pnpm dev`) that runs the engine synchronously behind the same HTTP contract, so a reviewer can try it without deploying.

### Backend flow (AWS)

1. `POST /jobs` `{ fileName, size, contentType }` → `api` Lambda validates with Zod (`application/pdf` only, ≤ 10 MB, size > 0) → writes `META` item with `status=AWAITING_UPLOAD` → returns `{ jobId, uploadUrl }` (S3 presigned PUT, 5-minute expiry, Content-Type locked).
2. Browser PUTs the file directly to S3 (avoid Lambda's ~6 MB sync payload limit).
3. S3 `ObjectCreated` → SQS (batchSize 1, visibility timeout > Lambda timeout, `maxReceiveCount=3`) → `extract` Lambda.
4. `extract`: conditional update to `PROCESSING` → run engine → write results → conditional update to `COMPLETED`.
5. DLQ → small `dlq` Lambda sets `status=FAILED` with an `errorCode`. **A job must never stay "processing" forever.**
6. `GET /jobs/{id}` → `api` Lambda queries DynamoDB → returns status + result, validated against the shared schema before returning.

Lambda: Node 20, 1024 MB, 60 s timeout.

If time runs short, cut SQS + presigned upload first (upload through Lambda, document the ~6 MB limit in the README). **Never cut the rule engine or its tests.**

### DynamoDB — single table `Jobs`

| PK | SK | Contents |
|---|---|---|
| `JOB#<ulid>` | `META` | status, fileName, s3Key, sha256, pageCount, errorCode, errorDetail, createdAt, updatedAt, `ttl` (7 days) |
| `JOB#<ulid>` | `PAGE#0001` … | pageStatus (`ok` / `refused`), method (`text_layer` / `ocr`), sectionTitle, items[], refusals[] |
| `JOB#<ulid>` | `DOC` | document-level conflicts and warnings |

- `getJob` is one `Query` on PK.
- Status transitions use `ConditionExpression` so SQS retries can't overwrite a finished job.
- Money is stored as **integer cents** plus the raw string. Never floats.

---

## 3. Reading PDFs

### Libraries

| Library | Use |
|---|---|
| `unpdf` (serverless build of pdf.js) | **Primary.** `getDocumentProxy()` → per page `page.getTextContent()` gives each text item with `transform[4]` (x) and `transform[5]` (y). |
| `pdfjs-dist` (legacy build) | Acceptable alternative with the same API. |
| `pdf-parse` | **Do not use.** Flattens to one string, loses coordinates, merges page boundaries. |
| `pdf-lib` | Only if OCR is implemented: split one scanned page into a 1-page PDF for Textract. |
| `@aws-sdk/client-textract` `AnalyzeExpense` | **Stretch goal only, behind a flag, off by default.** |

This is **not** OCR. Text-layer PDFs contain real characters; we read them exactly. OCR is only relevant for pages that are images.

### Routing per page (never per file)

```ts
const text = await page.getTextContent();
const chars = text.items.map(i => i.str).join("").replace(/\s/g, "").length;
if (chars >= 20) return parseTextLayer(text);      // method: "text_layer"
if (OCR_ENABLED)  return ocrPage(pageBytes);        // method: "ocr" + confidence (stretch)
return refuse("NO_TEXT_LAYER", pageNumber);         // default MVP behaviour
```

### Extraction algorithm

**File level** (the only failures allowed to fail the whole job):
- Magic bytes must be `%PDF-` → else `NOT_A_PDF`.
- pdf.js `PasswordException` → `PDF_ENCRYPTED`. Any other load failure → `PDF_CORRUPT`.

**Page level** — each page wrapped in its own `try/catch`. An unexpected exception on one page becomes a refusal `PAGE_PROCESSING_ERROR` for that page only; other pages continue.

1. Get text items with coordinates.
2. Text-layer check (above).
3. Group items into lines by `y` (tolerance ±2 pt), sort each line by `x`.
4. Find the header line (contains `Code`, `Description`, `Qty` …). Record each column's x-range. No header → refuse the table on that page (`TABLE_HEADER_NOT_FOUND`).
5. Data rows = lines between the header and the first `Subtotal` / `Total` / `Page n of m` / notes line whose first cell matches `^[A-Z]{2}-\d{3,4}$`.
6. Assign cells to columns by x-overlap with the header ranges (this is what stops `3m length` in a description being read as a quantity).
7. Parse each cell with strict parsers. A failed cell → refuse **that row only** (`ROW_UNPARSEABLE`, include the raw line).
8. Capture labelled facts: `Subtotal:`, `GST (15%):`, `Total (incl GST):`, `Total:`, and count statements like `(\d+) cartons`.
9. Read the section title (second header line) and classify it.

**Document level:** run the rule engine across pages.

### Strict field parsers

- Money: `^-?\$\d{1,3}(,\d{3})*\.\d{2}$` → integer cents. No `parseFloat` on money.
- Quantity: `^\d+(\.\d+)?$`.
- Unit: whitelist `ea | box | pack | kit | length | carton | tub`. Unknown → refuse the field.
- Unit price with suffix (`$74.00 /carton`): split into price + `perUnit`; flag that the unit came from the suffix, not a Unit column.
- Weight (`20kg`, `640g total`, `1.4kg`): keep the raw string only. Never convert or sum.

### Evidence

Every extracted number carries:

```ts
{ page: number; sourceText: string; rawValue: string; method: "text_layer" | "ocr"; bbox?: [number, number, number, number]; ocrConfidence?: number }
```

Hard invariants, enforced in the Zod output schema with `.superRefine()` so a bug cannot serialise an unsourced number:
- `evidence.sourceText.includes(evidence.rawValue)`
- `parse(evidence.rawValue) === value`

---

## 4. Rule engine

Each rule has a code, severity, scope, and a plain-language message template.

| Code | Scope | Outcome |
|---|---|---|
| `NO_TEXT_LAYER` | page | refusal |
| `PAGE_PROCESSING_ERROR` | page | refusal |
| `TABLE_HEADER_NOT_FOUND` | page | refusal |
| `ROW_UNPARSEABLE` | row | refusal with raw line |
| `LINE_MATH_MISMATCH` (qty × unit price ≠ amount) | row | item kept, `status: "conflict"` |
| `AMOUNT_NOT_STATED` | field | `amountCents: null` + reason |
| `UNIT_FROM_PRICE_SUFFIX` | field | warning |
| `WEIGHT_BASIS_AMBIGUOUS` | field | refusal to normalise; raw string kept |
| `SUBTOTAL_MISMATCH` (Σ amounts ≠ subtotal) | doc | conflict |
| `GST_MISMATCH` (subtotal × 15% ≠ GST, half-cent tolerance) | doc | conflict |
| `TOTAL_MISMATCH` (subtotal + GST ≠ total) | doc | conflict |
| `CONFLICTING_STATEMENTS` (same fact, different values) | doc | conflict listing both evidences; pick neither |
| `TOTAL_BASIS_UNCLEAR` (tax invoice with a bare `Total` and no GST line) | doc | warning |
| `NON_BILLABLE_SECTION` (Summary, Freight, Credit Note, Delivery Confirmation) | page | items `status: "needs_review"` |
| `NOTHING_TO_RECONCILE` (no subtotal/total present) | doc | info |

---

## 5. Expected behaviour on the six sample files (acceptance tests)

Write one test per file in `packages/engine`. These are the contract.

| File | What's in it | Expected |
|---|---|---|
| **IB-55871** | Clean text PDF. 4 lines (FX-201, FX-118, RF-330, IN-045). Subtotal $3,259.00, GST $488.85, total $3,747.85 — all reconcile. | 4 items `ok`, no refusals, no conflicts. No quantity parsed from `90mm`, `M12x150`, `65mm`, `R2.6`. `20 days` is not extracted. |
| **IB-55902** | **Scanned image, no text layer** (3 lines visible in the image). | 0 items. Refusal `NO_TEXT_LAYER` on page 1. Job status is **not** failed. |
| **IB-56010** | Columns are `Qty, Weight, Unit Price`. No Amount or Unit column. Weights mixed and unconverted (`20kg`, `640g total`, `1.4kg`, `500g`). Prices like `$74.00 /carton`. No totals. | 4 items with qty + unit price + raw weight string. Every `amountCents` is `null` with `AMOUNT_NOT_STATED`. `WEIGHT_BASIS_AMBIGUOUS` on weights. `UNIT_FROM_PRICE_SUFFIX` warnings. `NOTHING_TO_RECONCILE`. The numbers `222`, `22200` must not appear anywhere in items. |
| **IB-56088** | 3 lines reconcile to `Total: $2,050.00`. Header says **9 cartons dispatched**; warehouse notes say **11 cartons picked**. No GST line. | 3 items `ok`. `CONFLICTING_STATEMENTS` with both the 9 and 11 evidence lines, no winner chosen. `TOTAL_BASIS_UNCLEAR`. |
| **IB-56150** | 4 lines reconcile to subtotal $1,270.00; GST $190.50 is correct; **stated total $1,501.80 but subtotal + GST = $1,460.50**. | 4 items `ok`. `TOTAL_MISMATCH` conflict. `146050` / `1460.50` never appears in items (only, if at all, as `derived: true` inside the conflict). |
| **IB-STMT47** | 8 pages, same doc number. Pages 1–4 "Invoice n of 4" (Materials/Fixings). **Page 4 is a scanned image.** Pages 5–8 are "Statement Summary", "Freight Charges", "Credit Note Reference", "Signed Delivery Confirmation" but still list positive line items. No totals anywhere. Raw text merges page boundaries (`Page 1 of 8Ironbark…`). | Pages 1–3: 3 items each, `ok`. Page 4: `NO_TEXT_LAYER` refusal, **pages 1–3 and 5–8 still returned**. Pages 5–8: items returned with `needs_review` + `NON_BILLABLE_SECTION`. `NOTHING_TO_RECONCILE`. Every item's `evidence.page` is correct. |

Plus:
- A property test: for every item from every fixture, `sourceText.includes(rawValue)` holds.
- A containment test: inject a throwing page parser for one page and assert the other pages still return.

---

## 6. Output schema (shape)

```json
{
  "jobId": "01J…",
  "status": "completed" ,
  "outcome": "clean | has_issues",
  "pages": [{ "page": 4, "status": "refused", "method": null, "sectionTitle": "Invoice 4 of 4 - Fixings" }],
  "items": [{
    "id": "p1-r1", "page": 1, "code": "PL-201", "description": "Copper pipe 15mm, 3m length",
    "qty": 40, "unit": "length", "unitPriceCents": 1460, "amountCents": 58400,
    "status": "ok | needs_review | conflict",
    "evidence": { "page": 1, "method": "text_layer",
      "sourceText": "PL-201 Copper pipe 15mm, 3m length 40 length $14.60 $584.00",
      "fields": { "qty": "40", "unitPrice": "$14.60", "amount": "$584.00" } },
    "flags": []
  }],
  "refusals": [{ "code": "NO_TEXT_LAYER", "scope": "page", "page": 4,
    "message": "Page 4 is a scanned image, so we couldn't read its numbers reliably.",
    "action": "Check the lines on page 4 against the paper copy." }],
  "conflicts": [{ "code": "TOTAL_MISMATCH", "evidenceRefs": ["subtotal", "gst", "total"],
    "message": "The invoice total ($1,501.80) doesn't equal the subtotal ($1,270.00) plus GST ($190.50).",
    "derived": { "value": "1460.50", "inputs": ["subtotal", "gst"] } }]
}
```

Refusals and conflicts are **successful results**, not errors. Job `status: "failed"` is reserved for when the system could not process the file at all, and always carries a specific `errorCode`.

---

## 7. Frontend (Part B)

- Next.js static export → S3 + CloudFront (OAC). TanStack Query: mutation for create + upload, `useQuery` with `refetchInterval` for polling that stops on a terminal status. Upload via `XMLHttpRequest` for real progress.
- UI copy in English (users are in New Zealand and Australia), plain and non-technical.

### State is a discriminated union, never a generic error string

```ts
type UploadState =
  | { kind: "idle" }
  | { kind: "invalid_file"; reason: "not_pdf" | "too_large" | "empty" }
  | { kind: "creating" }
  | { kind: "uploading"; progress: number }
  | { kind: "processing"; jobId: string; since: number }
  | { kind: "done"; result: ExtractionResult }            // includes results with refusals
  | { kind: "failed"; code: ErrorCode; message: string; detail?: string; retryable: boolean; jobId?: string };
```

### One `toUserError()` function for every failure path

| Situation | Code | User sees |
|---|---|---|
| Not a PDF | `NOT_PDF` | "This file isn't a PDF. Please upload the invoice as a PDF." |
| Too large | `TOO_LARGE` | "This file is over 10 MB. Try a smaller export of the document." |
| S3 403 | `UPLOAD_LINK_EXPIRED` | "The upload link expired before the file finished sending. Please try again." |
| Offline | `OFFLINE` | "You appear to be offline. Nothing was uploaded." |
| Job failed | `PDF_ENCRYPTED` / `PDF_CORRUPT` / `NOT_A_PDF` | Specific sentence per code, e.g. "This PDF is password-protected, so we can't open it." |
| Polling > 90 s | `SLOW` (not an error) | "Still reading your document — this one is taking longer than usual." |
| Response fails Zod parse | `RESPONSE_SHAPE_INVALID` | "We got a response we didn't expect." + collapsible technical detail |

The last-resort fallback still shows the underlying message and the `jobId`. It never says only "An error occurred". The React error boundary uses the same function.

### Result screen

- Summary banner, e.g. "11 lines read · 1 page couldn't be read · 1 total doesn't add up".
- Items table; each row expands to show `Page n` and the source text in monospace with the raw values highlighted. Badges: ok / needs review / conflict.
- Refusals list: each entry answers **what** (which page/line), **why**, **what to do**.
- Conflicts: show both pieces of evidence side by side, e.g. "Summary says 9 cartons · Warehouse notes say 11 cartons", and state that we didn't pick one.
- The frontend never computes money: no sums, no conversions. Every number shown comes from the response.
- Message catalog keyed by code (title, explanation, action); fall back to the server message; always show the code in small text.
- `aria-live` region for status changes.
- One component test (Testing Library): render a fixture with a refusal and assert the plain-language sentence appears and "error occurred" does not.

---

## 8. README (required)

Answer three questions honestly:

1. **Hardest decision and why.** Candidates: refusing scanned pages vs OCR (OCR text isn't "exact source text"); whether derived values may appear in conflict messages; treating STMT47 pages 5–8 as needs-review rather than billable.
2. **Where I'm not confident.** e.g. line-grouping tolerance on unusual layouts; the section-type heuristic for STMT47; what the weights in IB-56010 mean (per unit vs per line); any infra step cut for time.
3. **What I'd do with three more days.** e.g. OCR via Textract `AnalyzeExpense` with confidence thresholds and arithmetic cross-checks; bounding-box highlighting on a rendered page; a broader corpus of real layouts; auth and per-customer storage.

Also include: how to run locally, how to run tests, how to deploy, the architecture diagram, and a short table of what each sample file produces.

---

## 9. Suggested order and time budget

| Time | Work |
|---|---|
| ~2 h | `schema` + `engine` + the six fixture tests + property and containment tests (heaviest-weighted part) |
| ~0.75 h | Lambda handlers, DynamoDB, S3, SQS/DLQ, deploy |
| ~1.5 h | Web: upload, polling, items / refusals / conflicts display, error mapping |
| ~0.75 h | README, cleanup, final commits |

## 10. Definition of done

- `pnpm test` passes locally with no AWS credentials.
- All six fixtures behave as in section 5.
- No number in any output lacks page + source text evidence.
- One broken page never removes results from other pages.
- Every refusal, conflict and failure reaches the screen as a specific plain-language sentence.
- The repo has a visible, meaningful commit history and an honest README.

When you are unsure about a behaviour, choose the option that refuses or flags rather than the option that guesses, and note the decision so it can go in the README.
