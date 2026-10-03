/**
 * The landing action, driven for real.
 *
 * =================================================================================================
 * WHY THIS FILE EXISTS
 * =================================================================================================
 * Two measured gaps live here, and both are **critical** research-integrity sites that
 * no static-markup test can observe. A mutation probe found each one leaves the unit suite green.
 *
 *   LA-1  `const stored = readStoredValidatorId()` -> `const stored = null`
 *         Resume becomes permanently dead. A returning validator is sent to enroll again, mints a
 *         SECOND identity, and the first is orphaned — one person's research record split in two,
 *         with nothing in the stored data able to tell.
 *
 *   LA-2  `router.push("/validate")` removed
 *         A validator the server RECOGNISED is left staring at a message claiming they hold no
 *         identity, having just been told the opposite.
 *
 * `renderToStaticMarkup` cannot observe either: both live inside `handleClick`, a handler it never
 * fires. So these are behavioural — a real click, and the effect observed in the DOM.
 *
 * =================================================================================================
 * WHAT EACH GUARD DOES **NOT** CATCH
 * =================================================================================================
 * Stated per test, because a guard whose limits are undocumented is how this repository's six
 * previous vacuous guards survived review.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LandingAction } from "@/components/onboarding/resume-validator";
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
  view = mount(<LandingAction locale={EN} />);
});

afterEach(() => {
  view.unmount();
  vi.clearAllMocks();
});

describe("LA-0 — the label reflects what this browser holds", () => {
  it("offers continuing when the session holds an attempt", () => {
    // The effect ran on mount (the harness commits effects), so the label for a
    // browser holding an identity is the continue label — a hint, never the
    // decision, which the press re-resolves.
    expect(control().textContent).toBe(t("landing.cta.continue"));

    // WEAKNESS: asserts the HINT, not the decision. A label/press mismatch — the
    // label saying continue while the press went to screening — would pass; the
    // routing is pinned separately below.
  });

  it("offers starting when the session holds nothing", () => {
    h.storedId = null;
    view.unmount();
    view = mount(<LandingAction locale={EN} />);

    expect(control().textContent).toBe(t("landing.cta.start"));

    // WEAKNESS: static label only. A component that always rendered the start
    // label yet still resolved correctly would pass; the resolution is pinned
    // in LA-1.
  });
});

describe("LA-1 — the action reads the identifier this browser holds", () => {
  it("resolves the stored identifier instead of claiming none is held", async () => {
    await view.pressAndSettle(control());

    // The positive claim. A mutation reading the stored identifier as `null` takes the early return
    // at the top of `handleClick`, so `h.resume` stays empty and this fails.
    expect(h.resume).toEqual([{ storedId: STORED_ID }]);

    // WEAKNESS: asserts the identifier is SENT, not that the answer is USED. A component that sent
    // it and then ignored the reply would pass here. LA-2's tests are what observe the reply.
  });

  it("goes to screening when the browser holds nothing, without asking the server", async () => {
    h.storedId = null;
    view.unmount();
    view = mount(<LandingAction locale={EN} />);

    await view.pressAndSettle(control());

    // The control for the test above: if `readStoredValidatorId` were not consulted at all, this
    // path would be unreachable and the first test's `[{ storedId }]` could not exist. A first-time
    // visitor needs no message — screening is exactly where they belong.
    expect(h.resume).toEqual([]);
    expect(h.pushes).toEqual(["/start"]);
    expect(statusText()).toBeNull();

    // WEAKNESS: observes the destination, not the reason. A mutation that pushed `/start` for every
    // press would pass here and fail the tests below.
  });
});

describe("LA-2 — a recognised validator is navigated onward", () => {
  it("navigates to /validate when the server restores the identity", async () => {
    await view.pressAndSettle(control());

    expect(h.pushes).toEqual(["/validate"]);

    // WEAKNESS: observes the destination, not the timing. A mutation that pushed before awaiting
    // the server — navigating a validator whose identity was NOT recognised — passes here, and is
    // caught only by the next test.
  });

  it("does not navigate when the server recognises nobody", async () => {
    h.resumeResult = { status: "absent" };
    view.unmount();
    view = mount(<LandingAction locale={EN} />);

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
