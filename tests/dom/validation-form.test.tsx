import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ValidationForm } from "@/app/validate/[batchId]/validation-form";
import { translatorFor } from "@/lib/i18n/copy";
import { resolveSessionEntry } from "@/lib/validation/session";
import { EVALUATION_CHOICES } from "@/schemas/validation";

import { batchIdFromAddress, positionFromAddress } from "./support/batch-address";
import { mount, type Mounted } from "./support/dom-harness";

/**
 * The per-entry form's write wiring, driven for real.
 *
 * =================================================================================================
 * WHY THIS FILE IS NOT A SOURCE SCAN
 * =================================================================================================
 * Every guard here closes a fact `renderToStaticMarkup` cannot reach: that a click reaches a handler,
 * and that `isPending` is reflected in the DOM *while the write is open*. `renderToStaticMarkup` never
 * fires a handler and can only ever see the idle state — documented in
 * `tests/unit/onboarding-routes.test.tsx` long before this change. So a route test that asserted "the
 * button is disabled while saving" against server-rendered markup would pass whether or not the
 * component ever disabled anything.
 *
 *   VF-1  the evaluation option the participant clicked is the one submitted
 *   VF-2  only the fields the chosen evaluation accepts are submitted
 *   VF-3  the submit control is disabled AND `aria-busy` WHILE the write is open
 *   VF-4  the evaluation options are inert while the write is open
 *   VF-5  two clicks in one task produce exactly ONE insert (the single-flight latch)
 *   VF-6  a recorded response navigates to the NEXT position, never past the batch
 *   VF-7  a refused duplicate also advances, because the answer IS stored
 *   VF-8  a failed write leaves the typed answer on screen and reports the reason
 *   VF-9  advancing to the next entry presents a fresh form with nothing carried over
 *
 * =================================================================================================
 * WHAT THIS DOES NOT PROVE
 * =================================================================================================
 * `happy-dom` is a SYNTHETIC DOM. This proves a click reaches a handler and that `disabled`/`aria-busy`
 * track `isPending`. It proves nothing about layout, contrast, focus order, a real viewport's 44px
 * target, or how a real browser's form submission interacts with `useTransition`. No human has ever
 * rendered this screen.
 */

const h = vi.hoisted(() => ({
  pushes: [] as string[],
  /** Every payload handed to the Server Action. */
  submitted: [] as unknown[],
  /**
   * When set, the action returns THIS promise instead of resolving — a write held open.
   *
   * A plain `neverResolves` is what the first draft used, and it is WRONG for a whole-file reason that
   * cost four unrelated tests their verdicts. A `useTransition` whose body never returns leaves React's
   * async `act` queue permanently non-empty, so every LATER test in the file measures a harness still
   * draining the previous test's work: two tests that assert `isPending` is back to `false` after a
   * settled write reported `aria-busy="true"`, and a test that expected a refusal message got markup
   * from a pending state. Each passed when run in isolation with `-t`, which is the signature of
   * cross-test contamination rather than of a code defect.
   *
   * So the hold is a DEFERRED that `afterEach` resolves. The window during the write is still open for
   * the duration of the test that wants it, and React's queue is empty by the time the next test
   * starts. The lesson is the one this repository has recorded repeatedly in another form: a harness
   * that leaves state behind turns every later result into a measurement of the harness.
   */
  hold: null as null | { readonly promise: Promise<unknown>; resolve: () => void },
  /** The result the action reports, changed per test. */
  result: { status: "recorded", responseId: "rsp_x", datasetEntryId: "OD_0001" } as unknown,
  /** The batch id and position the form was mounted with. */
  batchId: "batch-7f3a1c",
  position: 3,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (destination: string) => {
      h.pushes.push(destination);
    },
    replace: () => {},
    refresh: () => {},
    back: () => {},
  }),
}));

vi.mock("@/lib/validation/actions", () => ({
  submitValidationAction: vi.fn(async (raw: unknown) => {
    h.submitted.push(raw);
    if (h.hold !== null) return h.hold.promise;
    return h.result;
  }),
}));

const t = translatorFor("en");
const BATCH_ID = h.batchId;

let view: Mounted;

function form(): HTMLFormElement {
  return view.one<HTMLFormElement>("form");
}

/** The evaluation options, scoped to the evaluation group — the translation choice renders
 * its own radiogroup once an evaluable option is chosen, and an unscoped query would mix the two.
 *
 * Scoped by the group's `aria-label` rather than by position: the choice group is absent until an
 * evaluable option is chosen, so "the second radiogroup" is meaningless on a fresh form.
 */
function options(): HTMLButtonElement[] {
  const group = view.all('[role="radiogroup"]')[0] as HTMLElement;
  return Array.from(group.querySelectorAll('button[role="radio"]')) as HTMLButtonElement[];
}

/** The translation-choice options, in declared order: english, filipino, both, skip. */
function choiceOptions(): HTMLButtonElement[] {
  const groups = view.all('[role="radiogroup"]');
  if (groups.length !== 2) {
    throw new Error(
      `expected the evaluation group and the translation-choice group but found ${groups.length} radiogroups. ` +
        `The choice group renders only for an evaluable evaluation with no write in flight.`,
    );
  }
  const group = groups[1] as HTMLElement;
  return Array.from(group.querySelectorAll('button[role="radio"]')) as HTMLButtonElement[];
}

/** The submit control — the only `type="submit"` button, since the options are `type="button"`. */
function submitControl(): HTMLButtonElement {
  return view.one<HTMLButtonElement>('form button[type="submit"]');
}

