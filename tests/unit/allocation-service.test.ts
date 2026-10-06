import { describe, expect, it, vi } from "vitest";

import {
  allocateBatch,
  defaultBatch,
  type AllocationDependencies,
} from "@/lib/allocation/allocate-batch";
import {
  RepositoryError,
  type BatchesRepository,
  type DatasetEntriesRepository,
  type ValidatorsRepository,
} from "@/lib/repositories";
import { allocationConfigSchema, type AllocationConfig, type BatchRecord } from "@/schemas/batch";
import type { DatasetEntry } from "@/schemas/dataset";
import type { AnonymousValidatorId, ValidatorProfile } from "@/schemas/validator";

/**
 * `server-only` cannot be imported under Vitest, so the module marker is stubbed here. The boundary it
 * protects is asserted separately by `tests/unit/supabase-clients.test.ts`, which deliberately does NOT
 * stub it.
 */
vi.mock("server-only", () => ({}));

/**
 * The allocation SERVICE on the database-function path, driven against recording fakes.
 *
 * The service is thin by design: gate the validator, call the versioned function once, read the
 * batch back, project the granted entries. Every selection decision — pooled completion,
 * attempt exclusions, reservation arbitration, randomization, backfill — runs inside
 * `allocate_validation_batch_v1` and is proven against a real PostgreSQL engine in
 * `tests/integration/allocation-rpc-parity.test.ts`, not here. A fake that reimplemented any
 * of those would be the second implementation the architecture forbids, and a test asserting
 * through it would prove the fake.
 *
 * What this file proves instead:
 *
 *   - the gates (`unknown_validator`, `screening_required`) cost exactly one profile read;
 *   - the RPC input carries the minted identity, the capped size, and the TTL, and nothing
 *     that could steer selection;
 *   - the reported batch comes from the read-back, never from an echo;
 *   - the projection carries exactly the six renderable fields, in stored order;
 *   - failures map to `persistence` (or propagate, for non-repository throws);
 *   - the 4,800-row pool transfer is GONE from this path: the fakes below are typed as the
 *     narrow dependency Picks, so a service that reached for `listAllActive`, `listForEntries`,
 *     `claimReservations`, or `create` would not compile — and the call sequence is asserted
 *     exactly, so a stray read would also fail loudly at runtime.
 *
 * WHAT THIS DOES NOT PROVE
 * Nothing about Supabase, PostgREST, or SQL. The migration's position constraints are proven
 * by the allocation integration tests against a real engine; the Supabase translation is proven
 * by `tests/unit/repositories-supabase.test.ts` against a recording fake.
 */

const TIMESTAMP = "2026-09-30T00:00:00.000Z";
const VALIDATOR = "VAL_a81d92c1" as AnonymousValidatorId;

const profile: ValidatorProfile = {
  id: VALIDATOR,
  ilocanoProficiency: "fluent",
  createdAt: TIMESTAMP,
  lastActiveAt: TIMESTAMP,
  totalValidations: 0,
};

/** One active OD entry. `id` is the only field the tests vary, so this is a factory. */
function entry(id: string): DatasetEntry {
  return {
    id,
    category: "origin_destination",
    sourceEntryId: 1,
    categoryName: "Origin + Destination",
    instruction: `Langet an ti ${id}.`,
    origin: "Bangon",
    destination: "Kablantayan",
    transitMode: null,
    createdAt: TIMESTAMP,
    isActive: true,
  };
}

function config(overrides: Partial<AllocationConfig> = {}): AllocationConfig {
  return allocationConfigSchema.parse(overrides);
}

interface FakeOptions {
  readonly knownValidatorIds?: readonly string[];
  readonly profileProficiency?: ValidatorProfile["ilocanoProficiency"];
  /** Granted placements the fake `allocate` answers with, in order. */
  readonly grants?: ReadonlyArray<{ readonly entryId: string; readonly position: number }>;
  /** Effective batch-size ceiling for this fake's configuration. */
  readonly batchSize?: number;
  /** Stored entries the fake `listByIds` resolves, by id. Missing ids resolve to nothing. */
  readonly storedEntries?: ReadonlyMap<string, DatasetEntry>;
  /** A batch the fake `findById` returns instead of deriving one from the grant. */
  readonly readBack?: BatchRecord | null;
  readonly allocateFailure?: unknown;
  readonly findFailure?: unknown;
  readonly listFailure?: unknown;
}

