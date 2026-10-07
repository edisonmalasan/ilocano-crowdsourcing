/**
 * Sentence-length to skeleton-line approximation.
 *
 * The transition skeleton must suggest the shape of the upcoming Ilocano
 * sentence without showing its text. Measuring real text (canvas, DOM ranges)
 * would be precise and brittle; counting characters is coarse and stable, so
 * this module counts only `length` and never reads content.
 *
 * Calibrated once against the shipped data: 4,800 instructions run 21 to 185
 * characters with a median of 84. At roughly 45 characters per line the bands
 * below put the median on two lines, short sentences on one, and the longest
 * on four, at both breakpoints the validation cards serve.
 */

export const SENTENCE_SKELETON_CHARS_PER_LINE = 45;
export const SENTENCE_SKELETON_MAX_LINES = 4;
export const SENTENCE_SKELETON_GENERIC_LINES = 2;

/** Width bands for the final skeleton line, shortest first. */
export const SENTENCE_SKELETON_LAST_LINE_WIDTHS = ["w-2/5", "w-3/5", "w-4/5", "w-full"] as const;

export type SentenceSkeletonLastLineWidth = (typeof SENTENCE_SKELETON_LAST_LINE_WIDTHS)[number];

/**
 * How many skeleton lines a sentence of `length` characters suggests.
 * Unknown or empty input falls back to the stable generic shape so the
 * caller never invents knowledge the server has not returned.
 */
export function sentenceSkeletonLineCount(length: number | null | undefined): number {
  if (typeof length !== "number" || !Number.isFinite(length) || length <= 0) {
    return SENTENCE_SKELETON_GENERIC_LINES;
  }
  const lines = Math.ceil(length / SENTENCE_SKELETON_CHARS_PER_LINE);
  return Math.min(Math.max(lines, 1), SENTENCE_SKELETON_MAX_LINES);
}

/**
 * Width classes for each skeleton line, full width except the last, whose
 * width follows the leftover fraction deterministically. Same length in,
 * same widths out; content never matters.
 */
export function sentenceSkeletonLineWidths(length: number | null | undefined): readonly string[] {
  const lines = sentenceSkeletonLineCount(length);
  if (typeof length !== "number" || !Number.isFinite(length) || length <= 0) {
    return lines === 1 ? ["w-full"] : ["w-full", "w-4/5"];
  }
  if (lines === 1) return ["w-full"];
  const remainder = length % SENTENCE_SKELETON_CHARS_PER_LINE;
  if (remainder === 0) return Array.from({ length: lines }, () => "w-full");
  const fraction = remainder / SENTENCE_SKELETON_CHARS_PER_LINE;
  const last: SentenceSkeletonLastLineWidth =
    fraction <= 0.25 ? "w-2/5" : fraction <= 0.5 ? "w-3/5" : fraction <= 0.8 ? "w-4/5" : "w-full";
  return [...Array.from({ length: lines - 1 }, () => "w-full" as const), last];
}

/** Convenience over raw text: only the length is ever read. */
export function sentenceSkeletonLinesForText(text: string | null | undefined): readonly string[] {
  return sentenceSkeletonLineWidths(typeof text === "string" ? text.length : null);
}

/**
 * Length of an allocated entry's sentence, read without handing the caller
 * its text. Lives here (rather than at the call site) so modules that render
 * interface copy never name the research field alongside the catalog import.
 */
export function sentenceLengthForEntry(
  entry: { readonly instruction: string } | null | undefined,
): number | null {
  if (!entry) return null;
  return entry.instruction.length;
}
