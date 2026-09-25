import { z } from "zod";
import { RULE_CODES } from "./codes.js";
import { parseMoneyToCents, parseQty, UNITS } from "./parsers.js";

export const MethodSchema = z.enum(["text_layer", "ocr"]);
export type Method = z.infer<typeof MethodSchema>;

export const RuleCodeSchema = z.enum(RULE_CODES);

export const UnitSchema = z.enum(UNITS);

/**
 * A single sourced value: what page it came from, the exact text it was read
 * from, and the raw substring that was parsed. Used for document-level facts
 * (Subtotal, GST, Total, count statements) and referenced by conflicts.
 *
 * Hard invariant (section 3): `sourceText` must contain `rawValue` verbatim.
 * A bug that tries to serialise a number without a real quote back to it
 * fails validation here rather than reaching the client.
 */
export const EvidenceSchema = z
  .object({
    page: z.number().int().positive(),
    sourceText: z.string().min(1),
    rawValue: z.string().min(1),
    method: MethodSchema,
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    ocrConfidence: z.number().min(0).max(1).optional(),
  })
  .superRefine((evidence, ctx) => {
    if (!evidence.sourceText.includes(evidence.rawValue)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `evidence.sourceText does not contain evidence.rawValue ("${evidence.rawValue}")`,
        path: ["sourceText"],
      });
    }
  });
export type Evidence = z.infer<typeof EvidenceSchema>;

/**
 * Row-level evidence for a line item: the whole source line, plus the raw
 * substring captured for each field that was parsed out of it.
 */
export const ItemEvidenceSchema = z
  .object({
    page: z.number().int().positive(),
    method: MethodSchema,
    sourceText: z.string().min(1),
    fields: z.record(z.string(), z.string()),
    bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).optional(),
    ocrConfidence: z.number().min(0).max(1).optional(),
  })
  .superRefine((evidence, ctx) => {
    for (const [field, raw] of Object.entries(evidence.fields)) {
      if (!evidence.sourceText.includes(raw)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `evidence.fields.${field} ("${raw}") is not a substring of evidence.sourceText`,
          path: ["fields", field],
        });
      }
    }
  });
export type ItemEvidence = z.infer<typeof ItemEvidenceSchema>;

export const ItemStatusSchema = z.enum(["ok", "needs_review", "conflict"]);

export const ItemSchema = z
  .object({
    id: z.string().min(1),
    page: z.number().int().positive(),
    code: z.string().min(1),
    description: z.string().min(1),
    qty: z.number().nullable(),
    unit: UnitSchema.nullable(),
    unitPriceCents: z.number().int().nullable(),
    amountCents: z.number().int().nullable(),
    weightRaw: z.string().nullable(),
    status: ItemStatusSchema,
    evidence: ItemEvidenceSchema,
    flags: z.array(RuleCodeSchema),
  })
  .superRefine((item, ctx) => {
    const checks: Array<[string, number | null]> = [
      ["qty", item.qty],
      ["unitPrice", item.unitPriceCents],
      ["amount", item.amountCents],
    ];
    for (const [field, value] of checks) {
      if (value === null) continue;
      const raw = item.evidence.fields[field];
      if (raw === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `item.${field} is set but evidence.fields.${field} is missing`,
          path: ["evidence", "fields", field],
        });
        continue;
      }
      const parsed = field === "qty" ? parseQty(raw) : parseMoneyToCents(raw);
      if (parsed !== value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `item.${field} (${value}) does not equal parse(evidence.fields.${field}) (${parsed})`,
          path: [field],
        });
      }
    }
  });
export type Item = z.infer<typeof ItemSchema>;

export const RefusalScopeSchema = z.enum(["file", "page", "row", "field", "doc"]);

export const RefusalSchema = z.object({
  code: RuleCodeSchema,
  scope: RefusalScopeSchema,
  page: z.number().int().positive().optional(),
  message: z.string().min(1),
  action: z.string().min(1),
  detail: z.string().optional(),
});
export type Refusal = z.infer<typeof RefusalSchema>;

export const ConflictSchema = z.object({
  code: RuleCodeSchema,
  evidenceRefs: z.array(z.string()),
  message: z.string().min(1),
  derived: z
    .object({
      value: z.string(),
      inputs: z.array(z.string()),
    })
    .optional(),
});
export type Conflict = z.infer<typeof ConflictSchema>;

export const PageStatusSchema = z.enum(["ok", "refused"]);

export const PageResultSchema = z.object({
  page: z.number().int().positive(),
  status: PageStatusSchema,
  method: MethodSchema.nullable(),
  sectionTitle: z.string().nullable(),
});
export type PageResult = z.infer<typeof PageResultSchema>;

export const OutcomeSchema = z.enum(["clean", "has_issues"]);

export const ExtractionResultSchema = z.object({
  jobId: z.string().min(1),
  status: z.literal("completed"),
  outcome: OutcomeSchema,
  pages: z.array(PageResultSchema),
  items: z.array(ItemSchema),
  refusals: z.array(RefusalSchema),
  conflicts: z.array(ConflictSchema),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