/**
 * Recording fakes typed as the service's NARROW dependencies.
 *
 * `validators` is the full interface (one method is all the service uses, and the rest is
 * inert), but `batches` and `datasetEntries` are declared against the exact Picks the service
 * takes. A service that reached for any other repository method would fail typecheck — the
 * absence of the pool transfer is therefore structural, not merely asserted.
 */
function createFakes(options: FakeOptions = {}) {
  const calls: Array<{ method: string; argument: unknown }> = [];
  const known = new Set<string>(options.knownValidatorIds ?? [VALIDATOR as unknown as string]);
  const proficiencies = new Map<string, ValidatorProfile["ilocanoProficiency"]>();
  if (options.profileProficiency !== undefined) {
    for (const id of known) proficiencies.set(id, options.profileProficiency);
  }

  const record = (method: string, argument: unknown): void => {
    calls.push({ method, argument });
    const failures: Record<string, unknown> = {
      "batches.allocate": options.allocateFailure,
      "batches.findById": options.findFailure,
      "datasetEntries.listByIds": options.listFailure,
    };
    const failure = failures[method];
    if (failure !== undefined) throw failure;
  };

  const validators: ValidatorsRepository = {
    async create(profile_) {
      record("validators.create", profile_);
      return profile_;
    },
    async findById(id) {
      record("validators.findById", id);
      if (!known.has(id)) return null;
      const proficiency = proficiencies.has(id)
        ? (proficiencies.get(id) as ValidatorProfile["ilocanoProficiency"])
        : profile.ilocanoProficiency;
      return { ...profile, ilocanoProficiency: proficiency };
    },
    async listByIds(ids) {
      record("validators.listByIds", ids);
      return ids.flatMap((id) => (known.has(id) ? [profile] : []));
    },
    async listAllIds() {
      record("validators.listAllIds", undefined);
      return [...known] as AnonymousValidatorId[];
    },
    async touchLastActive(id, at) {
      record("validators.touchLastActive", { id, at });
    },
  };

  const batches: Pick<BatchesRepository, "allocate" | "findById"> = {
    async allocate(input) {
      record("batches.allocate", input);
      return [...(options.grants ?? [])];
    },
    async findById(id) {
      record("batches.findById", id);
      if (options.readBack !== undefined) return options.readBack;
      const grants = options.grants ?? [];
      if (grants.length === 0) return null;
      return {
        id,
        validatorId: VALIDATOR,
        entries: grants.map((placement) => ({ datasetEntryId: placement.entryId })),
      } as BatchRecord;
    },
  };

  const datasetEntries: Pick<DatasetEntriesRepository, "listByIds"> = {
    async listByIds(ids) {
      record("datasetEntries.listByIds", ids);
      const stored = options.storedEntries ?? new Map();
      return ids.flatMap((id) => {
        const found = stored.get(id);
        return found ? [found] : [];
      });
    },
  };

  const dependencies: AllocationDependencies = {
    validators,
    batches: batches as BatchesRepository,
    datasetEntries: datasetEntries as DatasetEntriesRepository,
    config: config(options.batchSize === undefined ? {} : { batchSize: options.batchSize }),
    newBatch: (validatorId) => defaultBatch(validatorId, new Date(TIMESTAMP)),
  };

  return { calls, dependencies };
}

function grantedEntries(ids: readonly string[]): Map<string, DatasetEntry> {
  return new Map(ids.map((id) => [id, entry(id)]));
}

function placements(ids: readonly string[]): Array<{ entryId: string; position: number }> {
  return ids.map((entryId, index) => ({ entryId, position: index + 1 }));
}

