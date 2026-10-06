import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { RepositoryError, type AllocateBatchInput } from "@/lib/repositories";
import { SupabaseBatchesRepository } from "@/lib/repositories/supabase/batches";
import type {
  PostgrestErrorLike,
  SupabaseClientLike,
  SupabaseRpcResultLike,
} from "@/lib/repositories/supabase/client";

/**
 * `SupabaseBatchesRepository.allocate`, against a FUNCTION-shaped fake.
 *
 * The shared fake in `repositories-supabase.test.ts` scripts table operations and refuses
 * `rpc` outright, for the reason `repositories-sign-in-attempts.test.ts` records: a
 * table-shaped envelope would let the shape checks below pass without ever being exercised.
 * So this file owns its fake, like the sign-in-attempts file does.
 *
 * WHAT THIS DOES NOT PROVE
 * That the function exists, that it arbitrates, or that its pillars match the methodology.
 * The fake proves this code calls the named function with the migration's argument names and
 * reads the granted placements correctly. `tests/integration/allocation-rpc-parity.test.ts`
 * runs the real SQL on a real engine, and states which half it covers.
 */

/** One recorded `rpc` call. */
interface RecordedRpc {
  readonly fn: string;
  readonly args: Record<string, unknown>;
}

function rpcHarness(outcomes: readonly (SupabaseRpcResultLike | { reject: Error })[] = []): {
  readonly client: SupabaseClientLike;
  readonly calls: () => readonly RecordedRpc[];
  readonly repository: SupabaseBatchesRepository;
} {
  const calls: RecordedRpc[] = [];
  const queue = [...outcomes];
  const client: SupabaseClientLike = {
    from(): never {
      throw new Error("this repository method must not perform a table operation");
    },
    rpc(fn: string, args: Record<string, unknown>): PromiseLike<SupabaseRpcResultLike> {
      calls.push({ fn, args });
      const next = queue.shift();
      if (next === undefined) {
        return Promise.reject(
          new Error(`unexpected rpc call to ${fn}: the fake had no scripted outcome left`),
        );
      }
      if ("reject" in next) return Promise.reject(next.reject);
      return Promise.resolve(next);
    },
  };
  return {
    client,
    calls: () => calls,
    repository: new SupabaseBatchesRepository(client),
  };
}

const rowsAre = (data: unknown): SupabaseRpcResultLike => ({ data, error: null });

const pgError = (code: string, message: string): PostgrestErrorLike => ({ code, message });

const INPUT: AllocateBatchInput = {
  batchId: "VAL_a81d92c1-2026-09-30T00:00:00.000Z",
  validatorId: "VAL_a81d92c1",
  size: 10,
  ttlSeconds: 300,
  createdAt: "2026-09-30T00:00:00.000Z",
};

describe("SupabaseBatchesRepository.allocate", () => {
  it("calls the versioned function with the argument names the migration declares", async () => {
    const harness = rpcHarness([rowsAre([{ entry_id: "OD_1", entry_position: 1 }])]);

    await harness.repository.allocate(INPUT);

    // PostgREST matches function arguments BY NAME, so a renamed parameter would send a null
    // and the function would fail at runtime rather than at compile time. Asserting the exact
    // keys — not just that it called something — is what catches a rename here.
    expect(harness.calls()).toEqual([
      {
        fn: "allocate_validation_batch_v1",
        args: {
          p_validator_id: "VAL_a81d92c1",
          p_batch_id: "VAL_a81d92c1-2026-09-30T00:00:00.000Z",
          p_batch_size: 10,
          p_ttl_seconds: 300,
          p_created_at: "2026-09-30T00:00:00.000Z",
        },
      },
    ]);
  });

  it("maps granted rows to placements in the returned order", async () => {
    const harness = rpcHarness([
      rowsAre([
        { entry_id: "OD_3", entry_position: 1 },
        { entry_id: "OD_1", entry_position: 2 },
      ]),
    ]);

    const placements = await harness.repository.allocate(INPUT);

    expect(placements).toEqual([
      { entryId: "OD_3", position: 1 },
      { entryId: "OD_1", position: 2 },
    ]);
  });

  it("returns an empty array when the function grants nothing, which is exhaustion", async () => {
    const harness = rpcHarness([rowsAre([])]);

    expect(await harness.repository.allocate(INPUT)).toEqual([]);
  });

  it("raises on a row that is not an entry id rather than dropping it", async () => {
    const harness = rpcHarness([rowsAre([{ entry_id: 42, entry_position: 1 }])]);

    await expect(harness.repository.allocate(INPUT)).rejects.toMatchObject({
      name: "RepositoryError",
      operation: "validation_batches.allocate",
    });
  });

  it("raises on a row without a positive 1-based position", async () => {
    for (const row of [
      { entry_id: "OD_1" },
      { entry_id: "OD_1", entry_position: 0 },
      { entry_id: "OD_1", entry_position: 1.5 },
      { entry_id: "OD_1", entry_position: "1" },
    ]) {
      const harness = rpcHarness([rowsAre([row])]);

      await expect(harness.repository.allocate(INPUT)).rejects.toMatchObject({
        name: "RepositoryError",
        operation: "validation_batches.allocate",
      });
    }
  });

  it("raises rather than reporting exhaustion when the answer is not a row array", async () => {
    // Treating a non-array as "nothing granted" would report exhaustion precisely when the
    // database is unreachable, which is the wrong direction.
    const harness = rpcHarness([{ data: null, error: null }]);

    await expect(harness.repository.allocate(INPUT)).rejects.toMatchObject({
      name: "RepositoryError",
      operation: "validation_batches.allocate",
    });
  });

  it("maps a Postgres rejection to the allocate operation", async () => {
    const harness = rpcHarness([{ data: null, error: pgError("PGRST202", "function not found") }]);

    const error = await harness.repository.allocate(INPUT).then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).operation).toBe("validation_batches.allocate");
  });

  it("wraps a call that never got an answer rather than leaving it unhandled", async () => {
    const harness = rpcHarness([{ reject: new Error("network down") }]);

    await expect(harness.repository.allocate(INPUT)).rejects.toMatchObject({
      name: "RepositoryError",
      operation: "validation_batches.allocate",
    });
  });
});
