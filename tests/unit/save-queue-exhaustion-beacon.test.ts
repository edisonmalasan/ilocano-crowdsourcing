import { describe, expect, it, vi } from "vitest";

import { BEACON_ID_PATTERN } from "@/lib/ops/beacon";
import { createSaveQueue, type QueuedSave } from "@/lib/validation/save-queue";
import type { SubmitValidationResult } from "@/lib/validation/validation-actions-core";
import type { ValidationResponseInput } from "@/schemas/validation";

/**
 * The queue's retry-exhaustion hook: the one call site the `retry_exhausted` operational
 * signal's client half depends on.
 *
 * The contract is narrow on purpose — fire exactly once per exhausted entry, never for a
 * permanent refusal, never for a confirmation, and never break the park path — so each
 * arm below asserts exactly one of those.
 */

const PAYLOAD: ValidationResponseInput = { evaluation: "correct_natural" };

function item(key = "OD_0001"): QueuedSave {
  return { key, batchId: "batch_01", datasetEntryId: key, position: 1, payload: PAYLOAD };
}

const PERSISTENCE: SubmitValidationResult = { status: "failed", reason: "persistence" };
const INVALID: SubmitValidationResult = { status: "failed", reason: "invalid" };
const RECORDED: SubmitValidationResult = {
  status: "recorded",
  responseId: "rsp_01",
  datasetEntryId: "OD_0001",
};

describe("createSaveQueue onExhausted", () => {
  it("fires once with the parked item when transient failures exhaust the attempts", async () => {
    const onExhausted = vi.fn();
    const queue = createSaveQueue({
      submit: async () => PERSISTENCE,
      wait: async () => {},
      maxAttempts: 2,
      onExhausted,
    });

    queue.enqueue(item());
    await queue.drain();

    expect(onExhausted).toHaveBeenCalledTimes(1);
    expect(onExhausted).toHaveBeenCalledWith(item());
    expect(queue.snapshot().states["OD_0001"]).toEqual({
      kind: "unsaved",
      reason: "persistence",
    });
  });

  it("never fires for a permanent refusal, which is not a retry episode", async () => {
    const onExhausted = vi.fn();
    const queue = createSaveQueue({
      submit: async () => INVALID,
      wait: async () => {},
      maxAttempts: 2,
      onExhausted,
    });

    queue.enqueue(item());
    await queue.drain();

    expect(onExhausted).not.toHaveBeenCalled();
    expect(queue.snapshot().states["OD_0001"]).toEqual({ kind: "unsaved", reason: "invalid" });
  });

  it("never fires when the save confirms", async () => {
    const onExhausted = vi.fn();
    const queue = createSaveQueue({
      submit: async () => RECORDED,
      wait: async () => {},
      onExhausted,
    });

    queue.enqueue(item());
    await queue.drain();

    expect(onExhausted).not.toHaveBeenCalled();
  });

  it("still parks the payload and resolves the drain when the handler throws", async () => {
    const queue = createSaveQueue({
      submit: async () => PERSISTENCE,
      wait: async () => {},
      maxAttempts: 1,
      onExhausted: () => {
        throw new Error("diagnostic callback down");
      },
    });

    queue.enqueue(item());
    await queue.drain();

    // The guarantee is the park, not the beacon: the complete payload is retained and the
    // drain resolves rather than rejecting with the handler's error.
    expect(queue.snapshot().unsaved.map((entry) => entry.key)).toEqual(["OD_0001"]);
  });

  it("fires once per exhausted entry, not once per attempt", async () => {
    const onExhausted = vi.fn();
    const submit = vi.fn(async (): Promise<SubmitValidationResult> => PERSISTENCE);
    const queue = createSaveQueue({ submit, wait: async () => {}, maxAttempts: 3, onExhausted });

    queue.enqueue(item());
    await queue.drain();

    expect(submit).toHaveBeenCalledTimes(3);
    expect(onExhausted).toHaveBeenCalledTimes(1);
  });
});

/**
 * Companion guard: the beacon id the production handler mints must satisfy the server's
 * shape rule, or the route answers 400 and the episode is never counted. This pins the
 * client mint against the REAL server pattern rather than a copy of it.
 */
describe("beacon id shape agreement", () => {
  it("the pattern the server enforces is the non-empty constrained alphabet the mint targets", async () => {
    const { mintBeaconId } = await import("@/lib/validation/ops-beacon-client");
    const first = mintBeaconId(new Uint8Array(16).fill(7));
    const second = mintBeaconId(new Uint8Array(16).fill(8));
    expect(first).toMatch(BEACON_ID_PATTERN);
    expect(second).toMatch(BEACON_ID_PATTERN);
    expect(first).not.toBe(second);
    expect(mintBeaconId()).toMatch(BEACON_ID_PATTERN);
  });
});
