import { describe, expect, it } from "vitest";

import {
  isQualifyingValidation,
  isTranslatableContent,
  requiresBilingualTranslations,
} from "@/lib/domain/validation-response";
import {
  EVALUATION_CHOICES,
  TRANSLATION_FIELD_LABELS,
  validationResponseInputSchema,
  validationResponseSchema,
  type Evaluation,
  type EvaluationVocabularyIsInSync,
  type QualifyingShapeIsInSync,
  type ValidationResponseInput,
} from "@/schemas/validation";
import * as validationModule from "@/schemas/validation";

/**
 * The approved integrity rules, as a table written from the `domain-contracts` delta.
 *
 * The table is written from the specification rather than derived from the implementation, so it can
 * disagree with the code and fail. It is the executable statement of the research rules: every
 * evaluation, crossed with every correction state, crossed with every English state, crossed with
 * every Filipino state. 4 x 3 x 3 x 3 = 108 cells, every one of them named.
 *
 * `null` means "accepted". A string is the comma-joined, sorted set of field paths that must be
 * reported as invalid — asserting the specific path, not merely that something failed, is what
 * guarantees a form can attach the message to the input the validator can actually fix.
 *
 * WHY THE STATES ARE TWO INDEPENDENT AXES
 *
 * The superseded model had a single `TRANSLATION_STATES` axis because the response named one
 * language and carried one text, so "which translations are present" was one question. This model has
 * two fields and neither selects the other, so the honest question is two questions. Collapsing them
 * back into one enum would quietly restore the coupling being removed — and it would make a cell
 * like "English present, Filipino blank" inexpressible, which is precisely the state that most needs
 * a test.
 *
 * WHY "BLANK" IS ITS OWN STATE WHEN IT PRODUCES THE SAME PATHS AS "ABSENT"
 *
 * `normalizeResearchText` maps a whitespace-only string to `null` before the integrity rules run, so
 * both states report the same field path. Keeping them as separate columns is what lets
 * `acceptedCombinations()` and the "no translation field exists" assertions below talk about the
 * *shape* of an accepted payload honestly, and it means the matrix would notice if that
 * normalization ever changed to preserve the difference.
 */

const CORRECTION_STATES = ["absent", "present", "blank"] as const;
type CorrectionState = (typeof CORRECTION_STATES)[number];

const TRANSLATION_FIELD_STATES = ["absent", "present", "blank"] as const;
type TranslationFieldState = (typeof TRANSLATION_FIELD_STATES)[number];

const CORRECTION = "nang idi-pay iti Baguio.";
const ENGLISH = "Go to the Bangko Sentral in Baguio by jeep.";
const FILIPINO = "Pumunta sa Bangko Sentral sa Baguio gamit ang jeep.";

/** The three common shapes, at module scope because several suites below reuse them. */
const ENGLISH_ONLY = { evaluation: "correct_natural", englishTranslation: ENGLISH } as const;
const FILIPINO_ONLY = { evaluation: "correct_natural", filipinoTranslation: FILIPINO } as const;
const BOTH = { ...ENGLISH_ONLY, filipinoTranslation: FILIPINO } as const;

/** A value that normalizes to nothing, used for the "blank" states. */
const BLANK = "   \t \n  ";

/** Builds the payload under test. Undefined keys are omitted, not sent as undefined. */
function payload(
  evaluation: Evaluation,
  correction: CorrectionState,
  english: TranslationFieldState,
  filipino: TranslationFieldState,
): Record<string, unknown> {
  const record: Record<string, unknown> = { evaluation };

  if (correction === "present") record.correctedInstruction = CORRECTION;
  if (correction === "blank") record.correctedInstruction = BLANK;

  if (english === "present") record.englishTranslation = ENGLISH;
  if (english === "blank") record.englishTranslation = BLANK;

  if (filipino === "present") record.filipinoTranslation = FILIPINO;
  if (filipino === "blank") record.filipinoTranslation = BLANK;

  return record;
}

/** Paths reported for an accepted-in-theory payload, given its correction state. */
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

