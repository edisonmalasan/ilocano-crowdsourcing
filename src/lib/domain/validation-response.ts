/**
 * The conditional branches of the validation flow, and the definition of coverage, as pure
 * predicates over plain data.
 *
 * These live in the domain layer, next to the text helper, rather than in the schema, for two
 * reasons, and the second is the important one:
 *
 *  1. The UI needs to answer "should I show the correction field?" and "must I collect both
 *     translations?" *before* any payload exists — the form has to know which fields to render. The
 *     schema's `superRefine` then enforces exactly the same answers on submit.
 *  2. The *meaning* of coverage is a research question, not a storage question. It is needed by
 *     allocation, by the admin dashboard, and by export, none of which own the schema. Putting it
 *     here gives it exactly one definition.
 *
 * A parameter typed as the evaluation union rather than a bare `string` means adding or removing an
 * evaluation is a compile error here, so these predicates cannot silently fall through to a default
 * and approve an unhandled case.
 *
 * This module deliberately imports NOTHING. It does not import the schema, which is what keeps
 * `isQualifyingValidation` usable from a React component, a Server Action, and a plain test without
 * dragging Zod or `server-only` along with it. The compile-time alias in `@/schemas/validation`
 * pins this module's vocabulary to the schema's, so the two cannot drift apart silently.
 */

/** The four approved evaluation values. Mirrors `evaluationSchema` in `@/schemas/validation`. */
export type ValidationEvaluation =
  "correct_natural" | "correct_unnatural" | "incorrect" | "cannot_evaluate";

/**
 * True only for the evaluations where the platform must not let the validator continue without a
 * corrected Ilocano sentence: `correct_unnatural` and `incorrect`.
 *
 * `correct_natural` has nothing to correct, and `cannot_evaluate` is an explicit statement of
 * insufficient confidence — requiring a correction there would force a validator to invent an
 * answer they just said they do not have, which would corrupt the very data this platform exists
 * to collect.
 */
export function isCorrectionRequired(evaluation: ValidationEvaluation): boolean {
  return evaluation === "correct_unnatural" || evaluation === "incorrect";
}

/**
 * True for every evaluation that supplies translatable content, which is every evaluation except
 * `cannot_evaluate`.
 *
 * A "cannot confidently evaluate" response supplies no reliable content, so requiring a translation
 * of it would force the validator to translate something they just said they could not judge. The
 * saved text would be an unverified rendering of an unverified judgement, which is worse than no
 * translation at all.
 *
 * For the three evaluations this returns true for, both translations are REQUIRED, not optional.
 * There is no "skip" and there is no choice of language: see `requiresBilingualTranslations`.
 */
export function isTranslatableContent(evaluation: ValidationEvaluation): boolean {
  return evaluation !== "cannot_evaluate";
}

/**
 * True when the evaluation requires an English translation *and* a Filipino translation of the
 * validated Ilocano sentence.
 *
 * This is the same predicate as {@link isTranslatableContent}, and it exists separately because the
 * two questions read very differently at the call sites. `isTranslatableContent` answers "is there
 * anything here worth translating?", which is what a form asks when deciding whether to render the
 * translation fields at all. `requiresBilingualTranslations` answers "may the validator continue
 * without this?", which is what a submit-time check asks. They are kept as two names over one
 * implementation so neither call site can quietly adopt the weaker reading — a caller that wanted
 * "is a translation permitted?" would be able to use the wrong one, and nothing would say so.
 *
 * They will diverge when the methodology allows a third target language, at which point
 * "permitted" and "required" stop being the same question. That is the moment to split the logic,
 * and it is recorded here so the split is a decision rather than an accident.
 */
export function requiresBilingualTranslations(evaluation: ValidationEvaluation): boolean {
  return isTranslatableContent(evaluation);
}

/**
 * The subset of a validation response that coverage depends on.
 *
 * Structural rather than the imported `ValidationResponse` type, on purpose: this module must stay
 * dependency-free, and a structural parameter means a stored record, a parsed payload, and a test
 * literal are all accepted without any of them having to be a schema output first.
 *
 * `correctedInstruction` and both translations are typed as possibly-`null` as well as possibly-
 * absent, because both states occur and both mean "not supplied". `isQualifyingValidation` treats
 * them identically, and the type says so rather than leaving it to be inferred.
 */
export interface QualifyingResponseShape {
  readonly evaluation: ValidationEvaluation;
  readonly correctedInstruction?: string | null;
  readonly englishTranslation?: string | null;
  readonly filipinoTranslation?: string | null;
}

/** True for a string that carries something other than whitespace. */
function isPresent(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Whether one stored response counts toward qualifying coverage.
 *
 * RESEARCH INTEGRITY, stated once. An entry leaves the allocation pool when it has the configured
 * number of qualifying responses from DISTINCT validators, and a response qualifies only if all of
 * the following hold:
 *
 *   - the evaluation supplies translatable content (so not `cannot_evaluate`);
 *   - any required correction is actually present;
 *   - the English translation is present and non-blank;
 *   - the Filipino translation is present and non-blank.
 *
 * The consequence that matters: **this is not a row count.** A `cannot_evaluate` response counts
 * zero. A partial response counts zero. A stored row that predates the bilingual requirement and is
 * missing either translation counts zero. Three raw rows of which only two carry a complete
 * bilingual pair is TWO qualifying validations, and the entry stays in the pool.
 *
 * The rejected alternative is a SQL expression. It would be a second, independent implementation of
 * the same rule in another language, and the two would drift — and a drifted coverage count is
 * invisible: allocation would quietly stop handing an entry to enough validators, or start
 * retiring one too early, and the research would record the result as if it were the methodology.
 *
 * Note what this function does NOT check, deliberately:
 *
 *   - **Distinctness.** That is a property of a *set* of responses, not of one response, and the
 *     database enforces it structurally via `UNIQUE (validator_id, dataset_entry_id)`. Counting
 *     distinct validators here would be checking a constraint twice, in a layer that cannot see the
 *     database.
 *   - **Whether the integrity rules pass.** A row that reached storage without a correction where
 *     one was required cannot exist, because the column constraint rejects it. Re-deriving that here
 *     would duplicate the schema and let the two disagree.
 */
export function isQualifyingValidation(response: QualifyingResponseShape): boolean {
  if (!isTranslatableContent(response.evaluation)) {
    return false;
  }
  if (isCorrectionRequired(response.evaluation) && !isPresent(response.correctedInstruction)) {
    return false;
  }
  return isPresent(response.englishTranslation) && isPresent(response.filipinoTranslation);
}
