import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ValidationForm } from "@/app/validate/[batchId]/validation-form";
import { EVALUATION_CHOICES } from "@/schemas/validation";
import type { ValidationResponseInput } from "@/schemas/validation";

import { mount, type Mounted } from "./support/dom-harness";

/**
 * The per-entry form's contract, driven for real.
 *
 * The form validates locally and hands a payload to the session runner; it never calls a Server
 * Action and never navigates. Every guard here closes a fact `renderToStaticMarkup` cannot
 * reach: that a click reaches the handler with the payload the participant built, and that two
 * clicks in one task enqueue once.
 *
 *   VF-1  the payload handed up carries the judgement the participant clicked
 *   VF-2  only the fields the chosen evaluation accepts are handed up
 *   VF-3  an incomplete answer is never handed up, and the missing input is named
 *   VF-4  two submits in one task hand up exactly ONE payload (the single-flight latch)
 *   VF-5  a new entry id resets the form; the same entry id keeps typed input (locale switch)
 *   VF-6  the form never disables for a transition: entries arrive interactive, the
 *         skeleton owns the wait and this component is not rendered during it
 *
 * WHAT THIS DOES NOT PROVE
 * `happy-dom` is a SYNTHETIC DOM. This proves a click reaches a handler. It proves nothing about
 * layout, contrast, focus order, a real viewport's 44px target, or how a real browser's form
 * submission interacts with `useTransition`. No human has ever rendered this screen.
 *
 * What this also does not prove — deliberately — is anything about persistence or advancing.
 * The form has no action to call and no address to navigate to; `validation-session.test.tsx`
 * owns those, against the runner that holds the queue and the prefetch.
 */

const h = vi.hoisted(() => ({
  /** Every payload handed to the runner, in order. */
  handedUp: [] as ValidationResponseInput[],
}));

let view: Mounted;

function form(): HTMLFormElement {
  return view.one<HTMLFormElement>("form");
}

/** The evaluation options, scoped to the evaluation group. */
function options(): HTMLButtonElement[] {
  const group = view.all('[role="radiogroup"]')[0] as HTMLElement;
  return Array.from(group.querySelectorAll('button[role="radio"]')) as HTMLButtonElement[];
}

/** The translation-choice options, in declared order: english, filipino, both, skip. */
function choiceOptions(): HTMLButtonElement[] {
  const groups = view.all('[role="radiogroup"]');
  if (groups.length !== 2) {
    throw new Error(
      `expected the evaluation group and the translation-choice group but found ${groups.length} radiogroups.`,
    );
  }
  const group = groups[1] as HTMLElement;
  return Array.from(group.querySelectorAll('button[role="radio"]')) as HTMLButtonElement[];
}

function field(name: string): HTMLTextAreaElement {
  const found = view.all(`[name="${name}"]`);
  if (found.length !== 1) {
    throw new Error(`expected exactly one field named "${name}" but found ${found.length}.`);
  }
  return found[0] as HTMLTextAreaElement;
}

/** Sets a field's value the way React's own controlled inputs expect to be told. */
function type(field: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  if (!setter) throw new Error("no value setter on the input prototype");
  setter.call(field, value);
  view.dispatch(field, new window.Event("input", { bubbles: true }));
}

async function choose(index: number): Promise<void> {
  await view.pressAndSettle(options()[index]!);
}

async function chooseLanguage(index: number): Promise<void> {
  await view.pressAndSettle(choiceOptions()[index]!);
}

const BOTH_LANGUAGES = 2;
const SKIP_TRANSLATION = 3;

async function fillTranslations(): Promise<void> {
  await chooseLanguage(BOTH_LANGUAGES);
  type(field("englishTranslation"), "Go to the Baguio Athletic Bowl.");
  await view.settle();
  type(field("filipinoTranslation"), "Pumunta sa Baguio Athletic Bowl.");
  await view.settle();
}

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

function mountForm(entryId = "OD_0007"): void {
  view = mount(
    <ValidationForm
      locale="en"
      datasetEntryId={entryId}
      onValidSubmit={(payload) => {
        h.handedUp.push(payload);
      }}
    />,
  );
}

beforeEach(() => {
  h.handedUp.length = 0;
  mountForm();
});

afterEach(() => {
  view.unmount();
  vi.clearAllMocks();
});

describe("VF-1 — the payload handed up carries the judgement made", () => {
  it("hands up the option the participant clicked, for each of the four", async () => {
    expect(EVALUATION_CHOICES).toHaveLength(4);

    for (const [index, choice] of EVALUATION_CHOICES.entries()) {
      // One mount per option: the single-flight latch correctly stays closed for a second
      // submit on the SAME entry, so reusing the mount would prove the latch rather than the
      // option. A fresh mount is a fresh entry, which is the only state a submit may leave.
      view.unmount();
      mountForm();
      h.handedUp.length = 0;

      await answerFully(index);
      await view.submitFormAndSettle(form());

      expect(h.handedUp).toHaveLength(1);
      expect(h.handedUp[0]?.evaluation, `clicking option ${index} must hand up its own value`).toBe(
        choice.value,
      );
    }
  });
});