/**
 * The bilingual rule, as a table.
 *
 * The two branches are opposites, and that is the whole rule:
 *   - an evaluable evaluation REQUIRES both translations, so any state other than `present` on
 *     either axis is an issue on that axis;
 *   - `cannot_evaluate` ACCEPTS neither, so any state other than `absent` on either axis is an
 *     issue on that axis.
 *
 * A response cannot be both, so the branches are mutually exclusive by construction rather than by
 * an ordering that could be got wrong.
 */
function translationIssues(
  evaluation: Evaluation,
  english: TranslationFieldState,
  filipino: TranslationFieldState,
): string[] {
  const englishField = "englishTranslation";
  const filipinoField = "filipinoTranslation";
  const issues: string[] = [];

  if (evaluation === "cannot_evaluate") {
    if (english !== "absent") issues.push(englishField);
    if (filipino !== "absent") issues.push(filipinoField);
    return issues;
  }

  if (english !== "present") issues.push(englishField);
  if (filipino !== "present") issues.push(filipinoField);
  return issues;
}

/**
 * The expected issue paths, as a sorted comma-joined STRING rather than an array.
 *
 * Joined, because that is what makes an empty result comparable to `""` in one step, and because a
 * two-element list renders identically whether it came from one combined check or from two
 * field-scoped ones — which is the whole point of asserting the paths rather than the messages.
 */
function expectedPaths(
  evaluation: Evaluation,
  correction: CorrectionState,
  english: TranslationFieldState,
  filipino: TranslationFieldState,
): string {
  return [
    ...correctionIssues(evaluation, correction),
    ...translationIssues(evaluation, english, filipino),
  ]
    .filter((path, index, all) => all.indexOf(path) === index)
    .sort()
    .join(",");
}

/** The accepted cells, named so a failure says which combination regressed. */
function acceptedCombinations(): string[] {
  const accepted: string[] = [];

  for (const evaluation of EVALUATION_CHOICES.map((choice) => choice.value)) {
    for (const correction of CORRECTION_STATES) {
      for (const english of TRANSLATION_FIELD_STATES) {
        for (const filipino of TRANSLATION_FIELD_STATES) {
          if (expectedPaths(evaluation, correction, english, filipino) === "") {
            accepted.push(
              `${evaluation} / correction:${correction} / english:${english} / filipino:${filipino}`,
            );
          }
        }
      }
    }
  }

  return accepted;
}

describe("evaluation vocabulary", () => {
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

  it("pins the domain predicate vocabulary to the schema vocabulary at compile time", () => {
    // These resolve to `true` or to `never`. If the two ever disagree, each becomes `never`, this
    // assignment fails, and `pnpm run typecheck` fails. There is no runtime assertion that could
    // substitute: both types vanish after compilation.
    const evaluations: EvaluationVocabularyIsInSync = true;
    const qualifyingShape: QualifyingShapeIsInSync = true;

    expect([evaluations, qualifyingShape]).toEqual([true, true]);
  });
});

