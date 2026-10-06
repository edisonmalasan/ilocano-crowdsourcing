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
    expect(queue.snapshot().states["OD_0001"]).toEqual({ kind: "saving", attempt: 1 });

    // The first retry waits 500ms; nothing is re-sent until the test releases the wait.
    expect(wait).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenLastCalledWith(500);
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
});
