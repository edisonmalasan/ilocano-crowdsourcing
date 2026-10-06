import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ValidationSessionRunner } from "@/app/validate/[batchId]/validation-session";
import type { RequestNextEntryResult } from "@/lib/validation/next-entry-actions-core";
import type { SubmitValidationResult } from "@/lib/validation/validation-actions-core";
import { EVALUATION_CHOICES } from "@/schemas/validation";
import type { AllocatedEntry } from "@/schemas/batch";

import { mount, type Mounted } from "./support/dom-harness";

/**
 * The optimistic session runner, driven for real.
 *
 * The Server Actions behind it are scripted deferreds: a save that stays unresolved while the
 * session has already moved on is an ordinary arrangement here, and every resolution is
 * released inside `act` so React's queue is empty before the next test mounts (the lesson
 * `validation-form.test.tsx` records about cross-test contamination).
 *
 *   S-1   mounting prefetches exactly the next position, carrying batch id and position only
 *   S-2   the prefetched sentence is never in the markup before its turn
 *   S-3   submit advances instantly while the save is still open (Saving, not Saved)
 *   S-4   the late confirmation marks Saved without touching the new entry's form
 *   S-5   already_recorded counts as synchronized
 *   S-6   a stale prefetch resolution is discarded, never rendered
 *   S-7   transient failure retries automatically and retains the response
 *   S-8   permanent refusal is never retried; the answer is recoverable, not dropped
 *   S-9   two pending saves still advance; the third pauses with plain copy and resumes
 *   S-10  the final entry drains before any navigation; Finish is unreachable until then
 *   S-11  no usable prefetch falls back to confirm-then-navigate
 *   S-12  double submit sends once (latch plus queue idempotency)
 *   S-13  locale re-render prefetches nothing, saves nothing, keeps typed input
 *   S-14  leaving warns while saves are pending, and stops warning once drained
 *
 * WHAT THIS DOES NOT PROVE
 * `happy-dom` is a SYNTHETIC DOM: no layout, no paint timing, no real navigation. "Instant" here
 * means the entry swaps without awaiting the write round trip — observed as DOM state, not
 * measured in milliseconds. Real-browser timing is a separate, human step.
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

const PERSISTENCE: SubmitValidationResult = { status: "failed", reason: "persistence" };

const h = vi.hoisted(() => ({
  pushes: [] as string[],
  /** Scripted save answers, consumed FIFO. */
  saveScript: [] as Array<() => Promise<SubmitValidationResult>>,
  saves: [] as unknown[],
  /** Scripted prefetch answers keyed by requested position, consumed FIFO per position. */
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

