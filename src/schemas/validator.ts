import { z } from "zod";

/**
 * Anonymous validator contract.
 *
 * ANONYMITY INVARIANT — the one thing this file must never be edited to allow:
 * `ValidatorProfile` has exactly five fields: an opaque id, a self-reported proficiency value, and
 * three activity counters/timestamps. There is deliberately NO field for full name, email address,
 * student ID, phone number, address, or social-media account, and the schema is a `strictObject`
 * so a payload carrying one is rejected rather than silently stripped. If the research
 * methodology later requires demographics, that is a methodology, consent-flow, schema, and
 * privacy-notice change made on purpose — never an incidental field added to this type.
 */

/** The approved screening question. Single source of truth; the UI renders this string. */
export const ILOCANO_PROFICIENCY_QUESTION = "How comfortable are you with Ilocano?";

/** The approved supporting copy for the screening question. */
export const ILOCANO_PROFICIENCY_SUPPORTING_COPY =
  "This helps us understand the background of our validators.";

/**
 * The five approved proficiency choices, in the order the screening screen must present them.
 *
 * Declared once and used to derive both `ilocanoProficiencySchema` and the UI's option list, so
 * the schema and the screen cannot disagree about which values exist, what they are called, or
 * what order they appear in.
 */
export const ILOCANO_PROFICIENCY_CHOICES = [
  { value: "native", label: "Native / first-language speaker" },
  { value: "fluent", label: "Fluent" },
  { value: "conversational", label: "Conversational" },
  { value: "basic", label: "Basic" },
  { value: "not_confident", label: "Not confident" },
] as const satisfies ReadonlyArray<{ value: string; label: string; description?: string }>;

export const ilocanoProficiencySchema = z.enum(
  ILOCANO_PROFICIENCY_CHOICES.map((choice) => choice.value) as [
    (typeof ILOCANO_PROFICIENCY_CHOICES)[number]["value"],
    ...(typeof ILOCANO_PROFICIENCY_CHOICES)[number]["value"][],
  ],
);

export type IlocanoProficiency = z.infer<typeof ilocanoProficiencySchema>;

/**
 * Narrows an arbitrary string from the answer control to a proficiency, or `null`.
 *
 * WHY THIS EXISTS. `AnswerGroup.onChange` is typed `(value: string) => void`, because the
 * control is generic over any option set. That made the screening call site an **unchecked
 * cast**:
 *
 *     onChange={(value) => setSelection(value as IlocanoProficiency)}
 *
 * Round six proved that cast is a research-data fabrication route. `onChange={() =>
 * setSelection(ILOCANO_PROFICIENCY_CHOICES[1].value)}` - selecting "Fluent" for every
 * participant regardless of what they chose - passes lint, format, typecheck, the full unit
 * suite, and the production build. The literal-level guards added in rounds three and four
 * cannot see it, because `"fluent"` never appears: the value arrives by property access.
 *
 * So this is not guarded with another regex, which would be the seventh shape-shaped
 * assertion this change has had to add and would fail the same way. The cast is **removed**.
 * A value that is not one of the five approved proficiencies is now a type error at the
 * assignment, so fabrication requires editing this function rather than editing a call site,
 * and this function is ordinary domain code with ordinary behavioural tests.
 *
 * Returning `null` rather than throwing: a control reporting a value that is not in its own
 * option list is a defect worth surviving rather than crashing a participant's session over,
 * and `null` is the honest state - nothing has been selected.
 */
export function toIlocanoProficiency(value: string): IlocanoProficiency | null {
  const parsed = ilocanoProficiencySchema.safeParse(value);
  // `parsed.data` is already `IlocanoProficiency` by Zod's own inference. Deliberately NOT
  // `(value as IlocanoProficiency)`: a cast here would reintroduce exactly the hole this
  // function exists to close, one level up.
  return parsed.success ? parsed.data : null;
}

/**
 * Anonymous validator identifier: `VAL_` plus exactly eight lowercase hex characters
 * (32 bits of entropy; see `@/lib/domain/anonymous-validator-id`).
 */
export const ANONYMOUS_VALIDATOR_ID_PATTERN = /^VAL_[0-9a-f]{8}$/;

export const anonymousValidatorIdSchema = z
  .string()
  .regex(
    ANONYMOUS_VALIDATOR_ID_PATTERN,
    "id must look like VAL_ followed by 8 lowercase hex characters",
  );

export type AnonymousValidatorId = z.infer<typeof anonymousValidatorIdSchema>;

/**
 * SELF-REPORTED RESEARCH METADATA — read this before adding anything derived from proficiency.
 *
 * The screening answer is stored verbatim and is never converted into a quality score, a weight,
 * a rank, a leaderboard position, or an eligibility flag, and no such derived value is ever shown
 * in the public experience. The thesis team has not yet approved which proficiency levels count
 * toward the independent-validation target, so deriving anything here would silently encode an
 * unapproved methodology decision. Eligibility stays a configurable, server-side concern of the
 * allocation change.
 */
export const validatorProfileSchema = z.strictObject({
  id: anonymousValidatorIdSchema,
  /** Nullable so a validator may be created before, or without, completing screening. */
  ilocanoProficiency: ilocanoProficiencySchema.nullable(),
  createdAt: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "createdAt must be an ISO 8601 datetime",
    }),
  lastActiveAt: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "lastActiveAt must be an ISO 8601 datetime",
    }),
  totalValidations: z.number().int().min(0),
});

export type ValidatorProfile = z.infer<typeof validatorProfileSchema>;
