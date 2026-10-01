import { describe, expect, it } from "vitest";

import { translatorFor } from "@/lib/i18n/copy";
import {
  EMPTY_ENTRY_FORM_INPUT,
  buildResponsePayload,
  checkEntryForm,
  entryFormFields,
  failureMessageFor,
  submitControlState,
  type EntryFormInput,
} from "@/lib/validation/entry-form-flow";
import { EVALUATION_CHOICES, evaluationSchema } from "@/schemas/validation";

/**
 * The per-entry form's decisions, as pure functions — no rendering, no DOM, no credential.
 *
 * =================================================================================================
 * WHY THESE ARE PURE AND WHAT THAT BUYS
 * =================================================================================================
 * The interesting part of a validation form is not a render; it is four questions — which inputs exist,
 * whether what is typed is complete, what the participant reads on failure, and what state the control is
 * in. Encoded as component state, every one of those branches is reachable only by driving a DOM, which
 * in this project means `happy-dom` — a synthetic DOM that proves a handler was called and nothing
 * about whether the DECISION was right. As functions, every branch is asserted directly.
 *
 * =================================================================================================
 * THE ONE THING THIS FILE MUST NOT PROVE: that the form ENFORCES anything
 * =================================================================================================
 * `checkEntryForm` is a COURTESY. The enforcement is the server, which refuses the same payload whether
 * or not this check ran — `validation-actions.test.ts` proves that, and that is where the guarantee
 * lives. Every test below that asserts a refusal is asserting that the form does not WASTE a round trip,
 * never that the rule is guaranteed. The distinction is stated here because "the form validates" is the
 * kind of sentence that becomes load-bearing for the wrong thing.
 */

const t = translatorFor("en");

/** Every approved evaluation, read from the table rather than restated. */
const EVERY_EVALUATION = EVALUATION_CHOICES.map((choice) => choice.value);

/** A form input with the chosen evaluation and all three text fields filled. */
function filled(evaluation: string, over: Partial<EntryFormInput> = {}): EntryFormInput {
  return {
    evaluation: evaluationSchema.parse(evaluation),
    correctedInstruction: "Iti Baguio Athletic Bowl ti pagtapon.",
    englishTranslation: "Go to the Baguio Athletic Bowl.",
    filipinoTranslation: "Pumunta sa Baguio Athletic Bowl.",
    ...over,
  };
}

describe("which conditional inputs exist", () => {
  it("shows neither a correction nor translations until something is chosen", () => {
    // Asking for a correction before there is a judgement to correct would invite a validator to write
    // a sentence they have not decided is wrong.
    expect(entryFormFields(null)).toEqual({ correction: false, translations: false });
  });

  it("shows translations but NOT a correction for `correct_natural`", () => {
    expect(entryFormFields("correct_natural")).toEqual({ correction: false, translations: true });
  });

  it("shows BOTH for `correct_unnatural` and for `incorrect`", () => {
    expect(entryFormFields("correct_unnatural")).toEqual({ correction: true, translations: true });
    expect(entryFormFields("incorrect")).toEqual({ correction: true, translations: true });
  });

  it("shows NEITHER for `cannot_evaluate`", () => {
    // The approved way to decline carries nothing else — and `tasks.md` forbids a "skip translation"
    // affordance, so this is the only no-fields state a validator can reach deliberately.
    expect(entryFormFields("cannot_evaluate")).toEqual({ correction: false, translations: false });
  });

  it("AGREES with the domain predicates for every approved evaluation, with no local rule", () => {
    // The claim that `entry-form-flow.ts` adds nothing to `isCorrectionRequired` /
    // `requiresBilingualTranslations`. Enumerated over the table rather than written as four literals,
    // so a fifth evaluation added tomorrow is covered by this test rather than escaping it.
    const imported = {
      correction: {
        correct_natural: false,
        correct_unnatural: true,
        incorrect: true,
        cannot_evaluate: false,
      },
      translations: {
        correct_natural: true,
        correct_unnatural: true,
        incorrect: true,
        cannot_evaluate: false,
      },
    };

    for (const value of EVERY_EVALUATION) {
      expect(
        entryFormFields(value),
        `${value}: the form must not disagree with the domain predicate`,
      ).toEqual({
        correction: imported.correction[value],
        translations: imported.translations[value],
      });
    }
  });

  it("is driven by the SAME table the schema parses, so a fifth option cannot half-exist", () => {
    // The rendered option list and this decision both come from `EVALUATION_CHOICES`. A future option
    // added to the schema but not the table would fail `evaluationSchema.parse` here — with a message
    // naming the value — rather than producing a form whose fifth option has no fields.
    expect(EVERY_EVALUATION).toHaveLength(4);
    for (const value of EVALUATION_CHOICES.map((choice) => choice.value)) {
      expect(evaluationSchema.safeParse(value).success).toBe(true);
    }
  });
});