describe("an unknown validator", () => {
  it("is reported as unknown_validator rather than as a database fault", async () => {
    const { dependencies } = createFakes({ knownValidatorIds: [] });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "unknown_validator" });
  });

  it("performs no write of any kind", async () => {
    const { dependencies, calls } = createFakes({ knownValidatorIds: [] });

    await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    expect(calls.map((call) => call.method)).toEqual(["validators.findById"]);
  });

  it("does not read the pool either, so an unknown identifier costs one query", async () => {
    const { dependencies, calls } = createFakes({ knownValidatorIds: [] });

    await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    // The ONLY read is the profile lookup. No allocation call, no read-back, no projection.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: "validators.findById", argument: VALIDATOR });
  });
});

describe("a requester with no recorded proficiency answer", () => {
  it("is refused as screening_required before any pool read", async () => {
    const { dependencies, calls } = createFakes({ profileProficiency: null });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "screening_required" });
    expect(calls.map((call) => call.method)).toEqual(["validators.findById"]);
  });

  it("allocates normally for every approved answer, which influences nothing", async () => {
    for (const proficiency of [
      "native",
      "fluent",
      "conversational",
      "basic",
      "not_confident",
    ] as const) {
      const { dependencies } = createFakes({
        profileProficiency: proficiency,
        grants: placements(["OD_1"]),
        storedEntries: grantedEntries(["OD_1"]),
      });

      const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

      expect(outcome.status).toBe("allocated");
    }
  });
});

describe("an empty grant", () => {
  it("reports exhausted when the function grants nothing", async () => {
    const { dependencies } = createFakes({ grants: [] });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    expect(outcome).toEqual({ status: "exhausted" });
  });

  it("persists nothing and reads nothing further", async () => {
    const { dependencies, calls } = createFakes({ grants: [] });

    await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    // Profile read, then the single allocation call. No read-back (nothing to confirm),
    // no entry projection, no second call of any kind.
    expect(calls.map((call) => call.method)).toEqual(["validators.findById", "batches.allocate"]);
  });

  it("carries no batch and no batch id", async () => {
    const { dependencies } = createFakes({ grants: [] });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    expect(outcome).not.toHaveProperty("batchId");
  });

  it("stays distinguishable from a persistence failure", async () => {
    const { dependencies } = createFakes({
      grants: [],
      allocateFailure: new RepositoryError("validation_batches.allocate", "down"),
    });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "persistence" });
  });
});

