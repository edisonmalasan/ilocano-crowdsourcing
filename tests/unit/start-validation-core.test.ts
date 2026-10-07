import { describe, expect, it, vi } from "vitest";

import { RepositoryError } from "@/lib/repositories";
import type {
  AllocatedPlacement,
  BatchesRepository,
  ValidatorsRepository,
  ValidationsRepository,
  DatasetEntriesRepository,
} from "@/lib/repositories";
import type { RecoverableBatch } from "@/lib/domain/batch-recovery";
import { allocationConfigSchema } from "@/schemas/batch";
import type { BatchRecord } from "@/schemas/batch";
import type { DatasetEntry } from "@/schemas/dataset";

import {
  runStartValidation,
  startValidationIntentSchema,
  type StartValidationDependencies,
  type StartValidationIntentKeysAreIdentifierAndSizeOnly,
  type StartValidationOutcomeKeysAreBatchIdEntryPositionTotalAndCountOnly,
} from "@/lib/validation/start-validation-core";

/**
 * `server-only` cannot be imported under Vitest, so the module marker is stubbed here.
 */
vi.mock("server-only", () => ({}));

/**
 * The start orchestration's CORE — driven against recording fakes.
 *
 * The core is a thin sequencer over `recognizeInterruptedBatch`, `allocateBatch`,
 * `resolveSessionEntry`, and `projectAllocatedEntry`. Selection, exclusion, contention,
 * and SQL parity belong to the versioned allocation function and are proven against a
 * real engine in `tests/integration/allocation-rpc-parity.test.ts`; a fake that enforced
 * them here would be testing the fake. This file proves the WIRING the orchestration
 * owns: the order (recovery before allocation), the write silence of the resume arm,
 * the narrowed single-entry result, the strict intent, and the terminal-outcome mapping.
 *
 * WHAT THIS DOES NOT PROVE: that a Supabase client can be constructed, that any query
 * reaches PostgREST, or that the wrapper builds its dependencies correctly on a
 * configured deployment. `start-validation-actions-wrapper.test.ts` drives the wrapper
 * with the environment module stubbed to throw, which is the path that actually runs
 * here.
 */

/** Type-level pin is consumed here, so a third intent key fails `pnpm run typecheck`. */
const INTENT_KEYS_ARE_IDENTIFIER_AND_SIZE_ONLY: StartValidationIntentKeysAreIdentifierAndSizeOnly = true;
void INTENT_KEYS_ARE_IDENTIFIER_AND_SIZE_ONLY;

/** Type-level pin is consumed here, so a seventh result key fails `pnpm run typecheck`. */
const OUTCOME_KEYS_ARE_BATCH_ID_ENTRY_POSITION_TOTAL_AND_COUNT_ONLY: StartValidationOutcomeKeysAreBatchIdEntryPositionTotalAndCountOnly = true;
void OUTCOME_KEYS_ARE_BATCH_ID_ENTRY_POSITION_TOTAL_AND_COUNT_ONLY;

function datasetEntry(id: string): DatasetEntry {
  return {
    id,
    category: "origin_destination",
    sourceEntryId: 1,
    categoryName: "Origin + Destination",
    instruction: `Iti ${id} ti ayanko ita; masapulko a makadanon iti ${id} a pagtaengan.`,
    origin: "Bangon",
    destination: "Kablantayan",
    transitMode: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    isActive: true,
  } as DatasetEntry;
}

interface Scenario {
  readonly knownValidator?: boolean;
  readonly profileProficiency?: "fluent" | null;
  /** Batches the recovery read answers with. Defaults to none. */
  readonly recoveryBatches?: RecoverableBatch[];
  /** Entry ids the validator has answered. Defaults to none. */
  readonly answered?: string[];
  /** Pool entries backing both `listByIds` and `findById`. Defaults to OD_1..OD_2. */
  readonly pool?: DatasetEntry[];
  /** Granted placements the fake allocation call answers with. Defaults to the pool. */
  readonly grants?: AllocatedPlacement[];
  readonly allocateFailure?: unknown;
  readonly recoveryFailure?: unknown;
  readonly findBatchFailure?: unknown;
}

