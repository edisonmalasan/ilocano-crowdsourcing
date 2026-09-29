/**
 * The two conditional branches of the validation flow, as pure predicates.
 *
 * These live in the domain layer, next to the text helper, rather than in the schema, because the
 * UI needs to answer "should I show the correction field?" and "should I show the translation
 * step?" *before* any payload exists — the form has to know which fields to render. The schema's
 * `superRefine` then enforces exactly the same answers on submit. One implementation, two
 * questions.
 *
 * A parameter typed as the evaluation union rather than a bare `string` means adding or removing
 * an evaluation is a compile error here, so these predicates cannot silently fall through to a
 * default and approve an unhandled case.
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
 * True for every evaluation except `cannot_evaluate`.
 *
 * A "cannot confidently evaluate" response supplies no reliable content, so offering a
 * translation of it would be meaningless — and the saved text would be an unverified rendering of
 * something the validator could not judge.
 */
export function isTranslationAllowed(evaluation: ValidationEvaluation): boolean {
  return evaluation !== "cannot_evaluate";
}
