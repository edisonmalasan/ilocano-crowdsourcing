import { describe, expect, it, vi } from "vitest";

import { runAllocateBatch } from "@/lib/allocation/allocation-actions-core";
import { RepositoryError } from "@/lib/repositories";
import type { AllocateBatchInput, AllocatedPlacement, BatchesRepository } from "@/lib/repositories";
import type { AllocationActionDependencies } from "@/lib/allocation/allocation-actions-core";
import { allocationConfigSchema } from "@/schemas/batch";
import type { BatchRecord } from "@/schemas/batch";
import type { DatasetEntry } from "@/schemas/dataset";

/**
 * `server-only` cannot be imported under Vitest, so the module marker is stubbed here.
 */
vi.mock("server-only", () => ({}));

/**
 * The allocation Server Action's CORE — the half that is reachable in this environment.
 *
 * =============================================================================
 * WHY THIS IS SEPARATE FROM THE WRAPPER TEST, and why neither is redundant
 * =============================================================================
 * `allocation-actions-wrapper.test.ts` drives the `"use server"` file with the environment module
 * stubbed to throw. That is the path that ACTUALLY RUNS in the current deployment, where all three
 * `SUPABASE_*` variables are absent.
 *
 * This file drives the core with dependencies injected. In the real deployment the core's
 * `ConfigurationFailure` branch is UNREACHABLE — `actionDependencies()` calls `getServerEnv()` while
 * building the argument, so the throw happens before `runAllocateBatch` is entered. So the core's
 * classification is proven here with a fake the real repositories never throw, and the wrapper's
 * translation of the throw it actually receives is proven there. A test of only one leaves the other
 * path unexercised, which is the gap a green checkmark once hid in this repository.
 *
 * =============================================================================
 * WHAT THIS DOES NOT PROVE
 * =============================================================================
 * That a Supabase client can be constructed, that any query reaches PostgREST, or that the wrapper
 * builds its dependencies correctly on a configured deployment. No credential exists, so nothing here
 * has ever spoken to a database. Selection, exclusion, and contention are proven against a real
 * engine in `tests/integration/allocation-rpc-parity.test.ts` — a fake that enforced the
 * answered-exclusion here would be testing the fake, so this file proves the WIRING (identity
 * forwarded, grant returned) and leaves the rule to the engine.
 */

/** A dependency set that records every repository call and never reaches a database. */
function createRecordingDependencies(
  over: {
    readonly knownValidator?: boolean;
    readonly pool?: { id: string }[];
    /** Granted placements the fake allocation call answers with. Defaults to the pool. */
    readonly grants?: AllocatedPlacement[];
    /**
     * The stored proficiency for the known validator. Defaults to an approved
     * answer; passing `null` builds the pre-correction attempt the screening
     * gate exists for, so the refusal can be driven through this action core
     * rather than asserted only at the service seam.
     */
    readonly profileProficiency?: "fluent" | null;
    readonly allocateFailure?: unknown;
  } = {},
) {
  const calls: string[] = [];

  const poolEntries = (over.pool ?? []).map((entry) => ({
    id: entry.id,
    category: "origin_destination" as const,
    sourceEntryId: 1,
    categoryName: "Origin + Destination",
    instruction: `Langet an ti ${entry.id}.`,
    origin: "Bangon",
    destination: "Kablantayan",
    transitMode: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    isActive: true,
  })) satisfies DatasetEntry[];

  const grants: AllocatedPlacement[] =
    over.grants ?? poolEntries.map((entry, index) => ({ entryId: entry.id, position: index + 1 }));

  const dependencies = {
    validators: {
      async findById(id: string) {
        calls.push("validators.findById");
        const proficiency =
          over.profileProficiency === undefined ? "fluent" : over.profileProficiency;
        return (over.knownValidator ?? true)
          ? {
              id,
              ilocanoProficiency: proficiency as "fluent" | null,
              createdAt: "2026-09-30T00:00:00.000Z",
              lastActiveAt: "2026-09-30T00:00:00.000Z",
              totalValidations: 0,
            }
          : null;
      },
    },
    batches: {
      async allocate() {
        calls.push("batches.allocate");
        if (over.allocateFailure !== undefined) throw over.allocateFailure;
        return [...grants];
      },
      async findById(id: string) {
        calls.push("batches.findById");
        if (grants.length === 0) return null;
        return {
          id,
          validatorId: "VAL_a81d92c1",
          entries: grants.map((placement) => ({ datasetEntryId: placement.entryId })),
        } as BatchRecord;
      },
      async listForRecovery() {
        calls.push("batches.listForRecovery");
        return [];
      },
    } satisfies Pick<BatchesRepository, "allocate" | "findById" | "listForRecovery">,
    datasetEntries: {
      async listByIds(ids: string[]) {
        calls.push("datasetEntries.listByIds");
        return poolEntries.filter((entry) => ids.includes(entry.id));
      },
    },
    config: allocationConfigSchema.parse({}),
    // The identifier AND the instant, from ONE minting call. A fixture returning only an id would have
    // satisfied the old shape while leaving `create` with nothing to write to `created_at` — and no
    // assertion in this file would have said so, because the failure would surface only against a
    // database that does not exist here.
    newBatch: (validatorId: string) => ({
      id: `${validatorId}-batch`,
      createdAt: "2026-09-30T00:00:00.000Z",
    }),
    ConfigurationFailure: class ServerEnvError extends Error {},
  } as unknown as AllocationActionDependencies;

  return { dependencies, calls };
}

