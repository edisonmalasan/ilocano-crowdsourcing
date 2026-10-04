/**
 * The conditional branches of the validation flow, and the definition of coverage, as pure
 * predicates over plain data.
 *
 * These live in the domain layer, next to the text helper, rather than in the schema, for two
 * reasons, and the second is the important one:
 *
 *  1. The UI needs to answer "should I show the correction field?" and "may I offer translation
 *     inputs?" *before* any payload exists — the form has to know which fields to render. The
 *     schema's `superRefine` then enforces exactly the same answers on submit.
 *
 *  2. The *meaning* of coverage is a research question, not a storage question. It is needed by
 *     allocation, by the admin dashboard, and by export, none of which own the schema. Putting it
 *     here gives it exactly one definition.
 *
 * A parameter typed as the evaluation union rather than a bare `string` means adding or removing an
 * evaluation is a compile error here, so these predicates cannot silently fall through to a default
 * and approve an unhandled case.
 *
 * This module deliberately imports NOTHING. It does not import the schema, which is what keeps
 * coverage usable from a React component, a Server Action, and a plain test without
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
 * True when the evaluation may carry research translations: every evaluation except
 * `cannot_evaluate`.
 *
 * A "cannot confidently evaluate" response supplies no reliable content, so offering a translation
 * of it would force the validator to translate something they just said they could not judge. The
 * saved text would be an unverified rendering of an unverified judgement, which is worse than no
 * translation at all.
 *
 * For the three evaluations this returns true for, each supplied translation must be non-blank,
 * but none is required: the validator chooses English, Filipino, both, or neither per response.
 * There is no "skip" penalty and no ranking of the choices.
 */
export function isTranslationEligible(evaluation: ValidationEvaluation): boolean {
  return evaluation !== "cannot_evaluate";
}

/**
 * The subset of a validation response that coverage depends on.
 *
 * Structural rather than the imported `ValidationResponse` type, on purpose: this module must stay
 * dependency-free, and a structural parameter means a stored record, a parsed payload, and a test
 * literal are all accepted without any of them having to be a schema output first.
 *
 * `correctedInstruction` and both translations are typed as possibly-`null` as well as possibly-
 * absent, because both states occur and both mean "not supplied".
 */