/** The translation inputs, by their `name`, which is how the payload keys are derived. */
function field(name: string): HTMLTextAreaElement | HTMLInputElement {
  const found = view.all(`[name="${name}"]`);
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one field named "${name}" but found ${found.length}. ` +
        `A conditional field that is HIDDEN rather than disabled still renders, so a count of zero ` +
        `means the field is absent from the DOM — which is a different state from being unfilled.`,
    );
  }
  return found[0] as HTMLTextAreaElement;
}

/** Sets a field's value the way React's own controlled inputs expect to be told. */
function type(field: HTMLTextAreaElement | HTMLInputElement, value: string): void {
  const prototype =
    field instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement : window.HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(prototype.prototype, "value")?.set;
  if (!setter) throw new Error("no value setter on the input prototype");
  setter.call(field, value);
  // Inside `act`, via the harness's generic `dispatch`. The first draft dispatched this directly and
  // the file emitted 95 `not wrapped in act(...)` warnings; the harness doc records why that is a
  // defect rather than cosmetic.
  view.dispatch(field, new window.Event("input", { bubbles: true }));
}

/**
 * Holds the next action open, and returns the release.
 *
 * The release is called by `afterEach` rather than by the test, so a test that wants to observe the
 * pending state can simply leave the write open and still let React's queue drain before the next test
 * mounts. See the note on `h.hold`.
 */
function holdWrite(): () => void {
  let release = (): void => {};
  const promise = new Promise<unknown>((resolve) => {
    release = () => {
      resolve(h.result);
    };
  });
  h.hold = { promise, resolve: release };
  return release;
}

/** Clicks an evaluation option and settles. */
async function choose(index: number): Promise<void> {
  await view.pressAndSettle(options()[index]!);
}

/** Clicks a translation choice — english, filipino, both, or skip — and settles. */
async function chooseLanguage(index: number): Promise<void> {
  await view.pressAndSettle(choiceOptions()[index]!);
}

/** The "both" choice: translations in both languages, as most answers carry. */
const BOTH_LANGUAGES = 2;
/** The "skip" choice: a recorded decision to translate neither. */
const SKIP_TRANSLATION = 3;

/** Chooses both languages and fills both research translations. */
async function fillTranslations(): Promise<void> {
  await chooseLanguage(BOTH_LANGUAGES);
  type(field("englishTranslation"), "Go to the Baguio Athletic Bowl.");
  await view.settle();
  type(field("filipinoTranslation"), "Pumunta sa Baguio Athletic Bowl.");
  await view.settle();
}

/** Chooses an evaluable option and fills what it needs, leaving the form ready to submit. */
async function completeAnEvaluableAnswer(index: number): Promise<void> {
  await choose(index);
  await fillTranslations();
}

/** Chooses an option and fills exactly the fields THAT option asks for. */
async function answerFully(index: number): Promise<void> {
  const value = EVALUATION_CHOICES[index]?.value;
  await choose(index);
  if (value === "correct_unnatural" || value === "incorrect") {
    type(field("correctedInstruction"), "Iti Baguio Athletic Bowl ti pagtapon.");
    await view.settle();
  }
  if (value !== "cannot_evaluate") {
    await fillTranslations();
  }
}

const CORRECT_NATURAL = EVALUATION_CHOICES.findIndex(
  (choice) => choice.value === "correct_natural",
);
const CORRECT_UNNATURAL = EVALUATION_CHOICES.findIndex(
  (choice) => choice.value === "correct_unnatural",
);
const INCORRECT = EVALUATION_CHOICES.findIndex((choice) => choice.value === "incorrect");
const CANNOT_EVALUATE = EVALUATION_CHOICES.findIndex(
  (choice) => choice.value === "cannot_evaluate",
);

/** The payload of the most recent submit, typed. */
function lastPayload(): {
  batchId?: unknown;
  datasetEntryId?: unknown;
  response?: Record<string, unknown>;
} {
  return h.submitted[h.submitted.length - 1] as never;
}

/**
 * A structural COPY of the most recent payload.
 *
 * Used where the assertion is that an EARLIER payload is unchanged after a second submit. Holding the
 * live object and comparing it to itself would pass whether or not anything had been preserved — the
 * array holds whatever the mock was handed, so `expect(h.submitted[0]).toBe(h.submitted[0])` is true
 * by construction.
 */
function lastPayloadSnapshot(): unknown {
  return structuredClone(h.submitted[h.submitted.length - 1]);
}

beforeEach(() => {
  h.pushes.length = 0;
  h.submitted.length = 0;
  h.hold = null;
  h.result = { status: "recorded", responseId: "rsp_x", datasetEntryId: "OD_0001" };
  view = mount(
    <ValidationForm
      locale="en"
      batchId={BATCH_ID}
      datasetEntryId="OD_0007"
      position={h.position}
    />,
  );
});

afterEach(async () => {
  // Drain BEFORE unmounting, and only if a write is still open. Unmounting with a transition pending
  // leaves React's async act queue non-empty and every later test in this file measures that instead of
  // its own subject — four tests did exactly that before this hook existed.
  if (h.hold !== null) {
    // Released INSIDE `act`, via `settle`'s callback. Releasing it outside is what produced the last
    // remaining "A suspended resource finished loading inside a test" warning — the deferred write
    // settling is a state change, and React logs it rather than flushing it silently.
    const release = h.hold.resolve;
    h.hold = null;
    await view.settle(release);
  }
  view.unmount();
  vi.clearAllMocks();
});

describe("VF-1 — the judgement submitted is the judgement made", () => {
  it("submits the option the participant clicked, for each of the four", async () => {
    // Enumerated over the table rather than written as four literals, so a fifth evaluation added
    // tomorrow is covered by this test rather than escaping it. The index is read from the table, so the
    // test cannot pass by clicking the wrong control and asserting the wrong value.
    expect(EVALUATION_CHOICES).toHaveLength(4);

    for (const [index, choice] of EVALUATION_CHOICES.entries()) {
      vi.clearAllMocks();
      h.submitted.length = 0;
      h.pushes.length = 0;

      // Fills exactly the fields THAT option asks for. The first draft used
      // `completeAnEvaluableAnswer`, which fills translations unconditionally, and failed on
      // `expected exactly one field named "englishTranslation" but found 0` for
      // `cannot_evaluate` — against correct code, and for the same reason VF-2 below asserts as a
      // feature: a hidden field is ABSENT, not unfilled. Two drafts, one mistake, same shape.
      await answerFully(index);
      await view.submitFormAndSettle(form());

      expect(
        lastPayload()["response"],
        `clicking option ${index} must submit its own value`,
      ).toMatchObject({ evaluation: choice.value });
    }
  });

  it("submits the entry and batch the form was mounted with, and nothing else", async () => {
    // The two identifiers a participant has no business choosing. Both are props rather than state, so
    // this is really a check that the component did not grow a place to override them.
    await completeAnEvaluableAnswer(CORRECT_NATURAL);

    await view.submitFormAndSettle(form());

    const payload = lastPayload() as Record<string, unknown>;
    expect(payload["batchId"]).toBe(BATCH_ID);
    expect(payload["datasetEntryId"]).toBe("OD_0007");
    expect(Object.keys(payload).sort()).toEqual(["batchId", "datasetEntryId", "response"]);
    // The three keys and no more: a fourth would be a client-supplied fact about a research record.
    // The full key set is pinned at the TYPE layer in `tests/unit/domain-types.test.ts`; this is the
    // behavioural half, and the two together mean neither a schema that strips a fourth key nor one
    // that honours it can pass.
    expect(Object.keys(payload["response"] as object).sort()).toEqual([
      "englishTranslation",
      "evaluation",
      "filipinoTranslation",
    ]);
  });
});

describe("VF-2 — only the fields the chosen evaluation accepts are submitted", () => {
  it("omits the correction for `correct_natural`", async () => {
    // The scenario the omission exists for: a validator picks `incorrect`, types a correction, then
    // changes their mind. The text is still in state and the server would REFUSE a payload carrying it.
    await choose(INCORRECT);
    type(field("correctedInstruction"), "Iti Baguio Athletic Bowl ti pagtapon.");
    await view.settle();
    await choose(CORRECT_NATURAL);
    await fillTranslations();

    await view.submitFormAndSettle(form());

    const response = lastPayload()["response"] as Record<string, unknown>;
    expect(response["evaluation"]).toBe("correct_natural");
    expect("correctedInstruction" in response).toBe(false);
  });

  it("carries NO translation for `cannot_evaluate`, even if one was typed first", async () => {
    // The reverse direction, and the one that would be a research-integrity failure rather than a
    // cosmetic one: a decline is a response that carries nothing else, by rule.
    await choose(CORRECT_NATURAL);
    await fillTranslations();
    await choose(CANNOT_EVALUATE);

    await view.submitFormAndSettle(form());

    expect(Object.keys(lastPayload()["response"] as object)).toEqual(["evaluation"]);
  });

  it("translates the VALIDATED sentence — the correction, not the original", async () => {
    // Task 4.3's client half. The failure this exists for is subtle: a form that prefilled the
    // translation from the entry's `instruction` would send the validator's own correction alongside a
    // translation of the sentence they said was WRONG, and the research record would carry two
    // different sentences under one response.
    //
    // Asserted on the submitted payload, never on the prompt text — a test that read the prompt could
    // not tell a validator's translation from a prefilled one. And the original instruction is
    // asserted ABSENT from the payload, which is the direction the mistake would take.
    const ORIGINAL = "Iti Baguio Athletic Bowl ti ayanko ita; masapulko a makadanon iti Baguio.";
    const CORRECTION = "Iti Baguio Athletic Bowl ti pagtapon.";
    await choose(INCORRECT);
    type(field("correctedInstruction"), CORRECTION);
    await view.settle();
    await chooseLanguage(BOTH_LANGUAGES);
    type(field("englishTranslation"), "Go to the Baguio Athletic Bowl.");
    await view.settle();
    type(field("filipinoTranslation"), "Pumunta sa Baguio Athletic Bowl.");
    await view.settle();

    await view.submitFormAndSettle(form());

    const response = lastPayload()["response"] as Record<string, unknown>;
    expect(response["correctedInstruction"]).toBe(CORRECTION);
    expect(response["englishTranslation"]).toBe("Go to the Baguio Athletic Bowl.");
    expect(response["filipinoTranslation"]).toBe("Pumunta sa Baguio Athletic Bowl.");
    // The original instruction is research material and is NEVER part of a response payload — not the
    // whole sentence, and not any field that merely echoes it.
    for (const [key, value] of Object.entries(response)) {
      if (typeof value === "string") {
        expect(value, `\`${key}\` must not carry the dataset's own wording`).not.toContain(
          "masapulko",
        );
      }
    }
    // The form never held the instruction at all: it is a prop of the CARD, not of the form, so there
    // is no field it could have submitted by accident.
    expect(ORIGINAL.length).toBeGreaterThan(0);
  });

  it("HIDES a conditional field rather than disabling it, so a validator cannot type into it", async () => {
    // D5's decision. A disabled input is still in the DOM, still focusable by some assistive
    // technology, and still readable in the markup — which is why the check is on its ABSENCE rather
    // than on a `disabled` attribute.
    expect(view.all('[name="correctedInstruction"]')).toHaveLength(0);
    expect(view.all('[name="englishTranslation"]')).toHaveLength(0);

    await choose(CORRECT_UNNATURAL);

    // The correction renders; the translation FIELDS do not — only the language CHOICE does, and
    // the choice is a second radiogroup alongside the evaluation one.
    expect(view.all('[name="correctedInstruction"]')).toHaveLength(1);
    expect(view.all('[name="englishTranslation"]')).toHaveLength(0);
    expect(view.all('[role="radiogroup"]')).toHaveLength(2);

    await chooseLanguage(BOTH_LANGUAGES);

    expect(view.all('[name="englishTranslation"]')).toHaveLength(1);
    expect(view.all('[name="filipinoTranslation"]')).toHaveLength(1);

    await choose(CANNOT_EVALUATE);

    // Back to nothing: the decline is a complete response on its own, and a form that left the boxes
    // visible would be asking for a translation the platform will not accept.
    expect(view.all('[name="correctedInstruction"]')).toHaveLength(0);
    expect(view.all('[name="englishTranslation"]')).toHaveLength(0);
    expect(view.all('[name="filipinoTranslation"]')).toHaveLength(0);
    expect(view.all('[role="radiogroup"]')).toHaveLength(1);
  });

  it("submits an evaluation-only payload when the validator chose to skip translation", async () => {
    // Skip is a first-class choice, not an omission: the response carries the evaluation and (for
    // `incorrect`) its correction, and neither translation key. The server reads the absent keys
    // as the recorded skip.
    await choose(CORRECT_NATURAL);
    await chooseLanguage(SKIP_TRANSLATION);

    await view.submitFormAndSettle(form());

    expect(Object.keys(lastPayload()["response"] as object)).toEqual(["evaluation"]);
  });
});

