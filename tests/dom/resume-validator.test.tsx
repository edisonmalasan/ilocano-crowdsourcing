/**
 * Resume-from-the-landing-page, driven for real.
 *
 * =================================================================================================
 * WHY THIS FILE EXISTS
 * =================================================================================================
 * Two of the seven measured gaps are here, and both are **critical** research-integrity sites that
 * no test in the project observed. A mutation probe found each one leaves all 881 unit tests green.
 *
 *   RV-1  `const stored = readStoredValidatorId()` -> `const stored = null`
 *         Resume becomes permanently dead. A returning validator is told they hold no identity, is
 *         sent to enroll again, mints a SECOND identity, and the first is orphaned — one person's
 *         research record split in two, with nothing in the stored data able to tell.
 *
 *   RV-2  `router.push("/ready")` removed
 *         A validator the server RECOGNISED is left staring at a message claiming they hold no
 *         identity, having just been told the opposite.
 *
 * `renderToStaticMarkup` cannot observe either: both live inside `handleClick`, a handler it never
 * fires. That limitation is documented in `tests/unit/onboarding-routes.test.tsx` and predates this
 * change. So these are behavioural — a real click, and the effect observed in the DOM.
 *
 * `tests/dom/feasibility-spike.test.tsx` already clicks this component and sees a navigation. It is
 * explicitly **not** a guard — it exists to prove the approach works — so RV-2 needs its own, and
 * one that also pins *which* result produced the navigation.
 *
 * =================================================================================================
 * WHAT EACH GUARD DOES **NOT** CATCH  (design.md D3)
 * =================================================================================================
 * Stated per test, because a guard whose limits are undocumented is how this repository's six
 * previous vacuous guards survived review.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResumeValidator } from "@/components/onboarding/resume-validator";
import { translatorFor } from "@/lib/i18n/copy";
import { mount, type Mounted } from "./support/dom-harness";

const EN = "en" as const;
const t = translatorFor(EN);

const STORED_ID = "v-0123456789abcdef0123456789abcdef";

/**
 * Hoisted so the `vi.mock` factories — hoisted above every import — close over the SAME object the
 * assertions read. A module-scope recorder would be a different object by the time a factory ran,
 * and every assertion would read `[]` and pass.
 */
const h = vi.hoisted(() => ({
  pushes: [] as string[],
  cleared: 0,
  storedId: null as string | null,
  /** Payloads exactly as the component sent them. */
  resume: [] as unknown[],
  /** What the server "says". Overridden per test. */
  resumeResult: null as unknown,
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
  writeStoredValidatorId: () => undefined,
  clearStoredValidatorId: () => {
    h.cleared += 1;
  },
}));

vi.mock("@/lib/validators/actions", () => ({
  resumeValidatorAction: vi.fn(async (raw: unknown) => {
    h.resume.push(raw);
    return h.resumeResult ?? { status: "restored", validatorId: h.storedId };
  }),
  enrollValidatorAction: vi.fn(async () => ({ status: "failed", reason: "persistence" })),
}));

let view: Mounted;

function control(): HTMLButtonElement {
  return view.one<HTMLButtonElement>("button");
}

function statusText(): string | null {
  const found = view.container.querySelector('[role="status"]');
  return found ? found.textContent : null;
}

beforeEach(() => {
  h.pushes.length = 0;
  h.cleared = 0;
  h.storedId = STORED_ID;
  h.resume.length = 0;
  h.resumeResult = { status: "restored", validatorId: STORED_ID };
  view = mount(<ResumeValidator locale={EN} />);
});

afterEach(() => {
  view.unmount();
  vi.clearAllMocks();
});

describe("RV-1 — the component reads the identifier this browser holds", () => {
  it("resolves the stored identifier instead of claiming none is held", async () => {
    await view.pressAndSettle(control());

    // The positive claim. A mutation reading the stored identifier as `null` takes the early return
    // at the top of `handleClick`, so `h.resume` stays empty and this fails.
    expect(h.resume).toEqual([{ storedId: STORED_ID }]);

    // WEAKNESS: asserts the identifier is SENT, not that the answer is USED. A component that sent
    // it and then ignored the reply would pass here. RV-2's test is what observes the reply.
  });

  it("reports an absent identifier rather than asking the server about nothing", async () => {
    h.storedId = null;
    view.unmount();
    view = mount(<ResumeValidator locale={EN} />);

    await view.pressAndSettle(control());

    // The control for the test above, and the reason it is a measurement rather than a decoration:
    // if `readStoredValidatorId` were not consulted at all, this path would be unreachable and the
    // first test's `[{ storedId }]` could not exist. One of the two fails if the component stops
    // branching.
    expect(h.resume).toEqual([]);
    expect(statusText()).toBe(t("resume.noneHeld"));

    // WEAKNESS: `resume.noneHeld` is looked up through the real catalog rather than hard-coded, so
    // this asserts the component shows the RIGHT message without pinning the English wording. A
    // wrong-message mutation that swapped two catalog keys would pass; one that dropped the message
    // entirely would not.
  });
});

describe("RV-2 — a recognised validator is navigated onward", () => {
  it("navigates to /ready when the server restores the identity", async () => {
    await view.pressAndSettle(control());

    expect(h.pushes).toEqual(["/ready"]);

    // WEAKNESS: observes the destination, not the timing. A mutation that pushed before awaiting
    // the server — navigating a validator whose identity was NOT recognised — passes here, and is
    // caught only by the next test.
  });

  it("does not navigate when the server recognises nobody", async () => {
    h.resumeResult = { status: "absent" };
    view.unmount();
    view = mount(<ResumeValidator locale={EN} />);

    await view.pressAndSettle(control());

    // The paired opposite, and it is the half that makes the test above mean anything: it pins
    // navigation to a RECOGNISED identity rather than to a click. It also pins the two side effects
    // that must accompany that refusal.
    expect(h.pushes).toEqual([]);
    expect(h.cleared).toBe(1);
    expect(statusText()).toBe(t("resume.unknown"));

    // WEAKNESS: does not assert WHICH identifier was cleared — there is only the one the component
    // holds, and `readStoredValidatorId` is a single-value stub. Clearing a *different* identifier
    // would pass.
  });
});