vi.mock("@/lib/validation/actions", () => ({
  submitValidationAction: vi.fn(async (raw: unknown) => {
    h.saves.push(raw);
    const next = h.saveScript.shift();
    if (next === undefined) throw new Error("save with no scripted answer");
    return next();
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let view: Mounted;

function mountRunner(initial = { entry: E1, position: 1 }): void {
  view = mount(
    <ValidationSessionRunner
      locale="en"
      initial={{
        batchId: BATCH_ID,
        entry: initial.entry,
        position: initial.position,
        total: 3,
        completedCount: initial.position - 1,
      }}
    />,
  );
}

function answerFully(): (index: number) => Promise<void> {
  return async (index: number) => {
    const group = view.all('[role="radiogroup"]')[0] as HTMLElement;
    const buttons = Array.from(group.querySelectorAll('button[role="radio"]'));
    await view.pressAndSettle(buttons[index]!);
    const value = EVALUATION_CHOICES[index]?.value;
    if (value !== "cannot_evaluate") {
      const groups = view.all('[role="radiogroup"]');
      const choice = (groups[1] as HTMLElement).querySelectorAll('button[role="radio"]');
      await view.pressAndSettle(choice[3]!);
    }
  };
}

async function submitCurrent(): Promise<void> {
  await view.submitFormAndSettle(view.one("form"));
}

function instructionVisible(id: string): boolean {
  return (view.container.textContent ?? "").includes(`Instruction sentence for ${id}.`);
}

beforeEach(() => {
  h.pushes.length = 0;
  h.saves.length = 0;
  h.saveScript.length = 0;
  h.prefetchCalls.length = 0;
  h.prefetchScript.clear();
});

afterEach(() => {
  view.unmount();
  vi.clearAllMocks();
});

describe("S-1 — mounting prefetches exactly the next position", () => {
  it("requests batch id and position only, and nothing else", async () => {
    const gate = deferred<RequestNextEntryResult>();
    h.prefetchScript.set(1, [() => gate.promise]);
    mountRunner();
    await view.settle();

    expect(h.prefetchCalls).toEqual([{ batchId: BATCH_ID, position: 1 }]);
    gate.resolve(readyFor(1, E2));
    await view.settle();
  });

  it("fires one prefetch per presented entry, never the whole batch", async () => {
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.saveScript.push(async () => recordedFor("OD_0001"));
    mountRunner();
    await view.settle();

    await answerFully()(0);
    await submitCurrent();

    await view.settle();
    // The advance consumed the position-1 prefetch; exactly one position-2 prefetch follows.
    expect(
      h.prefetchCalls.filter((call) => (call as { position: number }).position === 2),
    ).toHaveLength(1);
    expect(h.prefetchCalls).toHaveLength(2);
  });
});

describe("S-2 — the prefetched sentence is never exposed before its turn", () => {
  it("holds the next entry without rendering its sentence", async () => {
    const gate = deferred<RequestNextEntryResult>();
    h.prefetchScript.set(1, [() => gate.promise]);
    mountRunner();
    await view.settle();

    gate.resolve(readyFor(1, E2));
    await view.settle();

    expect(instructionVisible("OD_0001")).toBe(true);
    expect(instructionVisible("OD_0002")).toBe(false);
  });
});

describe("S-3/S-4 — instant advance with a save still open", () => {
  it("shows the next entry immediately, Saving now and Saved on confirmation", async () => {
    const saveGate = deferred<SubmitValidationResult>();
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.prefetchScript.set(2, [async () => readyFor(2, E3)]);
    h.saveScript.push(() => saveGate.promise);
    mountRunner();
    await view.settle();

    await answerFully()(0);
    await submitCurrent();

    // Advanced WITHOUT awaiting the write: E2 on screen, save still open.
    expect(instructionVisible("OD_0002")).toBe(true);
    expect(instructionVisible("OD_0001")).toBe(false);
    expect(view.container.textContent).toMatch(/Saving/);
    expect(view.container.textContent).not.toMatch(/Saved/);
    // Exactly one save, for the answered entry — the advance sent nothing itself.
    expect(h.saves).toHaveLength(1);

    await view.settle(() => {
      saveGate.resolve(recordedFor("OD_0001"));
    });
    expect(view.container.textContent).toMatch(/Saved/);
  });

  it("a late confirmation never touches the new entry's form", async () => {
    const saveGate = deferred<SubmitValidationResult>();
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.prefetchScript.set(2, [async () => readyFor(2, E3)]);
    h.saveScript.push(() => saveGate.promise);
    mountRunner();
    await view.settle();

    await answerFully()(0);
    await submitCurrent();
    // Type into the NEW entry while the old save is still open.
    const group = view.all('[role="radiogroup"]')[0] as HTMLElement;
    const buttons = Array.from(group.querySelectorAll('button[role="radio"]'));
    await view.pressAndSettle(buttons[3]!);

    await view.settle(() => {
      saveGate.resolve(recordedFor("OD_0001"));
    });

    // The new entry's answer survived the old entry's confirmation.
    const checked = view.all('button[role="radio"][aria-checked="true"]');
    expect(checked).toHaveLength(1);
    expect(checked[0]?.textContent).toMatch(/Cannot confidently evaluate/);
  });

  it("already_recorded counts as synchronized", async () => {
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.prefetchScript.set(2, [async () => readyFor(2, E3)]);
    h.saveScript.push(async () => ({ status: "already_recorded", datasetEntryId: "OD_0001" }));
    mountRunner();
    await view.settle();

    await answerFully()(0);
    await submitCurrent();

    expect(instructionVisible("OD_0002")).toBe(true);
    expect(view.container.textContent).toMatch(/Saved/);
  });
});

describe("S-6 — a stale prefetch resolution is discarded", () => {
  it("a prefetch that outlives its mount paints nothing anywhere", async () => {
    // The discarded flag exists for exactly this shape: a prefetch requested by a session that
    // is gone by the time it resolves. Two mounts share the module mock; the first one's
    // answer arrives after it unmounted. If the resolution ever wrote to module-shared state
    // instead of the requesting instance, the second session would show the first one's
    // sentence — so the bogus entry is deliberately one no real prefetch would name.
    const bogus = entry("OD_0009", 9);
    const slow = deferred<RequestNextEntryResult>();
    h.prefetchScript.set(1, [() => slow.promise]);
    h.prefetchScript.set(2, [async () => readyFor(2, E3)]);
    mountRunner();
    await view.settle();
    view.unmount();

    mountRunner({ entry: E2, position: 2 });
    await view.settle();
    slow.resolve(readyFor(1, bogus));
    await view.settle();

    expect(instructionVisible("OD_0009")).toBe(false);
    expect(instructionVisible("OD_0002")).toBe(true);
    expect(h.prefetchCalls).toHaveLength(2);
  });
});

describe("S-7/S-8 — failure, retry, and refusal", () => {
  it("a transient failure retries automatically with the response retained", async () => {
    const first = deferred<SubmitValidationResult>();
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.prefetchScript.set(2, [async () => readyFor(2, E3)]);
    h.saveScript.push(
      () => first.promise,
      async () => recordedFor("OD_0001"),
    );
    mountRunner();
    await view.settle();

    await answerFully()(0);
    await submitCurrent();
    expect(instructionVisible("OD_0002")).toBe(true);

    // Fail the first attempt. The retry waits out the real 500ms backoff — advanced here
    // with a real timer inside `act` rather than fake timers, which would put React's own
    // scheduling on a clock this harness does not own.
    await view.settle(() => {
      first.resolve(PERSISTENCE);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 650));
    });
    // The queue retried on its own: two submissions, still advancing, Saved at the end.
    expect(h.saves).toHaveLength(2);
    expect(view.container.textContent).toMatch(/Saved/);
  });

  it("a permanent refusal is never retried and stays recoverable", async () => {
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.prefetchScript.set(2, [async () => readyFor(2, E3)]);
    h.saveScript.push(async () => ({ status: "failed", reason: "not_in_batch" }));
    mountRunner();
    await view.settle();

    await answerFully()(0);
    await submitCurrent();

    // Advanced (the entry was answerable), but the refusal parks the response: exactly one
    // submission, an alert naming the failure, and no silent drop.
    expect(h.saves).toHaveLength(1);
    expect(view.one('[role="alert"]').textContent).toMatch(/nothing was saved/i);
    // No retry storm for a refusal that re-sending cannot fix.
    await view.settle();
    expect(h.saves).toHaveLength(1);
  });
});

describe("S-9 — the backlog bound pauses and resumes advancement", () => {
  it("two pending saves still advance; the third waits and resumes on drain", async () => {
    const first = deferred<SubmitValidationResult>();
    const second = deferred<SubmitValidationResult>();
    const third = deferred<SubmitValidationResult>();
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.prefetchScript.set(2, [async () => readyFor(2, E3)]);
    h.prefetchScript.set(3, [async () => FINISHED]);
    h.saveScript.push(
      () => first.promise,
      () => second.promise,
      () => third.promise,
    );
    mountRunner();
    await view.settle();

    await answerFully()(0);
    await submitCurrent();
    expect(instructionVisible("OD_0002")).toBe(true);

    await answerFully()(0);
    await submitCurrent();
    expect(instructionVisible("OD_0003")).toBe(true);

    // Third submit with two saves still open: held on OD_0003 with plain copy.
    await answerFully()(0);
    await submitCurrent();
    expect(instructionVisible("OD_0003")).toBe(true);
    expect(view.container.textContent).toMatch(/Saving your recent responses/);

    // Drain everything: the held advance completes to the finished flush (position 3 was the
    // last, so its prefetch said finished) — which navigates only after confirmation.
    await view.settle(() => {
      first.resolve(recordedFor("OD_0001"));
      second.resolve(recordedFor("OD_0002"));
      third.resolve(recordedFor("OD_0003"));
    });
    expect(h.pushes).toHaveLength(1);
    expect(h.pushes[0]).toContain("position=4");
  });
});

describe("S-10 — the final entry drains before any navigation", () => {
  it("no navigation happens until every save confirms", async () => {
    const gate = deferred<SubmitValidationResult>();
    h.prefetchScript.set(3, [async () => FINISHED]);
    h.saveScript.push(() => gate.promise);
    mountRunner({ entry: E3, position: 3 });
    await view.settle();

    await answerFully()(0);
    await submitCurrent();

    expect(h.pushes).toHaveLength(0);
    expect(view.container.textContent).toMatch(/Saving your recent responses/);

    await view.settle(() => {
      gate.resolve(recordedFor("OD_0003"));
    });
    expect(h.pushes).toHaveLength(1);
    expect(h.pushes[0]).toContain("position=4");
  });
});

describe("S-11 — no usable prefetch falls back to confirm-then-navigate", () => {
  it("a failed prefetch still banks the answer and navigates after confirmation", async () => {
    h.prefetchScript.set(1, [async () => ({ status: "failed", reason: "persistence" })]);
    h.saveScript.push(async () => recordedFor("OD_0001"));
    mountRunner();
    await view.settle();

    await answerFully()(0);
    await submitCurrent();

    expect(h.saves).toHaveLength(1);
    expect(h.pushes).toHaveLength(1);
    expect(h.pushes[0]).toContain("position=2");
  });
});

describe("S-12 — double submit sends once", () => {
  it("two submits in one task produce one save and one advance", async () => {
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.prefetchScript.set(2, [async () => readyFor(2, E3)]);
    h.saveScript.push(async () => recordedFor("OD_0001"));
    mountRunner();
    await view.settle();

    await answerFully()(0);
    const target = view.one("form");
    await act(async () => {
      target.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      target.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(h.saves).toHaveLength(1);
    expect(instructionVisible("OD_0002")).toBe(true);
  });
});

describe("S-13 — locale re-render touches neither queue nor prefetch", () => {
  it("switching language saves nothing, prefetches nothing, keeps typed input", async () => {
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    mountRunner();
    await view.settle();
    const prefetchesBefore = h.prefetchCalls.length;

    // Type half an answer, then switch language via a same-instance re-render.
    const group = view.all('[role="radiogroup"]')[0] as HTMLElement;
    const buttons = Array.from(group.querySelectorAll('button[role="radio"]'));
    await view.pressAndSettle(buttons[0]!);

    view.rerender(
      <ValidationSessionRunner
        locale="fil"
        initial={{ batchId: BATCH_ID, entry: E1, position: 1, total: 3, completedCount: 0 }}
      />,
    );

    expect(h.prefetchCalls.length).toBe(prefetchesBefore);
    expect(h.saves).toHaveLength(0);
    // The half-typed answer survived the language change.
    expect(view.all('button[role="radio"][aria-checked="true"]')).toHaveLength(1);
  });
});

describe("S-14 — leaving warns while saves are pending", () => {
  it("beforeunload is cancelled with pending saves and quiet once drained", async () => {
    const gate = deferred<SubmitValidationResult>();
    h.prefetchScript.set(1, [async () => readyFor(1, E2)]);
    h.prefetchScript.set(2, [async () => readyFor(2, E3)]);
    h.saveScript.push(() => gate.promise);
    mountRunner();
    await view.settle();

    await answerFully()(0);
    await submitCurrent();

    let prevented = false;
    await act(async () => {
      const event = new window.Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      prevented = event.defaultPrevented;
    });
    expect(prevented).toBe(true);

    await view.settle(() => {
      gate.resolve(recordedFor("OD_0001"));
    });

    await act(async () => {
      const event = new window.Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      prevented = event.defaultPrevented;
    });
    expect(prevented).toBe(false);
  });
});
