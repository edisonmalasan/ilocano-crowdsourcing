import { z } from "zod";

import { normalizeResearchText } from "@/lib/domain/text";
import {
  isCorrectionRequired,
  requiresBilingualTranslations,
  type QualifyingResponseShape,
  type ValidationEvaluation,
} from "@/lib/domain/validation-response";

import { datasetEntryIdSchema } from "./dataset";
import { anonymousValidatorIdSchema } from "./validator";

/**
 * Validation response contract — the integrity rules of the research.
 *
 * RESEARCH INTEGRITY, stated once and enforced once:
 * a correction and the two research translations are *separate response data*, attributed to one
 * validator and one dataset entry. They MUST NEVER be written back over the imported synthetic
 * instruction in `dataset_entries`. The imported instruction is immutable reference material; what
 * a validator believes it should have said is recorded beside it, not in place of it. That is why
 * the correction lives on the response and not on the entry, and why the two types have disjoint
 * fields.
 *
 * Both research translations are REQUIRED for every evaluable evaluation. There is no language
 * discriminator any more: the languages are named by the fields that hold them, so a request naming
 * an unsupported language is structurally unrepresentable rather than rejected at runtime. That is
 * a change of kind, not of degree — a discriminator extends to more languages, a required pair
 * cannot, and the reason is recorded in the change's `design.md`.
 *
 * All approved rules are encoded in ONE `superRefine` over ONE field shape
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
 * The two research translation targets, as *labels for the validation screen* rather than as a
 * value vocabulary.
 *
 * There is deliberately no `TRANSLATION_LANGUAGE_CHOICES` vocabulary and no
 * `translationLanguageSchema` here any more. They served a representation where a response named
 * one language and supplied one text, which cannot express "both are required". Naming them now
 * would invite reintroducing a discriminator on two required fields, which is precisely the
 * representation this change exists to remove.
 *
 * What survives is only what the UI needs to label two fixed text inputs. The values are not a
 * vocabulary, so nothing can select a language, and adding a third target language is a change to
 * this array *and* to the schema fields *and* to the database columns together — not a one-line
 * addition here.
 */
export const TRANSLATION_FIELD_LABELS = {
  english: {
    label: "English translation",
    description: "Translate the validated Ilocano sentence into English.",
  },
  filipino: {
    label: "Filipino translation",
    description: "Isalin ang validated na pangungusap sa Filipino.",
  },
} as const satisfies Record<string, { label: string; description: string }>;

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
  englishTranslation: normalizedResearchTextFieldSchema.optional(),
  filipinoTranslation: normalizedResearchTextFieldSchema.optional(),
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
 * The integrity rules. Every issue is field-scoped so a form control can attach the message to the
 * input the validator can actually fix.
 *
 * Rule map (see the `domain-contracts` capability):
 *  1. evaluation is one of four            -> `evaluationSchema` (the enum itself)
 *  2. correction required for `correct_unnatural` / `incorrect`
 *  3. `correct_natural` carries no correction
 *  4. `cannot_evaluate` carries no correction and no translation
 *  5. evaluable => both translations present and non-blank
 *  6. no translation-language discriminator -> structural, the field does not exist
 *  7. anything else is rejected            -> the enum, again
 *
 * Rule 5 is written as two independent field-scoped checks rather than one combined check, and the
 * reason is that a single combined check would produce ONE error message for a response missing
 * BOTH translations. A validator who has filled in neither field would be told only about the first,
 * fix it, submit, and be told about the second — two round trips for one omission. Two field-scoped
 * issues also let a form highlight both inputs at once.
 *
 * There is deliberately no separate "must not be empty" message. `normalizeResearchText` already
 * collapses a blank string to `null` before these rules see it, so `absent` and `blank` are the same
 * state by the time they are judged, and a whitespace-only translation is reported as *required* —
 * the same wording the correction rule uses for the same defect. A distinct "empty" message would
 * describe a distinction the pipeline has already thrown away, and it would tell a validator who
 * never typed anything that they had typed something wrong.
 */
function applyValidationIntegrityRules(
  value: ValidationResponseInputValues,
  ctx: AddIssueCapableContext,
): void {
  const { evaluation, correctedInstruction, englishTranslation, filipinoTranslation } = value;
  const hasCorrectionField = correctedInstruction !== undefined;
  const hasEnglishField = englishTranslation !== undefined;
  const hasFilipinoField = filipinoTranslation !== undefined;

  if (isCorrectionRequired(evaluation)) {
    if (!hasCorrectionField || correctedInstruction === null) {
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

  if (!requiresBilingualTranslations(evaluation)) {
    const notAccepted =
      "A translation is not accepted when the entry cannot be confidently evaluated, because " +
      "that evaluation supplies no reliable content to translate.";
    if (hasEnglishField) {
      ctx.addIssue({ code: "custom", path: ["englishTranslation"], message: notAccepted });
    }
    if (hasFilipinoField) {
      ctx.addIssue({ code: "custom", path: ["filipinoTranslation"], message: notAccepted });
    }

    return;
  }

  for (const [field, hasField, supplied] of [
    ["englishTranslation", hasEnglishField, englishTranslation],
    ["filipinoTranslation", hasFilipinoField, filipinoTranslation],
  ] as const) {
    const label = field === "englishTranslation" ? "An English" : "A Filipino";
    if (!hasField || supplied === null) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: `${label} translation is required for this evaluation. Both translations are required.`,
      });
    }
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

/**
 * Compile-time guard: the domain's coverage shape must be a subset of the schema's response fields.
 *
 * `isQualifyingValidation` lives in the dependency-free domain module and therefore cannot import
 * `ValidationResponseInput`. It declares the fields it reads structurally instead, which is what
 * makes it callable from a component, a Server Action, and a plain test without dragging Zod along.
 *
 * The cost of that freedom is that the two declarations can drift: a schema field could be renamed
 * and `isQualifyingValidation` would keep reading a property that no longer exists — at runtime, as
 * `undefined`, silently making every response fail to qualify. That is a coverage bug that produces
 * no error anywhere; entries would simply never leave the allocation pool.
 *
 * So this guard fails the build if the domain shape names a field the schema does not have. It
 * checks the *read* direction, which is the dangerous one. The reverse — a schema field the
 * coverage shape ignores — is deliberately not an error: an `id` or `createdAt` is legitimately
 * irrelevant to whether one response qualifies.
 */
export type QualifyingShapeIsInSync = [
  Exclude<keyof QualifyingResponseShape, keyof ValidationResponseInput>,
] extends [never]
  ? true
  : never;
