/**
 * =================================================================================================
 * FEASIBILITY SPIKE — the whole approach depends on this file. Read `design.md` D1 before the code.
 * =================================================================================================
 *
 * This is NOT a guard for any specified behaviour. It is a spike, and it exists to answer one
 * question before seven guards are written against the answer:
 *
 *     Can a test in this project observe what a client component's EVENT HANDLERS actually do?
 *
 * Why that question is unavoidable, stated as a measurement rather than a worry:
 *
 *   - `renderToStaticMarkup` never runs an effect and never fires a click handler.
 *   - `renderToStaticMarkup` can only ever see the IDLE state, so a pending state is unreachable.
 *
 * Both are documented in `tests/unit/onboarding-routes.test.tsx` and were adopted there
 * deliberately. But every one of the four CRITICAL unguarded call sites behind this change is an
 * event-handler or wiring fact — `readStoredValidatorId()` inside `handleClick`, `router.push`
 * inside `handleClick`, the answer handed to a Server Action inside `onSubmit`, and a button's
 * `disabled` binding that is only true while pending. None is observable without a DOM. At the time
 * of writing, `submitState` and `router.push` had **0 hits** anywhere in `tests/unit`.
 *
 * THE TWO BARS, both of which must hold
 * ------------------------------------
 *   BAR A (task 1.1) — render `ResumeValidator`, dispatch a real click, observe `router.push`
 *                      recorded with `/ready`.
 *   BAR B (task 1.2) — observe the PENDING state, not only the idle one. A never-resolving action
 *                      stub must leave the control disabled and `aria-busy`.
 *
 * BAR B is the half that matters and the half most likely to fail. A DOM that can render the idle
 * state proves very little: static markup already did that. What is unobtainable today is the
 * window *during* a write, which is precisely when a participant can double-submit.
 *
 * WHY NO @testing-library
 * -----------------------
 * `act` is exported by React itself (19.2.8, verified) and `createRoot` by `react-dom/client`, so a
 * DOM project costs ONE dependency (`happy-dom`) instead of three, and no third party gets to
 * decide how a click is synthesised. If a guard here is ever hard to explain, that trade is
 * revisited — but it starts from the smaller surface.
 *
 * WHAT THIS SPIKE DOES NOT ESTABLISH
 * ----------------------------------
 * It says nothing about whether `happy-dom` behaves like a browser for anything subtler than a
 * click, a disabled attribute, and `aria-busy`. It is not a substitute for a human opening the app,
 * which nobody in this project has ever done for any screen.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LandingAction } from "@/components/onboarding/resume-validator";

/**
 * `act` refuses to drive React outside a test environment unless this flag is set. Without it
 * React logs a warning and the update may not be flushed, which would make this file's results
 * meaningless in the one way that matters — a spike that passes for the wrong reason.
 */
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Hoisted so the `vi.mock` factories — which are lifted above every import — can close over the
 * same recorder the assertions read. A recorder created at module scope would be a *different*
 * object by the time the factories run, and every assertion would read `[]`.
 */
const h = vi.hoisted(() => ({
  pushes: [] as string[],
  /** Resolves the resume lookup. Left pending by BAR B to hold the transition open. */
  resume: null as null | { (): Promise<unknown> },
  storedId: "v-0123456789abcdef0123456789abcdef",
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

vi.mock("@/lib/validators/actions", () => ({
  resumeValidatorAction: vi.fn(async () => {
    if (h.resume) return h.resume();
    return { status: "restored", validatorId: h.storedId };
  }),
  // `status: "enrolled"` is the real `EnrollActionResult` vocabulary. This mock originally returned
  // `"created"`, which does not exist and drives `decideEnrollment` down its FAILURE branch — a
  // wrong literal that went unnoticed precisely because no test in this file calls enroll, which is
  // exactly the "a test that appears to cover something and does not" shape this repository has
  // found before. Corrected while writing `tests/dom/screening-form.test.tsx`, which does.
  enrollValidatorAction: vi.fn(async () => ({ status: "enrolled", validatorId: h.storedId })),
}));

vi.mock("@/lib/validators/browser-identity", () => ({
  readStoredValidatorId: () => h.storedId,
  writeStoredValidatorId: () => undefined,
  clearStoredValidatorId: () => undefined,
}));

/** Mounts into a real container so React attaches its listeners the way it does in a browser. */
let container: HTMLDivElement;
let root: Root;

function mount(): void {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<LandingAction locale="en" />);
  });
}

function control(): HTMLButtonElement {
  const found = container.querySelector("button");
  if (!found) throw new Error("no button rendered");
  return found as HTMLButtonElement;
}

/** A promise that never settles, so the transition stays open for BAR B. */
function neverResolves(): Promise<never> {
  return new Promise<never>(() => {});
}

beforeEach(() => {
  h.pushes.length = 0;
  h.resume = null;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();
});

describe("BAR A — a real click is observable", () => {
  it("renders the resume control", () => {
    mount();
    expect(control()).toBeTruthy();
    expect(control().textContent).not.toBe("");
  });

  it("navigates to /validate when a stored identity is restored", async () => {
    mount();
    await act(async () => {
      control().click();
    });
    expect(h.pushes).toEqual(["/validate"]);
  });

  it("does not navigate without a click — the control's own negative", async () => {
    mount();
    await act(async () => {});
    expect(h.pushes).toEqual([]);
  });
});

describe("BAR B — the PENDING window is observable", () => {
  it("marks the control busy and disabled while the write is in flight", async () => {
    mount();
    h.resume = neverResolves;

    expect(control().disabled).toBe(false);
    expect(control().getAttribute("aria-busy")).toBeNull();

    // Start the transition without awaiting the work it is waiting on.
    act(() => {
      control().click();
    });
    // Let React commit the pending state. The stub never resolves, so nothing closes the window.
    await act(async () => {});

    expect(control().disabled).toBe(true);
    expect(control().getAttribute("aria-busy")).toBe("true");
  });
});
