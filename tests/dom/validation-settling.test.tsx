import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ENTRY_SETTLING_MS,
  ValidationSessionRunner,
} from "@/app/validate/[batchId]/validation-session";
import type { RequestNextEntryResult } from "@/lib/validation/next-entry-actions-core";
import type { SubmitValidationResult } from "@/lib/validation/validation-actions-core";
import type { AllocatedEntry } from "@/schemas/batch";

import { mount, type Mounted } from "./support/dom-harness";

/**
 * The entry-settling interval — driven for real under fake timers.
 *
 * The runner presents each newly transitioned entry immediately while keeping
 * its controls disabled for `ENTRY_SETTLING_MS`; the save starts at submit
 * time and the interval never observes it. Fake timers stand in for the
 * 2000ms so no test sleeps a real two seconds: every duration below is
 * asserted against the exported constant, never a retyped copy.
 *
 *   T-1   submit enqueues the save and presents the next entry with the save open
 *   T-2   the new entry is readable but every control is disabled, with no wait copy
 *   T-3   the interval ends at ~2000ms with the save still unresolved
 *   T-4   an early save confirmation does not shorten the interval
 *   T-5   a late save confirmation does not extend the interval
 *   T-6   presenting a third entry starts its own full interval
 *   T-7   same-entry re-renders and locale switches restart nothing and save nothing
 *   T-8   unmounting mid-interval cleans the timer up
 *   T-9   the single-flight latch still holds while settling renders disabled
 *   T-10  the final entry transitions with no sixth-entry timer
 *
 * WHAT THIS DOES NOT PROVE
 * `happy-dom` dispatches on disabled custom buttons the way the shared harness
 * already relies on, so "disabled" here is asserted as rendered semantics
 * (every control carries `disabled`), not as a browser refusing a click — a
 * real browser's refusal is a separate, human step.
 */

const BATCH_ID = "VAL_0a1b2c3d-:2026-09-30T12:00:00.000Z";

function entry(id: string, position: number): AllocatedEntry {
  return {
    id,
    category: "origin_destination",
    instruction: `Instruction sentence for ${id}.`,
    origin: null,
    destination: `Destination ${position}`,
    transitMode: null,
  };
}

const E1 = entry("OD_0001", 1);
const E2 = entry("OD_0002", 2);
const E3 = entry("OD_0003", 3);

function readyFor(position: number, next: AllocatedEntry): RequestNextEntryResult {
  return {
    status: "ready",
    entry: next,
    position: position + 1,
    total: 3,
    completedCount: position,
  };
}

const FINISHED: RequestNextEntryResult = { status: "finished" };

function recordedFor(id: string): SubmitValidationResult {
  return { status: "recorded", responseId: `rsp_${id}`, datasetEntryId: id };
}

