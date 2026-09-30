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
  /** Flushes pending microtasks inside `act`, letting React commit async state changes. */
  settle(): Promise<void>;
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
    async settle(): Promise<void> {
      await act(async () => {});
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
