import { describe, expect, it, vi } from "vitest";

import { RepositoryError } from "@/lib/repositories";
import {
  runRequestNextEntry,
  type NextEntryDependencies,
} from "@/lib/validation/next-entry-actions-core";
import { allocatedEntrySchema, batchRecordSchema } from "@/schemas/batch";

/**
 * `server-only` cannot be imported under Vitest. The prefetch core inherits the marker from
 * `@/lib/server/write-intake` (like `validation-actions-core.ts` does), so it is stubbed here;
 * the boundary itself is asserted by `tests/unit/supabase-clients.test.ts`.
 */
vi.mock("server-only", () => ({}));

/**
 * The next-entry prefetch, over recording fakes.
 *
 * Each test proves the READ's decisions — which entry it names, what it refuses, and what never
 * crosses the boundary — not the wire. The fakes record calls so a prefetch that read the whole
 * batch, chose client-side, or leaked a researcher field would fail here by name.
 */

const VALIDATOR_ID = "VAL_0a1b2c3d";
const BATCH_ID = "VAL_0a1b2c3d-:2026-09-30T12:00:00.000Z";

interface PrefetchOptions {
  readonly batch?: unknown;
  readonly completedEntryIds?: readonly string[];
  readonly batchFailure?: unknown;
  readonly validationsFailure?: unknown;
  readonly datasetFailure?: unknown;
  readonly missingEntryIds?: readonly string[];
}

function storedEntry(id: string): Record<string, unknown> {
  return {
    id,
    category: "origin_destination",
    sourceEntryId: Number(id.split("_").pop()),
    categoryName: "Origin + Destination",
    instruction: `Instruction for ${id}.`,
    origin: "Baguio Cathedral",
    destination: "Burnham Park",
    transitMode: "jeepney",
    sourcePayload: { record_id: id, secret: "researcher-only" },
    createdAt: "2026-09-30T12:00:00.000Z",
    isActive: true,
  };
}

function createRecording(over: PrefetchOptions = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      batches: {
        async findById(id: string) {
          calls.push(`batches.findById:${id}`);
          if (over.batchFailure !== undefined) throw over.batchFailure;
          if (over.batch === null) return null;
          const record = over.batch ?? {
            id,
            validatorId: VALIDATOR_ID,
            entries: [
              { datasetEntryId: "OD_1", position: 1 },
              { datasetEntryId: "OD_2", position: 2 },
              { datasetEntryId: "OD_3", position: 3 },
            ],
          };
          return batchRecordSchema.parse(record);
        },
      },
      validations: {
        async listEntryIdsForValidator(validatorId: string) {
          calls.push(`validations.listEntryIdsForValidator:${validatorId}`);
          if (over.validationsFailure !== undefined) throw over.validationsFailure;
          return [...(over.completedEntryIds ?? [])];
        },
      },
      datasetEntries: {
        async findById(id: string) {
          calls.push(`datasetEntries.findById:${id}`);
          if (over.datasetFailure !== undefined) throw over.datasetFailure;
          if (over.missingEntryIds?.includes(id)) return null;
          return storedEntry(id) as never;
        },
      },
    } satisfies NextEntryDependencies,
  };
}