const h = vi.hoisted(() => ({
  pushes: [] as string[],
  saveScript: [] as Array<() => Promise<SubmitValidationResult>>,
  saves: [] as unknown[],
  prefetchScript: new Map<number, Array<() => Promise<RequestNextEntryResult>>>(),
  prefetchCalls: [] as unknown[],
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

vi.mock("@/lib/validation/next-entry-actions", () => ({
  requestNextEntryAction: vi.fn(async (raw: unknown) => {
    h.prefetchCalls.push(raw);
    const position = (raw as { position: number }).position;
    const script = h.prefetchScript.get(position);
    const next = script?.shift();
    if (next === undefined) throw new Error(`prefetch for position ${position} with no answer`);
    return next();
  }),
}));

vi.mock("@/lib/validation/verify-batch-actions", () => ({
  verifyBatchResponsesAction: vi.fn(async () => {
    return { status: "verified", complete: true, missing: [], total: 0 };
  }),
}));

vi.mock("@/lib/validation/start-validation-actions", () => ({
  requestStartValidationAction: vi.fn(async () => ({ status: "failed", reason: "persistence" })),
}));

vi.mock("@/lib/validators/browser-identity", () => ({
  readStoredValidatorId: vi.fn(() => null),
  writeStoredValidatorId: vi.fn(() => {}),
  clearStoredValidatorId: vi.fn(() => {}),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let view: Mounted;

function mountRunner(locale: "en" | "fil" = "en"): void {
  view = mount(
    <ValidationSessionRunner
      locale={locale}
      initial={{
        batchId: BATCH_ID,
        entry: E1,
        position: 1,
        total: 3,
        completedCount: 0,
      }}
    />,
  );
}

/** Move the settling clock inside `act` so React commits the expiry. */
async function advanceSettling(ms: number): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

async function answerFully(): Promise<void> {
  const group = view.all('[role="radiogroup"]')[0] as HTMLElement;
  const buttons = Array.from(group.querySelectorAll('button[role="radio"]'));
  await view.pressAndSettle(buttons[0]!);
  const groups = view.all('[role="radiogroup"]');
  const choice = (groups[1] as HTMLElement).querySelectorAll('button[role="radio"]');
  await view.pressAndSettle(choice[3]!);
}

async function submitCurrent(): Promise<void> {
  await view.submitFormAndSettle(view.one("form"));
}

function instructionVisible(id: string): boolean {
  return (view.container.textContent ?? "").includes(`Instruction sentence for ${id}.`);
}

/** Every interactive control of the presented entry: four evaluation radios + submit. */
function entryControls(): { radios: Element[]; submit: HTMLButtonElement } {
  const group = view.all('[role="radiogroup"]')[0] as HTMLElement;
  const radios = Array.from(group.querySelectorAll('button[role="radio"]'));
  const submit = view.one('button[type="submit"]') as HTMLButtonElement;
  return { radios, submit };
}

beforeEach(() => {
  vi.useFakeTimers();
  h.pushes.length = 0;
  h.saves.length = 0;
  h.saveScript.length = 0;
  h.prefetchCalls.length = 0;
  h.prefetchScript.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      h.saves.push(typeof init?.body === "string" ? JSON.parse(init.body) : null);
      const next = h.saveScript.shift();
      if (next === undefined) throw new Error("save with no scripted answer");
      const outcome = await next();
      if (outcome.status === "recorded") {
        return { json: async () => ({ status: "recorded", responseId: outcome.responseId }) };
      }
      if (outcome.status === "already_recorded") {
        return { json: async () => ({ status: "already_recorded" }) };
      }
      return { json: async () => ({ status: "failed", reason: outcome.reason }) };
    }),
  );
});

afterEach(() => {
  view.unmount();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("T-1 — submit saves in the background and presents the next entry at once", () => {
  it("enqueues entry 1 and shows entry 2 while its save is still open", async () => {
    const saveGate = deferred<SubmitValidationResult>();
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.saveScript.push(() => saveGate.promise);
    mountRunner();
    await view.settle();

    await answerFully();
    await submitCurrent();

    expect(h.saves).toHaveLength(1);
    expect(instructionVisible("OD_0002")).toBe(true);
    expect(instructionVisible("OD_0001")).toBe(false);
  });
});

describe("T-2 — the new entry settles before accepting input", () => {
  it("keeps every control disabled while the sentence stays readable, with no wait copy", async () => {
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.saveScript.push(async () => recordedFor("OD_0001"));
    mountRunner();
    await view.settle();

    await answerFully();
    await submitCurrent();
    await view.settle();

    // Readable: the new sentence is on screen immediately.
    expect(instructionVisible("OD_0002")).toBe(true);
    // Unanswerable: every interactive control carries real disabled semantics.
    const { radios, submit } = entryControls();
    expect(radios).toHaveLength(4);
    for (const radio of radios) {
      expect((radio as HTMLButtonElement).disabled).toBe(true);
    }
    expect(submit.disabled).toBe(true);
    // And the pause is never narrated: the label is the ordinary one, with no
    // countdown, no wait sentence, and no saving commentary. (The evaluation
    // hint legitimately contains the word "second", so that word alone is not
    // asserted absent; what is asserted is the absence of wait-themed copy.)
    expect(submit.textContent).toBe("Save and continue");
    expect(view.container.textContent).not.toMatch(/Saving…/);
    expect(view.container.textContent).not.toMatch(/please wait/i);
    expect(view.container.textContent).not.toMatch(/Preparing your sentences/);
    expect(view.container.getAttribute("aria-busy")).toBeNull();
  });
});

describe("T-3/T-4/T-5 — the interval answers only to its own clock", () => {
  it("enables at ~2000ms with the save still unresolved", async () => {
    const saveGate = deferred<SubmitValidationResult>();
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.saveScript.push(() => saveGate.promise);
    mountRunner();
    await view.settle();

    await answerFully();
    await submitCurrent();
    await view.settle();

    // Still settling just before the deadline, save open the whole time.
    await advanceSettling(ENTRY_SETTLING_MS - 1);
    expect(entryControls().submit.disabled).toBe(true);

    await advanceSettling(1);
    expect(entryControls().submit.disabled).toBe(false);
    for (const radio of entryControls().radios) {
      expect((radio as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it("an early save confirmation does not shorten the interval", async () => {
    const saveGate = deferred<SubmitValidationResult>();
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.saveScript.push(() => saveGate.promise);
    mountRunner();
    await view.settle();

    await answerFully();
    await submitCurrent();
    await view.settle();

    await view.settle(() => {
      saveGate.resolve(recordedFor("OD_0001"));
    });
    await advanceSettling(ENTRY_SETTLING_MS - 1);
    expect(entryControls().submit.disabled).toBe(true);

    await advanceSettling(1);
    expect(entryControls().submit.disabled).toBe(false);
  });

  it("a late save confirmation does not extend the interval", async () => {
    const saveGate = deferred<SubmitValidationResult>();
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.saveScript.push(() => saveGate.promise);
    mountRunner();
    await view.settle();

    await answerFully();
    await submitCurrent();
    await view.settle();

    await advanceSettling(ENTRY_SETTLING_MS * 3);
    // Enabled while the save is STILL open: the interval never waited on it.
    expect(entryControls().submit.disabled).toBe(false);

    await view.settle(() => {
      saveGate.resolve(recordedFor("OD_0001"));
    });
    expect(instructionVisible("OD_0002")).toBe(true);
  });
});

describe("T-6 — each new entry gets its own full interval", () => {
  it("entry 3 settles for its own full 2000ms after entry 2's interval elapsed", async () => {
    // NOTE on what this does and does not prove (measured, not assumed):
    // answering an entry requires enabled controls, so a newer entry can only
    // ever be presented after the older entry's interval fully elapsed — timer
    // overlap through the UI is unreachable by construction, and the updater's
    // identity check (`current === presentedId`) is belt-and-braces for
    // non-UI timer sources rather than a tested guard. What IS reachable, and
    // what this proves, is that every presented entry gets its own full
    // interval: entry 3 stays disabled for its own ~2000ms even though entry
    // 2's timer fired long ago.
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.prefetchScript.set(2, [async () => readyFor(2, E3)]);
    h.saveScript.push(async () => recordedFor("OD_0001"));
    h.saveScript.push(async () => recordedFor("OD_0002"));
    mountRunner();
    await view.settle();

    await answerFully();
    await submitCurrent();
    await view.settle();
    expect(instructionVisible("OD_0002")).toBe(true);
    await advanceSettling(ENTRY_SETTLING_MS);
    expect(entryControls().submit.disabled).toBe(false);

    await answerFully();
    await submitCurrent();
    await view.settle();
    expect(instructionVisible("OD_0003")).toBe(true);

    // Entry 3's own interval: still settling just before its deadline.
    await advanceSettling(ENTRY_SETTLING_MS - 1);
    expect(entryControls().submit.disabled).toBe(true);

    await advanceSettling(1);
    expect(entryControls().submit.disabled).toBe(false);
  });
});

describe("T-7 — same-entry renders and locale switches change nothing", () => {
  it("neither restarts the timer, saves, prefetches, nor advances", async () => {
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.saveScript.push(async () => recordedFor("OD_0001"));
    mountRunner();
    await view.settle();

    await answerFully();
    await submitCurrent();
    await view.settle();
    const savesAfterSubmit = h.saves.length;
    const prefetchesAfterSubmit = h.prefetchCalls.length;

    await advanceSettling(1500);
    // Same entry, new locale: a re-render, not a change.
    view.rerender(
      <ValidationSessionRunner
        locale="fil"
        initial={{ batchId: BATCH_ID, entry: E1, position: 1, total: 3, completedCount: 0 }}
      />,
    );
    await view.settle();
    expect(instructionVisible("OD_0002")).toBe(true);
    expect(h.saves.length).toBe(savesAfterSubmit);
    expect(h.prefetchCalls.length).toBe(prefetchesAfterSubmit);

    // The ORIGINAL deadline still holds: 500ms more enables, not 2000 more.
    await advanceSettling(500);
    expect(entryControls().submit.disabled).toBe(false);
  });
});

describe("T-8 — unmounting cleans the timer up", () => {
  it("leaves no pending timer behind", async () => {
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.saveScript.push(async () => recordedFor("OD_0001"));
    mountRunner();
    await view.settle();

    await answerFully();
    await submitCurrent();
    await view.settle();
    expect(vi.getTimerCount()).toBe(1);

    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
    // Advancing the clock after unmount fires nothing and throws nothing.
    await advanceSettling(ENTRY_SETTLING_MS * 2);
  });
});

describe("T-9 — protection survives the settling render", () => {
  it("a double submit while settling still enqueues exactly one response", async () => {
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.saveScript.push(async () => recordedFor("OD_0001"));
    mountRunner();
    await view.settle();

    await answerFully();
    // Two submits in ONE task against the live form: the second meets the
    // closed latch, not a detached node, so one enqueue is the latch working.
    const target = view.one("form");
    await act(async () => {
      target.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      target.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(h.saves).toHaveLength(1);
    expect(instructionVisible("OD_0002")).toBe(true);
  });
});

describe("T-10 — the final entry creates no further interval", () => {
  it("transitions to the finished card with no timer pending", async () => {
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.prefetchScript.set(2, [async () => FINISHED]);
    h.saveScript.push(async () => recordedFor("OD_0001"));
    h.saveScript.push(async () => recordedFor("OD_0002"));
    mountRunner();
    await view.settle();

    await answerFully();
    await submitCurrent();
    await view.settle();
    await advanceSettling(ENTRY_SETTLING_MS);

    await answerFully();
    await submitCurrent();
    await view.settle();

    expect(view.container.textContent).toContain("This batch is finished");
    expect(vi.getTimerCount()).toBe(0);
  });
});