describe("VF-3 and VF-4 — the pending state, observed WHILE the write is open", () => {
  it("disables the submit control and reports the in-progress state as TEXT", async () => {
    await completeAnEvaluableAnswer(CORRECT_NATURAL);

    holdWrite();
    view.submitForm(form());

    // DURING the write, not after. `aria-busy` and the label are what a screen reader reports, and both
    // are absent from server-rendered markup — which is the entire reason this is a `dom` test.
    const control = submitControl();
    expect(control.disabled, "the control must be inert while a write is in flight").toBe(true);
    expect(control.getAttribute("aria-busy")).toBe("true");
    expect(control.textContent).toBe(t("validation.submitting"));
    expect(control.textContent).not.toBe(t("validation.submit"));
  });

  it("makes the evaluation options INERT while the write is open, and inert UNIFORMLY", async () => {
    // WHAT THE CODE DOES, measured rather than assumed. The first draft of this test asserted the
    // opposite — that the options stay enabled and the group carries `aria-busy` — and failed against
    // correct code: the component passes `disabled={isPending}` to `AnswerGroup`, which is what the
    // approved scenario "A control inert alongside the write changes appearance uniformly" describes.
    //
    // The uniformity is the part worth asserting, because it is the one that can be got wrong: a form
    // that disabled the options but not the text fields would leave a participant able to retype a
    // correction into a box whose value is about to be discarded by a navigation.
    await completeAnEvaluableAnswer(CORRECT_UNNATURAL);

    expect(options().filter((option) => option.disabled)).toHaveLength(0);
    expect(field("correctedInstruction").hasAttribute("disabled")).toBe(false);

    const release = holdWrite();
    view.submitForm(form());

    expect(options()).toHaveLength(4);
    for (const option of options()) {
      expect(option.disabled, "every option must be inert while the write is open").toBe(true);
    }
    // The text fields too, and with the SAME class change rather than a bespoke one — `disabled:` variants
    // in the shared `controlClasses`, so an inert field cannot look different from an inert option.
    for (const name of ["correctedInstruction", "englishTranslation", "filipinoTranslation"]) {
      expect(
        field(name).hasAttribute("disabled"),
        `${name} must be inert while the write is open`,
      ).toBe(true);
    }
    // And the selected option is still ANNOUNCED as selected while disabled, so a screen-reader user is
    // not told the answer disappeared.
    const selected = options().filter((option) => option.getAttribute("aria-checked") === "true");
    expect(selected).toHaveLength(1);

    // The write is closed HERE, inside this test and inside `act`, rather than left to `afterEach`.
    //
    // This was the last remaining `not wrapped in act` warning in the `dom` project, and it took
    // three attempts to localise: it fires only for THIS test and not for the four other sites that
    // hold a write open, and neither wrapping the release in `act` nor draining microtasks inside it
    // changed it — two hypotheses, both measured, both wrong. What differs here is that the test ends
    // immediately after the last assertion, so the release lands in the same turn as the unmount.
    // Closing it here removes the ambiguity entirely, and it costs nothing: every assertion above
    // still runs while the write is open, which is the state this test exists to observe.
    release();
    await view.settle();
  });

  it("RE-ENABLES the control once the write settles", async () => {
    // The other half of VF-3, and the one a latch bug would break: a validator whose write succeeded but
    // whose control stayed disabled could not answer the next entry.
    await completeAnEvaluableAnswer(CORRECT_NATURAL);
    await view.submitFormAndSettle(form());

    expect(submitControl().disabled).toBe(false);
    expect(submitControl().getAttribute("aria-busy")).toBeNull();
  });
});