describe("the payload that gets sent", () => {
  it("carries ONLY the fields the chosen evaluation accepts", () => {
    // The omission is the whole point, and it is easy to get wrong: the schema REFUSES a correction for
    // `correct_natural`, so a form that always sent all three fields would be permanently unable to
    // submit that answer — and the bug would present as "the form does nothing" rather than as an error.
    const payload = buildResponsePayload("correct_natural", {
      correctedInstruction: "stale text from an earlier choice",
      englishTranslation: "Go to the bowl.",
      filipinoTranslation: "Pumunta sa bowl.",
    });

    expect(Object.keys(payload).sort()).toEqual([
      "englishTranslation",
      "evaluation",
      "filipinoTranslation",
    ]);
    expect(payload).not.toHaveProperty("correctedInstruction");
  });

  it("carries a correction for `incorrect` and none for `cannot_evaluate`", () => {
    const text = {
      correctedInstruction: "Iti Baguio Athletic Bowl ti pagtapon.",
      englishTranslation: "Go to the bowl.",
      filipinoTranslation: "Pumonta sa bowl.",
    };

    expect(buildResponsePayload("incorrect", text)).toHaveProperty("correctedInstruction");
    expect(Object.keys(buildResponsePayload("cannot_evaluate", text))).toEqual(["evaluation"]);
  });

  it("DROPS a stale correction when a validator changes their mind", () => {
    // The specific scenario the omission exists for: a validator picks `incorrect`, types a correction,
    // then switches to `correct_natural`. The text is still in component state. Sending it would have
    // the server refuse a perfectly legitimate change of mind.
    const stale = "Iti Baguio Athletic Bowl ti pagtapon.";

    expect(
      buildResponsePayload("correct_unnatural", {
        correctedInstruction: stale,
        englishTranslation: "Go.",
        filipinoTranslation: "Pumonta.",
      }),
    ).toHaveProperty("correctedInstruction", stale);
    expect(
      buildResponsePayload("correct_natural", {
        correctedInstruction: stale,
        englishTranslation: "Go.",
        filipinoTranslation: "Pumonta.",
      }),
    ).not.toHaveProperty("correctedInstruction");
  });

  it("produces a payload the SERVER schema accepts, for every evaluation, when the fields are filled", async () => {
    // The property that matters: the form and the server share one schema, so nothing the form can build
    // is refused on arrival. A form that built a payload the server rejects would burn a round trip and
    // lose a typed correction.
    const { validationResponseInputSchema } = await import("@/schemas/validation");

    for (const value of EVERY_EVALUATION) {
      const payload = buildResponsePayload(value, filled(value));
      expect(
        validationResponseInputSchema.safeParse(payload).success,
        `${value} must be acceptable`,
      ).toBe(true);
    }
  });

  it("never invents an `undefined` KEY, only an absent one", () => {
    // `{ correctedInstruction: undefined }` and `{}` serialise differently, and a payload that carries
    // the key with no value can trip a `required`-style check on the receiving side.
    const payload = buildResponsePayload("cannot_evaluate", {
      correctedInstruction: "x",
      englishTranslation: "y",
      filipinoTranslation: "z",
    });

    expect("correctedInstruction" in payload).toBe(false);
  });
});

