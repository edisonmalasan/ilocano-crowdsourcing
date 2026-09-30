/**
 * The screening form's write wiring, driven for real.
 *
 * =================================================================================================
 * WHY THIS FILE EXISTS, AND WHY IT IS NOT A SOURCE SCAN
 * =================================================================================================
 * Every guard here closes a call site that a mutation probe found **unguarded**: mutating the site
 * left all 881 unit tests green. `renderToStaticMarkup` cannot close any of them, because it never
 * fires a handler and can only ever see the idle state — both documented in
 * `tests/unit/onboarding-routes.test.tsx` long before this change existed. So these are
 * behavioural: a real click, a real form submit, and the effect observed in the DOM.
 *
 *   SF-1  the screening options stay inert while a write is in flight
 *   SF-2  the PRIMARY Continue control is disabled while a write is in flight
 *   SF-3  the skip control is disabled while a write is in flight
 *   SF-4  the payload carries the participant's ANSWER, never a decline
 *   SF-5  an enrolled participant is navigated to /ready
 *
 * =================================================================================================
 * WHY SF-4 HAS TWO TESTS AND THE SECOND IS NOT REDUNDANT
 * =================================================================================================
 * `expect(enroll).toEqual([{ … }])` also passes against a stub that records nothing and returns a
 * canned value for every call — it would pass whether or not the component passed an answer at all.
 * So the DECLINE path is asserted separately and is expected to carry exactly `null`. If the mock
 * were inert, or the component sent one value on every path, one of the two tests fails.
 * **A claim with a paired opposite is a measurement; a claim on its own is a decoration.**
 *
 * =================================================================================================
 * WHAT EACH GUARD DOES **NOT** CATCH  (design.md D3)
 * =================================================================================================
 * Stated per test. A guard whose limits are undocumented is how the six vacuous guards in this
 * repository's history survived review.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScreeningForm } from "@/app/start/screening-form";
import { mount, neverResolves, type Mounted } from "./support/dom-harness";

/**
 * Hoisted so the `vi.mock` factories — which are lifted above every import — close over the SAME
 * object the assertions read. A recorder created at module scope would be a different object by the
 * time a factory ran, and every assertion would read `[]` and pass.
 */
const h = vi.hoisted(() => ({
  pushes: [] as string[],
  written: [] as string[],
  cleared: 0,
  storedId: null as string | null,
  mintedId: "v-0123456789abcdef0123456789abcdef",
  /** Payloads exactly as the component sent them. */
  enroll: [] as unknown[],
  resume: [] as unknown[],
  /** When set, `enrollValidatorAction` returns this, holding the transition open. */
  holdEnroll: null as null | (() => Promise<never>),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (href: string) => {
      h.pushes.push(href);
    },
    replace: () => undefined,
    prefetch: () => undefined,
    back: () => undefined,
    forward: () => undefined,
    refresh: () => undefined,
  }),
}));

vi.mock("@/lib/validators/browser-identity", () => ({
  readStoredValidatorId: () => h.storedId,
  writeStoredValidatorId: (id: string) => {
    h.written.push(id);
  },
  clearStoredValidatorId: () => {
    h.cleared += 1;
  },
}));

vi.mock("@/lib/validators/actions", () => ({
  enrollValidatorAction: vi.fn(async (raw: unknown) => {
    h.enroll.push(raw);
    if (h.holdEnroll) return h.holdEnroll();
    // `status: "enrolled"` is the real vocabulary. The feasibility spike in this project mocked
    // `status: "created"`, which does not exist and drives `decideEnrollment` down its FAILURE
    // branch — a wrong literal that happened to be unexercised, and exactly what a later reader
    // would trust.
    return { status: "enrolled", validatorId: h.mintedId };
  }),
  resumeValidatorAction: vi.fn(async (raw: unknown) => {
    h.resume.push(raw);
    return { status: "absent" };
  }),
}));

/** Index 4 is `not_confident` — neither `null` nor `ILOCANO_PROFICIENCY_CHOICES[1]`. */
const NOT_CONFIDENT = 4;

let view: Mounted;

function form(): HTMLFormElement {
  return view.one<HTMLFormElement>("form");
}

function options(): HTMLButtonElement[] {
  return view.all('button[role="radio"]') as HTMLButtonElement[];
}

/** The Continue control. */
function continueControl(): HTMLButtonElement {
  return view.one<HTMLButtonElement>('form button[type="submit"]');
}

/**
 * The skip control: the only non-submit, non-radio button on the form.
 *
 * The radios are `type="button"` too, so they must be excluded explicitly — which is also why
 * `disabled={submitState.disabled}` and `disabled={isPending}` are two distinct bindings in the
 * component and had to be measured as two distinct sites.
 */