describe("research translation targets are two required fields, not a language choice", () => {
  it("labels both required fields for the validation screen", () => {
    expect(TRANSLATION_FIELD_LABELS.english.label).toBe("English translation");
    expect(TRANSLATION_FIELD_LABELS.filipino.label).toBe("Filipino translation");
    expect(TRANSLATION_FIELD_LABELS.english.description.length).toBeGreaterThan(0);
    expect(TRANSLATION_FIELD_LABELS.filipino.description.length).toBeGreaterThan(0);
  });

  it("exports no translation-language vocabulary or schema", () => {
    // A NEGATIVE assertion, so it is paired with a red-confirmation probe rather than trusted on
    // its own: see the note in `AGENTS.md` about absence assertions. The probe re-added a
    // `TRANSLATION_LANGUAGE_CHOICES` export and this test went red; without the export it is green.
    //
    // `TRANSLATION_FIELD_LABELS` is the ONLY translation-named export the schema module has. The
    // coverage predicates are deliberately not re-exported as values from here — see the next test.
    const translationExports = Object.keys(validationModule).filter((name) =>
      /translation/i.test(name),
    );

    expect(translationExports).toEqual(["TRANSLATION_FIELD_LABELS"]);
  });

  it("keeps `isQualifyingValidation` and its shape in the DOMAIN module, not the schema", () => {
    // Coverage is a research question, not a storage one: allocation, the admin dashboard, and
    // export all need it and none of them own the schema. If the schema re-exported the predicate
    // as a VALUE, every one of those consumers would import it from here and drag Zod in with it,
    // undoing the reason the domain module takes no dependencies.
    //
    // The domain module takes no imports at all, which is asserted structurally below rather than
    // trusted. What matters here is the direction of the value's home.
    // Read through an index signature, not by property name: a direct `validationModule.foo` would
    // be a COMPILE error while the export is absent, which is the stronger guarantee and already
    // covered by the `pnpm run typecheck` row in `AGENTS.md`. This runtime read is here for the case
    // the compiler cannot catch — an export that is not a type-safe binding, e.g. re-exporting
    // through `export { x }` from a module whose type is widened.
    const asRecord = validationModule as unknown as Record<string, unknown>;

    expect(asRecord.isQualifyingValidation).toBeUndefined();
    expect(asRecord.requiresBilingualTranslations).toBeUndefined();
    expect(typeof isQualifyingValidation).toBe("function");
    expect(typeof requiresBilingualTranslations).toBe("function");
  });
});