describe("whether what is typed is a complete response", () => {
  it("is incomplete — with a field, not a sentence — when nothing is chosen", () => {
    // "you have not chosen yet" and "your answer was rejected" are different things to say to someone,
    // and only one of them is true.
    const result = checkEntryForm(EMPTY_ENTRY_FORM_INPUT);

    expect(result.complete).toBe(false);
    expect(result.complete === false && Object.keys(result.fieldErrors)).toEqual(["evaluation"]);
  });

  it("is complete for a filled evaluable response, and returns the payload it built", () => {
    const result = checkEntryForm(filled("correct_natural"));

    expect(result.complete).toBe(true);
    expect(result.complete && result.payload.evaluation).toBe("correct_natural");
  });

  it("is complete for `cannot_evaluate` with NOTHING typed", () => {
    // The decline is a response. Requiring text on it would push a validator towards typing something
    // they are not confident about, which is the opposite of what the option means.
    const result = checkEntryForm({ ...EMPTY_ENTRY_FORM_INPUT, evaluation: "cannot_evaluate" });

    expect(result.complete).toBe(true);
  });

  it("names the MISSING translation field when one is absent", () => {
    const result = checkEntryForm(filled("correct_natural", { filipinoTranslation: "" }));

    expect(result.complete).toBe(false);
    expect(result.complete === false ? Object.keys(result.fieldErrors).sort() : []).toEqual([
      "filipinoTranslation",
    ]);
  });

  it("names the MISSING correction field when an evaluation requires one", () => {
    const result = checkEntryForm(filled("incorrect", { correctedInstruction: "" }));

    expect(result.complete).toBe(false);
    expect(result.complete === false ? Object.keys(result.fieldErrors) : []).toEqual([
      "correctedInstruction",
    ]);
  });

  it("names BOTH translations when both are absent", () => {
    const result = checkEntryForm({
      ...EMPTY_ENTRY_FORM_INPUT,
      evaluation: "correct_natural",
    });

    expect(result.complete).toBe(false);
    expect(result.complete === false && Object.keys(result.fieldErrors).sort()).toEqual([
      "englishTranslation",
      "filipinoTranslation",
    ]);
  });

  it("treats a whitespace-only translation as missing, exactly as the server does", () => {
    // The whole point of sharing the schema: a form that checked `length > 0` would let three spaces
    // through and the server would refuse it, costing a round trip and a typed correction.
    const result = checkEntryForm(filled("correct_natural", { englishTranslation: "   " }));

    expect(result.complete).toBe(false);
    expect(result.complete === false && Object.keys(result.fieldErrors)).toEqual([
      "englishTranslation",
    ]);
  });

  it("keeps ONE message per field, because the second is always a consequence of the first", () => {
    // Two messages on one input would be read out twice. Asserted as a COUNT rather than as a value,
    // so a schema that began reporting duplicates would fail here.
    const result = checkEntryForm({
      ...EMPTY_ENTRY_FORM_INPUT,
      evaluation: "correct_natural",
    });

    expect(result.complete).toBe(false);
    expect(result.complete === false && Object.values(result.fieldErrors)).toHaveLength(2);
    for (const message of result.complete === false ? Object.values(result.fieldErrors) : []) {
      expect(typeof message).toBe("string");
    }
  });

  it("reports a message that is SAFE TO SHOW, since it reaches a participant", () => {
    // A Zod message can name internals — a schema key, a `strictObject`. The field errors travel back to
    // a browser and are rendered, so the check is that they are sentences, not identifiers.
    const result = checkEntryForm({
      ...EMPTY_ENTRY_FORM_INPUT,
      evaluation: "correct_natural",
    });

    for (const message of result.complete === false ? Object.values(result.fieldErrors) : []) {
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toMatch(/ZodError|invalid_type|too_small|strictObject|\bundefined\b/);
    }
  });

  it("agrees with the SERVER on every incomplete case, rather than being stricter or laxer", async () => {
    // The strongest available statement of "this form is not a second rule": for each of a set of
    // incomplete inputs, the form and `validationResponseInputSchema` must both refuse. Compared by
    // BOOLEAN, so a difference in which message is produced does not fail — a client message differing
    // from the server's is fine; the two disagreeing about WHETHER this is a response is not.
    const { validationResponseInputSchema } = await import("@/schemas/validation");

    const attempts: ReadonlyArray<EntryFormInput> = [
      EMPTY_ENTRY_FORM_INPUT,
      { ...EMPTY_ENTRY_FORM_INPUT, evaluation: "correct_natural" },
      filled("correct_natural", { englishTranslation: "" }),
      filled("correct_natural", { filipinoTranslation: "" }),
      filled("incorrect", { correctedInstruction: "" }),
      filled("correct_natural", { correctedInstruction: "a correction nobody asked for" }),
      { ...EMPTY_ENTRY_FORM_INPUT, evaluation: "cannot_evaluate" },
    ];

    for (const attempt of attempts) {
      const clientComplete = checkEntryForm(attempt).complete;
      const serverComplete =
        attempt.evaluation === null
          ? false
          : validationResponseInputSchema.safeParse(
              buildResponsePayload(attempt.evaluation, attempt),
            ).success;

      expect(
        clientComplete,
        `the form and the server must agree about whether this is a response: ${JSON.stringify(attempt)}`,
      ).toBe(serverComplete);
    }
  });
});

