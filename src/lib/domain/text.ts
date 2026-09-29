/**
 * Text normalization for research text.
 *
 * This is the *only* place where validator-supplied or imported text is rewritten, and it is
 * deliberately the weakest rewrite that is still useful: trim the ends, collapse internal
 * whitespace runs to a single space.
 *
 * Research integrity rule, and the reason nothing more aggressive is allowed:
 * this function MUST NOT lowercase, case-fold, transliterate, de-punctuate, de-accent, or
 * otherwise "correct" Ilocano content. Ilocano capitalization and punctuation are part of the
 * object of study. A validator judging a synthetic sentence may be reacting precisely to an
 * unnatural capital letter or a misplaced period, so normalizing either away would delete the
 * evidence the dataset exists to collect. Ilocano also legitimately carries foreign proper
 * nouns and Spanish/English loan words whose casing is meaningful.
 *
 * The only sanctioned content change is collapsing runs of whitespace, which is invisible to a
 * reader judging wording but prevents a stray newline or doubled space from being recorded as if
 * the validator had typed it.
 */

/** Internal whitespace: space, tab, newline, carriage return, form feed, vertical tab. */
const WHITESPACE_RUN = /\s+/g;

/**
 * Normalizes research text (a correction, a translation, or a screening-derived label).
 *
 * Returns `null` when the value normalizes to nothing, so every caller can treat "the validator
 * left this blank" as "the field is absent" without re-deriving emptiness itself. Returning
 * `null` rather than `""` matters: the validation integrity rules distinguish *absent* from
 * *present but empty*, and collapsing both onto `""` would make those rules ambiguous.
 */
export function normalizeResearchText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.replace(WHITESPACE_RUN, " ").trim();

  return normalized.length > 0 ? normalized : null;
}