const VALID = { validatorId: "VAL_a81d92c1" };

describe("a rejected payload", () => {
  it("makes zero repository calls", async () => {
    // The boundary rule itself, asserted rather than assumed. A rejected payload that still reached a
    // repository would have already told the database something the caller got wrong.
    const { dependencies, calls } = createRecordingDependencies();

    const outcome = await runAllocateBatch({ validatorId: "not-an-id" }, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "invalid" });
    expect(calls).toEqual([]);
  });

  it("makes zero repository calls for a payload of the wrong shape entirely", async () => {
    for (const raw of [null, undefined, 42, "VAL_a81d92c1", [], {}]) {
      const { dependencies, calls } = createRecordingDependencies();

      await runAllocateBatch(raw, dependencies);

      expect(calls, `expected no repository call for ${JSON.stringify(raw)}`).toEqual([]);
    }
  });

  it("rejects an entry list, because a client may not choose what it receives", async () => {
    // The spec says such values are IGNORED. Rejecting is a strictly safer reading of that: a payload
    // carrying `entryIds` that is silently stripped looks, from outside, exactly like a successful
    // request whose values happened not to matter — and the first time somebody added an `entryIds`
    // field the service really did read, nothing about the request would have looked different.
    const { dependencies, calls } = createRecordingDependencies();

    const outcome = await runAllocateBatch(
      { validatorId: "VAL_a81d92c1", entryIds: ["OD_1", "OD_2"] },
      dependencies,
    );

    expect(outcome).toEqual({ status: "failed", reason: "invalid" });
    expect(calls).toEqual([]);
  });

  it("rejects a submitted order for the same reason", async () => {
    const { dependencies } = createRecordingDependencies();

    const outcome = await runAllocateBatch(
      { validatorId: "VAL_a81d92c1", order: ["OD_2", "OD_1"] },
      dependencies,
    );

    expect(outcome).toEqual({ status: "failed", reason: "invalid" });
  });

  it("rejects a submitted coverage target, because no such setting exists", async () => {
    // The one deliberate exception to "no fixture carries a target": this test's whole point is to
    // submit one. The intake is a `strictObject`, so an unrecognised key is rejected rather than
    // stripped — and a coverage target is unrecognised by design, since the corrected methodology
    // holds no number for it to set. Deleting this fixture would delete the only runtime witness
    // of the ADDED scenario "A client cannot supply a coverage target".
    const { dependencies } = createRecordingDependencies();

    const outcome = await runAllocateBatch(
      { validatorId: "VAL_a81d92c1", coverageTarget: 1 },
      dependencies,
    );

    expect(outcome).toEqual({ status: "failed", reason: "invalid" });
  });

  // The name says REJECTS and nothing more, and the narrowing is deliberate. An earlier version of
  // this name was "rejects submitted positions rather than honouring or ignoring them", which claimed
  // the test covers all three outcomes. It cannot: a boundary that rejects has no "honoured" path to
  // observe, and a test asserting absence of a key is not an assertion about behaviour. Whether the
  // service WOULD honour such a key is pinned elsewhere and at a different layer — a type-level
  // exact-key assertion, measured to fail `pnpm run typecheck` when a third
  // field is added to the intent.
  it("rejects submitted positions, so the batch is never client-ordered", async () => {
    const { dependencies, calls } = createRecordingDependencies();

    const outcome = await runAllocateBatch(
      { validatorId: "VAL_a81d92c1", positions: { OD_1: 3 } },
      dependencies,
    );

    expect(outcome).toEqual({ status: "failed", reason: "invalid" });
    expect(calls).toEqual([]);
  });

  it("rejects a non-positive or non-integer requested size", async () => {
    for (const requestedSize of [0, -1, 2.5]) {
      const { dependencies, calls } = createRecordingDependencies();

      const outcome = await runAllocateBatch(
        { validatorId: "VAL_a81d92c1", requestedSize },
        dependencies,
      );

      expect(outcome, `expected requestedSize ${requestedSize} to be rejected`).toEqual({
        status: "failed",
        reason: "invalid",
      });
      expect(calls).toEqual([]);
    }
  });

  it("reports no batch id on a rejected payload", async () => {
    const { dependencies } = createRecordingDependencies();

    const outcome = await runAllocateBatch({ validatorId: "nope" }, dependencies);

    // A client that can read a batch id out of a failed response will treat it as stored.
    expect(outcome).not.toHaveProperty("batchId");
  });
});

