import { describe, expect, it } from "vitest";

import {
  EVALUATION_CHOICES,
  TRANSLATION_LANGUAGE_CHOICES,
  translationLanguageSchema,
  validationResponseInputSchema,
  validationResponseSchema,
  type Evaluation,
  type ValidationResponseInput,
} from "@/schemas/validation";

/**
 * The seven approved integrity rules, as a table.
 *
 * The table below is written straight from the `domain-contracts` spec rather than derived from
 * the implementation, so it can disagree with the code and fail. It is the executable statement of
 * the research rules: every evaluation, crossed with every correction state, crossed with every
 * translation state.
 *
 * `null` means "accepted". A string is the comma-joined, sorted set of field paths that must be
 * reported as invalid — asserting the specific path, not merely that something failed, is what
 * guarantees a form can attach the message to the input the validator can actually fix.
 */

const CORRECTION_STATES = ["absent", "present", "blank"] as const;
type CorrectionState = (typeof CORRECTION_STATES)[number];

const TRANSLATION_STATES = [
  "none",
  "english_with_text",
  "english_without_text",
  "filipino_with_text",
  "unsupported",
] as const;
type TranslationState = (typeof TRANSLATION_STATES)[number];

const CORRECTION = "nang idi-pay iti Baguio.";

/** Builds the payload under test. Undefined keys are omitted, not sent as undefined. */
function payload(
  evaluation: Evaluation,
  correction: CorrectionState,
  translation: TranslationState,
): Record<string, unknown> {
  const record: Record<string, unknown> = { evaluation };

  if (correction === "present") record.correctedInstruction = CORRECTION;
  if (correction === "blank") record.correctedInstruction = "   \t \n  ";

  if (translation === "english_with_text") {
    record.translationLanguage = "english";
    record.translationText = "Go to the Bangko Sentral in Baguio by jeep.";
  }
  if (translation === "english_without_text") {
    record.translationLanguage = "english";
  }
  if (translation === "filipino_with_text") {
    record.translationLanguage = "filipino";
    record.translationText = "Pumunta sa Bangko Sentral sa Baguio gamit ang jeep.";
  }
  if (translation === "unsupported") {
    record.translationLanguage = "spanish";
    record.translationText = "Ve a Bangko Sentral en Baguio con jeep.";
  }

  return record;
}

/**
 * Whether a value supplies a `translationLanguage` the enum accepts. An unsupported language fails
 * at the enum, which is a *field* failure: the shared cross-field refinement does not run for a
 * payload whose fields did not parse. The table accounts for that explicitly rather than treating
 * it as an implementation detail.
 */
function hasValidTranslationLanguage(translation: TranslationState): boolean {
  return translation !== "unsupported";
}

/** Paths reported for an accepted-in-theory payload, given its correction and translation state. */
function correctionIssues(evaluation: Evaluation, correction: CorrectionState): string[] {
  const correctionRequired = evaluation === "correct_unnatural" || evaluation === "incorrect";

  if (correctionRequired) {
    // Both a missing field and a whitespace-only field are the same defect: no usable corrected
    // sentence. The validator cannot continue either way.
    return correction === "present" ? [] : ["correctedInstruction"];
  }

  // `correct_natural` and `cannot_evaluate` must not carry a correction. A whitespace-only field
  // still *carries* the field, so it is rejected just as a populated one is.
  return correction === "absent" ? [] : ["correctedInstruction"];
}

function translationIssues(evaluation: Evaluation, translation: TranslationState): string[] {
  if (translation === "unsupported") {
    // Rejected by the enum itself, on the language field. The spec calls for exactly this.
    return ["translationLanguage"];
  }
  if (translation === "none") return [];

  if (evaluation === "cannot_evaluate") {
    // No reliable content to translate, so any translation is refused. Text alone and language
    // alone are each reported on their own field.
    if (translation === "english_without_text") return ["translationLanguage"];
    return ["translationLanguage", "translationText"];
  }

  // A selected language requires non-empty text; a complete translation is fine.
  if (translation === "english_without_text") return ["translationText"];
  return [];
}

function expectedPaths(
  evaluation: Evaluation,
  correction: CorrectionState,
  translation: TranslationState,
): string[] {
  if (!hasValidTranslationLanguage(translation)) return ["translationLanguage"];

  return [
    ...correctionIssues(evaluation, correction),
    ...translationIssues(evaluation, translation),
  ]
    .filter((path, index, all) => all.indexOf(path) === index)
    .sort();
}

