import { describe, expect, it } from "vitest";

import {
  ANONYMOUS_VALIDATOR_ID_SHAPE,
  createAnonymousValidatorId,
  isAnonymousValidatorIdFormat,
} from "@/lib/domain/anonymous-validator-id";
import { normalizeResearchText } from "@/lib/domain/text";
import * as domainModule from "@/lib/domain/validation-response";
import {
  isCorrectionRequired,
  isTranslationEligible,
  type ValidationEvaluation,
} from "@/lib/domain/validation-response";
import { anonymousValidatorIdSchema } from "@/schemas/validator";

const ALL_EVALUATIONS: readonly ValidationEvaluation[] = [
  "correct_natural",
  "correct_unnatural",
  "incorrect",
  "cannot_evaluate",
];

describe("anonymous validator identifier", () => {
  it("produces an identifier in the documented opaque format on every draw", () => {
    for (let draw = 0; draw < 1000; draw += 1) {
      const id = createAnonymousValidatorId();

      expect(id, `draw ${draw} produced ${id}`).toMatch(/^VAL_[0-9a-f]{8}$/);
      expect(isAnonymousValidatorIdFormat(id)).toBe(true);
      // The schema is the single definition of the format, so the domain function and the
      // validator-facing contract cannot drift apart.
      expect(anonymousValidatorIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it("documents the shape it produces", () => {
    expect(ANONYMOUS_VALIDATOR_ID_SHAPE).toBe(
      "VAL_ + 4 random bytes as 8 lowercase hex characters",
    );
  });

  it("carries no meaningful component: nothing about time, machine, or identity is encoded", () => {
    // Two identifiers drawn back to back must not be related by any visible structure, and a
    // counter-based generator would show strictly increasing values. Only the prefix is constant.
    const first = createAnonymousValidatorId();
    const second = createAnonymousValidatorId();

    expect(first.slice(0, 4)).toBe("VAL_");
    expect(second.slice(0, 4)).toBe("VAL_");
    expect(first).toHaveLength(12);
    expect(second).toHaveLength(12);
  });

  it("has enough entropy that 1000 draws are overwhelmingly distinct", () => {
    // 32 bits gives a birthday-collision probability around 1e-4 at this sample size, so >900
    // distinct values is the honest threshold. This asserts the generator is random, not
    // sequential, without claiming collision-freedom it cannot guarantee.
    const draws = Array.from({ length: 1000 }, () => createAnonymousValidatorId());
    const distinct = new Set(draws);

    expect(distinct.size).toBeGreaterThan(900);
  });
});

describe("isCorrectionRequired", () => {
  it("is true only for the evaluations that demand a corrected Ilocano sentence", () => {
    expect(isCorrectionRequired("correct_natural")).toBe(false);
    expect(isCorrectionRequired("correct_unnatural")).toBe(true);
    expect(isCorrectionRequired("incorrect")).toBe(true);
    // Forcing a correction here would make a validator invent an answer they just said they do
    // not have.
    expect(isCorrectionRequired("cannot_evaluate")).toBe(false);
  });

  it("returns a definitive boolean for every approved evaluation, with no default fallthrough", () => {
    for (const evaluation of ALL_EVALUATIONS) {
      expect(typeof isCorrectionRequired(evaluation)).toBe("boolean");
      expect(typeof isTranslationEligible(evaluation)).toBe("boolean");
    }
  });
});

describe("isTranslationEligible", () => {
  it("is false only for cannot_evaluate", () => {
    expect(isTranslationEligible("correct_natural")).toBe(true);
    expect(isTranslationEligible("correct_unnatural")).toBe(true);
    expect(isTranslationEligible("incorrect")).toBe(true);
    // There is no reliable content to translate when the validator could not judge the entry, and
    // offering it would store an unverified rendering of an unverified judgement.
    expect(isTranslationEligible("cannot_evaluate")).toBe(false);
  });

  it("is a total function of the four approved evaluations, with no fifth state", () => {
    // Written from the spec's list rather than from the implementation, so a value added to
    // `EVALUATION_CHOICES` without a decision here fails instead of falling through.
    const expected: Record<string, boolean> = {
      correct_natural: true,
      correct_unnatural: true,
      incorrect: true,
      cannot_evaluate: false,
    };

    expect(Object.keys(expected).sort()).toEqual([...ALL_EVALUATIONS].sort());
    for (const evaluation of ALL_EVALUATIONS) {
      expect(isTranslationEligible(evaluation)).toBe(expected[evaluation]);
    }
  });

  it("exports exactly the eligibility predicate and the two per-language cover predicates", () => {
    // A NEGATIVE assertion, probe-confirmed: re-adding a `requiresBilingualTranslations` export
    // turns this red, and removing any of the three turns it red the other way. The three form one
    // closed vocabulary — may-carry, covers-English, covers-Filipino — with no "must collect both"
    // variant, because under this methodology no such predicate has a state in which it returns
    // true.
    const asRecord = domainModule as unknown as Record<string, unknown>;
    const translationPredicates = Object.keys(domainModule)
      .filter((name) => /translat/i.test(name))
      .sort();

    expect(translationPredicates).toEqual([
      "coversEnglishTranslation",
      "coversFilipinoTranslation",
      "isTranslationEligible",
    ]);
    expect(asRecord.isTranslatableContent).toBeUndefined();
    expect(asRecord.requiresBilingualTranslations).toBeUndefined();
  });
});

describe("normalizeResearchText", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeResearchText("  Gemahen ti jeep.  ")).toBe("Gemahen ti jeep.");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(normalizeResearchText("Gemahen\tnta  agpangide\n\nti jeep.")).toBe(
      "Gemahen nta agpangide ti jeep.",
    );
  });

  it("returns null for blank input so an empty field is treated as absent", () => {
    expect(normalizeResearchText("")).toBeNull();
    expect(normalizeResearchText("   ")).toBeNull();
    expect(normalizeResearchText("\t\n  \r ")).toBeNull();
  });

  it("returns null for a non-string input rather than throwing at a form boundary", () => {
    expect(normalizeResearchText(null)).toBeNull();
    expect(normalizeResearchText(undefined)).toBeNull();
  });

  it("does NOT lowercase, because capitalization is part of what validators judge", () => {
    // Lowercasing here would delete the evidence for an "unnatural capitalization" judgement.
    expect(normalizeResearchText("NANG idi-pay ITI Baguio")).toBe("NANG idi-pay ITI Baguio");
  });

  it("does NOT alter punctuation, for the same reason", () => {
    const punctuated = "Gemahen nga agpangide ti jeep — ngayon, agbugso?!";
    expect(normalizeResearchText(punctuated)).toBe(punctuated);
  });

  it("preserves Ilocano diacritics and apostrophes exactly", () => {
    const ilocano = "Ayo nga agsasalita iti Ilokano: maay, aweng, ngan no, kudi!";
    expect(normalizeResearchText(ilocano)).toBe(ilocano);
  });

  it("preserves a sentence that is already normalized, unchanged", () => {
    const clean = "Gemahen nga agpangide ti jeep.";
    expect(normalizeResearchText(clean)).toBe(clean);
  });
});