describe("an accepted payload", () => {
  it("passes the size preference to the allocation call, capped by configuration", async () => {
    // The grant is scripted, so entries length cannot prove the cap travelled: the assertion
    // reads the input the service handed the call, which is the property under test.
    const seen: AllocateBatchInput[] = [];
    for (const size of [2, 500]) {
      const harness = createRecordingDependencies({ pool: [{ id: "OD_1" }] });
      const batches = harness.dependencies.batches as unknown as {
        allocate: (input: AllocateBatchInput) => Promise<AllocatedPlacement[]>;
      };
      const inner = batches.allocate.bind(batches);
      batches.allocate = async (input) => {
        seen.push(input);
        return inner(input);
      };
      const outcome = await runAllocateBatch(
        { validatorId: "VAL_a81d92c1", requestedSize: size },
        harness.dependencies,
      );
      expect(outcome.status).toBe("allocated");
    }
    // A smaller preference travels through; an enormous one is capped at the configured size.
    expect(seen.map((input) => input.size)).toEqual([
      2,
      allocationConfigSchema.parse({}).batchSize,
    ]);
  });

  it("mints the batch from the REQUESTED validator, not from anything in the payload", async () => {
    const { dependencies, calls } = createRecordingDependencies({ pool: [{ id: "OD_1" }] });

    const outcome = await runAllocateBatch(
      { validatorId: "VAL_a81d92c1", requestedSize: 1 },
      dependencies,
    );

    expect(calls).toContain("validators.findById");
    expect(outcome).toMatchObject({ batchId: "VAL_a81d92c1-batch" });
  });

  it("allocates when the request carries nothing but an identifier", async () => {
    const { dependencies } = createRecordingDependencies({ pool: [{ id: "OD_1" }] });

    const outcome = await runAllocateBatch(VALID, dependencies);

    expect(outcome).toMatchObject({ status: "allocated", batchId: "VAL_a81d92c1-batch" });
  });

  it("reports unknown_validator for a well-formed identifier naming nobody", async () => {
    // The write-intake boundary only checks the FORMAT. What the identifier names is the service's
    // question, and a stale local-storage value is the most likely way to arrive here.
    const { dependencies } = createRecordingDependencies({ knownValidator: false, pool: [] });

    const outcome = await runAllocateBatch({ validatorId: "VAL_deadbeef" }, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "unknown_validator" });
  });

  it("reports screening_required for a recognised validator with no recorded answer", async () => {
    // The methodology gate at the action boundary: a pre-correction attempt
    // holds a valid identifier but no proficiency answer, so no batch may be
    // minted for it — and the refusal carries the dedicated reason rather than
    // collapsing into persistence or exhaustion.
    const { dependencies, calls } = createRecordingDependencies({
      pool: [{ id: "OD_1" }],
      profileProficiency: null,
    });

    const outcome = await runAllocateBatch(VALID, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "screening_required" });
    // And nothing was created or claimed on the way out: the only repository
    // call is the profile read that refused the request.
    expect(calls).toEqual(["validators.findById"]);
  });

  it("reports exhausted when the allocation call grants nothing", async () => {
    const { dependencies } = createRecordingDependencies({ pool: [{ id: "OD_1" }], grants: [] });

    const outcome = await runAllocateBatch(VALID, dependencies);

    expect(outcome).toEqual({ status: "exhausted" });
  });

  it("propagates the service's persistence classification unchanged", async () => {
    const { dependencies } = createRecordingDependencies({
      pool: [{ id: "OD_1" }],
      allocateFailure: new RepositoryError("validation_batches.allocate", "call rejected"),
    });

    const outcome = await runAllocateBatch(VALID, dependencies);

    // Re-deriving the mapping here would be a second place to get it wrong.
    expect(outcome).toEqual({ status: "failed", reason: "persistence" });
  });
});

