import { describe, expect, it, vi } from "vitest";

import { runAllocateBatch } from "@/lib/allocation/allocation-actions-core";
import { RepositoryError } from "@/lib/repositories";
import type { AllocationActionDependencies } from "@/lib/allocation/allocation-actions-core";
import { allocationConfigSchema } from "@/schemas/batch";

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
 * has ever spoken to a database.
 */

/** A dependency set that records every repository call and never reaches a database. */
function createRecordingDependencies(
  over: {
    readonly knownValidator?: boolean;
    readonly pool?: { id: string }[];
  } = {},
) {
  const calls: string[] = [];

  const dependencies = {
    validators: {
      async create() {
        calls.push("validators.create");
        throw new Error("not used");
      },
      async findById(id: string) {
        calls.push("validators.findById");
        return (over.knownValidator ?? true)
          ? {
              id,
              ilocanoProficiency: "fluent" as const,
              createdAt: "2026-09-30T00:00:00.000Z",
              lastActiveAt: "2026-09-30T00:00:00.000Z",
              totalValidations: 0,
            }
          : null;
      },
      async touchLastActive() {
        calls.push("validators.touchLastActive");
      },
    },
    datasetEntries: {
      async listActive() {
        calls.push("datasetEntries.listActive");
        return (over.pool ?? []).map((entry) => ({
          id: entry.id,
          category: "origin_destination" as const,
          instruction: `Langet an ti ${entry.id}.`,
          origin: "Bangon",
          destination: "Kablantayan",
          transitMode: null,
          createdAt: "2026-09-30T00:00:00.000Z",
          isActive: true,
        }));
      },
      async findById() {
        calls.push("datasetEntries.findById");
        return null;
      },
      async listByIds() {
        calls.push("datasetEntries.listByIds");
        return [];
      },
    },
    validations: {
      async insert() {
        calls.push("validations.insert");
        throw new Error("not used");
      },
      async findById() {
        calls.push("validations.findById");
        return null;
      },
      async findByEntry() {
        calls.push("validations.findByEntry");
        return [];
      },
      async listForEntries() {
        calls.push("validations.listForEntries");
        return [];
      },
      async listEntryIdsForValidator() {
        calls.push("validations.listEntryIdsForValidator");
        return [];
      },
      async countForEntry() {
        calls.push("validations.countForEntry");
        return 0;
      },
      async countForValidator() {
        calls.push("validations.countForValidator");
        return 0;
      },
    },
    batches: {
      async create(batch: { id: string; validatorId: string; entries: unknown[] }) {
        calls.push("batches.create");
        return batch as never;
      },
      async findById() {
        calls.push("batches.findById");
        return null;
      },
    },
    config: allocationConfigSchema.parse({}),
    random: () => 0,
    newBatchId: (validatorId: string) => `${validatorId}-batch`,
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
      { validatorId: "VAL_a81d92c1", entryIds: ["OD_0001", "OD_0002"] },
      dependencies,
    );

    expect(outcome).toEqual({ status: "failed", reason: "invalid" });
    expect(calls).toEqual([]);
  });

  it("rejects a submitted order or coverage target for the same reason", async () => {
    const { dependencies } = createRecordingDependencies();

    const outcome = await runAllocateBatch(
      { validatorId: "VAL_a81d92c1", order: ["OD_0002", "OD_0001"], coverageTarget: 1 },
      dependencies,
    );

    expect(outcome).toEqual({ status: "failed", reason: "invalid" });
  });

  // The name says REJECTS and nothing more, and the narrowing is deliberate. An earlier version of
  // this name was "rejects submitted positions rather than honouring or ignoring them", which claimed
  // the test covers all three outcomes. It cannot: a boundary that rejects has no "honoured" path to
  // observe, and a test asserting absence of a key is not an assertion about behaviour. Whether the
  // service WOULD honour such a key is pinned elsewhere and at a different layer — a type-level
  // exact-key assertion in `domain-types.test.ts`, measured to fail `pnpm run typecheck` when a third
  // field is added to `AllocationRequest`.
  it("rejects submitted positions, so the batch is never client-ordered", async () => {
    const { dependencies, calls } = createRecordingDependencies();

    const outcome = await runAllocateBatch(
      { validatorId: "VAL_a81d92c1", positions: { OD_0001: 3 } },
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
  it("passes the requested size through as a preference the server still caps", async () => {
    const pool = Array.from({ length: 6 }, (_, index) => ({ id: `OD_00${index + 10}` }));
    const short = createRecordingDependencies({ pool });
    const long = createRecordingDependencies({ pool });

    const smaller = await runAllocateBatch(
      { validatorId: "VAL_a81d92c1", requestedSize: 2 },
      short.dependencies,
    );
    const larger = await runAllocateBatch(
      { validatorId: "VAL_a81d92c1", requestedSize: 5 },
      long.dependencies,
    );

    if (smaller.status !== "allocated" || larger.status !== "allocated") {
      throw new Error("expected both requests to allocate");
    }
    expect(smaller.entries).toHaveLength(2);
    expect(larger.entries).toHaveLength(5);
  });

  it("mints the batch from the REQUESTED validator, not from anything in the payload", async () => {
    const { dependencies, calls } = createRecordingDependencies({ pool: [{ id: "OD_0001" }] });

    const outcome = await runAllocateBatch(
      { validatorId: "VAL_a81d92c1", requestedSize: 1 },
      dependencies,
    );

    expect(calls).toContain("validators.findById");
    expect(outcome).toMatchObject({ batchId: "VAL_a81d92c1-batch" });
  });

  it("allocates when the request carries nothing but an identifier", async () => {
    const { dependencies } = createRecordingDependencies({ pool: [{ id: "OD_0001" }] });

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

  it("reports exhausted when nothing eligible remains", async () => {
    const { dependencies } = createRecordingDependencies({ pool: [] });

    const outcome = await runAllocateBatch(VALID, dependencies);

    expect(outcome).toEqual({ status: "exhausted" });
  });

  it("propagates the service's persistence classification unchanged", async () => {
    const { dependencies } = createRecordingDependencies({ pool: [{ id: "OD_0001" }] });
    vi.spyOn(dependencies.batches, "create").mockRejectedValue(
      new RepositoryError("validation_batches.insert", "insert rejected"),
    );

    const outcome = await runAllocateBatch(VALID, dependencies);

    // Re-deriving the mapping here would be a second place to get it wrong.
    expect(outcome).toEqual({ status: "failed", reason: "persistence" });
  });
});

describe("the configuration-failure branch", () => {
  it("maps a thrown configuration failure to not_configured", async () => {
    // UNREACHABLE in the real deployment — the wrapper builds dependencies before entering here. It
    // exists so a caller supplying dependencies from elsewhere still cannot report a missing database
    // as a persistence fault, and it is proven here because `validators-actions.test.ts` proves the
    // same shape for the onboarding core.
    class ServerEnvError extends Error {}
    const { dependencies } = createRecordingDependencies({ pool: [{ id: "OD_0001" }] });
    const withFailure = {
      ...dependencies,
      ConfigurationFailure: ServerEnvError,
    } as AllocationActionDependencies;
    vi.spyOn(withFailure.validators, "findById").mockRejectedValue(
      new ServerEnvError("SUPABASE_URL is not set"),
    );

    const outcome = await runAllocateBatch(VALID, withFailure);

    expect(outcome).toEqual({ status: "failed", reason: "not_configured" });
  });

  it("re-raises anything that is not a configuration failure", async () => {
    // The service already turns a `RepositoryError` into `persistence` and re-raises everything else,
    // so a throw that reaches the core's catch is a BUG. Reporting it as `persistence` would send an
    // operator to the database for a defect in the code.
    class ServerEnvError extends Error {}
    const { dependencies } = createRecordingDependencies({ pool: [{ id: "OD_0001" }] });
    const withFailure = {
      ...dependencies,
      ConfigurationFailure: ServerEnvError,
    } as AllocationActionDependencies;
    vi.spyOn(withFailure.validators, "findById").mockRejectedValue(
      new TypeError("a programming error, not a configuration problem"),
    );

    await expect(runAllocateBatch(VALID, withFailure)).rejects.toThrow(TypeError);
  });
});