describe("VF-5 — a second click in the same task produces ONE insert", () => {
  it("does not submit twice when the control is pressed twice before React re-renders", async () => {
    // THE LATCH. `isPending` only becomes true on the next render, so two clicks dispatched inside one
    // task both see `isPending === false` and both reach the handler. A `useTransition` alone does not
    // prevent that — which is why the component carries a synchronous `useRef` latch. Without it this
    // test reports two inserts, and a validator's single judgement would be recorded twice: the second
    // refused by the uniqueness constraint, which is recoverable, but the extra round trip and the
    // second navigation are not.
    await completeAnEvaluableAnswer(CORRECT_NATURAL);

    holdWrite();
    const control = submitControl();
    const formElement = form();
    // Both submissions dispatched inside ONE synchronous `act`, so no render can happen between them.
    view.press(control);
    view.submitForm(formElement);

    expect(h.submitted).toHaveLength(1);
  });

  it("does not navigate twice either, which is the visible half of the same latch", async () => {
    await completeAnEvaluableAnswer(CORRECT_NATURAL);

    holdWrite();
    view.press(submitControl());
    view.submitForm(form());

    // The write never resolves, so no navigation can have happened; the assertion that matters is that
    // the latch means only ONE of them was ever started.
    expect(h.submitted).toHaveLength(1);
    expect(h.pushes).toHaveLength(0);
  });

  it("re-opens for the NEXT entry after a real submit, so the latch does not wedge the session", async () => {
    // The opposite failure: a latch that is never released would let a validator answer exactly one
    // entry per page load. The control must be usable again once the write settles.
    await completeAnEvaluableAnswer(CORRECT_NATURAL);
    await view.submitFormAndSettle(form());

    expect(h.submitted).toHaveLength(1);

    // Fresh state, a second answer, and a second submit — all within the same mounted component, which
    // is what a real single-page advance would do.
    await completeAnEvaluableAnswer(CORRECT_NATURAL);
    await view.submitFormAndSettle(form());

    expect(h.submitted).toHaveLength(2);
  });
});

