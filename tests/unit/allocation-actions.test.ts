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
    /**
     * The entries this validator has ALREADY answered, as `listEntryIdsForValidator` reports them.
     *
     * Added by the continuation work. The exclusion of already-answered entries is a guarantee that
     * already belongs to `batch-allocation` and is already proven at the allocation unit, so the
     * question `tasks.md` 2.5 asks is not "does allocation exclude them" but "does the path the
     * CONTINUE control actually calls still exclude them". Driving this through the Server Action's
     * core is what makes that a different experiment rather than a re-derivation from the same
     * implementation the original proof used.
     */
    readonly answered?: string[];
    /**
     * The stored proficiency for the known validator. Defaults to an approved
     * answer; passing `null` builds the pre-correction attempt the screening
     * gate exists for, so the refusal can be driven through this action core
     * rather than asserted only at the service seam.
     */
    readonly profileProficiency?: "fluent" | null;
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
        // `??` would be wrong here for the same reason as in
        // `allocation-service.test.ts`: `null` is the meaningful fixture value.
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
        return [...(over.answered ?? [])];
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
      async listForRecovery() {
        // Never reached by allocation. Present because this object is CAST to
        // `AllocationActionDependencies`, and a cast makes the compiler unable to check a missing
        // member — so nothing but a test would notice its absence, and nothing at all would notice it
        // while every assertion here stayed green.
        calls.push("batches.listForRecovery");
        return [];
      },
    },
    entryReservations: {
      // Grants everything requested: this file drives the action's intake, failure mapping, and
      // continuation path, not contention — the claim/backfill contract belongs to
      // `allocation-service.test.ts`, whose fake arbitrates. A fake that denied here would turn
      // every test in this file into a contention test wearing an intake test's name.
      async claimReservations(_validatorId: string, entryIds: string[]) {
        calls.push("entryReservations.claimReservations");
        return [...entryIds];
      },
      async releaseReservation() {
        calls.push("entryReservations.releaseReservation");
      },
    },
    config: allocationConfigSchema.parse({}),
    random: () => 0,
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
      { validatorId: "VAL_a81d92c1", entryIds: ["OD_0001", "OD_0002"] },
      dependencies,
    );

    expect(outcome).toEqual({ status: "failed", reason: "invalid" });
    expect(calls).toEqual([]);
  });

  it("rejects a submitted order for the same reason", async () => {
    const { dependencies } = createRecordingDependencies();

    const outcome = await runAllocateBatch(
      { validatorId: "VAL_a81d92c1", order: ["OD_0002", "OD_0001"] },
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

  it("reports screening_required for a recognised validator with no recorded answer", async () => {
    // The methodology gate at the action boundary: a pre-correction attempt
    // holds a valid identifier but no proficiency answer, so no batch may be
    // minted for it — and the refusal carries the dedicated reason rather than
    // collapsing into persistence or exhaustion.
    const { dependencies, calls } = createRecordingDependencies({
      pool: [{ id: "OD_0001" }],
      profileProficiency: null,
    });

    const outcome = await runAllocateBatch(VALID, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "screening_required" });
    // And nothing was created or claimed on the way out: the only repository
    // call is the profile read that refused the request.
    expect(calls).toEqual(["validators.findById"]);
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

describe("continuing after a finished batch, through the action the continue control calls", () => {
  /**
   * ==============================================================================================
   * WHAT THIS BLOCK IS, AND WHY IT IS NOT THE EXISTING ALLOCATION GUARANTEE RE-DERIVED
   * ==============================================================================================
   * `tasks.md` 2.5 asks for the exclusion of already-answered entries to be asserted "through the
   * continue path, rather than only at the allocation unit", and its own verification warns that
   * "re-deriving a guarantee from its own implementation proves nothing". So the experiment here is
   * deliberately a different one from `allocate-batch.test.ts`'s:
   *
   *   - it goes through `runAllocateBatch`, which is the function `requestBatchAction` delegates to and
   *     therefore the one a press on the finished screen's continue control actually reaches;
   *   - it supplies the exclusion through the REPOSITORY seam (`listEntryIdsForValidator`) rather than
   *     by calling the selection rule, so the assertion is about what the action's callers observe.
   *
   * What it does NOT do is re-test `selectBatchEntries`' ordering or shuffling. Those belong
   * to the allocation unit and are not restated here.
   */

  it("excludes every entry the validator already answered, from the batch the action returns", async () => {
    // A pool of six and a batch size of four, so the exclusion is LOAD-BEARING: if nothing were
    // excluded the action would still return four entries and a weaker assertion — "some entries were
    // returned" — would pass. Asserted as a set difference against the whole pool instead, so a
    // response that happened to return the right COUNT with an answered entry among it fails.
    const pool = Array.from({ length: 6 }, (_, index) => ({ id: `OD_00${index + 10}` }));
    const answered = ["OD_0010", "OD_0012"];
    const { dependencies, calls } = createRecordingDependencies({ pool, answered });

    const outcome = await runAllocateBatch(
      { validatorId: "VAL_a81d92c1", requestedSize: 4 },
      dependencies,
    );

    if (outcome.status !== "allocated") {
      throw new Error(`expected an allocated batch, got ${JSON.stringify(outcome)}`);
    }

    // The exclusion is real: a batch was produced, and none of the answered entries is in it.
    expect(outcome.entries.length).toBe(4);
    const allocatedIds = outcome.entries.map((entry) => entry.id);
    for (const entryId of answered) {
      expect(
        allocatedIds,
        `${entryId} was already answered and must not be re-served`,
      ).not.toContain(entryId);
    }
    // And it came from the exclusion rather than from the pool having shrunk: the unanswered entries
    // really were available. Measured, not assumed — a fixture whose pool omitted the answered ids
    // would make every assertion above pass with the exclusion switched off.
    expect(calls).toContain("validations.listEntryIdsForValidator");
    expect(allocatedIds.filter((id) => !answered.includes(id))).toHaveLength(4);
    expect(pool.filter((entry) => answered.includes(entry.id))).toHaveLength(2);
  });

  it("CAN FIRE: the SAME action re-serves an answered entry once the exclusion is not consulted", () => {
    // The control for the assertion above, and it is the one that makes it a guard. A repository whose
    // `listEntryIdsForValidator` returns nothing is not a broken fixture — it is exactly what a
    // participant's SECOND browser looks like, and it is what the assertion above would silently be
    // passing if the exclusion were not really being applied.
    //
    // The same pool, the same size, the same validator, the same action. Only the answered list
    // differs, and the answer differs with it — which is what proves the exclusion is load-bearing
    // rather than incidental to the pool's size.
    const pool = [{ id: "OD_0010" }, { id: "OD_0012" }];
    const withAnswers = createRecordingDependencies({ pool, answered: ["OD_0010"] });
    const withoutAnswers = createRecordingDependencies({ pool, answered: [] });

    const excluded = runAllocateBatch({ validatorId: "VAL_a81d92c1" }, withAnswers.dependencies);
    const included = runAllocateBatch({ validatorId: "VAL_a81d92c1" }, withoutAnswers.dependencies);

    return Promise.all([excluded, included]).then(([after, before]) => {
      if (after.status !== "allocated" || before.status !== "allocated") {
        throw new Error("both requests were expected to allocate");
      }
      // Without the exclusion the answered entry IS served; with it, it is not.
      expect(before.entries.map((entry) => entry.id)).toContain("OD_0010");
      expect(after.entries.map((entry) => entry.id)).not.toContain("OD_0010");
      // And the two runs really did differ, so the first assertion is a comparison and not a tautology.
      expect(after.entries.map((entry) => entry.id)).not.toEqual(
        before.entries.map((entry) => entry.id),
      );
    });
  });

  it("creates NO batch when continuing finds the pool exhausted, even with a non-empty dataset", async () => {
    // `tasks.md` 2.4's verification, and the load-bearing half of "no batch is fabricated".
    //
    // An EMPTY pool would be a weak control: a service that returned `exhausted` because it had
    // nothing to read is trivially not going to create a batch. So the pool here is NON-EMPTY and the
    // exhaustion comes from the exclusion — every remaining entry is one this validator has already
    // answered. That is precisely the situation a validator lands in after working through the whole
    // dataset, and it is the one where a service that allocated anyway would create an empty batch.
    const pool = Array.from({ length: 5 }, (_, index) => ({ id: `OD_00${index + 20}` }));
    const answered = pool.map((entry) => entry.id);
    const { dependencies, calls } = createRecordingDependencies({ pool, answered });

    const outcome = await runAllocateBatch(VALID, dependencies);

    // The fixture really is the hard case, asserted rather than assumed: a non-empty pool whose every
    // entry is excluded.
    expect(pool).toHaveLength(5);
    expect(answered).toEqual(pool.map((entry) => entry.id));
    expect(calls).toContain("datasetEntries.listActive");

    expect(outcome).toEqual({ status: "exhausted" });
    // THE CLAIM. Counted over the recorded calls, not inferred from the outcome shape: a service that
    // created an empty batch and then reported `exhausted` would satisfy the assertion above.
    expect(calls.filter((call) => call === "batches.create")).toEqual([]);
    // And the outcome carries no batch id to navigate to, so the continue control has nothing to
    // present — checked as a property of the value rather than of the component that reads it.
    expect("batchId" in outcome).toBe(false);
  });

  it("CAN FIRE: the same action DOES create a batch when the pool is not exhausted", () => {
    // The control for the assertion above, and the reason the count of zero means something. Identical
    // fixture, identical call, with ONE entry not yet answered — so the only difference is whether
    // anything is eligible, and the write appears and disappears with it.
    const pool = Array.from({ length: 5 }, (_, index) => ({ id: `OD_00${index + 20}` }));
    const all = pool.map((entry) => entry.id);
    const allButOne = all.slice(0, 4);
    const exhausted = createRecordingDependencies({ pool, answered: all });
    const eligible = createRecordingDependencies({ pool, answered: allButOne });

    return Promise.all([
      runAllocateBatch(VALID, exhausted.dependencies),
      runAllocateBatch(VALID, eligible.dependencies),
    ]).then(([nothingLeft, somethingLeft]) => {
      expect(nothingLeft.status).toBe("exhausted");
      expect(somethingLeft.status).toBe("allocated");
      // THE MEASUREMENT THE GUARD RESTS ON: the same action, the same repository shape, and the write
      // is present in one and absent in the other.
      expect(exhausted.calls.filter((call) => call === "batches.create")).toHaveLength(0);
      expect(eligible.calls.filter((call) => call === "batches.create")).toHaveLength(1);
    });
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
