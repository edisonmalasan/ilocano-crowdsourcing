import { z } from "zod";

import { normalizeResearchText } from "@/lib/domain/text";
import {
  isCorrectionRequired,
  isTranslationEligible,
  type CoverageResponseShape,
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
 * Both research translations are OPTIONAL per response: each evaluable evaluation offers
 * English, Filipino, both, or neither, and the validator's choice is read from which fields are
 * present. There is no language discriminator: the languages are named by the fields that hold
 * them, so a request naming an unsupported language is structurally unrepresentable rather than
 * rejected at runtime.
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
 * `translationLanguageSchema` here. The choice the validator makes — English, Filipino, both, or
 * skip — is read from which of the two fields below is present, so a discriminator column would be
 * a second source of truth that can disagree with the fields. Naming the choice now would invite
 * reintroducing one.
 *
 * What survives is only what the UI needs to label the choice and the two fixed text inputs. The
 * per-language label/description pairs below are that chrome. Adding a third target language is a
 * change to this map *and* to the schema fields *and* to the database columns together — not a
 * one-line addition here.
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
 * A research-text field: absent, or present-and-non-blank.
 *
 * The blank check runs BEFORE the normalisation transform, and that order is the whole point. A
 * whitespace-only string is REFUSED here — naming its field — rather than normalising to absent,
 * because absence is a legitimate choice (skip) while a blank in a supplied field is not: the
 * validator chose the language and then supplied nothing usable for it, and accepting that as a
 * skip would record a choice the stored data contradicts. `null` (SQL NULL read back) and
 * `undefined` (key omitted) both mean "not supplied" and pass through untouched; only a real
 * string is judged, and only for blankness. See `@/lib/domain/text` for why the transform
 * changes nothing beyond whitespace.
 *
 * The message is a sentence, not an identifier: field errors travel back to a browser and are
 * rendered to a participant, so a Zod-shaped message would leak internals.
 */
const nonBlankResearchTextFieldSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "This field must not be blank.")
  .transform((value) => normalizeResearchText(value));

/**
 * The one field shape. `validationResponseInputSchema` and `validationResponseSchema` are both
 * built from it and both receive the same `superRefine`, so a rule added here is added to both.
 */
const validationResponseInputFields = {
  evaluation: evaluationSchema,
  correctedInstruction: nonBlankResearchTextFieldSchema.nullable().optional(),
  englishTranslation: nonBlankResearchTextFieldSchema.nullable().optional(),
  filipinoTranslation: nonBlankResearchTextFieldSchema.nullable().optional(),
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
 *  5. each supplied translation is non-blank; none is required
 *  6. no translation-language discriminator -> structural, the field does not exist
 *  7. anything else is rejected            -> the enum, again
 *
 * Rule 5 is enforced one layer down, in `nonBlankResearchTextFieldSchema`: a whitespace-only
 * string is refused BEFORE normalisation could erase it into absent. The rule below therefore
 * sees only absent-or-non-blank values, and absence is the legitimate skip — there is nothing
 * left for this function to check on translations, and deliberately no second message here that
 * could disagree with the field's own.
 */
function applyValidationIntegrityRules(
  value: ValidationResponseInputValues,
  ctx: AddIssueCapableContext,
): void {
  const { evaluation, correctedInstruction } = value;
  // Nullish states are one state: `null` (SQL NULL read back) and `undefined` (key omitted) both
  // mean "not supplied". A blank string never reaches this function — the field schema refuses
  // it first — so presence here is presence of usable content. A stored row and a fresh payload
  // therefore face the same rule, and an explicit `null` from a client is a skip, not a defect.
  const hasCorrectionField = correctedInstruction != null;
  const hasEnglishField = value.englishTranslation != null;
  const hasFilipinoField = value.filipinoTranslation != null;

  if (isCorrectionRequired(evaluation)) {
    if (!hasCorrectionField) {
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

  if (!isTranslationEligible(evaluation)) {
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

  // No translation is required. Each supplied value is non-blank by construction (the
  // field schema refuses blanks before normalisation runs), and absence is a choice the
  // methodology explicitly permits — so there is nothing left to check here.
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
 * `entryCoverage` lives in the dependency-free domain module and therefore cannot import
 * `ValidationResponseInput`. It declares the fields it reads structurally instead, which is what
 * makes it callable from a component, a Server Action, and a plain test without dragging Zod along.
 *
 * The cost of that freedom is that the two declarations can drift: a schema field could be renamed
 * and coverage would keep reading a property that no longer exists — at runtime, as
 * `undefined`, silently making every entry read as uncovered. That is a coverage bug that produces
 * no error anywhere; entries would simply never leave the allocation pool.
 *
 * So this guard fails the build if the domain shape names a field the schema does not have. It
 * checks the *read* direction, which is the dangerous one. The reverse — a schema field the
 * coverage shape ignores — is deliberately not an error: an `id` or `createdAt` is legitimately
 * irrelevant to coverage.
 */
export type QualifyingShapeIsInSync = [
  Exclude<keyof CoverageResponseShape, keyof ValidationResponseInput>,
] extends [never]
  ? true
  : never;