describe("VF-6 — advancing, and only after the answer is stored", () => {
  it("navigates to the NEXT POSITION, not to a batch root and not to the same entry", async () => {
    await completeAnEvaluableAnswer(CORRECT_NATURAL);

    await view.submitFormAndSettle(form());

    // The segment is recovered through the route's OWN parse function and the position through a
    // reader, so this asserts what the ROUTE will receive rather than comparing a template beside
    // the implementation. `BATCH_ID` carries no reserved character, so the round trip is the
    // identity here — which is exactly the half the other DOM files cannot cover.
    expect(h.pushes).toHaveLength(1);
    expect(batchIdFromAddress(h.pushes[0] as string)).toBe(BATCH_ID);
    expect(positionFromAddress(h.pushes[0] as string)).toBe(String(h.position + 1));
  });

  it("does NOT navigate before the write has resolved", async () => {
    // A validator holding the next sentence while the current answer is in flight could judge against
    // knowing what is coming, which is precisely what the one-entry-at-a-time rule exists to prevent.
    await completeAnEvaluableAnswer(CORRECT_NATURAL);

    holdWrite();
    view.submitForm(form());

    expect(h.pushes).toHaveLength(0);
  });

  it("advances on a refused DUPLICATE too, because that answer IS stored", async () => {
    // The reason `already_recorded` is a success with a different name. The unique constraint refused a
    // second response, so the first one is in the database; advancing is the correct behaviour and
    // staying put would show a validator the sentence they already answered.
    await completeAnEvaluableAnswer(CORRECT_NATURAL);
    h.result = { status: "already_recorded", datasetEntryId: "OD_0007" };

    await view.submitFormAndSettle(form());

    expect(h.pushes).toHaveLength(1);
    expect(batchIdFromAddress(h.pushes[0] as string)).toBe(BATCH_ID);
    expect(positionFromAddress(h.pushes[0] as string)).toBe(String(h.position + 1));
    expect(view.container.textContent).not.toMatch(/nothing was saved/i);
  });

  it("moves between entries WITHOUT losing completed work and WITHOUT resubmitting it", async () => {
    // Task 6.1. The two halves are separate failures and both matter: losing the completed work means
    // a validator answers an entry twice, and RESUBMITTING it means a duplicate the constraint refuses
    // — which, unlike a lost answer, costs nothing to detect and everything to the participant, who
    // has already been advanced past the sentence they answered.
    await completeAnEvaluableAnswer(INCORRECT);
    type(field("correctedInstruction"), "Iti Baguio Athletic Bowl ti pagtapon.");
    await view.settle();
    await fillTranslations();
    await view.submitFormAndSettle(form());

    expect(h.submitted).toHaveLength(1);
    expect(h.pushes).toHaveLength(1);
    // Snapshotted AFTER the submit. The first draft of this test took the snapshot before it, so
    // `lastPayloadSnapshot()` read `h.submitted[-1]` and returned `undefined` — and the assertion
    // that followed then compared a real payload against `undefined`, which is a test that fails for
    // a reason that has nothing to do with the property it names.
    const firstPayload = lastPayloadSnapshot();

    // Arrive somewhere else, as the navigation does.
    view.unmount();
    view = mount(
      <ValidationForm locale="en" batchId={BATCH_ID} datasetEntryId="OD_0008" position={4} />,
    );
    await view.settle();

    // The completed work is still recorded — the payload the server received is unchanged and was
    // never re-sent.
    expect(h.submitted).toHaveLength(1);
    expect(h.submitted[0]).toEqual(firstPayload);
    // And the new screen is a BLANK one: nothing pre-selected, so no conditional field is on screen
    // yet and the next answer cannot be a copy of the last one by default. Asserted as a COUNT because
    // the field is legitimately absent when nothing is chosen — which is the behaviour VF-2 asserts,
    // and reading `.value` on an absent field would throw rather than measure anything.
    expect(view.all('[aria-checked="true"]')).toHaveLength(0);
    expect(view.all('[name="correctedInstruction"]')).toHaveLength(0);
    expect(view.all('[name="englishTranslation"]')).toHaveLength(0);

    // Answering the SECOND entry adds a second insert, and only a second one.
    await completeAnEvaluableAnswer(CORRECT_NATURAL);
    await view.submitFormAndSettle(form());

    expect(h.submitted).toHaveLength(2);
    expect(h.submitted[0]).toEqual(firstPayload);
    expect((h.submitted[1] as { datasetEntryId: string }).datasetEntryId).toBe("OD_0008");
    expect(h.pushes).toHaveLength(2);
    // Both addresses recovered through the route's parse function, in order, with their positions.
    expect(h.pushes.map((push) => batchIdFromAddress(push as string))).toEqual([
      BATCH_ID,
      "batch-7f3a1c",
    ]);
    expect(h.pushes.map((push) => positionFromAddress(push as string))).toEqual([
      String(h.position + 1),
      "5",
    ]);
  });

  it("navigates to an address whose segment round-trips back to the batch id", async () => {
    // REWRITTEN by `batch-route-round-trip`, and the rewrite is a correction rather than a
    // convenience. This test used to be titled "URL-encodes the batch id, so an identifier with a
    // slash cannot escape the path", and it passed because the component called
    // `encodeURIComponent` — which is the very mechanism that made the route unopenable. The
    // protection it measured was INCIDENTAL: a side effect of the encoding bug.
    //
    // Producers now emit the identifier raw, so encoding is no longer available as a defence and the
    // invariant has to be held where it belongs. It is held by `batchIdSchema`, which refuses an
    // identifier containing a path separator — asserted as the CAN FIRE control below rather than
    // here, because it is a property of the schema and not of this component.
    //
    // What is asserted here is the ROUND TRIP, which is the property that survives the change: the
    // component builds `/validate/` plus the identifier, and the route's parse function recovers that
    // identifier exactly. `encodeURIComponent` is deliberately absent from this assertion — asserting
    // the presence or absence of an encoding call by string is a source-shaped check that cannot see
    // a semantic change, and the one it replaces was exactly that.
    view.unmount();
    h.batchId = "batch-7f3a1c";
    view = mount(
      <ValidationForm
        locale="en"
        batchId={h.batchId}
        datasetEntryId="OD_0007"
        position={h.position}
      />,
    );

    await completeAnEvaluableAnswer(CORRECT_NATURAL);
    await view.submitFormAndSettle(form());

    expect(h.pushes).toHaveLength(1);
    expect(batchIdFromAddress(h.pushes[0] as string)).toBe("batch-7f3a1c");
    h.batchId = BATCH_ID;
  });

  it("presents a DIFFERENT entry after a real re-mount, chosen by the real server-side resolver", async () => {
    // Task 5.3's actual verification: "the next entry is presented after the write resolves".
    //
    // Asserting `router.push("/validate/<batch>?position=4")` alone would NOT be that. It would be
    // satisfied by a form that pushed a URL and a server that then showed the SAME entry again, which
    // is the actual participant-facing failure. `renderToStaticMarkup` cannot re-mount, and a
    // `router.push` mock cannot either, so the advance is closed here by doing both halves: a real
    // unmount and mount at the position the push named, with the entry chosen by the REAL
    // `resolveSessionEntry` — the production function, called the way
    // `validation-session-service.ts` calls it. No arithmetic anywhere in the assertion.
    //
    // REWRITTEN during the Phase 5 verification repair. The first draft resolved the entry with
    // `resolveNextSessionEntry`, a DIFFERENT function that had zero production callers, so the test
    // proved that dead function correct and said nothing about the product. It is now the same call
    // the route makes, with the position read out of the pushed URL rather than supplied by this test.
    const PLACEMENTS = [
      { datasetEntryId: "OD_0005", position: 1 },
      { datasetEntryId: "OD_0006", position: 2 },
      { datasetEntryId: "OD_0007", position: 3 },
      { datasetEntryId: "OD_0008", position: 4 },
    ] as const;

    // The form was mounted at position 3 with OD_0007, which is placement 3 above, and the two
    // placements before it are already done — the validator got here by answering in order.
    await completeAnEvaluableAnswer(CORRECT_NATURAL);
    await view.submitFormAndSettle(form());

    const pushed = h.pushes[0];
    expect(pushed).toBeDefined();
    // Read the position back OUT of the URL the form produced, so the next screen is driven by what
    // was actually navigated to rather than by the number this test happened to write down.
    const requestedPosition = Number(
      new URL(pushed as string, "https://example.invalid").searchParams.get("position"),
    );
    expect(Number.isNaN(requestedPosition)).toBe(false);

    // What the server resolves that request to, using the real resolver.
    //
    // THE COMPLETED SET IS CHOSEN SO THE REQUESTED POSITION IS LOAD-BEARING, and getting that wrong is
    // the second time this fixture's shape has cost a test its meaning. Positions 1 and 3 are
    // complete, 2 and 4 are not — the state a validator is in after reaching `?position=3` by a link
    // and answering while position 2 is still outstanding. So after the write completes OD_0007, TWO
    // placements remain and the requested position genuinely chooses between them.
    //
    // The first draft marked positions 1, 2 and 3 complete, leaving exactly ONE remaining placement.
    // Every requested position then resolved to that one entry — `4`, `1` and `999` alike — so
    // reading the position out of the pushed URL was **decoration**: the test passed identically with
    // the resolver ignoring its `requestedPosition` argument altogether, and also with the form
    // pushing `position + 2`. The re-verification pass measured both, green at 1214/1214. A fixture
    // that cannot discriminate makes a real read look like a real dependency, which is the most
    // expensive kind of vacuous test because it documents an intention it does not check.
    const completed = new Set(["OD_0005", "OD_0007"]);
    const next = resolveSessionEntry(PLACEMENTS, completed, requestedPosition);
    expect(next).not.toBeNull();
    // The answered entry is not re-presented.
    expect(next?.placement.datasetEntryId).not.toBe("OD_0007");
    // And the requested position is what selected it, not the fallback: the first REMAINING placement
    // is OD_0006, so a resolver that ignored its argument would answer differently and go red here.
    expect(next?.placement.datasetEntryId).not.toBe("OD_0006");
    expect(next?.placement.datasetEntryId).toBe("OD_0008");
    // The advance goes FORWARD from the placement just answered, which is what the push-then-reload
    // sequence rests on — and note it advances PAST an outstanding earlier entry rather than back to
    // it, because the server resolves against the requested position.
    expect(next?.placement.position ?? 0).toBeGreaterThan(3);
    // Stated so a reader can see the fixture is not accidentally satisfiable another way: TWO
    // placements are outstanding at the moment of resolution, and the request picks the later one.
    const remaining = PLACEMENTS.filter((p) => !completed.has(p.datasetEntryId));
    expect(remaining).toHaveLength(2);

    // The re-mount: the same component, at the position the push named, presenting the entry the real
    // resolver chose. A different `datasetEntryId` means a different sentence is on screen.
    view.unmount();
    view = mount(
      <ValidationForm
        locale="en"
        batchId={BATCH_ID}
        datasetEntryId={next?.placement.datasetEntryId ?? "OD_0008"}
        position={requestedPosition}
      />,
    );

    expect(view.one<HTMLFormElement>("form")).toBeDefined();
    // And no second insert happened merely by arriving somewhere: presenting an entry is a read, and a
    // mount that wrote on arrival would double every response.
    expect(h.submitted).toHaveLength(1);
  });

  it("CAN FIRE: the pushed position actually CHANGES which entry the resolver presents", () => {
    // The control the re-mount test above needs and did not have, found by asking what would have to
    // be true for that test's resolution step to fail.
    //
    // It reads the position out of the pushed URL and hands it to the resolver, so if the form pushed
    // a position the resolver ignores — or a position past the end, which the resolver answers with
    // the first remaining entry — the resolution above would return the same answer anyway. `?position=999`
    // is exactly that case: it resolves to `OD_0008` too, because nothing is at or after 999 and the
    // fallback takes over. So a mutation of the form's push to a wrong-but-large position is invisible
    // to the test above, and the sibling test that asserts the exact URL string is what catches it.
    //
    // This test pins the missing half: two DIFFERENT in-range positions must give two DIFFERENT
    // entries, which is what makes reading the position out of the URL worth anything.
    //
    // It is a SEPARATE test with its OWN fixture, and an earlier version of its comment claimed that
    // adding it made the re-mount test's `requestedPosition` load-bearing. That was wrong, and the
    // re-verification pass measured why: a control in a different test cannot fix a fixture in another,
    // so the re-mount test kept resolving to a single remaining placement regardless of the position
    // it was given. **The re-mount test's own fixture is now discriminating** — see its comment — and
    // this control remains because the two witness different things: the re-mount test witnesses the
    // end-to-end chain for one position, this one witnesses that the resolver's argument is not
    // ignored across a range.
    const PLACEMENTS = [
      { datasetEntryId: "OD_0005", position: 1 },
      { datasetEntryId: "OD_0006", position: 2 },
      { datasetEntryId: "OD_0007", position: 3 },
      { datasetEntryId: "OD_0008", position: 4 },
    ] as const;

    // Only OD_0005 completed, so THREE placements remain. The first draft of this control used a
    // completed set that left ONE placement, and every requested position then resolved to the same
    // entry — the control passed for the wrong reason while proving nothing about the position. It
    // failed on `expected 'OD_0008' to be 'OD_0007'`, which is an expected value written down instead
    // of measured: a single remaining placement cannot discriminate between three positions.
    const completed = new Set(["OD_0005"]);

    // Measured, not assumed — the values below were read out of the resolver, not derived by hand.
    // `remaining` is OD_0006 (2), OD_0007 (3), OD_0008 (4); the rule is the first placement at or
    // after the requested position, falling back to the first remaining.
    const atTwo = resolveSessionEntry(PLACEMENTS, completed, 2);
    const atThree = resolveSessionEntry(PLACEMENTS, completed, 3);
    const atFour = resolveSessionEntry(PLACEMENTS, completed, 4);
    // A position BEFORE the first remaining, and one PAST the end, both take the fallback — which is
    // why a wrong-but-large push is invisible to the test above and needs the sibling test that
    // asserts the exact URL.
    const atOne = resolveSessionEntry(PLACEMENTS, completed, 1);
    const atFarPastTheEnd = resolveSessionEntry(PLACEMENTS, completed, 999);

    expect(atTwo?.placement.datasetEntryId).toBe("OD_0006");
    expect(atThree?.placement.datasetEntryId).toBe("OD_0007");
    expect(atFour?.placement.datasetEntryId).toBe("OD_0008");
    expect(atOne?.placement.datasetEntryId).toBe("OD_0006");
    expect(atFarPastTheEnd?.placement.datasetEntryId).toBe("OD_0006");
    // Three in-range positions, THREE different answers — this is the property that makes reading the
    // position out of the pushed URL worth anything rather than decoration.
    expect(new Set([atTwo, atThree, atFour].map((c) => c?.placement.datasetEntryId)).size).toBe(3);
    // And the two fallbacks agree with the first remaining, which is what a stale link lands on.
    expect(atOne?.placement.datasetEntryId).toBe(atFarPastTheEnd?.placement.datasetEntryId);
    // Never a completed entry, on any of the five requests.
    for (const choice of [atOne, atTwo, atThree, atFour, atFarPastTheEnd]) {
      expect(completed.has(choice?.placement.datasetEntryId ?? "")).toBe(false);
    }
  });
});