export interface CoverageResponseShape {
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
 * Whether one stored response is a valid judgment: an evaluable evaluation with any required
 * correction actually present. Translations play no part — a judgment with no translations is
 * still a judgment, and one missing its required correction is not.
 *
 * The consequence that matters: a skipped-translation response counts here. Translation effort
 * must never cost a validator their evaluation.
 */
export function isValidJudgment(response: CoverageResponseShape): boolean {
  if (!isTranslationEligible(response.evaluation)) {
    return false;
  }
  if (isCorrectionRequired(response.evaluation) && !isPresent(response.correctedInstruction)) {
    return false;
  }
  return true;
}

/**
 * Whether one stored response covers English: a non-blank English translation is present on an
 * evaluation that may carry one.
 *
 * The eligibility gate is load-bearing, not redundant: the schema refuses `cannot_evaluate`
 * rows carrying translations, so such a row is unreachable through storage — but the predicate
 * is total over all inputs, and an impossible object must still get the methodology's answer
 * (nothing carried, nothing covered) rather than a presence check's accident. Absence on an
 * eligible evaluation is not failure — it is the validator's choice — and a blank value is
 * refused upstream, never stored, so stored presence means non-blank by construction.
 */
export function coversEnglishTranslation(response: CoverageResponseShape): boolean {
  return isTranslationEligible(response.evaluation) && isPresent(response.englishTranslation);
}

/**
 * Whether one stored response covers Filipino: a non-blank Filipino translation is present on
 * an evaluation that may carry one. Same contract as English — absence is a choice, blank is
 * refused before storage, and the eligibility gate gives impossible rows the methodology's
 * answer rather than a presence check's accident.
 */
export function coversFilipinoTranslation(response: CoverageResponseShape): boolean {
  return isTranslationEligible(response.evaluation) && isPresent(response.filipinoTranslation);
}

/**
 * Whether one stored response counts toward qualifying coverage: it contributes
 * in at least one pillar — a valid judgment, a covering English translation, or
 * a covering Filipino translation.
 *
 * RESEARCH INTEGRITY, stated once. `cannot_evaluate` counts zero in every
 * pillar. A response missing its required correction counts zero as a judgment
 * (but may still cover a language it carries). A blank translation can never
 * be stored — the schema normalizes it to absent before these rules see it —
 * so stored presence means cover.
 *
 * The consequence that matters: **this is not a row count.** Three raw rows of
 * which one judges, one covers English, and one covers Filipino are three
 * contributing responses whose entry is complete — and a raw `count(*)` still
 * says nothing about that.
 *
 * Whether contributions complete an entry is a separate question, answered by
 * {@link isEntryComplete} rather than here.
 *
 * The rejected alternative is a SQL expression. It would be a second, independent
 * implementation of the same rule in another language, and the two would drift — and
 * a drifted coverage count is invisible: allocation would quietly stop handing an
 * entry to enough validators, or start retiring one too early, and the research
 * would record the result as if it were the methodology.
 *
 * Note what this function does NOT check, deliberately:
 *
 *   - **Distinctness.** That is a property of a *set* of responses, not of one response, and the
 *     database enforces it structurally via `UNIQUE (validator_id, dataset_entry_id)`.
 *   - **Whether the integrity rules pass.** A malformed row cannot exist, because the column
 *     constraints reject it. Re-deriving that here would duplicate the schema and let the two
 *     disagree.
 */
export function isQualifyingValidation(response: CoverageResponseShape): boolean {
  return (
    isValidJudgment(response) ||
    coversEnglishTranslation(response) ||
    coversFilipinoTranslation(response)
  );
}

/**
 * A stored response together with the validator it belongs to, which coverage needs and
 * {@link isQualifyingValidation} deliberately does not look at.
 */
export interface ValidatorCoverageResponseShape extends CoverageResponseShape {
  readonly validatorId: string;
}

/**
 * How many distinct anonymous validators hold at least one contributing response in the set.
 *
 * This is a diagnostic, never a target: pooled coverage completes entries, not validator counts.
 * A validator counts once however many pillars their responses cover. The database makes
 * duplicates structurally impossible for one entry via
 * `UNIQUE (validator_id, dataset_entry_id)`, and this function does not rely on that: it
 * deduplicates explicitly, because a consumer that assembled its list some other way would
 * otherwise silently get a different answer from the same rule.
 *
 * The duplicate branch is unreachable through the repository and is tested anyway. An unreachable
 * branch that is never exercised is an untested branch, and a research metric's failure mode is
 * being quietly wrong rather than being loudly broken.
 */
export function countQualifyingValidations(
  responses: readonly ValidatorCoverageResponseShape[],
): number {
  const validators = new Set<string>();

  for (const response of responses) {
    if (isQualifyingValidation(response)) validators.add(response.validatorId);
  }

  return validators.size;
}

/**
 * Pooled coverage for one entry's stored responses: which of the three pillars hold.
 *
 * This is the whole of coverage, in one function. The three pillars may come from different
 * responses — a judgment with no translations, an English-only response, and a Filipino-only
 * response together cover an entry. That is the methodology: translation effort is per-response
 * and optional, while entry coverage is pooled and strict.
 *
 * The rejected alternative is a SQL expression. It would be a second, independent implementation of
 * the same rule in another language, and the two would drift — and a drifted coverage count is
 * invisible: allocation would quietly stop handing an entry to enough validators, or start
 * retiring one too early, and the research would record the result as if it were the methodology.
 */
export interface EntryCoverage {
  /** At least one response is a valid judgment. */
  readonly hasJudgment: boolean;
  /** At least one response carries a covering English translation. */
  readonly hasEnglish: boolean;
  /** At least one response carries a covering Filipino translation. */
  readonly hasFilipino: boolean;
}

export function entryCoverage(responses: readonly CoverageResponseShape[]): EntryCoverage {
  let hasJudgment = false;
  let hasEnglish = false;
  let hasFilipino = false;

  for (const response of responses) {
    if (isValidJudgment(response)) hasJudgment = true;
    if (coversEnglishTranslation(response)) hasEnglish = true;
    if (coversFilipinoTranslation(response)) hasFilipino = true;
  }

  return { hasJudgment, hasEnglish, hasFilipino };
}

/**
 * Whether a dataset entry is complete: its stored responses collectively hold a valid judgment,
 * a covering English translation, and a covering Filipino translation.
 *
 * This is the whole of completion, in one function, and it is deliberately a BOOLEAN rather than a
 * count compared against a target. There is no three-validator target, no three-attempt target, and
 * no 0/1/2/3 coverage level: an entry covered by one response and an entry covered by three are
 * both complete, and an entry whose only responses are `cannot_evaluate` is incomplete however many
 * rows it holds. The raw count of stored rows plays no part in the decision.
 *
 * Like the rule it replaces, this takes the entry's stored responses and nothing else: no
 * validator count, no target, no configuration. Every consumer that reports completion —
 * allocation eligibility, dashboard figures, and export status — calls this function, so
 * disagreement is impossible rather than merely detectable.
 */
export function isEntryComplete(responses: readonly CoverageResponseShape[]): boolean {
  const coverage = entryCoverage(responses);
  return coverage.hasJudgment && coverage.hasEnglish && coverage.hasFilipino;
}

/**
 * The instant an entry's pooled coverage first held, or `null` when it never did.
 *
 * Responses are replayed in server-minted `createdAt` order accumulating pillars; the returned
 * instant is the `createdAt` of the response that completed the set. Ties share an instant, and
 * that is correct: simultaneity at the recorded precision is simultaneity, and the late-arrival
 * diagnostic treats `>` strictly, so tied rows are never late relative to each other.
 */
export function firstCoveredAt(
  responses: readonly (CoverageResponseShape & { readonly createdAt: string })[],
): string | null {
  const ordered = [...responses].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );

  let judgment = false;
  let english = false;
  let filipino = false;
  for (const response of ordered) {
    if (isValidJudgment(response)) judgment = true;
    if (coversEnglishTranslation(response)) english = true;
    if (coversFilipinoTranslation(response)) filipino = true;
    if (judgment && english && filipino) return response.createdAt;
  }
  return null;
}