describe("runRequestNextEntry", () => {
  it("resolves the entry after the current position through the server order", async () => {
    const { deps, calls } = createRecording({ completedEntryIds: [] });

    const result = await runRequestNextEntry({ batchId: BATCH_ID, position: 1 }, deps);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.entry.id).toBe("OD_2");
    expect(result.position).toBe(2);
    expect(result.total).toBe(3);
    expect(result.completedCount).toBe(0);
    // The three reads, in order, and nothing else.
    expect(calls).toEqual([
      `batches.findById:${BATCH_ID}`,
      `validations.listEntryIdsForValidator:${VALIDATOR_ID}`,
      "datasetEntries.findById:OD_2",
    ]);
  });

  it("names the next entry even though the current one is not yet stored", async () => {
    // THE optimistic case: the current entry's save is still in flight, so the completed set
    // does not contain it — and the prefetch still names OD_2, not OD_1 again.
    const { deps } = createRecording({ completedEntryIds: [] });

    const result = await runRequestNextEntry({ batchId: BATCH_ID, position: 1 }, deps);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.entry.id).toBe("OD_2");
  });

  it("skips an already-stored current entry to the one after it", async () => {
    const { deps } = createRecording({ completedEntryIds: ["OD_1"] });

    const result = await runRequestNextEntry({ batchId: BATCH_ID, position: 1 }, deps);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.entry.id).toBe("OD_2");
  });

  it("reports finished past the last position", async () => {
    const { deps } = createRecording({ completedEntryIds: ["OD_1", "OD_2"] });

    const result = await runRequestNextEntry({ batchId: BATCH_ID, position: 3 }, deps);

    // OD_3 is still unanswered, so the entry after position 3 does not exist: finished.
    expect(result).toEqual({ status: "finished" });
  });

  it("reports finished when the batch is fully answered", async () => {
    const { deps } = createRecording({ completedEntryIds: ["OD_1", "OD_2", "OD_3"] });

    const result = await runRequestNextEntry({ batchId: BATCH_ID, position: 3 }, deps);

    expect(result).toEqual({ status: "finished" });
  });

  it("never serves an entry at or before the current position as next", async () => {
    // Positions 2 and 3 answered out of order while position 1 is still open: nothing REMAINS
    // after position 1 except work behind it, and the fallback to remaining[0] would name
    // position 1 itself. That is not a next entry, so the prefetch declines and the route —
    // which owns the fallback with a full render around it — decides instead.
    const { deps } = createRecording({ completedEntryIds: ["OD_2", "OD_3"] });

    const result = await runRequestNextEntry({ batchId: BATCH_ID, position: 1 }, deps);

    expect(result).toEqual({ status: "finished" });
  });

  it("projects exactly the six renderable fields, never the source payload", async () => {
    const { deps } = createRecording();

    const result = await runRequestNextEntry({ batchId: BATCH_ID, position: 1 }, deps);

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(Object.keys(result.entry).sort()).toEqual(
      Object.keys(allocatedEntrySchema.shape).sort(),
    );
    expect(result.entry).not.toHaveProperty("sourcePayload");
    expect(JSON.stringify(result)).not.toContain("researcher-only");
  });

  it("refuses a request that tries to steer the read with an extra field", async () => {
    const { deps } = createRecording();

    const result = await runRequestNextEntry(
      { batchId: BATCH_ID, position: 1, entryIds: ["OD_3"] },
      deps,
    );

    expect(result).toEqual({ status: "failed", reason: "invalid" });
  });

  it("refuses a malformed position without reading anything", async () => {
    const { deps, calls } = createRecording();

    const result = await runRequestNextEntry({ batchId: BATCH_ID, position: "two" }, deps);

    expect(result).toEqual({ status: "failed", reason: "invalid" });
    expect(calls).toEqual([]);
  });

  it("reports unknown_batch for a batch that is not in storage", async () => {
    const { deps } = createRecording({ batch: null });

    const result = await runRequestNextEntry({ batchId: BATCH_ID, position: 1 }, deps);

    expect(result).toEqual({ status: "failed", reason: "unknown_batch" });
  });

  it("reports persistence when any of the three reads fails", async () => {
    const failure = new RepositoryError("validation_batches.findById", "down");
    for (const over of [
      { batchFailure: failure },
      { validationsFailure: failure },
      { datasetFailure: failure },
    ]) {
      const { deps } = createRecording(over);
      const result = await runRequestNextEntry({ batchId: BATCH_ID, position: 1 }, deps);
      expect(result).toEqual({ status: "failed", reason: "persistence" });
    }
  });

  it("reports persistence when the placement names a missing dataset entry", async () => {
    const { deps } = createRecording({ missingEntryIds: ["OD_2"] });

    const result = await runRequestNextEntry({ batchId: BATCH_ID, position: 1 }, deps);

    expect(result).toEqual({ status: "failed", reason: "persistence" });
  });
});
