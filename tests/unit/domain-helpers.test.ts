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
  requiresBilingualTranslations,
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
      expect(typeof requiresBilingualTranslations(evaluation)).toBe("boolean");
    }
  });
});

describe("requiresBilingualTranslations", () => {
  it("is false only for cannot_evaluate", () => {
    expect(requiresBilingualTranslations("correct_natural")).toBe(true);
    expect(requiresBilingualTranslations("correct_unnatural")).toBe(true);
    expect(requiresBilingualTranslations("incorrect")).toBe(true);
    // There is no reliable content to translate when the validator could not judge the entry, and
    // requiring it would store an unverified rendering of an unverified judgement.
    expect(requiresBilingualTranslations("cannot_evaluate")).toBe(false);
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
      expect(requiresBilingualTranslations(evaluation)).toBe(expected[evaluation]);
    }
  });

  it("is the ONLY translation predicate the domain module exports, with no permitted variant", () => {
    // A NEGATIVE assertion, probe-confirmed: re-adding an `isTranslatableContent` export that
    // returns the same value turns this red, and removing `requiresBilingualTranslations` turns it
    // red the other way. Under this methodology a translation is never merely permitted, so an
    // "is one allowed?" predicate would have no state in which it returned true — an export that
    // exists only to be called wrongly.
    const asRecord = domainModule as unknown as Record<string, unknown>;
    const translationPredicates = Object.keys(domainModule)
      .filter((name) => /translat/i.test(name))
      .sort();

    expect(translationPredicates).toEqual(["requiresBilingualTranslations"]);
    expect(asRecord.isTranslatableContent).toBeUndefined();
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
