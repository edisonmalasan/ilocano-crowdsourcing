import { z } from "zod";

import { normalizeResearchText } from "@/lib/domain/text";
import {
  isCorrectionRequired,
  isTranslationAllowed,
  type ValidationEvaluation,
} from "@/lib/domain/validation-response";

import { datasetEntryIdSchema } from "./dataset";
import { anonymousValidatorIdSchema } from "./validator";

/**
 * Validation response contract — the integrity rules of the research.
 *
 * RESEARCH INTEGRITY, stated once and enforced once:
 * a correction and a translation are *separate response data*, attributed to one validator and
 * one dataset entry. They MUST NEVER be written back over the imported synthetic instruction in
 * `dataset_entries`. The imported instruction is immutable reference material; what a validator
 * believes it should have said is recorded beside it, not in place of it. That is why the
 * correction lives on the response and not on the entry, and why the two types have disjoint
 * fields.
 *
 * All seven approved rules are encoded in ONE `superRefine` over ONE field shape
 * (`validationResponseInputFields`), and both the request-facing schema and the stored-record
 * schema are built from that same shape. A rule therefore cannot be enforced on the client and
 * skipped on the server, and cannot drift between them. There is no second implementation of
 * these rules anywhere — in particular not in React form validation.
 */

/** The four approved evaluations, in the order the validation screen must present them. */
export const EVALUATION_CHOICES = [
  {
    value: "correct_natural",
    label: "Correct and natural",
    description: "The sentence says what was intended and reads naturally in Ilocano.",
  },
  {
    value: "correct_unnatural",
    label: "Correct but sounds unnatural",
    description: "The meaning is right, but the wording does not sound natural to a speaker.",
  },
  {
    value: "incorrect",
    label: "Incorrect",
    description: "The sentence does not express the intended information.",
  },
  {
    value: "cannot_evaluate",
    label: "Cannot confidently evaluate",
    description: "You are not confident enough to judge this entry.",
  },
] as const satisfies ReadonlyArray<{ value: string; label: string; description?: string }>;

export const evaluationSchema = z.enum(
  EVALUATION_CHOICES.map((choice) => choice.value) as [
    (typeof EVALUATION_CHOICES)[number]["value"],
    ...(typeof EVALUATION_CHOICES)[number]["value"][],
  ],
);

export type Evaluation = z.infer<typeof evaluationSchema>;

/**
 * The only two translation targets the research offers. "Skip translation" is the absence of a
 * translation, not a third language.
 */
export const TRANSLATION_LANGUAGE_CHOICES = [
  { value: "english", label: "English" },
  { value: "filipino", label: "Filipino" },
] as const satisfies ReadonlyArray<{ value: string; label: string; description?: string }>;

export const translationLanguageSchema = z.enum(
  TRANSLATION_LANGUAGE_CHOICES.map((choice) => choice.value) as [
    (typeof TRANSLATION_LANGUAGE_CHOICES)[number]["value"],
    ...(typeof TRANSLATION_LANGUAGE_CHOICES)[number]["value"][],
  ],
);

export type TranslationLanguage = z.infer<typeof translationLanguageSchema>;

/**
 * A text field that normalizes to `null` when the validator left it blank.
 *
 * Both transforms exist so "blank" and "absent" are distinguishable but handled uniformly: the
 * non-empty rules then have a single consistent meaning, whichever way the field arrived. See
 * `@/lib/domain/text` for why nothing beyond whitespace is changed.
 */
const normalizedResearchTextFieldSchema = z
  .string()
  .transform((value) => normalizeResearchText(value));

/**
 * The one field shape. `validationResponseInputSchema` and `validationResponseSchema` are both
 * built from it and both receive the same `superRefine`, so a rule added here is added to both.
 */
const validationResponseInputFields = {
  evaluation: evaluationSchema,
  correctedInstruction: normalizedResearchTextFieldSchema.optional(),
  translationLanguage: translationLanguageSchema.optional(),
  translationText: normalizedResearchTextFieldSchema.optional(),
};

/** The post-transform shape the integrity rules reason about, inferred from the shared fields. */
type ValidationResponseInputValues = z.infer<z.ZodObject<typeof validationResponseInputFields>>;

/**
 * Only the part of Zod's refinement context these rules need.
 *
 * Depending on the structural minimum rather than Zod's full context type is what lets ONE rule
 * function serve both the input schema and the stored-record schema: each supplies its own
 * context, and both satisfy this shape.
 */
type AddIssueCapableContext = Pick<z.RefinementCtx, "addIssue">;

/** Opaque storage identifier for a persisted validation record. */
export const validationResponseIdSchema = z.string().trim().min(1, "id must not be empty");

/**
 * Opaque storage identifier for a validation batch. Kept as a plain opaque token on purpose: the
 * batch lifecycle and its identifiers are owned by the allocation change, and this contract only
 * needs to reference a batch without hard-coding its shape.
 */
export const validationBatchIdSchema = z.string().trim().min(1, "batchId must not be empty");

