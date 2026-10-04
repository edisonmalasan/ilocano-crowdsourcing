/**
 * What one stored response contributes toward pooled coverage, or `null` when it contributes in
 * every pillar it could.
 *
 * This lives APART from `review-flags.ts` on purpose, and the separation is load-bearing: the
 * flag module is structurally forbidden from reading translation fields (a source test asserts
 * it), while naming a missing translation REQUIRES reading translation presence. One module
 * cannot do both, so the rule is surfaced twice — as a verdict there, as a contribution here —
 * from the same checks in the same order.
 *
 * What this reads is PRESENCE, never values. `isPresent` answers "is there non-blank text";
 * the text itself is never compared, copied, or returned. A reason names a missing contribution,
 * and a missing contribution is a fact about the response's shape, not its research content.
 *
 * The checks mirror the pooled-coverage short-circuit order: unevaluable first, then the
 * required correction (the judgment pillar), then English, then Filipino. A response missing
 * several pillars reports the first, which is the stable, documented priority rather than an
 * accident of code order. An agreement test in `tests/unit/review-flags.test.ts` pins verdict and
 * contribution together, so editing one without the other fails loudly instead of drifting.
 *
 * Like its sibling module, this imports NOTHING except `validation-response.ts`.
 */

import {
  coversEnglishTranslation,
  coversFilipinoTranslation,
  isCorrectionRequired,
  isTranslationEligible,
  type CoverageResponseShape,
} from "./validation-response";

/** True for a string that carries something other than whitespace. */
function isPresent(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export type DisqualifyReason =
  "unevaluable" | "missing-correction" | "missing-english" | "missing-filipino";

/**
 * The first pillar a stored response does NOT contribute toward, or `null` when it contributes
 * everywhere it could — a valid judgment, a covering English translation, a covering Filipino
 * translation, in that priority order.
 *
 * A judgment-only response therefore reports its missing translations in order (English first),
 * which is correct: it contributes its judgment and lacks both coverings. The entry-review UI
 * pairs this with the pooled verdict, so a response that contributes something is never shown as
 * contributing nothing.
 */
export function nonQualifyingReason(response: CoverageResponseShape): DisqualifyReason | null {
  if (!isTranslationEligible(response.evaluation)) {
    return "unevaluable";
  }
  if (isCorrectionRequired(response.evaluation) && !isPresent(response.correctedInstruction)) {
    return "missing-correction";
  }
  if (!coversEnglishTranslation(response)) {
    return "missing-english";
  }
  if (!coversFilipinoTranslation(response)) {
    return "missing-filipino";
  }
  return null;
}
