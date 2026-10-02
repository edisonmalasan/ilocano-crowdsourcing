/**
 * Why one stored response does not qualify toward coverage, or `null` when it does.
 *
 * This lives APART from `review-flags.ts` on purpose, and the separation is load-bearing: the
 * flag module is structurally forbidden from reading translation fields (a source test asserts
 * it), while naming a missing translation REQUIRES reading translation presence. One module
 * cannot do both, so the rule is surfaced twice — as a verdict there, as a reason here — from
 * the same checks in the same order.
 *
 * What this reads is PRESENCE, never values. `isPresent` answers "is there non-blank text";
 * the text itself is never compared, copied, or returned. A reason names a missing field, and a
 * missing field is a fact about the response's shape, not its research content.
 *
 * The checks mirror `isQualifyingValidation`'s short-circuit order exactly: unevaluable first,
 * then the required correction, then English, then Filipino. A response failing several checks
 * reports the first, which is the stable, documented priority rather than an accident of code
 * order. An agreement test in `tests/unit/review-flags.test.ts` pins verdict and reason together,
 * so editing one without the other fails loudly instead of drifting.
 *
 * Like its sibling module, this imports NOTHING except `validation-response.ts`.
 */

import {
  isCorrectionRequired,
  requiresBilingualTranslations,
  type QualifyingResponseShape,
} from "./validation-response";

/** True for a string that carries something other than whitespace. */
function isPresent(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export type DisqualifyReason =
  "unevaluable" | "missing-correction" | "missing-english" | "missing-filipino";

export function nonQualifyingReason(response: QualifyingResponseShape): DisqualifyReason | null {
  if (!requiresBilingualTranslations(response.evaluation)) {
    return "unevaluable";
  }
  if (isCorrectionRequired(response.evaluation) && !isPresent(response.correctedInstruction)) {
    return "missing-correction";
  }
  if (!isPresent(response.englishTranslation)) {
    return "missing-english";
  }
  if (!isPresent(response.filipinoTranslation)) {
    return "missing-filipino";
  }
  return null;
}