/** The accepted cells, named so a failure says which combination regressed. */
function acceptedCombinations(): string[] {
  const accepted: string[] = [];

  for (const evaluation of EVALUATION_CHOICES.map((choice) => choice.value)) {
    for (const correction of CORRECTION_STATES) {
      for (const translation of TRANSLATION_STATES) {
        if (expectedPaths(evaluation, correction, translation).length === 0) {
          accepted.push(`${evaluation} / correction:${correction} / translation:${translation}`);
        }
      }
    }
  }

  return accepted;
}

describe("evaluation and translation vocabularies", () => {
  it("offers exactly the four approved evaluations with their approved labels, in order", () => {
    expect([...EVALUATION_CHOICES]).toEqual([
      expect.objectContaining({ value: "correct_natural", label: "Correct and natural" }),
      expect.objectContaining({
        value: "correct_unnatural",
        label: "Correct but sounds unnatural",
      }),
      expect.objectContaining({ value: "incorrect", label: "Incorrect" }),
      expect.objectContaining({ value: "cannot_evaluate", label: "Cannot confidently evaluate" }),
    ]);
  });

  it("offers exactly english and filipino as translation targets", () => {
    expect([...TRANSLATION_LANGUAGE_CHOICES]).toEqual([
      { value: "english", label: "English" },
      { value: "filipino", label: "Filipino" },
    ]);
    expect(translationLanguageSchema.options).toEqual(["english", "filipino"]);
  });
});

describe("validation integrity matrix", () => {
  it("accepts every combination the rules permit", () => {
    // Asserted as a list of named cells, so a regression reports which combination changed rather
    // than just "one of sixty".
    expect(acceptedCombinations()).toEqual([
      "correct_natural / correction:absent / translation:none",
      "correct_natural / correction:absent / translation:english_with_text",
      "correct_natural / correction:absent / translation:filipino_with_text",
      "correct_unnatural / correction:present / translation:none",
      "correct_unnatural / correction:present / translation:english_with_text",
      "correct_unnatural / correction:present / translation:filipino_with_text",
      "incorrect / correction:present / translation:none",
      "incorrect / correction:present / translation:english_with_text",
      "incorrect / correction:present / translation:filipino_with_text",
      "cannot_evaluate / correction:absent / translation:none",
    ]);
  });

  for (const evaluation of EVALUATION_CHOICES.map((choice) => choice.value)) {
    for (const correction of CORRECTION_STATES) {
      for (const translation of TRANSLATION_STATES) {
        const expected = expectedPaths(evaluation, correction, translation);
        const cellName = `${evaluation} / correction:${correction} / translation:${translation}`;

        it(`${expected.length === 0 ? "accepts" : "rejects"} ${cellName}`, () => {
          const result = validationResponseInputSchema.safeParse(
            payload(evaluation, correction, translation),
          );

          expect(result.success).toBe(expected.length === 0);
          if (result.success) return;

          const actual = result.error.issues.map((issue) => issue.path.join(".")).sort();
          expect(actual).toEqual(expected);
        });
      }
    }
  }
});