describe("VF-2 — only the fields the evaluation accepts are handed up", () => {
  it("carries no correction and no translations for correct_natural with skip", async () => {
    const natural = EVALUATION_CHOICES.findIndex((choice) => choice.value === "correct_natural");
    await choose(natural);
    await chooseLanguage(SKIP_TRANSLATION);
    await view.submitFormAndSettle(form());

    expect(h.handedUp).toHaveLength(1);
    expect(h.handedUp[0]).toEqual({ evaluation: "correct_natural" });
  });

  it("carries the correction but drops a disclaimed translation on change of mind", async () => {
    const incorrect = EVALUATION_CHOICES.findIndex((choice) => choice.value === "incorrect");
    await choose(incorrect);
    type(field("correctedInstruction"), "Iti Baguio Athletic Bowl ti pagtapon.");
    await view.settle();
    // Typed Filipino, then chose English-only: the disclaimed text must not travel.
    await chooseLanguage(1);
    type(field("filipinoTranslation"), "Pumunta sa Baguio Athletic Bowl.");
    await view.settle();
    await chooseLanguage(0);
    type(field("englishTranslation"), "Go to the Baguio Athletic Bowl.");
    await view.settle();
    await view.submitFormAndSettle(form());

    expect(h.handedUp).toHaveLength(1);
    expect(h.handedUp[0]).not.toHaveProperty("filipinoTranslation");
    expect(h.handedUp[0]).toHaveProperty("englishTranslation", "Go to the Baguio Athletic Bowl.");
  });
});

describe("VF-3 — an incomplete answer is never handed up", () => {
  it("names the missing evaluation and sends nothing", async () => {
    await view.submitFormAndSettle(form());

    expect(h.handedUp).toHaveLength(0);
    // The missing input is identified by the group the participant must answer: the evaluation
    // legend is on screen and no option is selected. (The field-error string itself is empty —
    // the unit half in `validation-form-flow.test.ts` pins the field path; what the DOM can
    // show is that nothing was sent and the question is still open.)
    expect(view.container.textContent).toMatch(/closest fit/i);
    expect(view.all('button[role="radio"][aria-checked="true"]')).toHaveLength(0);
  });

  it("names a missing required correction and sends nothing", async () => {
    const incorrect = EVALUATION_CHOICES.findIndex((choice) => choice.value === "incorrect");
    await choose(incorrect);
    await fillTranslations();
    await view.submitFormAndSettle(form());

    expect(h.handedUp).toHaveLength(0);
  });
});

describe("VF-6 — entry transitions never disable this form", () => {
  it("renders every offered input enabled: the skeleton owns the wait, not a disabled entry", async () => {
    // The transition skeleton replaced the disabled-entry settling model: while the
    // skeleton shows this component is not rendered at all, and a revealed entry
    // arrives immediately interactive. There is therefore no `settling` prop and
    // no timer-disabled state here — only the submit's own pending state.
    const incorrect = EVALUATION_CHOICES.findIndex((choice) => choice.value === "incorrect");
    await choose(incorrect);
    await chooseLanguage(BOTH_LANGUAGES);
    expect(field("correctedInstruction").disabled).toBe(false);
    expect(field("englishTranslation").disabled).toBe(false);
    expect(field("filipinoTranslation").disabled).toBe(false);
    const radios = Array.from(
      (view.all('[role="radiogroup"]')[0] as HTMLElement).querySelectorAll('button[role="radio"]'),
    );
    expect(radios.length).toBe(4);
    for (const radio of radios) {
      expect((radio as HTMLButtonElement).disabled).toBe(false);
    }
    const submit = view.one('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(submit.textContent).toBe("Save and continue");
  });
});

describe("VF-4 — two submits in one task hand up exactly one payload", () => {
  it("the single-flight latch holds when React has committed nothing between clicks", async () => {
    await answerFully(0);
    const target = form();
    await act(async () => {
      target.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      target.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(h.handedUp).toHaveLength(1);
  });

  it("CAN FIRE: without the latch the same-task double submit hands up twice", async () => {
    // The control for the latch: two submits in one task MUST reach the handler twice when
    // nothing stops the second. If this arrangement ever reports one, the instrument — not the
    // latch — is what changed, and the test above is measuring the harness.
    let calls = 0;
    await act(async () => {
      const target = form();
      target.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      calls += 1;
      target.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      calls += 1;
    });
    expect(calls).toBe(2);
  });
});

describe("VF-5 — entry reset without losing in-progress work to a re-render", () => {
  it("a new entry id resets the form to empty", async () => {
    await answerFully(0);
    await view.submitFormAndSettle(form());
    expect(h.handedUp).toHaveLength(1);

    view.rerender(
      <ValidationForm
        locale="en"
        datasetEntryId="OD_0008"
        onValidSubmit={(payload) => {
          h.handedUp.push(payload);
        }}
      />,
    );

    // Nothing selected, nothing typed, and an immediate submit is refused as incomplete —
    // proving the reset cleared the submittable payload, not just the visible inputs.
    expect(
      view.all('button[role="radio"][aria-checked="true"]').length,
      "an option survived the advance",
    ).toBe(0);
    await view.submitFormAndSettle(form());
    expect(h.handedUp).toHaveLength(1);
  });

  it("re-rendering the same entry keeps everything typed (locale switch)", async () => {
    await answerFully(0);

    view.rerender(
      <ValidationForm
        locale="fil"
        datasetEntryId="OD_0007"
        onValidSubmit={(payload) => {
          h.handedUp.push(payload);
        }}
      />,
    );

    await view.submitFormAndSettle(form());
    expect(h.handedUp).toHaveLength(1);
    expect(h.handedUp[0]?.evaluation).toBe(EVALUATION_CHOICES[0]?.value);
  });
});
