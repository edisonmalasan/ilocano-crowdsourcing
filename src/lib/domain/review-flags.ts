/**
 * Whether a dataset entry requires researcher review, as pure predicates over stored responses.
 *
 * The methodology decision (approved by the thesis team) is stated once, here:
 *
 *   1. the entry's valid judgments do not all give the same evaluation, or
 *   2. more than one distinct corrected Ilocano version was submitted.
 *
 * Differences in English or Filipino wording alone are NEVER disagreement, because multiple
 * natural translations may be valid. That is enforced twice: behaviourally, by a test passing
 * rows whose translations differ and asserting no flag; and structurally, by a source test
 * asserting this module never READS a translation value — no `englishTranslation`, no
 * `filipinoTranslation`, in any casing or snake_case.
 *
 * Only VALID JUDGMENTS participate. A `cannot_evaluate` response is an abstention, not an
 * opinion: counting it as disagreement would flag entries for having been attempted, and a
 * translation-only response carries no judgment either, so neither must contribute to the
 * review flag. Both predicates reuse `isValidJudgment` (and correction presence) rather than
 * restating them.
 *
 * Corrections are compared after trimming surrounding whitespace and otherwise exact. No case
 * folding, no punctuation normalization: normalization hides real differences, and the safe
 * direction for a review flag is over-flagging to a human, never silent agreement. If reviewers
 * report noise, normalization is a methodology decision for the thesis team, not an engineering
 * tweak — see design.md D3.
 *
 * Like `validation-response.ts`, this module imports NOTHING except that module, for the same
 * reason: the flag must be usable from a Server Component, a Server Action, and a plain test
 * without dragging Zod or `server-only` along with it. The parameter type is the shared
 * `CoverageResponseShape`, not a narrower local shape: a second shape would be a second place
 * for the field list to drift.
 */

import {
  isValidJudgment,
  type CoverageResponseShape,
  type ValidationEvaluation,
} from "./validation-response";

/** True for a string that carries something other than whitespace. */
function isPresent(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** The canonical form a correction is compared in: trimmed, otherwise exact. */
function canonicalCorrection(value: string): string {
  return value.trim();
}

/**
 * Whether the entry's valid judgments disagree on evaluation.
 *
 * "Valid judgment" is doing the load-bearing work: the distinct evaluations are collected over
 * valid judgments only, so an entry whose only divergence is a `cannot_evaluate` — or a
 * translation-only response — alongside agreeing judgments does NOT flag. An entry with fewer
 * than two valid judgments cannot disagree with itself.
 */
export function evaluationsDisagree(responses: readonly CoverageResponseShape[]): boolean {
  const evaluations = new Set<ValidationEvaluation>();

  for (const response of responses) {
    if (isValidJudgment(response)) evaluations.add(response.evaluation);
  }

  return evaluations.size > 1;
}

/**
 * Whether more than one distinct corrected Ilocano version was submitted.
 *
 * Responses carrying no correction do not participate: `correct_natural` has nothing to correct,
 * and absence is not a version. Two corrections differing only in surrounding whitespace are one
 * version, not two — whitespace is an accident of the input field, not a linguistic claim.
 */
export function correctionsDiverge(responses: readonly CoverageResponseShape[]): boolean {
  const corrections = new Set<string>();

  for (const response of responses) {
    if (isPresent(response.correctedInstruction)) {
      // `isPresent` just proved this is a non-blank string; the assertion below is the type
      // checker catching up, not a runtime decision.
      corrections.add(canonicalCorrection(response.correctedInstruction as string));
    }
  }

  return corrections.size > 1;
}

/**
 * Whether an entry requires researcher review: evaluation disagreement among its valid
 * judgments, or more than one distinct correction submitted.
 *
 * This is the whole of the flag in one function. It answers the set-level question the two
 * predicates above cannot ask alone only insofar as it ORs them; everything else — what counts
 * as a valid judgment, what counts as distinct — lives in the predicates, where the tests pin it.
 */
export function requiresResearcherReview(responses: readonly CoverageResponseShape[]): boolean {
  return evaluationsDisagree(responses) || correctionsDiverge(responses);
}