describe("the sentence a participant reads when the write fails", () => {
  it("gives three DISTINCT sentences, and groups the three faults a participant cannot distinguish", () => {
    // The first draft of this test asserted `new Set(sentences).size === reasons.length` — five unique
    // sentences for five reasons — and it failed against code that was right. The measured grouping is
    // deliberate: `unknown_batch`, `not_in_batch` and `persistence` are three different faults with ONE
    // participant-visible consequence, and the participant has no way to tell which they hit.
    //
    // So the shape asserted here is the shape that matters, and it is asserted in both directions: the
    // two reasons a participant CAN act on are distinct, and the three they cannot act on are NOT
    // distinguished from one another. A version that silently merged all five would fail the first half.
    const reasons = [
      "invalid",
      "not_configured",
      "unknown_batch",
      "not_in_batch",
      "persistence",
    ] as const;
    const byReason = Object.fromEntries(
      reasons.map((reason) => [reason, failureMessageFor(reason, t)]),
    ) as Record<(typeof reasons)[number], string>;

    expect(byReason["invalid"]).not.toBe(byReason["not_configured"]);
    expect(byReason["not_configured"]).not.toBe(byReason["persistence"]);
    // The three indistinguishable ones share one sentence, deliberately.
    expect(byReason["unknown_batch"]).toBe(byReason["persistence"]);
    expect(byReason["not_in_batch"]).toBe(byReason["persistence"]);

    for (const sentence of Object.values(byReason)) {
      expect(sentence.length).toBeGreaterThan(20);
      expect(sentence).not.toMatch(/undefined|\[object/);
    }
  });

  it("does not tell a participant to RETRY when retrying cannot succeed", async () => {
    // `not_configured` is the case: the study is not open because a human has not deployed, so "try
    // again" is a promise the platform cannot keep until someone acts outside it. The other sentence
    // does offer a retry, and that is correct there.
    const { ENGLISH_COPY } = await import("@/lib/i18n/copy");

    expect(failureMessageFor("not_configured", t)).not.toMatch(/try again/i);
    expect(ENGLISH_COPY["validation.failure.notConfigured"]).toMatch(/not open right now/i);
  });

  it("tells the participant NOTHING WAS SAVED, so they know to retype", () => {
    for (const reason of ["invalid", "not_configured", "persistence"] as const) {
      expect(failureMessageFor(reason, t)).toMatch(/nothing was saved/i);
    }
  });

  it("says NOTHING about the database, the constraint, or the deployment", () => {
    // A participant-facing sentence that named a table would leak internal schema, and one that named
    // a missing `SUPABASE_*` variable would tell a stranger about the operator's deployment.
    for (const reason of [
      "invalid",
      "not_configured",
      "unknown_batch",
      "not_in_batch",
      "persistence",
    ] as const) {
      expect(failureMessageFor(reason, t)).not.toMatch(
        /supabase|postgrest|validations|batch_entries|23505|constraint|SQLSTATE/i,
      );
    }
  });

  it("localises, and says the same thing in both languages", () => {
    // Interface localization only — never research content. The check is that the two differ (a real
    // localisation) and that neither leaks an identifier.
    const english = failureMessageFor("persistence", translatorFor("en"));
    const filipino = failureMessageFor("persistence", translatorFor("fil"));

    expect(filipino).not.toBe(english);
    expect(filipino.length).toBeGreaterThan(20);
    expect(filipino).not.toMatch(/supabase|23505/i);
  });
});

describe("the state of the control that started the write", () => {
  it("is idle before the write: enabled, not busy, and labelled with the verb", () => {
    // `ariaBusy` is `undefined` rather than `false`, so React omits the attribute entirely. A literal
    // `false` would render `aria-busy="false"`, which is valid but says to assistive technology that
    // something is busy when nothing is.
    const state = submitControlState(false, t);

    expect(state.disabled).toBe(false);
    expect(state.ariaBusy).toBeUndefined();
    expect(state.label).toBe(t("validation.submit"));
  });

  it("is disabled AND busy during the write, and the change is available as TEXT", () => {
    // `design-system` requires the in-progress state to be reported, and this is the assertion that the
    // label changes — a control that only greyed out conveys nothing to a screen reader.
    const state = submitControlState(true, t);

    expect(state.disabled).toBe(true);
    expect(state.ariaBusy).toBe(true);
    expect(state.label).toBe(t("validation.submitting"));
    expect(state.label).not.toBe(t("validation.submit"));
  });

  it("has no catalog key for any skip-or-save-without-translating control ON THE VALIDATION ROUTE", async () => {
    // A form that offers to save an evaluable answer without its translations promises something the
    // DATABASE rejects, so the affordance would be a lie the participant discovers after doing the work.
    //
    // SCOPED TO THE VALIDATION NAMESPACE, and the scope is load-bearing rather than convenient. The
    // first draft filtered the WHOLE catalog on `/skip|later|without/i` and reported
    // `['screening.skip']` — the screening form's approved "skip the proficiency question" affordance,
    // which is a different question answered correctly. A guard that fires on a legitimate control is a
    // guard that trains its reader to ignore it, which is how a real violation gets in later; that is
    // the defect this repository has now recorded twice.
    const { ENGLISH_COPY } = await import("@/lib/i18n/copy");
    const suspicious = Object.keys(ENGLISH_COPY).filter(
      (key) => key.startsWith("validation.") && /skip|later|without|partial/i.test(key),
    );

    expect(
      suspicious,
      "no validation control may offer to skip part of a research response",
    ).toEqual([]);
    // And the scope is proven to be a real filter rather than a filter that matches nothing: the
    // screening affordance it deliberately excludes is asserted present here.
    expect(Object.keys(ENGLISH_COPY)).toContain("screening.skip");
  });

  it("enumerates the validation controls that DO exist, so the guard above is looking at a real set", async () => {
    // The control for the guard. A filter matching nothing passes every one of its own assertions, so
    // the positive case is asserted here: the validation namespace holds a substantial number of keys,
    // and the word "validation" appears in many of them. Without this, "no skip key exists" would also
    // be true if the catalog had no validation copy at all.
    const { ENGLISH_COPY } = await import("@/lib/i18n/copy");
    const validationKeys = Object.keys(ENGLISH_COPY).filter((key) => key.startsWith("validation."));

    expect(validationKeys.length).toBeGreaterThan(10);
    expect(validationKeys).toContain("validation.submit");
    expect(validationKeys).toContain("validation.submitting");
  });
});
