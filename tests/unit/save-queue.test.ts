import { describe, expect, it, vi } from "vitest";

import { createSaveQueue, type QueuedSave } from "@/lib/validation/save-queue";
import type { SubmitValidationResult } from "@/lib/validation/validation-actions-core";
import type { ValidationResponseInput } from "@/schemas/validation";

/**
 * The background save queue, driven with no DOM, no network, and no clock it does not control.
 *
 * Every test injects `submit` (a scripted server answer) and a manual `wait` (a deferred the
 * test resolves), so a save that stays unresolved while the session has already moved on is an
 * ordinary arrangement rather than a flaky race. What each test proves is stated above it:
 * a queue test that only asserts "a number came back" proves the queue runs, while one that
 * asserts WHOSE payload confirmed proves it does not lose answers.
 */

const PAYLOAD: ValidationResponseInput = { evaluation: "correct_natural" };

function item(key = "OD_0001", overrides: Partial<QueuedSave> = {}): QueuedSave {
  return {
    key,
    batchId: "batch_01",
    datasetEntryId: key,
    position: 1,
    payload: PAYLOAD,
    ...overrides,
  };
}

const RECORDED: SubmitValidationResult = {
  status: "recorded",
  responseId: "rsp_01",
  datasetEntryId: "OD_0001",
};

const PERSISTENCE: SubmitValidationResult = { status: "failed", reason: "persistence" };

function manualWait() {
  const releases: Array<() => void> = [];
  const wait = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      releases.push(resolve);
    });
  });
  return { wait, releases };
}