/**
 * The seven rules. Every issue is field-scoped so a form control can attach the message to the
 * input the validator can actually fix.
 *
 * Rule map (see `domain-contracts` spec):
 *  1. evaluation is one of four            -> `evaluationSchema` (the enum itself)
 *  2. correction required for `correct_unnatural` / `incorrect`
 *  3. `correct_natural` carries no correction
 *  4. `cannot_evaluate` carries no correction and no translation
 *  5. a translation has an approved language and non-empty text
 *  6. translation allowed only for evaluations other than `cannot_evaluate` (same condition as
 *     rule 4's second half; see `isTranslationAllowed`)
 *  7. anything else is rejected            -> the enum, again
 */
function applyValidationIntegrityRules(
  value: ValidationResponseInputValues,
  ctx: AddIssueCapableContext,
): void {
  const { evaluation, correctedInstruction, translationLanguage, translationText } = value;
  const hasCorrectionField = correctedInstruction !== undefined;
  const hasTranslationLanguageField = translationLanguage !== undefined;
  const hasTranslationTextField = translationText !== undefined;

  if (isCorrectionRequired(evaluation)) {
    if (!hasCorrectionField) {
      ctx.addIssue({
        code: "custom",
        path: ["correctedInstruction"],
        message: "A corrected Ilocano version is required for this evaluation.",
      });
    } else if (correctedInstruction === null) {
      ctx.addIssue({
        code: "custom",
        path: ["correctedInstruction"],
        message: "A corrected Ilocano version is required for this evaluation.",
      });
    }
  } else if (hasCorrectionField) {
    ctx.addIssue({
      code: "custom",
      path: ["correctedInstruction"],
      message: `A corrected Ilocano version is not accepted for the "${evaluation}" evaluation.`,
    });
  }

  if (!isTranslationAllowed(evaluation)) {
    if (hasTranslationLanguageField) {
      ctx.addIssue({
        code: "custom",
        path: ["translationLanguage"],
        message:
          "A translation is not accepted when the entry cannot be confidently evaluated, because " +
          "that evaluation supplies no reliable content to translate.",
      });
    }
    if (hasTranslationTextField) {
      ctx.addIssue({
        code: "custom",
        path: ["translationText"],
        message:
          "A translation is not accepted when the entry cannot be confidently evaluated, because " +
          "that evaluation supplies no reliable content to translate.",
      });
    }

    return;
  }

  if (hasTranslationLanguageField && !hasTranslationTextField) {
    ctx.addIssue({
      code: "custom",
      path: ["translationText"],
      message: "Translation text is required when a translation language is selected.",
    });
  } else if (hasTranslationTextField && translationText === null) {
    ctx.addIssue({
      code: "custom",
      path: ["translationText"],
      message: "Translation text must not be empty.",
    });
  }

  if (hasTranslationTextField && !hasTranslationLanguageField) {
    ctx.addIssue({
      code: "custom",
      path: ["translationLanguage"],
      message: "A translation language is required when translation text is supplied.",
    });
  }
}

/**
 * A validation *intent*: exactly the fields a validator supplies. This is the shape a client sends
 * and the shape the server re-parses before persisting anything.
 */
export const validationResponseInputSchema = z
  .object(validationResponseInputFields)
  .superRefine(applyValidationIntegrityRules);

/**
 * A persisted validation *record*: the intent plus server-assigned identity and timestamps.
 *
 * This is runtime response state, not a static dataset definition. It is intentionally not
 * structurally assignable to `DatasetEntry`: this record has no `instruction`/`origin`/
 * `destination` and the entry has no `evaluation`/`validatorId`, so neither can stand in for the
 * other and a response can never be mistaken for (or written over) an imported entry.
 */
export const validationResponseSchema = z
  .object({
    ...validationResponseInputFields,
    id: validationResponseIdSchema,
    validatorId: anonymousValidatorIdSchema,
    datasetEntryId: datasetEntryIdSchema,
    batchId: validationBatchIdSchema,
    createdAt: z
      .string()
      .trim()
      .min(1, "createdAt must not be empty")
      .refine(
        (value) => !Number.isNaN(Date.parse(value)),
        "createdAt must be an ISO 8601 datetime",
      ),
    updatedAt: z
      .string()
      .trim()
      .min(1, "updatedAt must not be empty")
      .refine(
        (value) => !Number.isNaN(Date.parse(value)),
        "updatedAt must be an ISO 8601 datetime",
      ),
  })
  .superRefine(applyValidationIntegrityRules);

export type ValidationResponseInput = z.infer<typeof validationResponseInputSchema>;
export type ValidationResponse = z.infer<typeof validationResponseSchema>;

/**
 * Compile-time guard: the domain predicate vocabulary and the schema vocabulary must agree.
 *
 * `Evaluation` is derived from `EVALUATION_CHOICES` and `ValidationEvaluation` is written out in
 * `@/lib/domain/validation-response`. Duplicating the union is unavoidable — the domain module
 * must not import the schema to stay dependency-free — so this alias pins the two together. It
 * resolves to `never` if either side ever gains or loses a value, which is a compile error at the
 * point of use rather than a silently unhandled evaluation.
 */
export type EvaluationVocabularyIsInSync = [ValidationEvaluation] extends [Evaluation]
  ? [Evaluation] extends [ValidationEvaluation]
    ? true
    : never
  : never;