describe("rule-by-rule evidence", () => {
  it("rejects an evaluation outside the four allowed values and names the field", () => {
    const result = validationResponseInputSchema.safeParse({ evaluation: "correct_but_unnatural" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("evaluation");
  });

  it("rejects an evaluation the roadmap example used but the spec does not allow", () => {
    // The roadmap's illustrative JSON shows "correct_but_unnatural", which is not one of the four
    // approved values. Accepting it would quietly create a fifth state the UI never renders.
    const result = validationResponseInputSchema.safeParse({ evaluation: "correct_but_unnatural" });

    expect(result.success).toBe(false);
  });

  it("rejects an unnatural rating submitted with no correction", () => {
    const result = validationResponseInputSchema.safeParse({ evaluation: "correct_unnatural" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "correctedInstruction",
    ]);
  });

  it("rejects an incorrect rating with a whitespace-only correction", () => {
    const result = validationResponseInputSchema.safeParse({
      evaluation: "incorrect",
      correctedInstruction: "   ",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "correctedInstruction",
    ]);
  });

  it("rejects a correct-and-natural rating that carries a correction", () => {
    const result = validationResponseInputSchema.safeParse({
      evaluation: "correct_natural",
      correctedInstruction: CORRECTION,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "correctedInstruction",
    ]);
  });

  it("accepts the same cannot-evaluate response with neither a correction nor a translation", () => {
    const result = validationResponseInputSchema.safeParse({ evaluation: "cannot_evaluate" });

    expect(result.success).toBe(true);
  });

  it("rejects a cannot-evaluate response submitted with a correction", () => {
    const result = validationResponseInputSchema.safeParse({
      evaluation: "cannot_evaluate",
      correctedInstruction: CORRECTION,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "correctedInstruction",
    ]);
  });

  it("rejects a cannot-evaluate response submitted with a translation", () => {
    const result = validationResponseInputSchema.safeParse({
      evaluation: "cannot_evaluate",
      translationLanguage: "english",
      translationText: "Go to Baguio by jeep.",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join(".")).sort()).toEqual([
      "translationLanguage",
      "translationText",
    ]);
  });

  it("accepts a correct-and-natural response with no translation, because translation is optional", () => {
    const result = validationResponseInputSchema.safeParse({ evaluation: "correct_natural" });

    expect(result.success).toBe(true);
  });

  it("rejects an unsupported translation language and names the language field", () => {
    const result = validationResponseInputSchema.safeParse({
      evaluation: "correct_natural",
      translationLanguage: "spanish",
      translationText: "Ve a Baguio con jeep.",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "translationLanguage",
    ]);
  });

  it("rejects english selected with empty translation text and names the text field", () => {
    const result = validationResponseInputSchema.safeParse({
      evaluation: "correct_natural",
      translationLanguage: "english",
      translationText: "",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(["translationText"]);
  });

  it("rejects translation text supplied with no language, and names the language field", () => {
    const result = validationResponseInputSchema.safeParse({
      evaluation: "correct_natural",
      translationText: "Go to Baguio by jeep.",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "translationLanguage",
    ]);
  });

  it("normalizes a correction's surrounding and internal whitespace without altering its content", () => {
    const parsed = validationResponseInputSchema.parse({
      evaluation: "incorrect",
      correctedInstruction: "  Gemahen   nga  agpangide\tti jeep.  ",
    });

    expect(parsed.correctedInstruction).toBe("Gemahen nga agpangide ti jeep.");
  });
});

describe("persisted validation record", () => {
  const STORED = {
    id: "res_01",
    validatorId: "VAL_a81d92c1",
    datasetEntryId: "OD_0123",
    batchId: "batch_01",
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:05.000Z",
  } as const;

  it("keeps the correction and the translation as response data, not as an instruction", () => {
    const parsed = validationResponseSchema.parse({
      ...STORED,
      evaluation: "incorrect",
      correctedInstruction: CORRECTION,
      translationLanguage: "english",
      translationText: "Go to the Bangko Sentral in Baguio by jeep.",
    });

    expect(parsed.correctedInstruction).toBe(CORRECTION);
    expect(parsed.translationText).toBe("Go to the Bangko Sentral in Baguio by jeep.");
    // The record holds no `instruction` field at all, which is how a correction is structurally
    // prevented from overwriting the imported synthetic sentence.
    expect("instruction" in parsed).toBe(false);
  });

  it("enforces the same integrity rules as the input schema, so a server write cannot skip them", () => {
    const result = validationResponseSchema.safeParse({ ...STORED, evaluation: "incorrect" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "correctedInstruction",
    ]);
  });

  it("rejects a record that names a dataset entry ID which is not source-shaped", () => {
    const result = validationResponseSchema.safeParse({
      ...STORED,
      datasetEntryId: "entry-17",
      evaluation: "correct_natural",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("datasetEntryId");
  });

  it("rejects a record whose validator ID is not in the opaque anonymous format", () => {
    const result = validationResponseSchema.safeParse({
      ...STORED,
      evaluation: "correct_natural",
      validatorId: "validator@example.test",
    });

    expect(result.success).toBe(false);
  });

  it("narrows to the same input type, so a caller can hand a parsed record to input-shaped code", () => {
    const parsed = validationResponseSchema.parse({ ...STORED, evaluation: "correct_natural" });
    const asInput: ValidationResponseInput = parsed;

    expect(asInput.evaluation).toBe("correct_natural");
  });
});