describe("validation integrity matrix", () => {
  it("accepts exactly four combinations, one per evaluation", () => {
    // The single most important assertion in this file. Before this change the matrix had TEN
    // accepted cells, because a translation was optional. There are now exactly four: the three
    // evaluable evaluations with a complete bilingual pair, and `cannot_evaluate` with neither.
    // A regression that re-opens optionality shows up here as a fifth row, by name.
    expect(acceptedCombinations()).toEqual([
      "correct_natural / correction:absent / english:present / filipino:present",
      "correct_unnatural / correction:present / english:present / filipino:present",
      "incorrect / correction:present / english:present / filipino:present",
      "cannot_evaluate / correction:absent / english:absent / filipino:absent",
    ]);
  });

  for (const evaluation of EVALUATION_CHOICES.map((choice) => choice.value)) {
    for (const correction of CORRECTION_STATES) {
      for (const english of TRANSLATION_FIELD_STATES) {
        for (const filipino of TRANSLATION_FIELD_STATES) {
          const expected = expectedPaths(evaluation, correction, english, filipino);
          const cellName = `${evaluation} / correction:${correction} / english:${english} / filipino:${filipino}`;

          it(`${expected === "" ? "accepts" : "rejects"} ${cellName}`, () => {
            const result = validationResponseInputSchema.safeParse(
              payload(evaluation, correction, english, filipino),
            );

            expect(result.success).toBe(expected === "");
            if (result.success) return;

            const actual = result.error.issues
              .map((issue) => issue.path.join("."))
              .sort()
              .join(",");
            expect(actual).toBe(expected);
          });
        }
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
    // Both translations ARE supplied, so the correction is the only defect. Without them the
    // rejection would prove nothing about the correction rule — it would pass for the wrong reason.
    const result = validationResponseInputSchema.safeParse({
      ...BOTH,
      evaluation: "correct_unnatural",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "correctedInstruction",
    ]);
  });

  it("rejects an incorrect rating with a whitespace-only correction", () => {
    const result = validationResponseInputSchema.safeParse({
      ...BOTH,
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
      ...BOTH,
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

  it("rejects a correct-and-natural response with NO translation, because translation is required", () => {
    // This is the behavioural reversal this change exists to make, so it is asserted directly and
    // not only as a cell of the matrix above. The superseded requirement is recorded verbatim in the
    // `domain-contracts` delta under the REMOVED block.
    const result = validationResponseInputSchema.safeParse({ evaluation: "correct_natural" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join(".")).sort()).toEqual([
      "englishTranslation",
      "filipinoTranslation",
    ]);
  });

  it("rejects an evaluable response carrying only the English translation", () => {
    const result = validationResponseInputSchema.safeParse(ENGLISH_ONLY);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "filipinoTranslation",
    ]);
  });

  it("rejects an evaluable response carrying only the Filipino translation", () => {
    const result = validationResponseInputSchema.safeParse(FILIPINO_ONLY);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "englishTranslation",
    ]);
  });

  it("rejects a whitespace-only English translation and names the English field", () => {
    const result = validationResponseInputSchema.safeParse({
      ...FILIPINO_ONLY,
      englishTranslation: "   \t  ",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "englishTranslation",
    ]);
  });

  it("rejects a whitespace-only Filipino translation and names the Filipino field", () => {
    const result = validationResponseInputSchema.safeParse({
      ...ENGLISH_ONLY,
      filipinoTranslation: "   \t  ",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "filipinoTranslation",
    ]);
  });

  it("reports a blank translation as REQUIRED, not as empty, because nothing was typed", () => {
    // The ordering decision in `applyValidationIntegrityRules`. A validator who left the field empty
    // has not typed something wrong, and must not be told that they have.
    const result = validationResponseInputSchema.safeParse({
      ...FILIPINO_ONLY,
      englishTranslation: "   ",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    const [issue] = result.error.issues;
    expect(issue.path.join(".")).toBe("englishTranslation");
    expect(issue.message).toBe(
      "An English translation is required for this evaluation. Both translations are required.",
    );
  });

  it("rejects a cannot-evaluate response carrying an English translation", () => {
    const result = validationResponseInputSchema.safeParse({
      evaluation: "cannot_evaluate",
      englishTranslation: ENGLISH,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "englishTranslation",
    ]);
  });

  it("rejects a cannot-evaluate response carrying a Filipino translation", () => {
    const result = validationResponseInputSchema.safeParse({
      evaluation: "cannot_evaluate",
      filipinoTranslation: FILIPINO,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
      "filipinoTranslation",
    ]);
  });

  it("rejects a cannot-evaluate response carrying both translations and names both fields", () => {
    const result = validationResponseInputSchema.safeParse({
      evaluation: "cannot_evaluate",
      englishTranslation: ENGLISH,
      filipinoTranslation: FILIPINO,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join(".")).sort()).toEqual([
      "englishTranslation",
      "filipinoTranslation",
    ]);
  });

  it("rejects a response written in the SUPERSEDED single-translation wire format", () => {
    // A deployment hazard, so it is pinned as behaviour rather than left to be discovered. Any
    // client still sending the old shape has both keys stripped as unknown, and is then rejected
    // for supplying neither required translation. Nothing is silently accepted-and-lost.
    const result = validationResponseInputSchema.safeParse({
      evaluation: "correct_natural",
      translationLanguage: "english",
      translationText: ENGLISH,
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join(".")).sort()).toEqual([
      "englishTranslation",
      "filipinoTranslation",
    ]);
  });

  it("never emits a translation-language key, whatever the payload contained", () => {
    // The removal of the discriminator is a STRUCTURAL property: it is not "not accepted", it is
    // "not representable". Zod strips unknown keys, so nothing can round-trip through the schema
    // carrying one.
    const parsed = validationResponseInputSchema.parse({
      ...BOTH,
      translationLanguage: "spanish",
      translationText: "Ve a Baguio con jeep.",
    });

    expect("translationLanguage" in parsed).toBe(false);
    expect("translationText" in parsed).toBe(false);
    expect(parsed.englishTranslation).toBe(ENGLISH);
    expect(parsed.filipinoTranslation).toBe(FILIPINO);
  });

  it("normalizes a correction's surrounding and internal whitespace without altering its content", () => {
    const parsed = validationResponseInputSchema.parse({
      ...BOTH,
      evaluation: "incorrect",
      correctedInstruction: "  Gemahen   nga  agpangide\tti jeep.  ",
    });

    expect(parsed.correctedInstruction).toBe("Gemahen nga agpangide ti jeep.");
  });

  it("normalizes whitespace inside both translations without altering their content", () => {
    const parsed = validationResponseInputSchema.parse({
      evaluation: "correct_natural",
      englishTranslation: "  Go to   the Bangko Sentral.  ",
      filipinoTranslation: "  Pumunta   sa Bangko Sentral.  ",
    });

    expect(parsed.englishTranslation).toBe("Go to the Bangko Sentral.");
    expect(parsed.filipinoTranslation).toBe("Pumunta sa Bangko Sentral.");
  });
});

describe("qualifying validation", () => {
  it("requires both translations for an evaluable response", () => {
    expect(isQualifyingValidation(BOTH)).toBe(true);
  });

  it("requires a correction as well, for the evaluations that need one", () => {
    // `...BOTH` first, so the explicit `evaluation` wins. Written the other way round the spread
    // would silently restore `correct_natural` and the assertion would pass for the wrong reason.
    expect(
      isQualifyingValidation({
        ...BOTH,
        evaluation: "incorrect",
        correctedInstruction: CORRECTION,
      }),
    ).toBe(true);
    expect(isQualifyingValidation({ ...BOTH, evaluation: "incorrect" })).toBe(false);
    expect(
      isQualifyingValidation({
        ...BOTH,
        evaluation: "incorrect",
        correctedInstruction: "   ",
      }),
    ).toBe(false);
  });

  it("does not require a correction where the evaluation does not", () => {
    expect(isQualifyingValidation(BOTH)).toBe(true);
    // Present anyway. The predicate does not police this — the schema and the column constraint do
    // — so a surplus correction is not by itself a coverage disqualification.
    expect(isQualifyingValidation({ ...BOTH, correctedInstruction: CORRECTION })).toBe(true);
  });

  it("never counts a cannot-evaluate response, even if translations were somehow supplied", () => {
    expect(isQualifyingValidation({ evaluation: "cannot_evaluate" })).toBe(false);
    expect(
      isQualifyingValidation({
        evaluation: "cannot_evaluate",
        englishTranslation: ENGLISH,
        filipinoTranslation: FILIPINO,
      }),
    ).toBe(false);
  });

  it("treats a missing, a null, and a whitespace-only translation identically", () => {
    for (const value of [undefined, null, "", "   ", "\t\n"]) {
      expect(
        isQualifyingValidation({
          evaluation: "correct_natural",
          englishTranslation: FILIPINO as unknown as string,
          filipinoTranslation: value,
        }),
      ).toBe(false);
      expect(
        isQualifyingValidation({
          evaluation: "correct_natural",
          filipinoTranslation: FILIPINO,
          englishTranslation: value,
        }),
      ).toBe(false);
    }
  });

  it("agrees with the schema over the cells the schema ACCEPTS", () => {
    // The predicate and the integrity rules are two implementations of overlapping rules, and a
    // drift between them would be invisible until an entry silently failed to reach coverage.
    //
    // The relationship is deliberately NOT equivalence, and pretending otherwise would be the wrong
    // test rather than a stricter one. Two asymmetries are real and intended:
    //
    //   1. `cannot_evaluate` is a VALID record that deliberately does not qualify. Requiring the
    //      two to agree in both directions would assert that a legitimate response counts toward
    //      coverage, which is exactly the accounting error this change exists to prevent.
    //   2. A payload the schema rejects can still satisfy the predicate's own criteria — a
    //      `correct_natural` carrying a correction qualifies by every criterion the predicate
    //      checks. It cannot be persisted, so the disagreement is unreachable in practice; the
    //      predicate documents that it does not re-derive the correction-absence rules because the
    //      column constraint already rejects them.
    //
    // So the invariant asserted is the one that carries weight: for every record the schema
    // accepts, the predicate agrees with it. Coverage may under-count a usable record; it may never
    // over-count an unusable one.
    const acceptedButQualifying: string[] = [];
    const acceptedButNotQualifying: string[] = [];
    let accepted = 0;

    for (const evaluation of EVALUATION_CHOICES.map((choice) => choice.value)) {
      for (const correction of CORRECTION_STATES) {
        for (const english of TRANSLATION_FIELD_STATES) {
          for (const filipino of TRANSLATION_FIELD_STATES) {
            const result = validationResponseInputSchema.safeParse(
              payload(evaluation, correction, english, filipino),
            );
            if (!result.success) continue;

            accepted += 1;
            const cell = `${evaluation}/${correction}/${english}/${filipino}`;
            if (isQualifyingValidation(result.data)) {
              acceptedButQualifying.push(cell);
            } else {
              acceptedButNotQualifying.push(cell);
            }
          }
        }
      }
    }

    expect(accepted).toBe(4);
    expect(acceptedButQualifying).toEqual([
      "correct_natural/absent/present/present",
      "correct_unnatural/present/present/present",
      "incorrect/present/present/present",
    ]);
    // The one accepted record that does not qualify is the intended accounting, named explicitly so
    // a change to it is a deliberate edit rather than an accident.
    expect(acceptedButNotQualifying).toEqual(["cannot_evaluate/absent/absent/absent"]);
  });
});

describe("translatable content and required translations", () => {
  it("agrees on all four evaluations, by construction rather than by coincidence", () => {
    for (const choice of EVALUATION_CHOICES) {
      const evaluation = choice.value;

      expect(isTranslatableContent(evaluation)).toBe(evaluation !== "cannot_evaluate");
      expect(requiresBilingualTranslations(evaluation)).toBe(isTranslatableContent(evaluation));
    }
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

  it("keeps the correction and both translations as response data, not as an instruction", () => {
    const parsed = validationResponseSchema.parse({
      ...STORED,
      evaluation: "incorrect",
      correctedInstruction: CORRECTION,
      englishTranslation: ENGLISH,
      filipinoTranslation: FILIPINO,
    });

    expect(parsed.correctedInstruction).toBe(CORRECTION);
    expect(parsed.englishTranslation).toBe(ENGLISH);
    expect(parsed.filipinoTranslation).toBe(FILIPINO);
    // The record holds no `instruction` field at all, which is how a correction is structurally
    // prevented from overwriting the imported synthetic sentence.
    expect("instruction" in parsed).toBe(false);
  });

  it("enforces the same integrity rules as the input schema, so a server write cannot skip them", () => {
    const result = validationResponseSchema.safeParse({ ...STORED, evaluation: "incorrect" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join(".")).sort()).toEqual([
      "correctedInstruction",
      "englishTranslation",
      "filipinoTranslation",
    ]);
  });

  it("enforces the same rules for a correct-and-natural record, with no correction required", () => {
    const result = validationResponseSchema.safeParse({ ...STORED, evaluation: "correct_natural" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join(".")).sort()).toEqual([
      "englishTranslation",
      "filipinoTranslation",
    ]);
  });

  it("accepts a complete stored record and keeps it qualifying", () => {
    const parsed = validationResponseSchema.parse({
      ...STORED,
      evaluation: "correct_natural",
      englishTranslation: ENGLISH,
      filipinoTranslation: FILIPINO,
    });

    expect(isQualifyingValidation(parsed)).toBe(true);
  });

  it("rejects a record that names a dataset entry ID which is not source-shaped", () => {
    const result = validationResponseSchema.safeParse({
      ...STORED,
      evaluation: "correct_natural",
      englishTranslation: ENGLISH,
      filipinoTranslation: FILIPINO,
      datasetEntryId: "entry-17",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("datasetEntryId");
  });

  it("rejects a record whose validator ID is not in the opaque anonymous format", () => {
    const result = validationResponseSchema.safeParse({
      ...STORED,
      evaluation: "correct_natural",
      englishTranslation: ENGLISH,
      filipinoTranslation: FILIPINO,
      validatorId: "validator@example.test",
    });

    expect(result.success).toBe(false);
  });

  it("narrows to the same input type, so a caller can hand a parsed record to input-shaped code", () => {
    const parsed = validationResponseSchema.parse({
      ...STORED,
      evaluation: "correct_natural",
      englishTranslation: ENGLISH,
      filipinoTranslation: FILIPINO,
    });
    const asInput: ValidationResponseInput = parsed;

    expect(asInput.evaluation).toBe("correct_natural");
  });
});