describe("continuing after a finished batch, through the action the continue control calls", () => {
  /**
   * Through `runAllocateBatch` — the function `requestBatchAction` delegates to and therefore
   * the one a press on the finished screen's continue control actually reaches — asserting the
   * WIRING rather than the rule: the requesting validator's identity reaches the allocation
   * call, and the grant it answers with is what the action reports. Selection, exclusion, and
   * contention belong to the versioned function and are proven against a real engine in
   * `tests/integration/allocation-rpc-parity.test.ts`; a fake that enforced the
   * answered-exclusion here would be testing the fake, so this block does not attempt it.
   */

  it("forwards the requesting validator to the allocation call and returns its grant", async () => {
    const { dependencies, calls } = createRecordingDependencies({
      pool: [{ id: "OD_10" }, { id: "OD_12" }],
    });

    const outcome = await runAllocateBatch(
      { validatorId: "VAL_a81d92c1", requestedSize: 4 },
      dependencies,
    );

    if (outcome.status !== "allocated") {
      throw new Error(`expected an allocated batch, got ${JSON.stringify(outcome)}`);
    }
    expect(calls).toContain("batches.allocate");
    expect(outcome.entries.map((entry) => entry.id).sort()).toEqual(["OD_10", "OD_12"]);
  });

  it("creates NO batch when the call grants nothing, even with a non-empty dataset", async () => {
    // A non-empty pool whose grant is empty: the honest outcome is exhaustion with nothing
    // persisted. Counted over the recorded calls, not inferred from the outcome shape: a
    // service that persisted an empty batch and then reported `exhausted` would satisfy an
    // outcome-only assertion.
    const { dependencies, calls } = createRecordingDependencies({
      pool: [{ id: "OD_20" }],
      grants: [],
    });

    const outcome = await runAllocateBatch(VALID, dependencies);

    expect(outcome).toEqual({ status: "exhausted" });
    expect(calls).not.toContain("batches.findById");
    expect("batchId" in outcome).toBe(false);
  });
});