function createScenarioDependencies(over: Scenario = {}) {
  const calls: string[] = [];
  const pool = over.pool ?? [datasetEntry("OD_1"), datasetEntry("OD_2")];
  const grants: AllocatedPlacement[] =
    over.grants ?? pool.map((entry, index) => ({ entryId: entry.id, position: index + 1 }));

  const batchIdFor = (validatorId: string) => `${validatorId}-batch`;
  const storedBatch = (id: string): BatchRecord => ({
    id,
    validatorId: "VAL_a81d92c1",
    entries: grants.map((placement) => ({
      datasetEntryId: placement.entryId,
      position: placement.position,
    })),
  });

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
    } as Pick<ValidatorsRepository, "findById">,
    validations: {
      async listEntryIdsForValidator() {
        calls.push("validations.listEntryIdsForValidator");
        return [...(over.answered ?? [])];
      },
    } as Pick<ValidationsRepository, "listEntryIdsForValidator">,
    batches: {
      async listForRecovery() {
        calls.push("batches.listForRecovery");
        if (over.recoveryFailure !== undefined) throw over.recoveryFailure;
        return [...(over.recoveryBatches ?? [])];
      },
      async allocate() {
        calls.push("batches.allocate");
        if (over.allocateFailure !== undefined) throw over.allocateFailure;
        return [...grants];
      },
      async findById(id: string) {
        calls.push("batches.findById");
        if (over.findBatchFailure !== undefined) throw over.findBatchFailure;
        if (grants.length === 0) return null;
        return storedBatch(id);
      },
    } as Pick<BatchesRepository, "listForRecovery" | "allocate" | "findById">,
    datasetEntries: {
      async findById(id: string) {
        calls.push("datasetEntries.findById");
        return pool.find((entry) => entry.id === id) ?? null;
      },
      async listByIds(ids: string[]) {
        calls.push("datasetEntries.listByIds");
        return pool.filter((entry) => ids.includes(entry.id));
      },
    } as Pick<DatasetEntriesRepository, "findById" | "listByIds">,
    config: allocationConfigSchema.parse({}),
    newBatch: (validatorId: string) => ({
      id: batchIdFor(validatorId),
      createdAt: "2026-09-30T00:00:00.000Z",
    }),
    ConfigurationFailure: class ServerEnvError extends Error {},
  } as unknown as StartValidationDependencies;

  return { dependencies, calls, grants };
}

const VALID = { validatorId: "VAL_a81d92c1" };
const INTERRUPTED_ID = "VAL_a81d92c1-2026-09-30T20:14:03.117Z";

function interruptedBatch(entryIds: readonly string[]): RecoverableBatch {
  return {
    id: INTERRUPTED_ID,
    validatorId: "VAL_a81d92c1",
    createdAt: "2026-09-30T20:14:03.117Z",
    entryIds: [...entryIds],
  };
}

describe("a rejected payload", () => {
  it("makes zero repository calls", async () => {
    const { dependencies, calls } = createScenarioDependencies();

    const outcome = await runStartValidation({ validatorId: "not-an-id" }, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "invalid" });
    expect(calls).toEqual([]);
  });

  it("rejects an entry list, an order, ownership, and timestamps before any read", async () => {
    // The start orchestration takes intent only. Each of these would steer the result —
    // which entries, in what order, under whose ownership, at what time — so each is
    // refused rather than stripped: a stripped field looks exactly like a request whose
    // values happened not to matter.
    const hostile = [
      { validatorId: "VAL_a81d92c1", entryIds: ["OD_1"] },
      { validatorId: "VAL_a81d92c1", order: ["OD_2", "OD_1"] },
      { validatorId: "VAL_a81d92c1", batchId: INTERRUPTED_ID },
      { validatorId: "VAL_a81d92c1", createdAt: "2026-09-30T00:00:00.000Z" },
      { validatorId: "VAL_a81d92c1", coverageTarget: 1 },
    ];
    for (const raw of hostile) {
      const { dependencies, calls } = createScenarioDependencies();
      const outcome = await runStartValidation(raw, dependencies);
      expect(outcome, `expected refusal for ${JSON.stringify(raw)}`).toEqual({
        status: "failed",
        reason: "invalid",
      });
      expect(calls).toEqual([]);
    }
  });

  it("reports no batch id and no entry on a rejected payload", async () => {
    const { dependencies } = createScenarioDependencies();

    const outcome = await runStartValidation({ validatorId: "nope" }, dependencies);

    expect(outcome).not.toHaveProperty("batchId");
    expect(outcome).not.toHaveProperty("entry");
  });
});

