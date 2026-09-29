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
