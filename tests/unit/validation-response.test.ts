import { describe, expect, it } from "vitest";

import {
  countQualifyingValidations,
  coversEnglishTranslation,
  coversFilipinoTranslation,
  firstCoveredAt,
  isEntryComplete,
  isQualifyingValidation,
  isTranslationEligible,
  isValidJudgment,
  type CoverageResponseShape,
  type ValidatorCoverageResponseShape,
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
 * Each translation field is independent: "which translations are present" is two questions, one
 * per field. Collapsing them back into one enum would recouple what the methodology decoupled —
 * and it would make a cell like "English present, Filipino blank" inexpressible, which is
 * precisely the state that most needs a test.
 *
 * WHY "BLANK" IS ITS OWN STATE WHEN IT NORMALIZES TO ABSENT
 *
 * `normalizeResearchText` maps a whitespace-only string to `null` before the integrity rules run.
 * Keeping blank as a separate column is what lets the matrix notice if that normalization ever
 * changed to preserve the difference — and the accepted set below would change with it.
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

  // A blank string is REFUSED by the field schema before normalisation could erase it — so blank
  // counts as supplied-but-invalid everywhere: missing where a correction is required, forbidden
  // where none is allowed. Only absent is the same as nothing.
  if (correctionRequired) {
    return correction === "present" ? [] : ["correctedInstruction"];
  }

  // `correct_natural` and `cannot_evaluate` must not carry a correction in any form.
  return correction === "absent" ? [] : ["correctedInstruction"];
}

/**
 * The translation rule, as a table.
 *
 * Translations are a per-response CHOICE: present and absent are both legitimate for an
 * evaluable evaluation, but a blank in a supplied field is refused rather than read as a skip.
 * `cannot_evaluate` refuses every supplied translation, blank or not.
 */
