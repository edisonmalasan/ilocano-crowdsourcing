import { describe, expect, it } from "vitest";

import {
  SENTENCE_SKELETON_CHARS_PER_LINE,
  SENTENCE_SKELETON_GENERIC_LINES,
  SENTENCE_SKELETON_MAX_LINES,
  sentenceLengthForEntry,
  sentenceSkeletonLineCount,
  sentenceSkeletonLineWidths,
  sentenceSkeletonLinesForText,
} from "@/lib/validation/sentence-skeleton";

describe("sentence skeleton line bands", () => {
  it("pins the calibration constants the bands are tuned against", () => {
    expect(SENTENCE_SKELETON_CHARS_PER_LINE).toBe(45);
    expect(SENTENCE_SKELETON_MAX_LINES).toBe(4);
    expect(SENTENCE_SKELETON_GENERIC_LINES).toBe(2);
  });

  it("maps a short sentence to one full line", () => {
    expect(sentenceSkeletonLineCount(21)).toBe(1);
    expect(sentenceSkeletonLineWidths(21)).toEqual(["w-full"]);
  });

  it("maps the median sentence to two lines", () => {
    expect(sentenceSkeletonLineCount(84)).toBe(2);
    const widths = sentenceSkeletonLineWidths(84);
    expect(widths).toHaveLength(2);
    expect(widths[0]).toBe("w-full");
  });

  it("maps a long sentence to four full lines at most", () => {
    expect(sentenceSkeletonLineCount(185)).toBe(4);
    expect(sentenceSkeletonLineCount(10_000)).toBe(4);
    expect(sentenceSkeletonLineWidths(10_000)).toHaveLength(4);
  });

  it("uses the stable generic shape for unknown or empty input", () => {
    for (const unknown of [null, undefined, 0, -5, Number.NaN] as const) {
      expect(sentenceSkeletonLineCount(unknown)).toBe(SENTENCE_SKELETON_GENERIC_LINES);
    }
    expect(sentenceSkeletonLineWidths(null)).toEqual(["w-full", "w-4/5"]);
    expect(sentenceSkeletonLineWidths(undefined)).toEqual(["w-full", "w-4/5"]);
  });

  it("is deterministic and content-independent: same length, same shape", () => {
    const a = "a".repeat(84);
    const b = "z".repeat(84);
    expect(sentenceSkeletonLinesForText(a)).toEqual(sentenceSkeletonLinesForText(b));
    expect(sentenceSkeletonLinesForText(a)).toEqual(sentenceSkeletonLinesForText(a));
    expect(sentenceSkeletonLinesForText(null)).toEqual(["w-full", "w-4/5"]);
  });

  it("varies the last-line width with the leftover fraction, never randomly", () => {
    const quarter = sentenceSkeletonLineWidths(45 + 11);
    const half = sentenceSkeletonLineWidths(45 + 22);
    const most = sentenceSkeletonLineWidths(45 + 36);
    expect(quarter[quarter.length - 1]).toBe("w-2/5");
    expect(half[half.length - 1]).toBe("w-3/5");
    expect(most[most.length - 1]).toBe("w-4/5");
    const exact = sentenceSkeletonLineWidths(90);
    expect(exact).toEqual(["w-full", "w-full"]);
  });

  it("reads an entry length without handing over its text", () => {
    expect(sentenceLengthForEntry({ instruction: "abc" })).toBe(3);
    expect(sentenceLengthForEntry(null)).toBeNull();
    expect(sentenceLengthForEntry(undefined)).toBeNull();
  });
});