describe("fresh start", () => {
  it("allocates and returns the batch id plus exactly the first entry", async () => {
    const { dependencies, calls } = createScenarioDependencies();

    const outcome = await runStartValidation(VALID, dependencies);

    if (outcome.status !== "started") {
      throw new Error(`expected started, got ${JSON.stringify(outcome)}`);
    }
    expect(outcome.batchId).toBe("VAL_a81d92c1-batch");
    expect(outcome.entry.id).toBe("OD_1");
    expect(outcome.position).toBe(1);
    expect(outcome.total).toBe(2);
    expect(outcome.completedCount).toBe(0);
    expect(calls).toContain("batches.allocate");
  });

  it("issues exactly one allocation call", async () => {
    const { dependencies, calls } = createScenarioDependencies();

    await runStartValidation(VALID, dependencies);

    expect(calls.filter((call) => call === "batches.allocate")).toHaveLength(1);
  });

  it("carries one entry, never the batch: the wire holds no second sentence", async () => {
    const { dependencies } = createScenarioDependencies();

    const outcome = await runStartValidation(VALID, dependencies);
    if (outcome.status !== "started") {
      throw new Error(`expected started, got ${JSON.stringify(outcome)}`);
    }

    // The shape contract is structural — one `entry`, no `entries` — and the wire
    // assertion below is the runtime half: a second entry's sentence, identifier, or
    // position must not be present anywhere in the serialized result.
    expect(outcome).not.toHaveProperty("entries");
    const wire = JSON.stringify(outcome);
    expect(wire).toContain("OD_1");
    expect(wire).not.toContain("OD_2");
  });

  it("carries exactly the runner-construction keys and nothing beyond them", async () => {
    const { dependencies } = createScenarioDependencies();

    const outcome = await runStartValidation(VALID, dependencies);
    if (outcome.status !== "started") {
      throw new Error(`expected started, got ${JSON.stringify(outcome)}`);
    }

    // The completed count is the only permitted addition: no source payload, no
    // coverage data, no researcher metadata, no second entry under any key.
    expect(Object.keys(outcome).sort()).toEqual([
      "batchId",
      "completedCount",
      "entry",
      "position",
      "status",
      "total",
    ]);
    expect(outcome.completedCount).toBe(0);
  });

  it("reports exhausted when the allocation call grants nothing", async () => {
    const { dependencies } = createScenarioDependencies({ grants: [] });

    const outcome = await runStartValidation(VALID, dependencies);

    expect(outcome).toEqual({ status: "exhausted" });
    expect(outcome).not.toHaveProperty("batchId");
    expect(outcome).not.toHaveProperty("entry");
  });
});

describe("resume", () => {
  it("resumes the interrupted batch with its first unanswered entry", async () => {
    const { dependencies } = createScenarioDependencies({
      recoveryBatches: [interruptedBatch(["OD_1", "OD_2"])],
      answered: ["OD_1"],
    });

    const outcome = await runStartValidation(VALID, dependencies);

    if (outcome.status !== "resumed") {
      throw new Error(`expected resumed, got ${JSON.stringify(outcome)}`);
    }
    expect(outcome.batchId).toBe(INTERRUPTED_ID);
    expect(outcome.entry.id).toBe("OD_2");
    expect(outcome.total).toBe(2);
    expect(outcome.completedCount).toBe(1);
  });

  it("performs zero allocation calls on the resume arm", async () => {
    // Resume-writes-nothing, counted rather than inferred: an orchestration that
    // allocated alongside the resumption would still navigate to the right address, so
    // an outcome-only assertion could not see it.
    const { dependencies, calls } = createScenarioDependencies({
      recoveryBatches: [interruptedBatch(["OD_1", "OD_2"])],
    });

    const outcome = await runStartValidation(VALID, dependencies);

    expect(outcome.status).toBe("resumed");
    expect(calls).not.toContain("batches.allocate");
  });

  it("carries one entry on the resume arm too", async () => {
    const { dependencies } = createScenarioDependencies({
      recoveryBatches: [interruptedBatch(["OD_1", "OD_2"])],
    });

    const outcome = await runStartValidation(VALID, dependencies);
    if (outcome.status !== "resumed") {
      throw new Error(`expected resumed, got ${JSON.stringify(outcome)}`);
    }

    expect(outcome).not.toHaveProperty("entries");
    const wire = JSON.stringify(outcome);
    expect(wire).toContain("OD_1");
    expect(wire).not.toContain("OD_2");
    expect(Object.keys(outcome).sort()).toEqual([
      "batchId",
      "completedCount",
      "entry",
      "position",
      "status",
      "total",
    ]);
  });

  it("falls through to allocation when the interrupted batch is fully answered", async () => {
    // A finished interrupted batch recognises as `none`, so the run allocates fresh
    // rather than stranding the participant. The fresh pool holds entries this attempt
    // has never answered, matching the allocation exclusion the fake does not enforce.
    const { dependencies, calls } = createScenarioDependencies({
      recoveryBatches: [interruptedBatch(["OD_1", "OD_2"])],
      answered: ["OD_1", "OD_2"],
      pool: [datasetEntry("OD_3"), datasetEntry("OD_4")],
    });

    const outcome = await runStartValidation(VALID, dependencies);

    if (outcome.status !== "started") {
      throw new Error(`expected started, got ${JSON.stringify(outcome)}`);
    }
    expect(outcome.entry.id).toBe("OD_3");
    expect(outcome.completedCount).toBe(0);
    expect(calls).toContain("batches.allocate");
  });
});

