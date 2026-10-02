/**
 * The review flag is a methodology decision with a pure implementation, so it is tested as one:
 * every clause of the approved rule gets a case, and the two things the rule forbids get cases
 * that prove the absence rather than assuming it.
 *
 * Two halves to the "translations never count" promise, because neither half alone holds it:
 *
 *   1. BEHAVIOURAL — rows whose translations differ but evaluations and corrections agree must
 *      not flag. Without this, the module could compare translations tomorrow and no test would
 *      notice.
 *   2. STRUCTURAL — this module's comment-stripped source must contain no reference to
 *      translations at all. Without this, the behavioural test could be "fixed" by an edit that
 *      keeps the old cases passing while adding a translation comparison elsewhere.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  correctionsDiverge,
  evaluationsDisagree,
  requiresResearcherReview,
} from "@/lib/domain/review-flags";
import type { QualifyingResponseShape } from "@/lib/domain/validation-response";

const ENGLISH = "Go north past the market.";
const FILIPINO = "Dumiretso ka sa hilaga lagpas ng palengke.";

// A complete bilingual response, the shape that qualifies.
const qualifying = (overrides: Partial<QualifyingResponseShape> = {}): QualifyingResponseShape => ({
  evaluation: "correct_natural",
  englishTranslation: ENGLISH,
  filipinoTranslation: FILIPINO,
  ...overrides,
});

describe("evaluationsDisagree", () => {
  it("flags when qualifying responses carry different evaluations", () => {
    const responses = [
      qualifying(),
      qualifying({
        evaluation: "incorrect",
        correctedInstruction: "naurnos a balikas",
      }),
    ];

    expect(evaluationsDisagree(responses)).toBe(true);
    expect(requiresResearcherReview(responses)).toBe(true);
  });

  it("does not flag a single qualifying response, which cannot disagree with itself", () => {
    expect(evaluationsDisagree([qualifying()])).toBe(false);
    expect(requiresResearcherReview([qualifying()])).toBe(false);
  });

  it("does not flag an empty set", () => {
    expect(evaluationsDisagree([])).toBe(false);
    expect(requiresResearcherReview([])).toBe(false);
  });

  it("ignores a cannot_evaluate alongside agreeing qualifying responses", () => {
    // An abstention is not an opinion. Counting it as disagreement would flag entries for having
    // been attempted — the exact inversion of what the flag is for.
    const responses = [qualifying(), qualifying(), { evaluation: "cannot_evaluate" as const }];

    expect(evaluationsDisagree(responses)).toBe(false);
    expect(requiresResearcherReview(responses)).toBe(false);
  });

  it("ignores evaluations on responses that do not qualify", () => {
    // Two responses with different evaluations, NEITHER carrying translations: neither qualifies,
    // so there is no qualifying disagreement. A flag computed over raw evaluations would fire
    // here, which is why the predicate filters first.
    const responses = [
      { evaluation: "correct_natural" as const },
      {
        evaluation: "incorrect" as const,
        correctedInstruction: "naurnos a balikas",
      },
    ];

    expect(evaluationsDisagree(responses)).toBe(false);
    expect(requiresResearcherReview(responses)).toBe(false);
  });
});

describe("correctionsDiverge", () => {
  it("flags more than one distinct correction even when evaluations agree", () => {
    const responses = [
      qualifying({ evaluation: "incorrect", correctedInstruction: "balikas a" }),
      qualifying({ evaluation: "incorrect", correctedInstruction: "balikas b" }),
    ];

    expect(correctionsDiverge(responses)).toBe(true);
    expect(requiresResearcherReview(responses)).toBe(true);
  });

  it("does not flag identical corrections", () => {
    const responses = [
      qualifying({ evaluation: "incorrect", correctedInstruction: "balikas a" }),
      qualifying({ evaluation: "incorrect", correctedInstruction: "balikas a" }),
    ];

    expect(correctionsDiverge(responses)).toBe(false);
  });

  it("does not flag corrections differing only in surrounding whitespace", () => {
    // Whitespace is an accident of the input field, not a linguistic claim. Treating it as a
    // version would flag entries for how a validator used the space bar.
    const responses = [
      qualifying({ evaluation: "incorrect", correctedInstruction: "balikas a" }),
      qualifying({ evaluation: "incorrect", correctedInstruction: "  balikas a\n" }),
    ];

    expect(correctionsDiverge(responses)).toBe(false);
  });

  it("does not treat case differences as agreement", () => {
    // The conservative direction, stated rather than hidden: no case folding means a casing
    // difference flags for human review. If reviewers report noise, normalization is a thesis-team
    // methodology decision, not an engineering tweak.
    const responses = [
      qualifying({ evaluation: "incorrect", correctedInstruction: "Balikas a" }),
      qualifying({ evaluation: "incorrect", correctedInstruction: "balikas a" }),
    ];

    expect(correctionsDiverge(responses)).toBe(true);
  });

  it("ignores responses carrying no correction", () => {
    const responses = [
      qualifying(),
      qualifying({ evaluation: "incorrect", correctedInstruction: "balikas a" }),
    ];

    expect(correctionsDiverge(responses)).toBe(false);
  });
});

describe("translations never count toward the flag", () => {
  it("does not flag rows differing only in translation wording", () => {
    const responses = [
      qualifying(),
      qualifying({
        englishTranslation: "Head north beyond the marketplace.",
        filipinoTranslation: "Pumunta ka sa hilaga lagpas ng palengke.",
      }),
    ];

    expect(requiresResearcherReview(responses)).toBe(false);
    expect(evaluationsDisagree(responses)).toBe(false);
    expect(correctionsDiverge(responses)).toBe(false);
  });

  it("contains no reference to translations in the module that computes the flag", () => {
    // The structural half. Comments stripped first — the module's own header explains the rule in
    // prose, and prose about translations is not a comparison of them. What remains must not
    // mention translations at all, so no edit can compare them without failing here first.
    const source = readFileSync(
      fileURLToPath(new URL("../../src/lib/domain/review-flags.ts", import.meta.url)),
      "utf8",
    );
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    expect(code).not.toMatch(/translation/i);
  });
});