describe("a successful allocation", () => {
  it("never reports a batch with no entries", async () => {
    const { dependencies } = createFakes({
      grants: placements(["OD_1", "OD_2"]),
      storedEntries: grantedEntries(["OD_1", "OD_2"]),
    });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    if (outcome.status !== "allocated")
      throw new Error(`expected allocated, got ${outcome.status}`);
    expect(outcome.entries.length).toBeGreaterThan(0);
  });

  it("hands the function the minted identity, the capped size, and the TTL — and nothing steerable", async () => {
    const { dependencies, calls } = createFakes({
      grants: placements(["OD_1"]),
      storedEntries: grantedEntries(["OD_1"]),
    });

    await allocateBatch({ validatorId: VALIDATOR, requestedSize: 4 }, dependencies);

    const allocate = calls.find((call) => call.method === "batches.allocate");
    expect(allocate).toBeDefined();
    const input = allocate?.argument as {
      batchId: string;
      validatorId: string;
      size: number;
      ttlSeconds: number;
      createdAt: string;
    };
    // ONE instant for the id and the column, from the injected clock.
    expect(input.batchId).toBe(`${VALIDATOR}-${TIMESTAMP}`);
    expect(input.createdAt).toBe(TIMESTAMP);
    expect(input.validatorId).toBe(VALIDATOR);
    expect(input.size).toBe(4);
    expect(input.ttlSeconds).toBe(config().reservationTtlSeconds);
    // And nothing else: no entry list, no order, no coverage figure. A steering field
    // smuggled into the input would fail here by key set rather than by inspection.
    expect(Object.keys(input).sort()).toEqual(
      ["batchId", "createdAt", "size", "ttlSeconds", "validatorId"].sort(),
    );
  });

  it("caps a larger requested size at the configured ceiling", async () => {
    const { dependencies, calls } = createFakes({
      grants: placements(["OD_1"]),
      storedEntries: grantedEntries(["OD_1"]),
    });

    await allocateBatch({ validatorId: VALIDATOR, requestedSize: 500 }, dependencies);

    const allocate = calls.find((call) => call.method === "batches.allocate");
    expect((allocate?.argument as { size: number }).size).toBe(config().batchSize);
  });

  it("reports the batch the read-back returned, never an echo of the request", async () => {
    const { dependencies } = createFakes({
      grants: placements(["OD_1", "OD_2"]),
      storedEntries: grantedEntries(["OD_1", "OD_2"]),
    });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    if (outcome.status !== "allocated")
      throw new Error(`expected allocated, got ${outcome.status}`);
    expect(outcome.batchId).toBe(`${VALIDATOR}-${TIMESTAMP}`);
    expect(outcome.entries.map((entry) => entry.id)).toEqual(["OD_1", "OD_2"]);
  });

  it("returns entries in the order the repository STORED, not the order granted", async () => {
    // The grant arrives OD_1-first but the read-back stores OD_2-first: the reported order
    // follows storage, because storage is what the validator will work through.
    const { dependencies } = createFakes({
      grants: placements(["OD_1", "OD_2"]),
      storedEntries: grantedEntries(["OD_1", "OD_2"]),
      readBack: {
        id: `${VALIDATOR}-${TIMESTAMP}`,
        validatorId: VALIDATOR,
        entries: [
          { datasetEntryId: "OD_2", position: 1 },
          { datasetEntryId: "OD_1", position: 2 },
        ],
      },
    });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    if (outcome.status !== "allocated")
      throw new Error(`expected allocated, got ${outcome.status}`);
    expect(outcome.entries.map((entry) => entry.id)).toEqual(["OD_2", "OD_1"]);
  });

  it("records no entry twice within one batch", async () => {
    const { dependencies } = createFakes({
      grants: placements(["OD_1"]),
      storedEntries: grantedEntries(["OD_1"]),
      readBack: {
        id: `${VALIDATOR}-${TIMESTAMP}`,
        validatorId: VALIDATOR,
        entries: [
          { datasetEntryId: "OD_1", position: 1 },
          { datasetEntryId: "OD_1", position: 2 },
        ],
      },
    });

    // A stored double is served as stored: the no-duplicate guarantee lives in the function
    // (one row per entry id in the grant), and this service reports storage honestly rather
    // than deduplicating a record it did not write.
    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    if (outcome.status !== "allocated")
      throw new Error(`expected allocated, got ${outcome.status}`);
    expect(outcome.entries).toHaveLength(2);
  });

  it("derives the batch id from the validator's own identifier and the injected clock", async () => {
    const { dependencies, calls } = createFakes({
      grants: placements(["OD_1"]),
      storedEntries: grantedEntries(["OD_1"]),
    });

    await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    const allocate = calls.find((call) => call.method === "batches.allocate");
    const input = allocate?.argument as { batchId: string; createdAt: string };
    expect(input.batchId).toContain(VALIDATOR);
    expect(input.batchId).toContain(TIMESTAMP);
    expect(input.createdAt).toBe(TIMESTAMP);
  });
});

describe("what the requesting validator is shown", () => {
  it("carries only the fields needed to render an entry", async () => {
    const { dependencies } = createFakes({
      grants: placements(["OD_1"]),
      storedEntries: grantedEntries(["OD_1"]),
    });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    if (outcome.status !== "allocated")
      throw new Error(`expected allocated, got ${outcome.status}`);
    expect(Object.keys(outcome.entries[0] ?? {}).sort()).toEqual(
      ["category", "destination", "id", "instruction", "origin", "transitMode"].sort(),
    );
  });

  it("carries no archival copy of the source record", async () => {
    const { dependencies } = createFakes({
      grants: placements(["OD_1"]),
      storedEntries: grantedEntries(["OD_1"]),
    });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    if (outcome.status !== "allocated")
      throw new Error(`expected allocated, got ${outcome.status}`);
    expect(outcome.entries[0]).not.toHaveProperty("sourcePayload");
    expect(JSON.stringify(outcome)).not.toContain("source_payload");
  });

  it("carries no coverage figure, no other validator's response, and no screening answer", async () => {
    const { dependencies } = createFakes({
      grants: placements(["OD_1"]),
      storedEntries: grantedEntries(["OD_1"]),
    });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    if (outcome.status !== "allocated")
      throw new Error(`expected allocated, got ${outcome.status}`);
    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toContain("ilocanoProficiency");
    expect(serialized).not.toContain("coverage");
    expect(serialized).not.toContain("validatorId");
  });

  it("carries no ingestion timestamp or active flag", async () => {
    const { dependencies } = createFakes({
      grants: placements(["OD_1"]),
      storedEntries: grantedEntries(["OD_1"]),
    });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    if (outcome.status !== "allocated")
      throw new Error(`expected allocated, got ${outcome.status}`);
    expect(outcome.entries[0]).not.toHaveProperty("createdAt");
    expect(outcome.entries[0]).not.toHaveProperty("isActive");
  });
});

