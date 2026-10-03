import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { RepositoryError } from "@/lib/repositories";
import {
  CLAIM_RESERVATIONS_FUNCTION,
  RELEASE_RESERVATION_FUNCTION,
  SupabaseEntryReservationsRepository,
} from "@/lib/repositories/supabase/entry-reservations";
import type {
  PostgrestErrorLike,
  SupabaseClientLike,
  SupabaseRpcResultLike,
} from "@/lib/repositories/supabase/client";
import { ENTRY_RESERVATIONS_OPERATIONS } from "@/lib/repositories/supabase/operations";

/**
 * The Supabase entry-reservations repository, against a FUNCTION-shaped fake.
 *
 * The claim function returns `table (entry_id text)`, which PostgREST delivers as a ROW ARRAY —
 * one single-key row per granted entry — unlike the sign-in counter's scalar. The fake scripts
 * row arrays here, and the shape checks below exist because an empty grant (contention) and a
 * failed claim (unreachable database) must leave through different doors: the first returns
 * `[]`, the second raises.
 *
 * WHAT THIS FILE DOES NOT PROVE: nothing about PostgREST, and nothing about atomicity. The unit
 * proves this code asks for the arbitrating statement and reads the answer correctly; the
 * statement's arbitration is `tests/integration/entry-reservations.test.ts`, which states which
 * half it covers.
 */

/** One recorded `rpc` call. */
interface RecordedRpc {
  readonly fn: string;
  readonly args: Record<string, unknown>;
}

function rpcHarness(outcomes: readonly (SupabaseRpcResultLike | { reject: Error })[] = []): {
  readonly client: SupabaseClientLike;
  readonly calls: () => readonly RecordedRpc[];
  readonly repository: SupabaseEntryReservationsRepository;
} {
  const calls: RecordedRpc[] = [];
  const queue = [...outcomes];
  const client: SupabaseClientLike = {
    from(): never {
      throw new Error("this repository must not perform a table operation");
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
    repository: new SupabaseEntryReservationsRepository(client),
  };
}

const rowsAre = (data: unknown): SupabaseRpcResultLike => ({ data, error: null });
const pgError = (code: string, message: string): PostgrestErrorLike => ({ code, message });

describe("claimReservations", () => {
  it("calls the claim function with the argument names the migration declares", async () => {
    const harness = rpcHarness([rowsAre([{ entry_id: "E1" }, { entry_id: "E2" }])]);
    const granted = await harness.repository.claimReservations("VAL_a", ["E1", "E2"], 1800);
    // PostgREST matches function arguments BY NAME, so a renamed parameter would send a null and
    // the function would fail at runtime rather than at compile time.
    expect(harness.calls()).toEqual([
      {
        fn: CLAIM_RESERVATIONS_FUNCTION,
        args: { p_validator_id: "VAL_a", p_entry_ids: ["E1", "E2"], p_ttl_seconds: 1800 },
      },
    ]);
    expect(granted).toEqual(["E1", "E2"]);
  });

  it("returns an empty grant as an empty array, never as a failure", async () => {
    // Contention is a real answer: every requested entry held elsewhere. Raising here would
    // report exhaustion as a database fault, which is the wrong direction.
    const harness = rpcHarness([rowsAre([])]);
    await expect(harness.repository.claimReservations("VAL_a", ["E1"], 1800)).resolves.toEqual([]);
  });

  it("raises a typed error naming the claim when Postgres refuses it", async () => {
    const harness = rpcHarness([{ data: null, error: pgError("XX000", "boom") }]);
    const error = await harness.repository.claimReservations("VAL_a", ["E1"], 1800).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).operation).toBe(
      ENTRY_RESERVATIONS_OPERATIONS.claimReservations,
    );
  });

  it("wraps a call that never got an answer instead of returning it", async () => {
    const harness = rpcHarness([{ reject: new Error("connection reset") }]);
    const error = await harness.repository.claimReservations("VAL_a", ["E1"], 1800).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).operation).toBe(
      ENTRY_RESERVATIONS_OPERATIONS.claimReservations,
    );
  });

  it("raises on a non-array body rather than reading it as no grants", async () => {
    // Defaulting a misshapen body to `[]` would read a broken function as contention — the one
    // value that silently shrinks every batch.
    const harness = rpcHarness([rowsAre("E1")]);
    await expect(harness.repository.claimReservations("VAL_a", ["E1"], 1800)).rejects.toThrow(
      RepositoryError,
    );
  });

  it("raises on a row that is not an entry id rather than dropping it", async () => {
    // Silently dropping the row would turn someone else's grant into our contention, which fails
    // in the wrong direction: the batch would be short for a reason no log names.
    const harness = rpcHarness([rowsAre([{ entry_id: "E1" }, { nope: "E2" }])]);
    await expect(harness.repository.claimReservations("VAL_a", ["E1"], 1800)).rejects.toThrow(
      RepositoryError,
    );
  });
});

describe("releaseReservation", () => {
  it("calls the release function scoped to the holder", async () => {
    const harness = rpcHarness([rowsAre(null)]);
    await harness.repository.releaseReservation("VAL_a", "E1");
    // The holder travels with the call: a release that named only the entry could free another
    // attempt's hold, and the migration enforces the scoping — this asserts the caller upholds it.
    expect(harness.calls()).toEqual([
      {
        fn: RELEASE_RESERVATION_FUNCTION,
        args: { p_validator_id: "VAL_a", p_entry_id: "E1" },
      },
    ]);
  });

  it("treats a null body as released, and a non-null body as the wrong function", async () => {
    const harness = rpcHarness([rowsAre(null), rowsAre([{ entry_id: "E1" }])]);
    await expect(harness.repository.releaseReservation("VAL_a", "E1")).resolves.toBeUndefined();
    await expect(harness.repository.releaseReservation("VAL_a", "E1")).rejects.toThrow(
      RepositoryError,
    );
  });

  it("raises a typed error naming the release when Postgres refuses it", async () => {
    const harness = rpcHarness([{ data: null, error: pgError("XX000", "boom") }]);
    const error = await harness.repository.releaseReservation("VAL_a", "E1").then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(error).toBeInstanceOf(RepositoryError);
    expect((error as RepositoryError).operation).toBe(
      ENTRY_RESERVATIONS_OPERATIONS.releaseReservation,
    );
  });
});
