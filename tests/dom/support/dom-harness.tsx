/**
 * Shared DOM helpers for the `dom` Vitest project.
 *
 * WHY THIS FILE HAS NO MOCKS
 * --------------------------
 * `vi.mock` factories are hoisted above every import and are **per file**, so a shared mock module
 * cannot work: each test file needs its own `vi.hoisted` recorders, because a recorder created at
 * module scope in *this* file would be a different object by the time a test file's own factory
 * runs. So the harness holds only what is genuinely shareable — mounting, dispatching, and querying
 * — and every test file owns its recorders.
 *
 * WHY `act` AND NOT @testing-library
 * ----------------------------------
 * `act` is exported by React itself and `createRoot` by `react-dom/client`, so a DOM project costs
 * one dependency instead of three, and no third party decides how a click is synthesised. See
 * `openspec/changes/thin-shell-call-sites/design.md` D1.
 *
 * WHY `IS_REACT_ACT_ENVIRONMENT` IS SET HERE
 * -------------------------------------------
 * `act` refuses to drive React outside a test environment unless the flag is set, and React then
 * logs a warning and may not flush the update. A test that asserts on a flushed DOM while running
 * with flushing disabled passes for the wrong reason, so the flag is set once, here, rather than
 * copied into each file. It is assigned through a cast instead of a `declare global { var }`,
 * which would need an eslint suppression and a bare `var`.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  /** The element the component was rendered into, attached to `document.body`. */
  readonly container: HTMLDivElement;
  /** Exactly one match, or a thrown error naming the selector and the count. */
  one<T extends Element>(selector: string): T;
  /** Zero or more matches, in document order. */
  all(selector: string): Element[];
  /**
   * Dispatches a click inside a SYNCHRONOUS `act`, so React commits the resulting state before
   * control returns.
   *
   * This is the form to use when observing a PENDING state: a never-resolving action leaves the
   * transition open, and `pressAndSettle` would await a promise that never resolves.
   */
  press(target: Element): void;
  /**
   * Dispatches `count` clicks inside **ONE** synchronous `act`.
   *
   * ── WHY `press` TWICE IS NOT THE SAME EXPERIMENT, AND THIS IS THE POINT OF THE METHOD ────────────────
   * `press` opens and closes its own `act`, and React commits at the close. So two `press` calls are
   * two tasks: the first commits `disabled`, and the second press meets a button that is already
   * `disabled`. Any assertion built on two `press` calls is therefore a test of `disabled` alone.
   *
   * That distinction hid a real gap. `finished-batch.tsx` guards its request with BOTH `disabled`
   * (what the participant sees) and a synchronous ref latch (what makes the guarantee), and the
   * finished screen's DOM test used two `press` calls to claim it covered the same-task case. It did
   * not: **deleting the latch outright left the whole DOM suite green**, because the second press was
   * always stopped by `disabled` and never by the latch. A guard with no failing mutation is not a
   * guard, and this repository has a documented rule that a check which cannot fail must not be
   * reported as coverage.
   *
   * `pressMany` reproduces what a browser actually does when a participant double-clicks: both clicks
   * are dispatched before React has committed anything, so both handlers run and both read the same
   * committed state. In a real browser that is exactly the race the latch exists to win. With the
   * clicks inside one `act` the latch becomes observable here, and its removal turns this red.
   *
   * The count must be at least 1 — a zero-count call would be a no-op that silently proves nothing,
   * which is the same defect in a smaller size.
   */
  pressMany(target: Element, count: number): void;
  /**
   * Flushes pending microtasks inside `act`, letting React commit async state changes.
   *
   * Takes an optional callback that runs INSIDE that same `act`, which is how a state change with no
   * DOM event of its own gets wrapped: releasing a deferred write is a state change, and releasing it
   * outside `act` is what produced this project's last remaining
   * "A suspended resource finished loading inside a test" warning.
   */
  settle(run?: () => void): Promise<void>;
  /** Click and let every pending promise resolve. Use only for resolvable work. */
  pressAndSettle(target: Element): Promise<void>;
  /**
   * Dispatches `submit` on a form inside a SYNCHRONOUS `act`, for observing a pending state.
   *
   * Dispatched directly on the form rather than by clicking its submit button: a submit button's
   * activation is browser behaviour with its own quirks, and the behaviour under test is the
   * `onSubmit` handler either way — the same handler a real click reaches. One less dependency on
   * `happy-dom`'s form fidelity, which nothing here has verified.
   */
  submitForm(form: HTMLFormElement): void;
  /** Dispatch `submit` and let the resulting promises resolve. */
  submitFormAndSettle(form: HTMLFormElement): Promise<void>;
  /**
   * Dispatches an arbitrary event inside a SYNCHRONOUS `act`.
   *
   * Added because `press` and `submitForm` cover only the two events this project's controls use,
   * and typing into a controlled field dispatches `input` — which React applies as an update, and an
   * update dispatched outside `act` is a warning *and* an unflushed commit. The first draft of the
   * validation form's DOM tests called `field.dispatchEvent(...)` directly and produced **95**
   * `not wrapped in act(...)` warnings across the file. Each was followed by an explicit `settle()`,
   * so no assertion was reading a stale DOM and all of them passed — but a suite that emits 95
   * warnings is a suite nobody re-reads carefully, and this project's claim that its `dom` bars were
   * "proved red before any guard depended on them" depends on the output being legible.
   *
   * The general form is kept rather than an `input`-specific helper so the next control that needs
   * `change` or `blur` does not reintroduce the same defect in a new place.
   */
  dispatch(target: Element, event: Event): void;
  unmount(): void;
}

export function mount(element: ReactElement): Mounted {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(element);
  });

  return {
    container,
    one<T extends Element>(selector: string): T {
      const found = container.querySelectorAll(selector);
      if (found.length !== 1) {
        throw new Error(
          `expected exactly one "${selector}" but found ${found.length}. ` +
            `A guard that silently accepts "zero" or "two" here would be testing nothing, ` +
            `so this throws rather than returning the first match.`,
        );
      }
      return found[0] as T;
    },
    all(selector: string): Element[] {
      return [...container.querySelectorAll(selector)];
    },
    press(target: Element): void {
      act(() => {
        target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    pressMany(target: Element, count: number): void {
      // Refused rather than accepted: `pressMany(el, 0)` would assert nothing while looking like
      // a test of something, and `pressMany(el, -1)` would silently dispatch nothing at all.
      if (!Number.isInteger(count) || count < 1) {
        throw new Error(
          `pressMany requires a positive integer count, got ${String(count)}. ` +
            `A zero or negative count would dispatch nothing and pass while testing nothing.`,
        );
      }
      act(() => {
        for (let i = 0; i < count; i += 1) {
          target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
        }
      });
    },
    async settle(run?: () => void): Promise<void> {
      await act(async () => {
        run?.();
      });
    },
    async pressAndSettle(target: Element): Promise<void> {
      await act(async () => {
        target.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    submitForm(form: HTMLFormElement): void {
      act(() => {
        form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      });
    },
    async submitFormAndSettle(form: HTMLFormElement): Promise<void> {
      await act(async () => {
        form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      });
    },
    dispatch(target: Element, event: Event): void {
      act(() => {
        target.dispatchEvent(event);
      });
    },
    unmount(): void {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

/**
 * A promise that never settles, so a `useTransition` stays pending and the window *during* a write
 * is observable. This is the only way to reach the state `renderToStaticMarkup` provably cannot,
 * and it is the state in which a participant can double-submit.
 */
export function neverResolves(): Promise<never> {
  return new Promise<never>(() => {});
}
