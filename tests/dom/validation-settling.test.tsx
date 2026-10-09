import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ENTRY_TRANSITION_MS,
  ValidationSessionRunner,
} from "@/app/validate/[batchId]/validation-session";
import type { RequestNextEntryResult } from "@/lib/validation/next-entry-actions-core";
import type { SubmitValidationResult } from "@/lib/validation/validation-actions-core";
import type { AllocatedEntry } from "@/schemas/batch";

import { mount, type Mounted } from "./support/dom-harness";

/**
 * The entry transition — driven for real under fake timers.
 *
 * The runner enqueues the save at submit time, shows the layout-matched
 * skeleton for `ENTRY_TRANSITION_MS`, and only then reveals the next entry,
 * immediately interactive. The next entry's real sentence and form are never
 * rendered during the interval. Fake timers stand in for the 1500ms so no
 * test sleeps a real second and a half: every duration below is asserted
 * against the exported constant, never a retyped copy.
 *
 *   T-1   submit enqueues the save and shows the skeleton with no real sentence
 *   T-2   the skeleton carries no real sentence, no real form, no wait copy
 *   T-3   the interval ends at ~1500ms with the save still unresolved
 *   T-4   an early save confirmation does not shorten the interval
 *   T-5   a late save confirmation does not extend the interval
 *   T-6   presenting a third entry starts its own full interval
 *   T-7   same-entry re-renders and locale switches restart nothing and save nothing
 *   T-8   unmounting mid-interval cleans the timer up
 *   T-9   the single-flight latch still holds (double submit enqueues once)
 *   T-10  the final entry transitions with no sixth-entry timer
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

/** Move the transition clock inside `act` so React commits the expiry. */
async function advanceTransition(ms: number): Promise<void> {
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

function skeletonVisible(): boolean {
  return view.all('[data-skeleton="validation"]').length === 1;
}

beforeEach(() => {
  vi.useFakeTimers();
  h.pushes.length = 0;
  h.saves.length = 0;
  h.saveScript.length = 0;
  h.prefetchCalls.length = 0;
  h.prefetchScript.clear();
  // URL-routed on purpose: the retry-exhaustion beacon POSTs to `/api/ops-beacon`, and a
  // stub that consumed a scripted save answer for EVERY fetch would let the diagnostic
  // beacon steal the next save's answer. Only validation-responses touches the script;
  // anything else is acknowledged without recording.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      const url = typeof _url === "string" ? _url : String(_url ?? "");
      if (!url.includes("/api/validation-responses")) {
        return { json: async () => ({ status: "recorded" }) };
      }
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

describe("T-1 — submit saves in the background and shows the transition skeleton", () => {
  it("enqueues entry 1 and shows the skeleton with neither sentence while its save is still open", async () => {
    const saveGate = deferred<SubmitValidationResult>();
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.saveScript.push(() => saveGate.promise);
    mountRunner();
    await view.settle();

    await answerFully();
    await submitCurrent();

    expect(h.saves).toHaveLength(1);
    expect(skeletonVisible()).toBe(true);
    expect(instructionVisible("OD_0001")).toBe(false);
    expect(instructionVisible("OD_0002")).toBe(false);
  });
});

describe("T-2 — the transition shows a skeleton, never a disabled entry", () => {
  it("renders no real sentence and no real form, with no wait copy", async () => {
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.saveScript.push(async () => recordedFor("OD_0001"));
    mountRunner();
    await view.settle();

    await answerFully();
    await submitCurrent();
    await view.settle();

    expect(skeletonVisible()).toBe(true);
    expect(instructionVisible("OD_0001")).toBe(false);
    expect(instructionVisible("OD_0002")).toBe(false);
    // No real form is on screen during the transition.
    expect(view.all("form").length).toBe(0);
    expect(view.all('button[type="submit"]').length).toBe(0);
    // And the pause is never narrated: no countdown, no wait sentence, no saving commentary.
    expect(view.container.textContent).not.toMatch(/Saving…/);
    expect(view.container.textContent).not.toMatch(/please wait/i);
    expect(view.container.textContent).not.toMatch(/Preparing your sentences/);
    expect(view.container.textContent).not.toMatch(/Loading next sentence/);
  });
});

describe("T-3/T-4/T-5 — the interval answers only to its own clock", () => {
  it("reveals at ~1500ms with the save still unresolved", async () => {
    const saveGate = deferred<SubmitValidationResult>();
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.saveScript.push(() => saveGate.promise);
    mountRunner();
    await view.settle();

    await answerFully();
    await submitCurrent();
    await view.settle();

    // Still skeleton just before the deadline, save open the whole time.
    await advanceTransition(ENTRY_TRANSITION_MS - 1);
    expect(skeletonVisible()).toBe(true);
    expect(instructionVisible("OD_0002")).toBe(false);

    await advanceTransition(1);
    expect(skeletonVisible()).toBe(false);
    expect(instructionVisible("OD_0002")).toBe(true);
    // Revealed entry is immediately interactive: the submit control is enabled.
    const submit = view.one('button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    expect(submit.textContent).toBe("Save and continue");
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
    await advanceTransition(ENTRY_TRANSITION_MS - 1);
    expect(skeletonVisible()).toBe(true);

    await advanceTransition(1);
    expect(instructionVisible("OD_0002")).toBe(true);
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

    await advanceTransition(ENTRY_TRANSITION_MS * 3);
    // Revealed while the save is STILL open: the interval never waited on it.
    expect(skeletonVisible()).toBe(false);
    expect(instructionVisible("OD_0002")).toBe(true);

    await view.settle(() => {
      saveGate.resolve(recordedFor("OD_0001"));
    });
    expect(instructionVisible("OD_0002")).toBe(true);
  });
});

describe("T-6 — each transition gets its own full interval", () => {
  it("entry 3 shows its own full 1500ms skeleton after entry 2's interval elapsed", async () => {
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.prefetchScript.set(2, [async () => readyFor(2, E3)]);
    h.saveScript.push(async () => recordedFor("OD_0001"));
    h.saveScript.push(async () => recordedFor("OD_0002"));
    mountRunner();
    await view.settle();

    await answerFully();
    await submitCurrent();
    await view.settle();
    expect(skeletonVisible()).toBe(true);
    await advanceTransition(ENTRY_TRANSITION_MS);
    expect(instructionVisible("OD_0002")).toBe(true);

    await answerFully();
    await submitCurrent();
    await view.settle();
    expect(skeletonVisible()).toBe(true);
    expect(instructionVisible("OD_0003")).toBe(false);

    // Entry 3's own interval: still skeleton just before its deadline.
    await advanceTransition(ENTRY_TRANSITION_MS - 1);
    expect(skeletonVisible()).toBe(true);

    await advanceTransition(1);
    expect(skeletonVisible()).toBe(false);
    expect(instructionVisible("OD_0003")).toBe(true);
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

    await advanceTransition(1000);
    // Same entry, new locale: a re-render, not a change.
    view.rerender(
      <ValidationSessionRunner
        locale="fil"
        initial={{ batchId: BATCH_ID, entry: E1, position: 1, total: 3, completedCount: 0 }}
      />,
    );
    await view.settle();
    expect(skeletonVisible()).toBe(true);
    expect(h.saves.length).toBe(savesAfterSubmit);
    expect(h.prefetchCalls.length).toBe(prefetchesAfterSubmit);

    // The ORIGINAL deadline still holds: 500ms more reveals, not 1500 more.
    await advanceTransition(500);
    expect(skeletonVisible()).toBe(false);
    expect(instructionVisible("OD_0002")).toBe(true);
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
    await advanceTransition(ENTRY_TRANSITION_MS * 2);
  });
});

describe("T-9 — protection survives the transition render", () => {
  it("a double submit still enqueues exactly one response", async () => {
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
    expect(skeletonVisible()).toBe(true);
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
    await advanceTransition(ENTRY_TRANSITION_MS);

    await answerFully();
    await submitCurrent();
    await view.settle();

    expect(view.container.textContent).toContain("This batch is finished");
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("T-11 — a prefetch miss holds the generic skeleton until the fallback decides", () => {
  it("shows no fake entry while the prefetch is still unknown", async () => {
    const prefetchGate = deferred<RequestNextEntryResult>();
    const saveGate = deferred<SubmitValidationResult>();
    h.prefetchScript.set(1, [() => prefetchGate.promise]);
    h.saveScript.push(() => saveGate.promise);
    mountRunner();
    await view.settle();

    await answerFully();
    await submitCurrent();
    await view.settle();

    // Generic skeleton: no sentence, stable shape, no invented entry.
    expect(skeletonVisible()).toBe(true);
    expect(instructionVisible("OD_0001")).toBe(false);
    expect(instructionVisible("OD_0002")).toBe(false);

    // Prefetch resolves mid-transition: shape fills in, still skeleton until expiry.
    await view.settle(() => {
      prefetchGate.resolve(readyFor(1, E2));
    });
    expect(skeletonVisible()).toBe(true);
    expect(instructionVisible("OD_0002")).toBe(false);

    await advanceTransition(ENTRY_TRANSITION_MS);
    expect(instructionVisible("OD_0002")).toBe(true);
  });
});