describe("fall-through and terminal outcomes", () => {
  it("allocates when the internal recovery check cannot complete", async () => {
    const { dependencies, calls } = createScenarioDependencies({
      recoveryFailure: new RepositoryError("validation_batches.listForRecovery", "read failed"),
    });

    const outcome = await runStartValidation(VALID, dependencies);

    // The participant cannot act on a lookup failure, so none is shown: the run proceeds
    // exactly as when no interrupted batch exists.
    if (outcome.status !== "started") {
      throw new Error(`expected started, got ${JSON.stringify(outcome)}`);
    }
    expect(calls).toContain("batches.allocate");
  });

  it("reports unknown_validator for a well-formed identifier naming nobody", async () => {
    const { dependencies } = createScenarioDependencies({ knownValidator: false });

    const outcome = await runStartValidation({ validatorId: "VAL_deadbeef" }, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "unknown_validator" });
  });

  it("reports screening_required for a recognised attempt with no recorded answer", async () => {
    const { dependencies, calls } = createScenarioDependencies({ profileProficiency: null });

    const outcome = await runStartValidation(VALID, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "screening_required" });
    // The refusal costs exactly the profile read: no recovery read, no allocation call.
    expect(calls).toEqual(["validators.findById"]);
  });

  it("reports not_configured when the deployment has no database", async () => {
    const { dependencies } = createScenarioDependencies();
    const failing = {
      ...dependencies,
      validators: {
        async findById() {
          throw new dependencies.ConfigurationFailure();
        },
      },
    } as StartValidationDependencies;

    const outcome = await runStartValidation(VALID, failing);

    expect(outcome).toEqual({ status: "failed", reason: "not_configured" });
  });

  it("reports persistence when a read fails outside the recovery check", async () => {
    const { dependencies } = createScenarioDependencies({
      findBatchFailure: new RepositoryError("validation_batches.findById", "read failed"),
    });

    const outcome = await runStartValidation(VALID, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "persistence" });
  });

  it("propagates the allocation service's persistence classification unchanged", async () => {
    const { dependencies } = createScenarioDependencies({
      allocateFailure: new RepositoryError("validation_batches.allocate", "call rejected"),
    });

    const outcome = await runStartValidation(VALID, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "persistence" });
  });
});

describe("latency", () => {
  it("resolves against fakes within the three-second target", async () => {
    // What this measures: orchestration wiring time against in-memory fakes — a ceiling
    // on the mechanism, not on the deployment. The real-path figure (dispatch to first
    // entry rendered on the deployed path, with device/network/cold-start conditions)
    // remains an open item recorded in `tasks.md` 5.1, and this test must not be read
    // as that measurement.
    const { dependencies } = createScenarioDependencies();
    const startedAt = performance.now();

    await runStartValidation(VALID, dependencies);

    expect(performance.now() - startedAt).toBeLessThan(3000);
  });
});

describe("intent schema strictness", () => {
  it("is a strict object, so an extra key cannot be stripped silently", () => {
    // The runtime half of the key-set pin: the type assertion above catches a key added
    // on purpose, and this catches a schema accidentally loosened to `z.object`.
    expect(startValidationIntentSchema.safeParse({ validatorId: "VAL_a81d92c1" }).success).toBe(
      true,
    );
    expect(
      startValidationIntentSchema.safeParse({ validatorId: "VAL_a81d92c1", clientOrder: [] })
        .success,
    ).toBe(false);
  });
});