function skipControl(): HTMLButtonElement {
  const candidates = view.all("form button:not([role='radio'])");
  const skip = candidates.find((b) => b !== continueControl());
  if (!skip) throw new Error("the skip control was not rendered");
  return skip as HTMLButtonElement;
}

/** Mounts, submits, and leaves the transition OPEN — for the pending-state tests. */
function beginPendingWrite(): void {
  h.holdEnroll = neverResolves;
  view.submitForm(form());
}

beforeEach(() => {
  h.pushes.length = 0;
  h.written.length = 0;
  h.cleared = 0;
  h.storedId = null;
  h.holdEnroll = null;
  h.enroll.length = 0;
  h.resume.length = 0;
  view = mount(<ScreeningForm locale="en" />);
});

afterEach(() => {
  view.unmount();
  vi.clearAllMocks();
});

describe("SF-4 — the payload carries the answer, not a fabricated level", () => {
  it("sends the option the participant actually chose", async () => {
    view.press(options()[NOT_CONFIDENT]);
    await view.submitFormAndSettle(form());

    // Not `ILOCANO_PROFICIENCY_CHOICES[1]`. Index 1 is the "Fluent" bypass that round six of the
    // archived review found, and choosing index 4 is precisely what lets this assertion catch it.
    expect(h.enroll).toEqual([{ ilocanoProficiency: "not_confident" }]);

    // WEAKNESS: a mutation hardcoding `not_confident` passes. The scope is "the chosen option is
    // transmitted, verified for one level", and it is that, not more.
  });

  it("sends exactly null when the participant declines, and no level at all", async () => {
    await view.submitFormAndSettle(form());

    // The control for the test above — see the file header for why this is not redundant.
    expect(h.enroll).toEqual([{ ilocanoProficiency: null }]);

    // WEAKNESS: asserts absence, not the REASON. It cannot by itself distinguish a deliberate
    // decline from a lost answer; that is the first test's job, and the pair is the point.
  });
});

describe("SF-5 — a successful enrollment navigates onward", () => {
  it("navigates to /ready and stores the minted identifier", async () => {
    await view.submitFormAndSettle(form());

    expect(h.pushes).toEqual(["/ready"]);
    expect(h.written).toEqual([h.mintedId]);

    // WEAKNESS: observes both effects but not their ORDER. A mutation that navigated before storing
    // would pass. Sequencing is a real property and is NOT covered here.
  });

  it("does not navigate while the action is still in flight", async () => {
    beginPendingWrite();
    await view.settle();

    expect(h.pushes).toEqual([]);

    // WEAKNESS: the positive half is the test above; this one only establishes that the negative
    // state is reachable, which is what makes that positive half a measurement rather than a
    // tautology.
  });
});

describe("SF-2 — the primary control is inert while a write is in flight", () => {
  it("disables Continue, because a double press mints two validators", async () => {
    expect(continueControl().disabled).toBe(false);

    beginPendingWrite();
    await view.settle();

    // The property, stated directly. `submitControlState` is already asserted three times in
    // `onboarding-routes.test.tsx`; what was unobserved is that the BUTTON BINDS it — `submitState`
    // had **0 hits** anywhere in `tests/unit` before this change. This is the first assertion
    // anywhere connecting that decision to a rendered control.
    expect(continueControl().disabled).toBe(true);

    // WEAKNESS: observes `disabled`, not the whole accessible state. `aria-busy` is asserted for
    // the OTHER component in `feasibility-spike.test.tsx`; it is not asserted here.
  });
});

describe("SF-3 — the skip control is inert while a write is in flight", () => {
  it("disables skip, as a binding distinct from Continue's", async () => {
    beginPendingWrite();
    await view.settle();

    expect(skipControl().disabled).toBe(true);

    // WHY A SEPARATE TEST: `disabled={submitState.disabled}` occurs TWICE in the component. One
    // test covering both would go red for either mutation and could not say which fired — and a red
    // that cannot be attributed may be failing for an unrelated reason. This way each is
    // attributable by name.
  });
});

describe("SF-1 — the screening options are inert while a write is in flight", () => {
  it("disables every option, so a selection cannot change mid-write", async () => {
    expect(options().some((o) => o.disabled)).toBe(false);

    beginPendingWrite();
    await view.settle();

    // ALL options, not the first: a mutation disabling only the first would satisfy
    // `options()[0].disabled` and leave four selectable.
    expect(options().map((o) => o.disabled)).toEqual([true, true, true, true, true]);

    // WEAKNESS: observes `disabled` only. Whether a disabled radio remains focusable, and whether
    // the roving `tabIndex` still reaches it, are NOT asserted — a real keyboard question that a
    // synthetic DOM cannot answer and that no human has yet checked in a browser.
  });
});