function translationIssues(
  evaluation: Evaluation,
  english: TranslationFieldState,
  filipino: TranslationFieldState,
): string[] {
  const englishField = "englishTranslation";
  const filipinoField = "filipinoTranslation";

  if (evaluation === "cannot_evaluate") {
    // Any supplied translation — real or blank — is refused. A blank is not absence: the field
    // schema rejects whitespace-only strings before they could normalise away.
    const issues: string[] = [];
    if (english !== "absent") issues.push(englishField);
    if (filipino !== "absent") issues.push(filipinoField);
    return issues;
  }

  // Per-response choice: present and absent are both legitimate, but a blank in a supplied
  // field is refused rather than read as a skip.
  const issues: string[] = [];
  if (english === "blank") issues.push(englishField);
  if (filipino === "blank") issues.push(filipinoField);
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

describe("research translation targets are two fields with a per-response choice", () => {
  it("labels both fields for the validation screen", () => {
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

  it("keeps coverage predicates and their shape in the DOMAIN module, not the schema", () => {
    // Coverage is a research question, not a storage one: allocation, the admin dashboard, and
    // export all need it and none of them own the schema. If the schema re-exported the predicates
    // as VALUES, every one of those consumers would import it from here and drag Zod in with it,
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

    expect(asRecord.entryCoverage).toBeUndefined();
    expect(asRecord.isEntryComplete).toBeUndefined();
    expect(asRecord.isTranslationEligible).toBeUndefined();
    expect(typeof isEntryComplete).toBe("function");
    expect(typeof isTranslationEligible).toBe("function");
  });
});

describe("validation integrity matrix", () => {
  it("accepts every translation choice for an evaluable response, and nothing but absence for cannot-evaluate", () => {
    // correct_natural: correction absent x 4 translation states (absent/present each, blank
    // refused) = 4. correct_unnatural and incorrect: correction present x 4 = 4 each. For
    // `cannot_evaluate`: correction absent x translation absent/absent = 1. Total: 4 + 4 + 4 + 1
    // = 13 accepted cells of 108.
    // A regression that re-imposes the bilingual pair shows up here as missing rows, by name —
    // and a regression that silently accepts blanks shows up as extra rows.
    expect(acceptedCombinations()).toHaveLength(13);

    const names = new Set(acceptedCombinations());
    for (const evaluation of ["correct_unnatural", "incorrect"]) {
      for (const english of ["absent", "present"] as const) {
        for (const filipino of ["absent", "present"] as const) {
          expect(
            names.has(
              `${evaluation} / correction:present / english:${english} / filipino:${filipino}`,
            ),
          ).toBe(true);
        }
      }
    }
    for (const english of ["absent", "present"] as const) {
      for (const filipino of ["absent", "present"] as const) {
        expect(
          names.has(
            `correct_natural / correction:absent / english:${english} / filipino:${filipino}`,
          ),
        ).toBe(true);
      }
    }
    expect(
      names.has("cannot_evaluate / correction:absent / english:absent / filipino:absent"),
    ).toBe(true);
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

            // Deduplicated: a blank in a forbidden field raises TWO issues on one path — the
            // field-level blank refusal and the rule-level not-accepted refusal — and the matrix
            // asserts WHICH fields are invalid, not how many messages each carries. The form
            // keeps the first per field, pinned in `validation-form-flow.test.ts`.
            const actual = result.error.issues
              .map((issue) => issue.path.join("."))
              .filter((path, index, all) => all.indexOf(path) === index)
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
    // The correction is the only defect in this payload: translations are absent by choice, which
    // is legitimate, so the rejection proves the correction rule rather than anything else.
    const result = validationResponseInputSchema.safeParse({
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

  it("accepts a correct-and-natural response with NO translation, the validator having skipped", () => {
    // The behavioural statement of the methodology change: translation is a per-response choice,
    // and skip is a first-class answer. The superseded requirement is recorded verbatim in the
    // `domain-contracts` delta under the REMOVED block.
    const result = validationResponseInputSchema.safeParse({ evaluation: "correct_natural" });

    expect(result.success).toBe(true);
  });

  it("accepts an evaluable response carrying only the English translation", () => {
    const result = validationResponseInputSchema.safeParse(ENGLISH_ONLY);

    expect(result.success).toBe(true);
  });

  it("accepts an evaluable response carrying only the Filipino translation", () => {
    const result = validationResponseInputSchema.safeParse(FILIPINO_ONLY);

    expect(result.success).toBe(true);
  });

  it("refuses a whitespace-only English translation and names the English field", () => {
    // A blank in a supplied field is not a skip: the validator chose the language and supplied
    // nothing usable. The field schema refuses it before normalisation could erase the
    // distinction — which is also why the message is the field's own rather than a rule's.
    const result = validationResponseInputSchema.safeParse({
      ...FILIPINO_ONLY,
      englishTranslation: "   \t  ",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join(".")).sort()).toEqual([
      "englishTranslation",
    ]);
    for (const issue of result.error.issues) {
      expect(issue.message.length).toBeGreaterThan(10);
      expect(issue.message).not.toMatch(
        /ZodError|invalid_type|too_small|strictObject|\bundefined\b/,
      );
    }
  });

  it("refuses a whitespace-only Filipino translation and names the Filipino field", () => {
    const result = validationResponseInputSchema.safeParse({
      ...ENGLISH_ONLY,
      filipinoTranslation: "   \t  ",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join(".")).sort()).toEqual([
      "filipinoTranslation",
    ]);
  });

  it("accepts an explicit null translation as a skip, exactly like an omitted key", () => {
    // Null is not blank: it is SQL NULL read back, or a client stating absence outright. Both
    // nullish states mean "not supplied", and the field schema passes both through untouched.
    const result = validationResponseInputSchema.safeParse({
      evaluation: "correct_natural",
      englishTranslation: null,
    });

    expect(result.success).toBe(true);
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
    // client still sending the old shape has both keys stripped as unknown — and with translations
    // optional, the stripped payload is now an ACCEPTED translation-free response. Nothing is
    // silently lost: the stripped keys carried at most one translation, and the record stands as
    // a judgment without translations rather than failing closed.
    const result = validationResponseInputSchema.safeParse({
      evaluation: "correct_natural",
      translationLanguage: "english",
      translationText: ENGLISH,
    });

    expect(result.success).toBe(true);
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

describe("pooled coverage predicates", () => {
  it("counts a judgment alone as a valid judgment with no language cover", () => {
    const response = { evaluation: "correct_natural" } as const;

    expect(isValidJudgment(response)).toBe(true);
    expect(coversEnglishTranslation(response)).toBe(false);
    expect(coversFilipinoTranslation(response)).toBe(false);
    expect(isQualifyingValidation(response)).toBe(true);
  });

  it("requires a correction as well, for the evaluations that need one", () => {
    // `...BOTH` first, so the explicit `evaluation` wins. Written the other way round the spread
    // would silently restore `correct_natural` and the assertion would pass for the wrong reason.
    expect(
      isValidJudgment({
        ...BOTH,
        evaluation: "incorrect",
        correctedInstruction: CORRECTION,
      }),
    ).toBe(true);
    expect(isValidJudgment({ ...BOTH, evaluation: "incorrect" })).toBe(false);
    expect(
      isValidJudgment({
        ...BOTH,
        evaluation: "incorrect",
        correctedInstruction: "   ",
      }),
    ).toBe(false);
  });

  it("does not require a correction where the evaluation does not", () => {
    expect(isValidJudgment(BOTH)).toBe(true);
    // Present anyway. The predicate does not police this — the schema and the column constraint do
    // — so a surplus correction is not by itself a coverage disqualification.
    expect(isValidJudgment({ ...BOTH, correctedInstruction: CORRECTION })).toBe(true);
  });

  it("never counts a cannot-evaluate response, even if translations were somehow supplied", () => {
    expect(isValidJudgment({ evaluation: "cannot_evaluate" })).toBe(false);
    expect(
      isQualifyingValidation({
        evaluation: "cannot_evaluate",
        englishTranslation: ENGLISH,
        filipinoTranslation: FILIPINO,
      }),
    ).toBe(false);
  });

  it("counts a single-translation response as covering exactly its language", () => {
    expect(coversEnglishTranslation(ENGLISH_ONLY)).toBe(true);
    expect(coversFilipinoTranslation(ENGLISH_ONLY)).toBe(false);
    expect(coversEnglishTranslation(FILIPINO_ONLY)).toBe(false);
    expect(coversFilipinoTranslation(FILIPINO_ONLY)).toBe(true);
    expect(isQualifyingValidation(ENGLISH_ONLY)).toBe(true);
    expect(isQualifyingValidation(FILIPINO_ONLY)).toBe(true);
  });

  it("treats a missing, a null, and a whitespace-only translation identically", () => {
    for (const value of [undefined, null, "", "   ", "\t\n"]) {
      expect(
        coversEnglishTranslation({
          evaluation: "correct_natural",
          englishTranslation: value,
        }),
      ).toBe(false);
      expect(
        coversFilipinoTranslation({
          evaluation: "correct_natural",
          filipinoTranslation: FILIPINO,
          englishTranslation: value,
        }),
      ).toBe(true);
    }
  });

  it("agrees with the schema over the cells the schema ACCEPTS", () => {
    // The predicate and the integrity rules are two implementations of overlapping rules, and a
    // drift between them would be invisible until an entry silently failed to reach coverage.
    //
    // The relationship is deliberately NOT equivalence, and pretending otherwise would be the wrong
    // test rather than a stricter one. Two asymmetries are real and intended:
    //
    //   1. `cannot_evaluate` is a VALID record that deliberately contributes nothing. Requiring the
    //      two to agree in both directions would assert that a legitimate response counts toward
    //      coverage, which is exactly the accounting error this change exists to prevent.
    //   2. A payload the schema rejects can still satisfy the predicate's own criteria — a
    //      `correct_natural` carrying a correction contributes a judgment by every criterion the
    //      predicate checks. It cannot be persisted, so the disagreement is unreachable in practice;
    //      the predicate documents that it does not re-derive the correction-absence rules because
    //      the column constraint already rejects them.
    //
    // So the invariant asserted is the one that carries weight: for every record the schema
    // accepts, the predicate agrees that it contributes. Coverage may under-count a usable record;
    // it may never over-count an unusable one.
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

    // 13 accepted cells (4 per evaluable evaluation — absent or present per language,
    // blank refused — plus 1 for cannot_evaluate); all but the abstention contribute in at
    // least one pillar.
    expect(accepted).toBe(13);
    expect(acceptedButQualifying).toHaveLength(12);
    // The accepted record that contributes nothing is the abstention, named explicitly so a
    // change to it is a deliberate edit rather than an accident.
    expect(acceptedButNotQualifying).toEqual(["cannot_evaluate/absent/absent/absent"]);
  });
});

describe("pooled coverage over a set of responses", () => {
  /**
   * A stored response from a named validator.
   *
   * Typed rather than inferred: an `overrides` parameter of `Record<string, unknown>` widens
   * `evaluation` to `string`, which stops the literal from being assignable to the domain shape and
   * makes the type-check fail for a reason that has nothing to do with coverage.
   */
  function responseFrom(
    validatorId: string,
    overrides: Partial<ValidatorCoverageResponseShape> = {},
  ): ValidatorCoverageResponseShape {
    return { validatorId, ...BOTH, ...overrides };
  }

  /**
   * A `cannot_evaluate` response, which carries no correction and no translations.
   *
   * A separate helper rather than `responseFrom(validatorId, { evaluation: "cannot_evaluate" })`,
   * because an inline object literal inside an array widens `evaluation` to `string` and stops the
   * whole array from being assignable to the domain shape.
   */
  function cannotEvaluateFrom(validatorId: string): ValidatorCoverageResponseShape {
    return { validatorId, evaluation: "cannot_evaluate" };
  }

  it("counts a judgment-only response as one contributing validator", () => {
    expect(
      countQualifyingValidations([{ validatorId: "VAL_0000beef", evaluation: "correct_natural" }]),
    ).toBe(1);
  });

  it("counts mixed single-pillar responses per validator, not per row", () => {
    // Three stored rows — a judgment with no translations, an English-only row, a
    // Filipino-only row — from three attempts: three contributing validators.
    const stored = [
      responseFrom("VAL_0000beef", { englishTranslation: null, filipinoTranslation: null }),
      responseFrom("VAL_0000feed", { filipinoTranslation: null }),
      responseFrom("VAL_0000cafe", { englishTranslation: null }),
    ];

    expect(stored).toHaveLength(3);
    expect(countQualifyingValidations(stored)).toBe(3);
  });

  it("counts a cannot_evaluate response as zero even when it is the only response", () => {
    // The research-integrity case this whole change exists to get right. A validator who was not
    // confident has still given the thesis team something worth keeping — the record is stored — but
    // it must not advance coverage, or an entry full of unconfident responses would look finished.
    const stored = [cannotEvaluateFrom("VAL_0000beef"), cannotEvaluateFrom("VAL_0000feed")];

    expect(countQualifyingValidations(stored)).toBe(0);
  });

  it("counts each DISTINCT validator once, not each row", () => {
    // A validator counts once however many pillars their responses cover.
    //
    // The duplicate is unreachable through the repository — `UNIQUE (validator_id,
    // dataset_entry_id)` makes one response per validator per entry structurally impossible — and
    // it is exercised anyway. A branch that cannot be reached is a branch that is never run, and the
    // failure mode of a research metric is being quietly wrong rather than being loudly broken.
    const stored = [
      responseFrom("VAL_0000beef"),
      responseFrom("VAL_0000beef"),
      responseFrom("VAL_0000feed"),
    ];

    expect(stored).toHaveLength(3);
    expect(countQualifyingValidations(stored)).toBe(2);
  });

  it("is empty-safe and never negative", () => {
    expect(countQualifyingValidations([])).toBe(0);
  });

  it("agrees with a per-response filter on every combination of three stored responses", () => {
    // `countQualifyingValidations` is `isQualifyingValidation` plus a dedupe, so the two must not
    // disagree about WHICH responses qualify. Swept exhaustively over the three states that can
    // occur in storage: a judgment with translations, `cannot_evaluate`, a judgment without
    // translations, and single-language rows — across three validators.
    const shapes: readonly CoverageResponseShape[] = [
      { evaluation: "correct_natural", englishTranslation: ENGLISH, filipinoTranslation: FILIPINO },
      { evaluation: "cannot_evaluate" },
      { evaluation: "correct_natural" },
      { evaluation: "correct_natural", englishTranslation: ENGLISH },
      { evaluation: "correct_natural", filipinoTranslation: FILIPINO },
      {
        evaluation: "incorrect",
        correctedInstruction: CORRECTION,
        englishTranslation: ENGLISH,
        filipinoTranslation: FILIPINO,
      },
      { evaluation: "incorrect", correctedInstruction: CORRECTION },
    ];
    const validators = ["VAL_0000beef", "VAL_0000feed", "VAL_0000cafe"];

    let cells = 0;
    for (const first of shapes) {
      for (const second of shapes) {
        for (const third of shapes) {
          const stored = [
            { validatorId: validators[0], ...first },
            { validatorId: validators[1], ...second },
            { validatorId: validators[2], ...third },
          ];
          const expectedQualifying = stored.filter((record) =>
            isQualifyingValidation(record),
          ).length;
          const expectedCount = new Set(
            stored.filter((record) => isQualifyingValidation(record)).map((r) => r.validatorId),
          ).size;

          // Distinct validators here, so the count and the filter must agree exactly.
          expect(countQualifyingValidations(stored), JSON.stringify(stored)).toBe(expectedCount);
          expect(expectedCount, JSON.stringify(stored)).toBe(expectedQualifying);
          cells += 1;
        }
      }
    }

    expect(cells).toBe(shapes.length ** 3);
  });

  it("reports when pooled coverage first held, at the completing response's instant", () => {
    const first = "2026-09-30T00:00:00.000Z";
    const second = "2026-09-30T00:00:01.000Z";
    const third = "2026-09-30T00:00:02.000Z";
    const withAt = (
      at: string,
      shape: CoverageResponseShape,
    ): CoverageResponseShape & { createdAt: string } => ({ ...shape, createdAt: at });

    // Judgment, then English, then Filipino: covered at the third instant.
    expect(
      firstCoveredAt([
        withAt(first, { evaluation: "correct_natural" }),
        withAt(second, { evaluation: "correct_natural", englishTranslation: ENGLISH }),
        withAt(third, { evaluation: "correct_natural", filipinoTranslation: FILIPINO }),
      ]),
    ).toBe(third);
    // One full response covers at its own instant.
    expect(firstCoveredAt([withAt(first, { ...BOTH, evaluation: "correct_natural" })])).toBe(first);
    // Never covered without all three pillars.
    expect(
      firstCoveredAt([
        withAt(first, { evaluation: "correct_natural" }),
        withAt(second, { evaluation: "cannot_evaluate" }),
      ]),
    ).toBeNull();
    // Empty input never covered.
    expect(firstCoveredAt([])).toBeNull();
  });
});

describe("entry completion is pooled, not counted", () => {
  /**
   * Local builders, deliberately NOT shared with the coverage block above. That block's helpers
   * return validator-carrying shapes; the completion predicate takes the plain shape and must be
   * exercised as taking it, so that a future edit which starts reading the validator id fails the
   * type-check here instead of silently changing what completion depends on.
   */
  function pooledJudgment(overrides: Partial<CoverageResponseShape> = {}): CoverageResponseShape {
    return {
      evaluation: "correct_natural",
      ...overrides,
    };
  }

  function unevaluable(): CoverageResponseShape {
    return { evaluation: "cannot_evaluate" };
  }

  it("is complete with pooled coverage across three responses", () => {
    expect(
      isEntryComplete([
        pooledJudgment(),
        pooledJudgment({ englishTranslation: ENGLISH }),
        pooledJudgment({ filipinoTranslation: FILIPINO }),
      ]),
    ).toBe(true);
  });

  it("stays complete when further responses arrive", () => {
    // A further response from another attempt does not make a complete entry less complete, and
    // must not make it MORE complete either — there is no level above complete to reach.
    const complete = pooledJudgment({ englishTranslation: ENGLISH, filipinoTranslation: FILIPINO });
    expect(isEntryComplete([complete, complete])).toBe(true);
  });

  it("is complete however many responses hold the coverage, because the count plays no part", () => {
    expect(isEntryComplete(Array.from({ length: 50 }, () => pooledJudgment()))).toBe(false);
    expect(
      isEntryComplete(
        Array.from({ length: 50 }, () => pooledJudgment({ englishTranslation: ENGLISH })),
      ),
    ).toBe(false);
  });

  it("is incomplete with no stored response", () => {
    expect(isEntryComplete([])).toBe(false);
  });

  it("is incomplete when the only response is cannot_evaluate", () => {
    expect(isEntryComplete([unevaluable()])).toBe(false);
  });

  it("is incomplete however many cannot_evaluate responses it holds", () => {
    // The count of rows has no part in the decision: many non-contributing rows are still no
    // pooled coverage.
    expect(
      isEntryComplete([unevaluable(), unevaluable(), unevaluable(), unevaluable(), unevaluable()]),
    ).toBe(false);
  });

  it("is incomplete when a pillar is missing", () => {
    // A judgment alone, however many translations it lacks, is not coverage.
    expect(isEntryComplete([pooledJudgment({ englishTranslation: ENGLISH })])).toBe(false);
    // And a missing required correction means no valid judgment at all.
    expect(
      isEntryComplete([
        {
          evaluation: "incorrect",
          englishTranslation: ENGLISH,
          filipinoTranslation: FILIPINO,
        },
      ]),
    ).toBe(false);
  });

  it("is complete with pooled coverage among several non-contributing rows", () => {
    // The non-contributing responses neither delay nor reduce completion.
    expect(
      isEntryComplete([
        unevaluable(),
        pooledJudgment({ englishTranslation: ENGLISH }),
        unevaluable(),
      ]),
    ).toBe(false);
    expect(
      isEntryComplete([
        unevaluable(),
        pooledJudgment({ englishTranslation: ENGLISH }),
        pooledJudgment({ filipinoTranslation: FILIPINO }),
        pooledJudgment(),
      ]),
    ).toBe(true);
  });

  it("needs no validator to decide: coverage holds with or without one named", () => {
    // The predicate takes `CoverageResponseShape`, which has no validator field. Pooled coverage
    // holds regardless of whose the responses are — distinctness is a property of the
    // attempt, enforced by the database, not an input to completion.
    const withValidator: ValidatorCoverageResponseShape = {
      validatorId: "VAL_0000beef",
      ...pooledJudgment({ englishTranslation: ENGLISH, filipinoTranslation: FILIPINO }),
    };
    const withoutValidator: CoverageResponseShape = {
      ...pooledJudgment({ englishTranslation: ENGLISH, filipinoTranslation: FILIPINO }),
    };

    expect(isEntryComplete([withValidator])).toBe(true);
    expect(isEntryComplete([withoutValidator])).toBe(true);
  });
});

describe("translation choice agrees with the schema", () => {
  it("offers choice on all three evaluable evaluations and none on cannot-evaluate", () => {
    // Cross-checked against the vocabulary the schema ships rather than against a retyped list, so
    // an evaluation added to `EVALUATION_CHOICES` without a decision here fails instead of being
    // silently included by a default.
    for (const choice of EVALUATION_CHOICES) {
      expect(isTranslationEligible(choice.value)).toBe(choice.value !== "cannot_evaluate");
    }
  });
});

describe("persisted validation record", () => {
  const STORED = {
    id: "res_01",
    validatorId: "VAL_a81d92c1",
    datasetEntryId: "OD_123",
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
    ]);
  });

  it("accepts a translation-free evaluable record", () => {
    const result = validationResponseSchema.safeParse({ ...STORED, evaluation: "correct_natural" });

    expect(result.success).toBe(true);
  });

  it("accepts a complete stored record and keeps it contributing", () => {
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
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("validatorId");
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