function flush(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe("createSaveQueue", () => {
  it("confirms a recorded save and empties the pending set", async () => {
    const snapshots: unknown[] = [];
    const queue = createSaveQueue({
      submit: async () => RECORDED,
      wait: async () => {},
      notify: (snapshot) => {
        snapshots.push(snapshot);
      },
    });

    queue.enqueue(item());
    expect(queue.pendingCount()).toBe(1);

    await queue.drain();
    expect(queue.pendingCount()).toBe(0);
    expect(queue.snapshot().unsaved).toEqual([]);
    expect(queue.snapshot().states["OD_0001"]).toEqual({ kind: "saved" });
    expect(snapshots.length).toBeGreaterThan(0);
  });

  it("treats already_recorded as synchronized, not as a second submission", async () => {
    const submit = vi.fn(async (): Promise<SubmitValidationResult> => ({
      status: "already_recorded",
      datasetEntryId: "OD_0001",
    }));
    const queue = createSaveQueue({ submit, wait: async () => {} });

    queue.enqueue(item());
    await queue.drain();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(queue.snapshot().states["OD_0001"]).toEqual({ kind: "saved" });
    expect(queue.snapshot().unsaved).toEqual([]);
  });

  it("does not report saved before the server confirms", async () => {
    let resolveSubmit!: (result: SubmitValidationResult) => void;
    const submit = vi.fn(
      () =>
        new Promise<SubmitValidationResult>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const queue = createSaveQueue({ submit, wait: async () => {} });

    queue.enqueue(item());
    await flush();

    // The save is in flight and the server has said nothing: no saved state anywhere.
    expect(queue.snapshot().states["OD_0001"]).toEqual({ kind: "saving", attempt: 1 });
    expect(queue.pendingCount()).toBe(1);

    resolveSubmit(RECORDED);
    await queue.drain();
    expect(queue.snapshot().states["OD_0001"]).toEqual({ kind: "saved" });
  });

  it("attributes a late confirmation to its own entry while the session has moved on", async () => {
    // THE race this queue exists for: entry 1's save stays unresolved while entry 2's save
    // completes first. Each confirmation must land on its own key.
    const resolvers = new Map<string, (result: SubmitValidationResult) => void>();
    const submit = vi.fn(
      (entry: QueuedSave) =>
        new Promise<SubmitValidationResult>((resolve) => {
          resolvers.set(entry.key, resolve);
        }),
    );
    const queue = createSaveQueue({ submit, wait: async () => {} });

    queue.enqueue(item("OD_0001"));
    queue.enqueue(item("OD_0002"));
    await flush();

    resolvers.get("OD_0002")?.(RECORDED);
    await flush();
    expect(queue.snapshot().states["OD_0002"]).toEqual({ kind: "saved" });
    expect(queue.snapshot().states["OD_0001"]).toEqual({ kind: "saving", attempt: 1 });

    resolvers.get("OD_0001")?.({
      status: "recorded",
      responseId: "rsp_01",
      datasetEntryId: "OD_0001",
    });
    await queue.drain();
    expect(queue.snapshot().states["OD_0001"]).toEqual({ kind: "saved" });
    expect(queue.pendingCount()).toBe(0);
  });

  it("retries a transient failure once the backoff elapses, then confirms", async () => {
    const { wait, releases } = manualWait();
    const submit = vi.fn(async (): Promise<SubmitValidationResult> => PERSISTENCE);
    submit.mockResolvedValueOnce(PERSISTENCE).mockResolvedValueOnce(RECORDED);
    const queue = createSaveQueue({ submit, wait });

    queue.enqueue(item());
    await flush();
    expect(submit).toHaveBeenCalledTimes(1);

    // The first retry waits 500ms; nothing is re-sent until the test releases the wait.
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenLastCalledWith(500);
    // The retry is announced BEFORE the backoff elapses — the wait is the visible part —
    // so the retry state already shows while nothing has been re-sent yet.
    expect(queue.snapshot().states["OD_0001"]).toEqual({ kind: "retrying", attempt: 2 });
    expect(submit).toHaveBeenCalledTimes(1);
    releases.forEach((release) => release());
    await queue.drain();

    expect(submit).toHaveBeenCalledTimes(2);
    expect(queue.snapshot().states["OD_0001"]).toEqual({ kind: "saved" });
  });

  it("parks the complete payload after exhausting bounded attempts, and retries it on demand", async () => {
    const submit = vi.fn(async (): Promise<SubmitValidationResult> => PERSISTENCE);
    const queue = createSaveQueue({ submit, wait: async () => {}, maxAttempts: 2 });

    queue.enqueue(item());
    await queue.drain();

    expect(submit).toHaveBeenCalledTimes(2);
    expect(queue.pendingCount()).toBe(0);
    // Parked, not dropped: the payload is retained with its reason.
    expect(queue.snapshot().unsaved.map((entry) => entry.key)).toEqual(["OD_0001"]);
    expect(queue.snapshot().states["OD_0001"]).toEqual({
      kind: "unsaved",
      reason: "persistence",
    });

    // A retry re-drives from attempt 1 and confirms.
    submit.mockResolvedValueOnce(RECORDED);
    expect(queue.retry("OD_0001")).toBe(true);
    await queue.drain();
    expect(submit).toHaveBeenCalledTimes(3);
    expect(queue.snapshot().states["OD_0001"]).toEqual({ kind: "saved" });
    expect(queue.snapshot().unsaved).toEqual([]);
  });

  it("treats not_configured as transient: bounded retries, then parked", async () => {
    // A deployment that gains a database mid-batch recovers on retry; one that never does
    // parks like any exhausted transient — retried, then retained, never dropped.
    const submit = vi.fn(async (): Promise<SubmitValidationResult> => ({
      status: "failed",
      reason: "not_configured",
    }));
    const queue = createSaveQueue({ submit, wait: async () => {}, maxAttempts: 2 });

    queue.enqueue(item());
    await queue.drain();

    expect(submit).toHaveBeenCalledTimes(2);
    expect(queue.snapshot().states["OD_0001"]).toEqual({
      kind: "unsaved",
      reason: "not_configured",
    });
    expect(queue.snapshot().unsaved.map((entry) => entry.key)).toEqual(["OD_0001"]);
  });

  it("never retries an invalid, unknown-batch, or not-in-batch refusal", async () => {
    for (const reason of ["invalid", "unknown_batch", "not_in_batch"] as const) {
      const submit = vi.fn(async (): Promise<SubmitValidationResult> => ({
        status: "failed",
        reason,
      }));
      const queue = createSaveQueue({ submit, wait: async () => {} });

      queue.enqueue(item(`OD_${reason}`));
      await queue.drain();

      expect(submit).toHaveBeenCalledTimes(1);
      expect(queue.snapshot().states[`OD_${reason}`]).toEqual({
        kind: "unsaved",
        reason,
      });
    }
  });

  it("retry of an unknown key is a no-op rather than a submission", async () => {
    const submit = vi.fn(async (): Promise<SubmitValidationResult> => RECORDED);
    const queue = createSaveQueue({ submit, wait: async () => {} });

    expect(queue.retry("OD_missing")).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it("enqueueing the same key twice submits once", async () => {
    const submit = vi.fn(async (): Promise<SubmitValidationResult> => RECORDED);
    const queue = createSaveQueue({ submit, wait: async () => {} });

    queue.enqueue(item());
    queue.enqueue(item());
    await queue.drain();

    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("drain resolves when every entry has settled, and never rejects", async () => {
    const submit = vi.fn(async (): Promise<SubmitValidationResult> => RECORDED);
    submit.mockResolvedValueOnce(RECORDED).mockResolvedValueOnce(PERSISTENCE);
    const queue = createSaveQueue({ submit, wait: async () => {}, maxAttempts: 1 });

    queue.enqueue(item("OD_0001"));
    queue.enqueue(item("OD_0002"));

    await expect(queue.drain()).resolves.toBeUndefined();
    expect(queue.snapshot().states["OD_0001"]).toEqual({ kind: "saved" });
    expect(queue.snapshot().states["OD_0002"]).toEqual({
      kind: "unsaved",
      reason: "persistence",
    });
  });

  it("uses the configured backoff schedule across attempts", async () => {
    const waits: number[] = [];
    const submit = vi.fn(async (): Promise<SubmitValidationResult> => PERSISTENCE);
    const queue = createSaveQueue({
      submit,
      wait: async (ms: number) => {
        waits.push(ms);
      },
      maxAttempts: 3,
      backoffMs: [100, 200, 400],
    });

    queue.enqueue(item());
    await queue.drain();

    expect(submit).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([100, 200]);
  });

  it("notifies on every state change so the runner can render status from it", async () => {
    const seen: string[] = [];
    const queue = createSaveQueue({
      submit: async () => RECORDED,
      wait: async () => {},
      notify: (snapshot) => {
        seen.push(
          `${snapshot.pending.length}:${snapshot.unsaved.length}:${JSON.stringify(snapshot.states)}`,
        );
      },
    });

    queue.enqueue(item());
    await queue.drain();

    expect(seen.length).toBeGreaterThanOrEqual(2);
    expect(seen[seen.length - 1]).toContain('"saved"');
  });

  it("admits all 5 of a batch but runs at most MAX_ACTIVE_SAVES at once", async () => {
    // The 5.4 measurement: five rapid submits with every save held open. All five are
    // queued (pending 5), but only three workers start — the fourth and fifth wait FIFO.
    const resolvers = new Map<string, (result: SubmitValidationResult) => void>();
    const submit = vi.fn(
      (entry: QueuedSave) =>
        new Promise<SubmitValidationResult>((resolve) => {
          resolvers.set(entry.key, resolve);
        }),
    );
    const queue = createSaveQueue({ submit, wait: async () => {} });

    const ids = ["OD_0001", "OD_0002", "OD_0003", "OD_0004", "OD_0005"];
    for (const [index, id] of ids.entries()) {
      queue.enqueue(item(id, { position: index + 1, datasetEntryId: id }));
    }
    await flush();

    expect(queue.pendingCount()).toBe(5);
    expect(queue.activeCount()).toBe(3);
    expect(submit).toHaveBeenCalledTimes(3);

    // Draining one worker refills exactly one waiter, FIFO: the fourth starts, the fifth waits.
    // Polled, not slept fixed: the refill crosses several promise ticks (drive settle, pump,
    // next drive), and a fixed flush count is a guess about the harness's scheduling.
    resolvers.get("OD_0001")!(RECORDED);
    for (let waited = 0; waited < 50; waited += 1) {
      if (submit.mock.calls.length >= 4) break;
      await flush();
    }
    expect(submit).toHaveBeenCalledTimes(4);
    expect(queue.activeCount()).toBe(3);

    for (const id of ["OD_0002", "OD_0003", "OD_0004", "OD_0005"]) {
      for (let waited = 0; waited < 50; waited += 1) {
        if (resolvers.has(id)) break;
        await flush();
      }
      resolvers.get(id)!({ ...RECORDED, datasetEntryId: id });
    }
    await queue.drain();
    expect(submit).toHaveBeenCalledTimes(5);
    expect(queue.pendingCount()).toBe(0);
    for (const id of ids) {
      expect(queue.snapshot().states[id]).toEqual({ kind: "saved" });
    }
  });

  it("CAN FIRE: the active bound is observed, not assumed — a latch-less double start would show 2", async () => {
    // The control for the test above: with only TWO held saves the active count is 2, so a
    // count of 3 is a measurement of the bound and not of the harness. And resolving both
    // drains cleanly, so the bound never strands work.
    const resolvers = new Map<string, (result: SubmitValidationResult) => void>();
    const submit = vi.fn(
      (entry: QueuedSave) =>
        new Promise<SubmitValidationResult>((resolve) => {
          resolvers.set(entry.key, resolve);
        }),
    );
    const queue = createSaveQueue({ submit, wait: async () => {} });

    queue.enqueue(item("OD_0001"));
    queue.enqueue(item("OD_0002"));
    await flush();

    expect(queue.activeCount()).toBe(2);
    resolvers.get("OD_0001")!(RECORDED);
    resolvers.get("OD_0002")!({ ...RECORDED, datasetEntryId: "OD_0002" });
    await queue.drain();
    expect(queue.pendingCount()).toBe(0);
  });

  it("a slow first save never head-of-line-blocks the saves behind it", async () => {
    // Out-of-order attribution at the worker level: entries 2-5 confirm while entry 1 is
    // still open, and each confirmation lands on its own key.
    const resolvers = new Map<string, (result: SubmitValidationResult) => void>();
    const submit = vi.fn(
      (entry: QueuedSave) =>
        new Promise<SubmitValidationResult>((resolve) => {
          resolvers.set(entry.key, resolve);
        }),
    );
    const queue = createSaveQueue({ submit, wait: async () => {} });

    for (const id of ["OD_0001", "OD_0002", "OD_0003"]) {
      queue.enqueue(item(id, { datasetEntryId: id }));
    }
    await flush();

    resolvers.get("OD_0003")!({ ...RECORDED, datasetEntryId: "OD_0003" });
    resolvers.get("OD_0002")!({ ...RECORDED, datasetEntryId: "OD_0002" });
    await flush();
    expect(queue.snapshot().states["OD_0002"]).toEqual({ kind: "saved" });
    expect(queue.snapshot().states["OD_0003"]).toEqual({ kind: "saved" });
    expect(queue.snapshot().states["OD_0001"]).toEqual({ kind: "saving", attempt: 1 });

    resolvers.get("OD_0001")!(RECORDED);
    await queue.drain();
    expect(queue.snapshot().states["OD_0001"]).toEqual({ kind: "saved" });
  });

  it("exposes live worker counts: 3 active and 2 queued under a five-rapid burst", async () => {
    // The operator half of the 5.4 measurement: `activeSaves`/`queuedSaves` read the live
    // worker occupancy off the snapshot rather than deriving it from state kinds.
    const resolvers = new Map<string, (result: SubmitValidationResult) => void>();
    const submit = vi.fn(
      (entry: QueuedSave) =>
        new Promise<SubmitValidationResult>((resolve) => {
          resolvers.set(entry.key, resolve);
        }),
    );
    const queue = createSaveQueue({ submit, wait: async () => {} });

    for (const id of ["OD_0001", "OD_0002", "OD_0003", "OD_0004", "OD_0005"]) {
      queue.enqueue(item(id, { datasetEntryId: id }));
    }
    await flush();

    expect(queue.snapshot().activeSaves).toBe(3);
    expect(queue.snapshot().queuedSaves).toBe(2);

    for (const id of ["OD_0001", "OD_0002", "OD_0003", "OD_0004", "OD_0005"]) {
      for (let waited = 0; waited < 50; waited += 1) {
        if (resolvers.has(id)) break;
        await flush();
      }
      resolvers.get(id)!({ ...RECORDED, datasetEntryId: id });
    }
    await queue.drain();
    expect(queue.snapshot().activeSaves).toBe(0);
    expect(queue.snapshot().queuedSaves).toBe(0);
  });

  it("reports per-key queue wait off an injected clock, absent until a worker starts", async () => {
    // Privacy-safe timing with no wall clock: three held workers, two waiters admitted at
    // t=2000, one worker freed at t=2500. The waiter that starts reports 500; the one
    // still waiting reports nothing — absence is the unstarted state, not a zero.
    let t = 1000;
    const resolvers = new Map<string, (result: SubmitValidationResult) => void>();
    const submit = vi.fn(
      (entry: QueuedSave) =>
        new Promise<SubmitValidationResult>((resolve) => {
          resolvers.set(entry.key, resolve);
        }),
    );
    const queue = createSaveQueue({ submit, wait: async () => {}, now: () => t });

    for (const id of ["OD_0001", "OD_0002", "OD_0003"]) {
      queue.enqueue(item(id, { datasetEntryId: id }));
    }
    await flush();
    expect(queue.snapshot().queueWaitMs).toEqual({
      OD_0001: 0,
      OD_0002: 0,
      OD_0003: 0,
    });

    t = 2000;
    queue.enqueue(item("OD_0004", { datasetEntryId: "OD_0004" }));
    queue.enqueue(item("OD_0005", { datasetEntryId: "OD_0005" }));
    await flush();
    expect(queue.snapshot().queueWaitMs["OD_0004"]).toBeUndefined();
    expect(queue.snapshot().queueWaitMs["OD_0005"]).toBeUndefined();

    t = 2500;
    resolvers.get("OD_0001")!(RECORDED);
    for (let waited = 0; waited < 50; waited += 1) {
      if (submit.mock.calls.length >= 4) break;
      await flush();
    }
    expect(submit).toHaveBeenCalledTimes(4);
    expect(queue.snapshot().queueWaitMs["OD_0004"]).toBe(500);
    expect(queue.snapshot().queueWaitMs["OD_0005"]).toBeUndefined();

    for (const id of ["OD_0002", "OD_0003", "OD_0004", "OD_0005"]) {
      for (let waited = 0; waited < 50; waited += 1) {
        if (resolvers.has(id)) break;
        await flush();
      }
      resolvers.get(id)!({ ...RECORDED, datasetEntryId: id });
    }
    await queue.drain();
    // Settle clears per-key timing with the key: the snapshot describes live work only.
    expect(queue.snapshot().queueWaitMs).toEqual({});
  });
});
