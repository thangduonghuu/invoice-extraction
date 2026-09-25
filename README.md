# Insta Quote AI - invoice line-item extraction with evidence and refusals

Built from `PROMPT.md`. Two parts in one pnpm monorepo:

- **Part A** (`packages/engine`, `backend`) - a pure `extract(pdfBytes) -> ExtractionResult` function, adapted onto AWS Lambda via AWS Amplify Gen 2.
- **Part B** (`web`) - a React (Vite) page that uploads a PDF and shows the result in plain language.

The one rule everything else follows: **never output a number you can't point to a source for. Refusing is a correct result; guessing is not.**

```
packages/schema   Zod schemas, ErrorCode/RuleCode enums - shared by engine, backend and web
packages/engine   extract(pdfBytes) -> ExtractionResult. Pure, no AWS. Parsers, rule engine, tests.
backend/          Lambda handlers + AWS Amplify Gen 2 infra, and a local synchronous dev server
web/              React + Vite SPA, deployed via AWS Amplify Hosting
fixtures/         the 6 sample PDFs - all present and passing
```

**Contents:** [A note on this session](#a-note-on-this-session) · [How to run it](#how-to-run-it) ([Tests](#tests), [Deploying](#deploying)) · [What was actually deployed and tested](#what-was-actually-deployed-and-tested) · [Architecture](#architecture) · [Source layout](#source-layout) · [What the six sample files produce](#what-the-six-sample-files-are-expected-to-produce) · [Hardest decisions](#hardest-decisions-and-why) · [Where I'm not confident](#where-im-not-confident) · [Three more days](#what-id-do-with-three-more-days)

## A note on this session

`PROMPT.md` originally specified SST v3 (or CDK) for the backend, and a Next.js static export -> S3 + CloudFront for the frontend. Partway through, the user asked to switch to **AWS Amplify Gen 2** for the backend (so `npx ampx sandbox` gives a personal, disposable cloud environment to test against) and to **plain React + Vite** for the frontend (no Next.js). Both are deliberate, requested deviations from the written spec, not oversights - `packages/schema` and `packages/engine` (the heaviest-weighted part) are completely unaffected either way, since they're framework-agnostic pure TypeScript.

Two things to know about the current state:

1. **The 6 sample PDFs are in `fixtures/` and all 15 `fixtures.test.ts` cases pass, for real, against the real files** - not a skip. They weren't available for most of this session (see git history if you want the "skips, not fails" scaffolding-era story), and dropping them in surfaced a real bug: `findSectionTitle` originally took "the nearest non-empty line above the table header", which happened to work on hand-built test data but was wrong against the real layouts - every real page has a fixed two-line header (company letterhead, then the actual section title: "Tax Invoice", "Invoice 1 of 4 - Materials", "Statement Summary", etc.), with narrative lines and metadata (Date, Bill to) *between* that title and the table. The old heuristic sometimes grabbed a "Date: ..." line (never useful) and, on IB-56088, grabbed a narrative line ("Summary: 9 cartons dispatched...") that coincidentally contained the word "summary" and wrongly marked all 3 of that invoice's items `needs_review`. Fixed by reading the section title from a fixed position (the second line on the page) instead of searching upward from the header - see `packages/engine/src/header.ts`. `packages/engine/tests/property.test.ts` (the sourceText/rawValue invariant, checked across every item from every fixture) also passes for real now.
2. **The backend was actually deployed and verified, for real, in this session** - this is not a paper design. `backend` was deployed with `npx ampx sandbox` into AWS account `042704721766` (region `ap-southeast-1`, sandbox identifier `thangduong`), and the full pipeline was driven end to end against it: `POST /jobs` → presigned S3 upload → real `ObjectCreated` → SQS → the real `extract` Lambda → DynamoDB → `GET /jobs/{id}` returning the fully correct, schema-valid result, all within about two seconds. Then `web` (the Vite app) was pointed at that live API URL and driven through a real Chromium browser, uploading a real PDF and rendering the real result - not a mock. See "What was actually deployed and tested" below for the exact resources and how to reproduce or tear it down.

## How to run it

Requires Node >= 20 and pnpm.

```bash
pnpm install

# Terminal 1 - the API, running synchronously with no AWS account
pnpm dev                 # -> http://localhost:8787

# Terminal 2 - the web app
pnpm dev:web              # -> http://localhost:5173, talks to localhost:8787 by default
```

Drop a PDF onto the page and watch it go through creating -> uploading -> processing -> done, or drop a non-PDF / oversized file and watch the refusal path.

To point the web app at a deployed API instead, set `VITE_API_URL` (e.g. in `web/.env.local`) before running/building it.

### Tests

```bash
pnpm test    # runs every workspace's tests: schema, engine, api, web - no AWS credentials needed
pnpm build   # type-checks/builds every package, and produces web/dist (the production build)
```

`pnpm test` is genuinely offline: the engine tests use synthetic PDFs and hand-built fixtures, `backend`'s tests exercise only its pure functions (DynamoDB item reassembly, S3-event parsing) without calling AWS, and `web`'s test renders a component with React Testing Library.

### Deploying

**API (Part A) - AWS Amplify Gen 2:**

```bash
cd backend
npx ampx sandbox                 # personal cloud sandbox: watches amplify/ and redeploys on save
npx ampx sandbox --once          # single deploy, no watching (what CI/a script would use)
npx ampx sandbox delete --yes    # tear it down
```

`amplify/backend.ts` defines the DynamoDB table, upload bucket, queue + DLQ, and the four Lambda functions (`amplify/functions/*`) via `defineBackend` plus the CDK escape hatch for the pieces Amplify's built-in constructs don't cover (this API has no Auth/Data - it's a plain REST contract, so there was no reason to pull in Amplify's GraphQL Data layer). A successful deploy writes `backend/amplify_outputs.json` with the API URL under `custom.apiUrl` (gitignored - it's per-deployment, not a build artifact).

For a real (non-sandbox) branch deployment, connect the repo in the Amplify Console the same way as the web app below and use `npx ampx pipeline-deploy --branch <name> --app-id <id>` in CI, or just keep using a sandbox per environment - not attempted in this session.

**Web (Part B) - AWS Amplify Hosting:**

1. In the Amplify Console, create a new app from this Git repo.
2. Under the app's monorepo settings, set **App root directory** to `web` - Amplify will then pick up `web/amplify.yml`, which `cd ..`s back to the repo root to run `pnpm install` (workspace-aware) and `pnpm --filter @invoice-extractor/web build`, and publishes `web/dist` (the Vite production build).
3. Add an environment variable `VITE_API_URL` set to the API URL from `amplify_outputs.json` (or the sandbox output), so the deployed site talks to the deployed API instead of `localhost:8787`.

This Hosting side (the Console app + `amplify.yml`) was written carefully but not actually connected to a Console app in this session - see "Where I'm not confident".

## What was actually deployed and tested

Unlike the write-up below for the frontend hosting, this part is not a caveat - it happened, in this session, against a real AWS account:

- **Account / region:** `042704721766`, `ap-southeast-1`, sandbox identifier `thangduong` (stack `amplify-invoiceextractorapi-thangduong-sandbox-2381b09381`).
- **What got created:** the `Jobs` DynamoDB table, the uploads S3 bucket (with the `ObjectCreated` -> SQS notification), the `ExtractQueue` + `ExtractDlq` SQS queues, all four Lambda functions (`create-job`, `get-job`, `extract`, `dlq`), and an HTTP API (API Gateway v2) with `POST /jobs` and `GET /jobs/{id}` routes - exactly the architecture below, provisioned by `amplify/backend.ts`, no manual console clicking.
- **What was verified, live, not mocked:** `POST /jobs` returned a real presigned S3 URL; `PUT`-ing a real generated PDF to it succeeded; the resulting `ObjectCreated` event actually flowed through SQS and triggered the real `extract` Lambda; `GET /jobs/{id}` returned `status: "COMPLETED"` with the correct, schema-valid extraction result within ~2 seconds of upload. Separately, the Vite frontend was pointed at that live API URL and driven through a real headless Chromium (Playwright) - picked a real file, watched it upload, poll, and render the correct result in the actual UI.
- **What this proves and doesn't prove:** it proves the architecture, IAM permissions, event wiring (S3->SQS->Lambda), and the schema contract between backend and frontend all work together for real. It does **not** prove the DLQ path fires correctly under real failure/retry conditions (that would need forcing three real failed SQS deliveries), and it doesn't cover a non-sandbox `pipeline-deploy` or the Amplify Hosting Console side for the web app.
- **This sandbox may still be running.** If you want to poke at it yourself, ask for the current `apiUrl` from `backend/amplify_outputs.json` (not committed), or run `npx ampx sandbox --once` from `backend` again (updates in place) and read it from there. Tear it down with `npx ampx sandbox delete --yes` from `backend` when you're done with it - sandbox resources are billed like any other AWS resources, just easy to identify and remove.

## Architecture

```
                              ┌──────────────┐
  Browser ── POST /jobs ────▶ │  create-job  │──▶ DynamoDB: PUT META (AWAITING_UPLOAD)
                              │   (Lambda)   │──▶ S3 presigned PUT URL (5 min, Content-Type locked)
                              └──────────────┘
  Browser ── PUT file ───────────────────────────▶ S3 (uploads/<jobId>.pdf)
                                                        │
                                                 ObjectCreated
                                                        ▼
                                                    SQS (batchSize 1)
                                                        │
                                              ┌──────────────────┐
                                              │     extract      │──▶ DynamoDB: PROCESSING (conditional)
                                              │     (Lambda)     │──▶ engine.extract(bytes)
                                              └──────────────────┘──▶ DynamoDB: PAGE#000N x N, DOC, COMPLETED
                                                        │  (unexpected throw, not a FileLevelError)
                                                        ▼
                                              SQS retries x3 ──▶ DLQ ──▶ dlq Lambda ──▶ DynamoDB: FAILED

  Browser ── GET /jobs/{id} ─▶ │  get-job (Lambda)  │──▶ DynamoDB Query (one, on PK) ──▶ validated JobRecord
                    (polled, TanStack Query, stops on a terminal status)
```

Local mode (`pnpm dev`) collapses the right-hand side into one process: `PUT /upload/:jobId` runs `extract()` synchronously against an in-memory store, behind the identical three-call contract (`POST /jobs`, `PUT` the `uploadUrl`, `GET /jobs/{id}`).

**DynamoDB, single table `Jobs`:**

| PK | SK | Contents |
|---|---|---|
| `JOB#<ulid>` | `META` | status, fileName, s3Key, errorCode/errorDetail, createdAt/updatedAt, ttl (7 days) |
| `JOB#<ulid>` | `PAGE#0001` ... | pageStatus, method, sectionTitle, that page's items[], that page's refusals[] |
| `JOB#<ulid>` | `DOC` | document-level conflicts[], document-level refusals[] |

`get-job` is one `Query` on `PK`. Status transitions use a `ConditionExpression` on the current status so an SQS redelivery can never overwrite a job that already moved on - and the DLQ handler means a job can never stay "processing" forever.

## Source layout

Every file below has exactly one job - this is the map for finding it.

```
packages/schema/src/
  codes.ts         RuleCode / ErrorCode / JobStatus enums
  parsers.ts       canonical money/qty parsers - shared with the engine so
                   extraction and validation can never drift apart
  extraction.ts    the ExtractionResult schema and its sourceText/rawValue
                   invariants (.superRefine)
  job.ts           the job/API contract: CreateJobRequest/Response, JobRecord

packages/engine/src/
  document.ts      file-level PDF load: magic bytes, encrypted/corrupt
  lines.ts         per-page text-layer read + line grouping (y tolerance)
  header.ts        column detection by x-range, section-title classification
  rows.ts          data-row scanning, strict field parsing, item assembly
  facts.ts         doc-wide Subtotal/GST/Total + count-statement capture
  rules.ts         reconciliation and conflicting-statement rules
  refusals.ts      plain-language refusal message builders
  parsers.ts       extraction-specific field parsers (unit, weight, price+suffix)
  extract.ts       orchestrator - wires the above into extract(pdfBytes)
  types.ts         internal types shared across the files above

backend/
  amplify/backend.ts        defineBackend + CDK: DynamoDB table, S3 bucket,
                             SQS queues, HTTP API, wired to the four functions
  amplify/functions/*/      one folder per Lambda (create-job, get-job,
                             extract, dlq) - each resource.ts just configures
                             runtime/memory/timeout; each handler.ts re-exports
                             the real implementation from src/handlers/
  src/jobsTable.ts          single-table DynamoDB access: create/transition/write/read
  src/s3Event.ts            recovers a jobId from the S3-event-via-SQS message
  src/localServer.ts        `pnpm dev` - the same HTTP contract, run synchronously, no AWS
  src/handlers/             the real Lambda logic: createJob, getJob, extract, dlq

web/src/
  main.tsx / App.tsx    Vite entry point and the top-level page shell
  index.css             the whole design system: CSS custom-property tokens
                        (color/radius/shadow), light + dark mode via
                        prefers-color-scheme, no component library
  lib/apiClient.ts      talks to the API (createJob / uploadFile / getJob),
                        throws AppError
  lib/uploadState.ts    the UploadState discriminated union
  lib/errors.ts         the ErrorCode -> plain-language message catalog
                        (toUserError - every failure path goes through it)
  lib/ruleCatalog.ts    short display titles for RuleCodes
  lib/validateFile.ts   client-side pre-upload checks (type/size/empty)
  components/           UploadPanel orchestrates the state machine; ResultView /
                        ItemsTable / RefusalsList / ConflictsList render a
                        completed result; FailedView + ErrorBoundary render
                        every failure path; StatusAnnouncer is the aria-live
                        region announcing status changes to screen readers
```

## What the six sample files are expected to produce

This is the contract `packages/engine/tests/fixtures.test.ts` encodes (see `PROMPT.md` section 5) - verified against the real files, all 15 test cases passing.

| File | Expected |
|---|---|
| IB-55871 | 4 items, all `ok`, no refusals, no conflicts. `90mm`/`M12x150`/`20 days` etc. never parsed as quantities. |
| IB-55902 | Scanned, no text layer. 0 items, one `NO_TEXT_LAYER` refusal on page 1, job still `completed`. |
| IB-56010 | 4 items with qty + unit price + a raw, unconverted weight string; `amountCents: null` + `AMOUNT_NOT_STATED` on every item; `WEIGHT_BASIS_AMBIGUOUS` and `UNIT_FROM_PRICE_SUFFIX` flags; `NOTHING_TO_RECONCILE`. |
| IB-56088 | 3 items, all `ok`. `CONFLICTING_STATEMENTS` (9 vs 11 cartons, neither picked). `TOTAL_BASIS_UNCLEAR` (bare total, no GST line). |
| IB-56150 | 4 items, all `ok`. `TOTAL_MISMATCH` conflict; the correct sum ($1,460.50) appears only as a `derived` value inside that conflict, never as an item's amount. |
| IB-STMT47 | 8 pages, page 4 scanned. Pages 1-3 and 5-8 all still return items despite page 4 failing. Pages 5-8 are `needs_review` + `NON_BILLABLE_SECTION`. `NOTHING_TO_RECONCILE` (no totals anywhere). Every item's `evidence.page` is correct. |

## Hardest decisions, and why

- **Refusing scanned pages instead of doing OCR.** `PROMPT.md` requires `sourceText` to be the *exact* source text a number came from. OCR output is a model's best guess at what characters are on the page, not a verbatim quote - treating it as equivalent evidence would quietly weaken the one hard rule this whole system exists to enforce. OCR stays a flagged, off-by-default stretch (`OCR_ENABLED`), matching the prompt's own guidance.
- **Where a computed number is allowed to appear at all.** Every doc-level reconciliation rule (`SUBTOTAL_MISMATCH`/`GST_MISMATCH`/`TOTAL_MISMATCH`) computes a value only to compare it against a stated fact, and that computed value is only ever attached to the resulting `conflict.derived` object - it's structurally impossible for it to end up on an `Item`, because nothing in the row-building code path ever touches `docFacts`.
- **Splitting refusals vs. conflicts for `TOTAL_BASIS_UNCLEAR` / `NOTHING_TO_RECONCILE`.** The rule table in section 4 labels these "warning" and "info" rather than "conflict", but the output schema in section 6 only shows two arrays. I put them in `refusals[]` (scope `"doc"`) rather than `conflicts[]`, since their shape - a plain-language `message` + `action`, no `evidenceRefs`/`derived` - matches a refusal, not a contradiction. This was the most ambiguous single call in the whole schema and is worth a second look once real output is being reviewed.
- **What counts as "a failed cell" for `ROW_UNPARSEABLE` vs. a field-level flag.** Section 3 says the unit whitelist failing means "refuse the field", but section 3's algorithm (step 7) says "a failed cell -> refuse that row (`ROW_UNPARSEABLE`)". I read the unit whitelist as *part of* "strict parsing" for that field, so a bad unit refuses the whole row, same as a bad money or quantity cell. By contrast, `AMOUNT_NOT_STATED` / `WEIGHT_BASIS_AMBIGUOUS` / `UNIT_FROM_PRICE_SUFFIX` are not cell failures - they're normal outcomes for a document shaped that way - so those live as `item.flags`, not row refusals.
- **Treating STMT47 pages 5-8 as `needs_review`, not dropped or fully billable.** They still contain real, sourced line items, so refusing them outright would throw away real evidence; presenting them identically to pages 1-3 would misrepresent a Credit Note / Delivery Confirmation as an invoice line. `NON_BILLABLE_SECTION` keeps the data and the distinction.
- **Co-locating every Amplify function in one custom CDK stack (`resourceGroupName`).** By default, Amplify puts every `defineFunction()` into one shared "function" nested stack. This API's functions need IAM grants, environment variables, and SQS event sources wired up *after* the DynamoDB table/bucket/queues exist (in a second custom stack) - and that cross-stack reference in both directions is a CloudFormation circular dependency, not just an Amplify quirk. Setting `resourceGroupName` on all four functions to the same name as the custom stack, then retrieving that stack via `Stack.of(backend.createJob.resources.lambda)` instead of calling `backend.createStack()` again, was the fix - documented inline in `amplify/backend.ts` since it's non-obvious and easy to reintroduce by "simplifying" the file.

## Where I'm not confident

- **Header/column detection and the section-title heuristic are now verified against the real fixtures** (all 15 `fixtures.test.ts` cases pass), but only against these 6 layouts, all from the same fictional company template. A genuinely different invoice design (merged cells, wrapped descriptions, unusual header wording, a letterhead that isn't exactly two lines) would likely still need adjustment - the fix described above (section title = the fixed second line of the page) is more robust than the original "search upward from the header" guess, but it's still a fixed-position rule, not a general one.
- **GST half-cent tolerance.** Money is integer cents, so "half a cent" isn't directly representable; I implemented it as a ±1 cent tolerance around `round(subtotal * 0.15)`. Confirmed against IB-55871's real numbers (GST reconciles exactly, no tolerance actually needed there) but the tolerance itself is still a judgment call for cases where it would matter.
- **`CONFLICTING_STATEMENTS` is narrow.** It only recognizes the pattern `(\d+)\s*cartons?` - it would need a broader vocabulary (and probably NLP rather than regex) to catch other kinds of contradicting narrative statements in real documents.
- **IB-56010's weights.** I have no way to know from the prompt alone whether `20kg` etc. means per-unit or per-line - so I don't guess; the raw string is kept, untouched, unconverted, unsummed, exactly as the hard rule requires.
- **`PDF_ENCRYPTED` is untested.** `document.test.ts` covers `NOT_A_PDF` and `PDF_CORRUPT` against real (if synthetic) byte content, but the encrypted path relies on pdf.js reporting a `PasswordException`, which needs an actual password-protected PDF - `pdf-lib` can't produce one, and none of the 6 fixtures are described as encrypted. The code path (`document.ts`, checking `err.name === "PasswordException"`) is short and directly mirrors pdf.js's own documented behaviour, but it's asserted, not verified.
- **The DLQ path under real failure conditions.** The happy path (upload -> extract -> COMPLETED) was verified live. Forcing three genuine failed SQS deliveries to prove the DLQ -> `dlq` Lambda -> `FAILED` status path fires correctly in the deployed environment was not done - only reasoned through and unit-tested (`jobsTable.test.ts`'s `forceFailIfNotTerminal` coverage).
- **`sha256` on the META item.** It's in the schema (per section 2's table) but nothing currently computes or writes it - flagged rather than silently dropped.
- **Amplify Hosting for the web app.** `web/amplify.yml` is written to Amplify Hosting's documented monorepo build-spec format and reasoned through carefully, but - unlike the API - it was never connected to a real Amplify Console app in this session, so the exact Console monorepo settings (or the YAML itself) may need a small adjustment on a first deploy. Vite `dev`/`build` themselves were run and verified locally.
- **A `pipeline-deploy` (non-sandbox) branch deployment.** Only `ampx sandbox` was exercised. `ampx pipeline-deploy` is the documented path for a real named-branch deployment via CI and should work the same way against the same `amplify/backend.ts`, but wasn't run.

## What I'd do with three more days

- Test against a second, genuinely different invoice template (not just the 6 fixtures, which share one letterhead format) to see how much of the header/section-title logic is still fixed-position-shaped versus actually general.
- Force a real DLQ failure against the sandbox and confirm the `FAILED` status path end to end, not just in tests.
- Connect `web` to a real Amplify Hosting Console app and confirm the monorepo build spec works unmodified.
- Implement OCR via Textract `AnalyzeExpense` behind `OCR_ENABLED`, with a confidence threshold and the same arithmetic cross-checks, surfaced through the `ocrConfidence` field that's already in the evidence schema.
- Bounding-box highlighting on a rendered page image in the UI (the `bbox` field is already in the schema, just unused) instead of just highlighting the matched substring in the source line.
- Broaden `CONFLICTING_STATEMENTS` and the header-keyword lists against a real corpus of invoice layouts instead of the hand-picked patterns here.
- Compute and store the file's `sha256` (dedup, integrity).
- Auth and per-customer storage.
# invoice-extraction