describe("VF-8 — a failed write keeps what the participant typed", () => {
  it("reports the reason and leaves the form filled, so nothing has to be retyped", async () => {
    // The single most consequential failure behaviour. A form that cleared itself on failure would make
    // somebody re-derive a correction they had already written, and the ones who give up are the ones
    // whose research response is lost.
    await choose(INCORRECT);
    type(field("correctedInstruction"), "Iti Baguio Athletic Bowl ti pagtapon.");
    await view.settle();
    await fillTranslations();
    h.result = { status: "failed", reason: "persistence" };

    await view.submitFormAndSettle(form());

    expect(field("correctedInstruction").value).toBe("Iti Baguio Athletic Bowl ti pagtapon.");
    expect(field("englishTranslation").value).toBe("Go to the Baguio Athletic Bowl.");
    expect(view.container.textContent).toMatch(/nothing was saved/i);
    expect(h.pushes).toHaveLength(0);
  });

  it("marks the failure for assistive technology, not only in colour", async () => {
    await choose(CANNOT_EVALUATE);

    h.result = { status: "failed", reason: "invalid" };
    await view.submitFormAndSettle(form());

    const alerts = view.all('[role="alert"]');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  it("attaches a field-level message to the choice that needs making", async () => {
    // The refusal here is the CLIENT's own check: without a language choice the form cannot know
    // which inputs to require, so it refuses before any payload exists. The message lands on the
    // CHOICE group — the control the validator must use — asserted through the rendered
    // `aria-invalid` and the alert text, because those are what a screen reader reads; asserting
    // only that a message string appears would pass for a message rendered somewhere the
    // participant never looks.
    await choose(CORRECT_NATURAL);

    await view.submitFormAndSettle(form());

    const groups = view.all('[role="radiogroup"]');
    expect(groups).toHaveLength(2);
    const choiceGroup = groups[1] as HTMLElement;
    expect(choiceGroup.getAttribute("aria-invalid")).toBe("true");
    const describedBy = (choiceGroup.getAttribute("aria-describedby") ?? "").split(" ");
    expect(describedBy.length, "the invalid group must point at a description").toBeGreaterThan(0);
    const messages = describedBy
      .map((id) => view.container.querySelector(`#${cssEscape(id)}`)?.textContent ?? "")
      .filter((text) => text.length > 0);
    expect(messages.join(" ")).toMatch(/translate/i);
    expect(h.submitted).toHaveLength(0);
  });

  it("does NOT surface a server issue path as a field message, and says so here", async () => {
    // MEASURED, and it is a deliberate scope boundary rather than an omission. The form renders
    // `failureMessageFor(result.reason, t)` and IGNORES `result.issues` — so a server refusal carrying
    // `response.filipinoTranslation` does not produce a message on the Filipino box.
    //
    // That is safe here for a reason worth stating, and it would not be safe anywhere else: the form's
    // own `checkEntryForm` runs the SAME schema the server runs, before the request is made, so a
    // payload the server would reject for a missing field never leaves the browser. A server `invalid`
    // therefore means something this form cannot produce, and the honest response is the general
    // "nothing was saved" sentence rather than a field name the participant cannot act on.
    //
    // The first draft of this test asserted the OPPOSITE — that the server's issue message would appear
    // on the field — and failed against correct code. Asserted here as a documented boundary so a
    // future change that DOES surface server issues has to change this test deliberately.
    await choose(CORRECT_NATURAL);
    await fillTranslations();
    h.result = {
      status: "failed",
      reason: "invalid",
      issues: [
        { path: "response.filipinoTranslation", message: "A Filipino translation is required." },
      ],
    };

    await view.submitFormAndSettle(form());

    expect(view.container.textContent).not.toContain("A Filipino translation is required.");
    expect(view.container.textContent).toMatch(/nothing was saved/i);
    expect(view.all('[aria-invalid="true"]')).toHaveLength(0);
  });

  it("re-enables the control after a failure, so the participant can try again", async () => {
    await completeAnEvaluableAnswer(CORRECT_NATURAL);
    h.result = { status: "failed", reason: "persistence" };

    await view.submitFormAndSettle(form());

    expect(submitControl().disabled).toBe(false);
    expect(submitControl().getAttribute("aria-busy")).toBeNull();
  });

  it("does not attempt a submit at all when the form is INCOMPLETE", async () => {
    // A courtesy, and stated as one: the server would refuse this payload too, but burning a round trip
    // and showing an error for a field the participant has not reached yet is a bad experience rather
    // than a research problem.
    await choose(CORRECT_NATURAL);

    await view.submitFormAndSettle(form());

    expect(h.submitted).toHaveLength(0);
    // The missing fields are named, not a single generic complaint.
    expect(view.container.textContent).toMatch(/translation/i);
  });
});

/**
 * Escapes a value for use as a CSS selector.
 *
 * `aria-describedby` holds a bare element id, and the ids in `Field` are derived from the field name —
 * so `field-filipinoTranslation-description` is already selector-safe today. The helper exists so that
 * if a field name ever gained a character that is not, the failure is a clear selector error rather
 * than a silently-null query that would let the assertion below pass for the wrong reason.
 */
function cssEscape(value: string): string {
  return value.replace(/([^\w-])/g, "\\$1");
}

/**
 * WEAKNESS: the Server Action is mocked, so nothing here proves the write reaches a database, and the
 * duplicate this file treats as a success is a value this file's own mock returned rather than a
 * `23505` PostgREST has ever raised. The `lang`/`disabled`/`aria-busy` assertions are about what
 * `happy-dom` reports, which is a synthetic DOM and not a browser.
 */

describe("VF-9 — each presented entry begins with a fresh form", () => {
  it("clears entry 1's answers when entry 2 renders in the same instance", async () => {
    // The leak this guards: advancing reuses this component instance, so `useState` initializers
    // do not run again and entry 1's answers would sit in entry 2's inputs — submittable as
    // entry 2's response. Rerendering with a new entry id is the production advance, minus the
    // router: same instance, new props, which is exactly the shape that leaks.
    await answerFully(INCORRECT);
    await view.submitFormAndSettle(form());
    expect(h.submitted).toHaveLength(1);

    view.rerender(
      <ValidationForm locale="en" batchId={BATCH_ID} datasetEntryId="OD_0008" position={4} />,
    );
    await view.settle();

    // No evaluation selected: every option announces unselected.
    expect(
      options().filter((option) => option.getAttribute("aria-checked") === "true"),
    ).toHaveLength(0);
    // No correction, no translations, no choice: the conditional inputs are absent, not merely
    // emptied — an emptied-but-present box would still read as an answer the validator gave.
    expect(view.all('[name="correctedInstruction"]')).toHaveLength(0);
    expect(view.all('[name="englishTranslation"]')).toHaveLength(0);
    expect(view.all('[name="filipinoTranslation"]')).toHaveLength(0);
    expect(view.all('[role="radiogroup"]')).toHaveLength(1);
    // No error carried over either.
    expect(view.container.querySelector('[role="alert"]')).toBeNull();
    expect(view.all('[aria-invalid="true"]')).toHaveLength(0);
  });

  it("sends nothing stale when entry 2 is submitted untouched", async () => {
    // The payload half of the same guarantee. Rendering empty inputs while keeping entry 1's
    // payload underneath would pass every assertion above and still submit the wrong answer —
    // which is why the fix resets state rather than hiding it, and why this submits.
    await answerFully(INCORRECT);
    await view.submitFormAndSettle(form());

    view.rerender(
      <ValidationForm locale="en" batchId={BATCH_ID} datasetEntryId="OD_0008" position={4} />,
    );
    await view.settle();
    await view.submitFormAndSettle(form());

    // The untouched entry-2 submit is refused as incomplete (no evaluation chosen), so the
    // server receives nothing further: one payload total, and it names entry 1.
    expect(h.submitted).toHaveLength(1);
    expect((h.submitted[0] as { datasetEntryId: string }).datasetEntryId).toBe("OD_0007");
  });

  it("keeps typing when the same entry re-renders, because that is not an advance", async () => {
    // The guard compares entry ids, not renders: a locale switch or parent update re-renders
    // this same entry, and wiping a half-typed answer there would destroy work for no reason.
    await choose(CORRECT_NATURAL);
    await fillTranslations();

    view.rerender(
      <ValidationForm locale="en" batchId={BATCH_ID} datasetEntryId="OD_0007" position={3} />,
    );
    await view.settle();

    expect(field("englishTranslation").value).toBe("Go to the Baguio Athletic Bowl.");
  });
});