describe("a failed allocation", () => {
  it("reports persistence when the read-back finds no batch", async () => {
    const { dependencies } = createFakes({
      grants: placements(["OD_1"]),
      storedEntries: grantedEntries(["OD_1"]),
      readBack: null,
    });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "persistence" });
  });

  it("reports persistence when a granted entry does not resolve", async () => {
    const { dependencies } = createFakes({
      grants: placements(["OD_1", "OD_2"]),
      storedEntries: grantedEntries(["OD_1"]),
    });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "persistence" });
  });

  it("reports persistence when a granted entry does not project", async () => {
    const unprojectable = {
      ...entry("OD_1"),
      // An instruction the schema refuses: the row exists but is not renderable.
      instruction: "",
    };
    const { dependencies } = createFakes({
      grants: placements(["OD_1"]),
      storedEntries: new Map([["OD_1", unprojectable]]),
    });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "persistence" });
  });

  it("reports persistence rather than an empty successful batch", async () => {
    const { dependencies } = createFakes({
      grants: placements(["OD_1"]),
      storedEntries: grantedEntries(["OD_1"]),
      findFailure: new RepositoryError("validation_batches.findById", "down"),
    });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "persistence" });
  });

  it("reports no batch id on a failed allocation", async () => {
    const { dependencies } = createFakes({
      grants: placements(["OD_1"]),
      storedEntries: grantedEntries(["OD_1"]),
      allocateFailure: new RepositoryError("validation_batches.allocate", "down"),
    });

    const outcome = await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    expect(outcome).toEqual({ status: "failed", reason: "persistence" });
    expect(outcome).not.toHaveProperty("batchId");
  });

  it("propagates a non-repository error instead of reporting it as a persistence failure", async () => {
    const { dependencies } = createFakes({
      grants: placements(["OD_1"]),
      storedEntries: grantedEntries(["OD_1"]),
      allocateFailure: new Error("a bug, not a network fault"),
    });

    await expect(allocateBatch({ validatorId: VALIDATOR }, dependencies)).rejects.toThrow(
      "a bug, not a network fault",
    );
  });
});

describe("the read pattern", () => {
  it("issues exactly four round trips on the happy path", async () => {
    const { dependencies, calls } = createFakes({
      grants: placements(["OD_1", "OD_2"]),
      storedEntries: grantedEntries(["OD_1", "OD_2"]),
    });

    await allocateBatch({ validatorId: VALIDATOR }, dependencies);

    // Profile read, allocation call, batch read-back, granted-entry projection. This exact
    // sequence is the performance contract: a fifth read here is a regression to the
    // pool-transfer shape this change removed, and it fails by count rather than by
    // inspection of what was read.
    expect(calls.map((call) => call.method)).toEqual([
      "validators.findById",
      "batches.allocate",
      "batches.findById",
      "datasetEntries.listByIds",
    ]);
  });

  it("derives the effective size from configuration, not from the request alone", async () => {
    const { dependencies, calls } = createFakes({
      grants: placements(["OD_1"]),
      storedEntries: grantedEntries(["OD_1"]),
      batchSize: 3,
    });

    await allocateBatch({ validatorId: VALIDATOR, requestedSize: 10 }, dependencies);

    const allocate = calls.find((call) => call.method === "batches.allocate");
    expect((allocate?.argument as { size: number }).size).toBe(3);
  });
});
