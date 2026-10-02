import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  allocateBatch,
  defaultBatch,
  type MintedBatchIdentity,
} from "@/lib/allocation/allocate-batch";
import {
  RepositoryError,
  type BatchesRepository,
  type DatasetEntriesRepository,
  type ValidationsRepository,
  type ValidatorsRepository,
} from "@/lib/repositories";
import { allocationConfigSchema, type AllocationConfig, type BatchRecord } from "@/schemas/batch";
import type { DatasetEntry, DatasetEntryId } from "@/schemas/dataset";
import type { AnonymousValidatorId, ValidatorProfile } from "@/schemas/validator";
import type { ValidationResponse } from "@/schemas/validation";

/**
 * `server-only` cannot be imported under Vitest, so the module marker is stubbed here. The boundary it
 * protects is asserted separately by `tests/unit/supabase-clients.test.ts`, which deliberately does NOT
 * stub it.
 */
vi.mock("server-only", () => ({}));

/**
 * The allocation SERVICE, driven against in-memory repositories.
 *
 * =============================================================================
 * WHY THIS FILE IS NOT A DUPLICATE OF `allocation.test.ts`
 * =============================================================================
 * `allocation.test.ts` proves the ORDER the pure rule imposes, in isolation. It is handed a coverage map
 * and never derives one, so nothing in it can catch the failure this file exists to catch: a service
 * that feeds the rule the wrong NUMBERS.
 *
 * =============================================================================
 * THE TEST THAT MATTERS MOST, and why it is written the way it is
 * =============================================================================
 * "An entry whose stored responses are all `cannot_evaluate` is offered with zero coverage" is the spec
 * scenario an implementation is most likely to pass by accident. `ValidationsRepository` exposes a
 * convenient `countForEntry`, a single call that returns a number, while the correct path is a read
 * plus a reduce through `countQualifyingValidations`. Substituting the convenient method makes three
 * `cannot_evaluate` responses look like full coverage and retires an entry nobody has judged — and
 * the resulting over-collection is invisible: it looks like diligence.
 *
 * So the fake below makes the two paths produce DIFFERENT answers for the same stored data. If anyone
 * substitutes `countForEntry`, `listForEntries` is never called and the call-recording assertion fails
 * by name. A test that merely asserted "the entry was offered" would pass under both implementations
 * in some configurations; this one is built so it cannot.
 *
 * =============================================================================
 * WHAT THIS FILE DOES NOT PROVE
 * =============================================================================
 * Nothing about Supabase, PostgREST, or SQL. The fakes are maps and arrays. The migration's
 * `position` constraints are proven by `tests/integration/allocation-migration.test.ts` against a real
 * PostgreSQL engine; the Supabase translation is proven by `tests/unit/repositories-supabase.test.ts`
 * against a recording fake. Between them, still unproven: that any of it works against a hosted
 * project.
 *
 * The clause this file used to end with was "because no credential exists", and it was false — three
 * credentials do exist and have been in use since 2026-10-03. What is actually true is narrower and
 * worth stating precisely: allocation has never been executed against a hosted project. The
 * repository's query builders (`.in()`, `.range()`, `.eq()`) have still never reached a real
 * PostgREST; the only builder call that has is `.rpc()`, reached by the dataset import.
 */

const TIMESTAMP = "2026-09-30T00:00:00.000Z";
const VALIDATOR: AnonymousValidatorId = "VAL_a81d92c1";

const profile: ValidatorProfile = {
  id: VALIDATOR,
  ilocanoProficiency: "fluent",
  createdAt: TIMESTAMP,
  lastActiveAt: TIMESTAMP,
  totalValidations: 0,
};

/** One active OD entry. `id` is the only field the tests vary, so this is a factory. */
function entry(id: string, overrides: Partial<DatasetEntry> = {}): DatasetEntry {
  return {
    id,
    category: "origin_destination",
    instruction: `Langet an ti ${id}.`,
    origin: "Bangon",
    destination: "Kablantayan",
    transitMode: null,
    createdAt: TIMESTAMP,
    isActive: true,
    ...overrides,
  };
}

/**
 * A stored response.
 *
 * `evaluation` alone does not build a well-formed `ValidationResponse` for an evaluable choice: the
 * integrity rules require both translations. `cannot_evaluate` requires neither. Both shapes are built
 * here explicitly rather than with a partial spread, because a fixture that silently omitted a
 * translation would be testing a row the database would refuse.
 */
function response(overrides: {
  readonly datasetEntryId: string;
  readonly validatorId?: string;
  readonly evaluation?: ValidationResponse["evaluation"];
}): ValidationResponse {
  const base = {
    id: `res_${overrides.datasetEntryId}_${overrides.validatorId ?? VALIDATOR}`,
    validatorId: overrides.validatorId ?? VALIDATOR,
    datasetEntryId: overrides.datasetEntryId,
    batchId: "batch_prior",
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };

  if (overrides.evaluation === "cannot_evaluate") {
    return { ...base, evaluation: "cannot_evaluate" };
  }

  return {
    ...base,
    evaluation: overrides.evaluation ?? "correct_natural",
    englishTranslation: "From Bangon to the Municipal Hall.",
    filipinoTranslation: "Mula Bangon tungo sa Kablantayan.",
  };
}

/** Three `cannot_evaluate` rows from three distinct validators: three rows, zero qualifying. */
function cannotEvaluateOnly(entryId: string): ValidationResponse[] {
  return ["VAL_0000aaa1", "VAL_0000aaa2", "VAL_0000aaa3"].map((validatorId) =>
    response({ datasetEntryId: entryId, validatorId, evaluation: "cannot_evaluate" }),
  );
}

function config(overrides: Partial<AllocationConfig> = {}): AllocationConfig {
  return allocationConfigSchema.parse(overrides);
}

/**
 * In-memory repositories that record every call.
 *
 * `countForEntry` is implemented DELIBERATELY as a row count rather than as the qualifying count. That
 * is the bug this file is built to detect, so the fake must not accidentally implement the correct
 * behaviour and mask it. If the service ever calls it, the assertion on `calls` fails.
 */
function createFakes(
  options: {
    readonly pool?: DatasetEntry[];
    readonly responses?: ValidationResponse[];
    readonly knownValidatorIds?: string[];
  } = {},
) {
  const calls: Array<{ method: string; argument: unknown }> = [];
  const known = new Set<string>(options.knownValidatorIds ?? [VALIDATOR]);
  const stored = new Map<string, BatchRecord>();
  let failures = new Map<string, unknown>();

  const record = (method: string, argument: unknown): void => {
    calls.push({ method, argument });
    const failure = failures.get(method);
    if (failure !== undefined) throw failure;
  };

  const validators: ValidatorsRepository = {
    async create(stored_) {
      record("validators.create", stored_);
      return stored_;
    },
    async findById(id) {
      record("validators.findById", id);
      return known.has(id) ? profile : null;
    },
    async listByIds(ids) {
      record("validators.listByIds", ids);
      return ids.flatMap((id) => (known.has(id) ? [profile] : []));
    },
    async touchLastActive(id, at) {
      record("validators.touchLastActive", { id, at });
    },
  };

  const datasetEntries: DatasetEntriesRepository = {
    async listActive(query) {
      record("datasetEntries.listActive", query);
      return (options.pool ?? []).filter((candidate) => candidate.isActive);
    },
    async findById(id) {
      record("datasetEntries.findById", id);
      return (options.pool ?? []).find((candidate) => candidate.id === id) ?? null;
    },
    async listByIds(ids) {
      record("datasetEntries.listByIds", ids);
      return (options.pool ?? []).filter((candidate) => ids.includes(candidate.id));
    },
  };

  const responses = options.responses ?? [];

  const validations: ValidationsRepository = {
    async insert(stored_) {
      record("validations.insert", stored_);
      return stored_;
    },
    async findById(id) {
      record("validations.findById", id);
      return responses.find((candidate) => candidate.id === id) ?? null;
    },
    async findByEntry(entryId) {
      record("validations.findByEntry", entryId);
      return responses.filter((candidate) => candidate.datasetEntryId === entryId);
    },
    async listForEntries(entryIds) {
      record("validations.listForEntries", entryIds);
      const wanted = new Set<string>(entryIds);
      // UNFILTERED, exactly as the interface demands. A fake that applied the qualifying rule here
      // would be the second implementation the interface comment forbids, and would make the whole
      // "all non-qualifying stays in the pool" scenario vacuous.
      return responses.filter((candidate) => wanted.has(candidate.datasetEntryId));
    },
    async listEntryIdsForValidator(validatorId) {
      record("validations.listEntryIdsForValidator", validatorId);
      const mine = responses.filter((candidate) => candidate.validatorId === validatorId);
      return [...new Set(mine.map((candidate) => candidate.datasetEntryId))] as DatasetEntryId[];
    },
    // THE RAW COUNT, deliberately. See the header.
    async countForEntry(entryId) {
      record("validations.countForEntry", entryId);
      return responses.filter((candidate) => candidate.datasetEntryId === entryId).length;
    },
    async countForValidator(validatorId) {
      record("validations.countForValidator", validatorId);
      return responses.filter((candidate) => candidate.validatorId === validatorId).length;
    },
  };

  // Declared as the interface rather than built up from a partial, so the fake is checkable as one.
  const batches: BatchesRepository = {
    async create(batch, createdAt) {
      record("batches.create", batch);
      // The instant the repository was told to write is recorded, because a later change that stopped
      // passing it would otherwise be invisible here: `create` would still "succeed" against this fake
      // and the migration's `not null` would only object against a real database.
      //
      // This comment used to claim that visibility and **nothing asserted it** — the recorder existed,
      // the value was written into `calls`, and no test in the file ever read it, so the "would be
      // invisible otherwise" was a guarantee with no witness. The assertion now exists: "hands the
      // repository a server-minted instant" under `describe("a successful allocation")` reads this entry
      // and compares it to the injected clock. **A recorder with no reader is the same defect as a guard
      // with no failing case** — it looks like evidence and supplies none.
      record("batches.create.createdAt", createdAt);
      stored.set(batch.id, batch);
      return batch;
    },
    async findById(id) {
      record("batches.findById", id);
      return stored.get(id) ?? null;
    },
    // Not exercised by the allocation service, which never looks for an interrupted batch. Declared
    // because the interface requires it and this fake is typed as the interface on purpose — a
    // partial here would stop being a check on the interface's shape.
    async listForRecovery(validatorId) {
      record("batches.listForRecovery", validatorId);
      return [];
    },
  };

  return {
    calls,
    stored,
    dependencies: { validators, datasetEntries, validations, batches },
    countOf(method: string): number {
      return calls.filter((call) => call.method === method).length;
    },
    failOn(method: string, error: unknown): void {
      const next = new Map(failures);
      next.set(method, error);
      failures = next;
    },
  };
}

/**
 * A constant randomness source. The order this produces is a specific permutation of the input, which
 * is the point of injecting it: the allocation is reproducible, so a failing assertion names a cause.
 */
const constantZero = (): number => 0;

const FIXED_NOW = new Date("2026-09-30T12:00:00.000Z");

function dependenciesFor(
  fakes: ReturnType<typeof createFakes>,
  over: {
    readonly config?: AllocationConfig;
    readonly random?: () => number;
    readonly newBatch?: (validatorId: AnonymousValidatorId) => MintedBatchIdentity;
  } = {},
) {
  return {
    ...fakes.dependencies,
    config: over.config ?? config(),
    random: over.random ?? constantZero,
    newBatch:
      over.newBatch ??
      ((validatorId: AnonymousValidatorId) => defaultBatch(validatorId, FIXED_NOW)),
  };
}

const request = { validatorId: VALIDATOR };

/** Narrowing helper: a test that wants entries must fail loudly if there are none. */
function allocated(outcome: Awaited<ReturnType<typeof allocateBatch>>) {
  if (outcome.status !== "allocated")
    throw new Error(`expected an allocated outcome, got ${outcome.status}`);
  return outcome;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("an entry whose stored responses are all non-qualifying stays in the pool", () => {
  it("offers the entry at zero coverage despite three stored response rows", async () => {
    // The scenario the whole coverage rule exists for. Three rows, three distinct validators, and
    // NONE of them a qualifying completed validation — so coverage is 0 and the entry is still the
    // most under-covered thing in the pool.
    const target = entry("OD_0001");
    const other = entry("OD_0002");
    const fakes = createFakes({
      pool: [other, target],
      responses: cannotEvaluateOnly(target.id),
    });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    const ids = allocated(outcome).entries.map((candidate) => candidate.id);
    expect(ids[0]).toBe(target.id);
  });

  it("proves it reads the responses and reduces them rather than counting rows", async () => {
    // The assertion that distinguishes the two implementations. `countForEntry` returns 3 here and
    // `listForEntries` returns the three rows; only the second can be reduced to 0.
    const fakes = createFakes({
      pool: [entry("OD_0001"), entry("OD_0002")],
      responses: cannotEvaluateOnly("OD_0001"),
    });

    await allocateBatch(request, dependenciesFor(fakes));

    expect(fakes.countOf("validations.listForEntries")).toBe(1);
    expect(fakes.countOf("validations.countForEntry")).toBe(0);
  });

  it("counts repeated qualifying responses from ONE validator once", async () => {
    // Structurally impossible in production — `UNIQUE (validator_id, dataset_entry_id)` refuses the
    // second row — so it is exercised here to pin what the reduce does if the constraint is ever
    // dropped. Two rows, one validator, coverage 1, so the entry is still eligible against a target
    // of 3 but outranks an entry with no responses at all.
    const twice = entry("OD_0001");
    const untouched = entry("OD_0002");
    const fakes = createFakes({
      pool: [twice, untouched],
      responses: [
        response({ datasetEntryId: twice.id, validatorId: "VAL_0000bbb1" }),
        response({ datasetEntryId: twice.id, validatorId: "VAL_0000bbb1" }),
      ],
    });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    const ids = allocated(outcome).entries.map((candidate) => candidate.id);
    expect(ids[0]).toBe(untouched.id);
    expect(ids).toContain(twice.id);
  });
});

describe("the coverage target", () => {
  it("does not offer an entry that has reached the configured target", async () => {
    const retired = entry("OD_0001");
    const live = entry("OD_0002");
    const fakes = createFakes({
      pool: [retired, live],
      responses: ["VAL_0000ccc1", "VAL_0000ccc2", "VAL_0000ccc3"].map((validatorId) =>
        response({ datasetEntryId: retired.id, validatorId }),
      ),
    });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    const ids = allocated(outcome).entries.map((candidate) => candidate.id);
    expect(ids).toEqual([live.id]);
  });

  it("compares against the CONFIGURED target, so a changed target changes the pool", async () => {
    // "Reached", not "exceeds": at a target of 3 the third qualifying validation retires the entry. At
    // a target of 4 the same data leaves it eligible. A rule with `>` hard-coded would serve every entry
    // one extra time, and the resulting over-collection is invisible in the data.
    const retired = entry("OD_0001");
    const live = entry("OD_0002");
    const fakes = createFakes({
      pool: [retired, live],
      responses: ["VAL_0000ccc1", "VAL_0000ccc2", "VAL_0000ccc3"].map((validatorId) =>
        response({ datasetEntryId: retired.id, validatorId }),
      ),
    });

    const outcome = await allocateBatch(
      request,
      dependenciesFor(fakes, { config: config({ independentValidationTarget: 4 }) }),
    );

    // Under the higher target the retired entry is eligible again. It is NOT first — the other entry
    // has coverage 0 against its 3 — and the ordering assertion belongs to the rule's own tests.
    expect(allocated(outcome).entries.map((candidate) => candidate.id)).toContain(retired.id);
  });

  it("serves the whole requested size even when it means going past the lowest-coverage group", async () => {
    const lowest = [entry("OD_0001"), entry("OD_0002")];
    const higher = [entry("OD_0003"), entry("OD_0004"), entry("OD_0005")];
    const fakes = createFakes({
      pool: [...lowest, ...higher],
      responses: higher.flatMap((candidate) => [
        response({ datasetEntryId: candidate.id, validatorId: "VAL_0000ddd1" }),
      ]),
    });

    const outcome = await allocateBatch(
      request,
      dependenciesFor(fakes, { config: config({ batchSize: 5 }) }),
    );

    // All three higher-coverage entries are included, so the batch is not short.
    expect(allocated(outcome).entries).toHaveLength(5);
  });

  it("shortens the batch only when fewer eligible entries exist than were requested", async () => {
    const fakes = createFakes({ pool: [entry("OD_0001"), entry("OD_0002")] });

    const outcome = await allocateBatch(
      request,
      dependenciesFor(fakes, { config: config({ batchSize: 10 }) }),
    );

    expect(allocated(outcome).entries).toHaveLength(2);
  });
});

describe("an entry the validator already answered", () => {
  it("is excluded from the batch offered to that validator", async () => {
    const mine = entry("OD_0001");
    const theirs = entry("OD_0002");
    const fakes = createFakes({
      pool: [mine, theirs],
      responses: [response({ datasetEntryId: mine.id, validatorId: VALIDATOR })],
    });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    const ids = allocated(outcome).entries.map((candidate) => candidate.id);
    expect(ids).not.toContain(mine.id);
    expect(ids).toContain(theirs.id);
  });

  it("excludes it even when the stored response does not qualify toward coverage", async () => {
    // Two independent rules that must not be confused. `cannot_evaluate` contributes ZERO to coverage,
    // so it would not retire the entry on its own — but the validator who submitted it must still never
    // be asked again, because the methodology forbids one person judging an entry twice. Reading
    // exclusion off the coverage figure would get this wrong.
    const mine = entry("OD_0001");
    const theirs = entry("OD_0002");
    const fakes = createFakes({
      pool: [mine, theirs],
      responses: [
        response({
          datasetEntryId: mine.id,
          validatorId: VALIDATOR,
          evaluation: "cannot_evaluate",
        }),
      ],
    });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    expect(allocated(outcome).entries.map((candidate) => candidate.id)).toEqual([theirs.id]);
  });

  it("excludes an entry even when its coverage is BELOW the target", async () => {
    // The two rules again, at the boundary: OD_0001 has one qualifying validation against a target of
    // 3, so it is under-covered and eligible by coverage — and still excluded for this validator.
    const mine = entry("OD_0001");
    const theirs = entry("OD_0002");
    const fakes = createFakes({
      pool: [mine, theirs],
      responses: [response({ datasetEntryId: mine.id, validatorId: VALIDATOR })],
    });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    expect(allocated(outcome).entries.map((candidate) => candidate.id)).toEqual([theirs.id]);
  });
});

describe("an unknown validator", () => {
  it("is reported as unknown_validator rather than as a database fault", async () => {
    const fakes = createFakes({ pool: [entry("OD_0001")] });

    const outcome = await allocateBatch({ validatorId: "VAL_deadbeef" }, dependenciesFor(fakes));

    // A returning browser with a stale local-storage identifier is the single most likely thing to go
    // wrong. Reporting it as a persistence failure would tell a participant the study is broken when
    // nothing is.
    expect(outcome).toEqual({ status: "failed", reason: "unknown_validator" });
  });

  it("performs no write of any kind", async () => {
    const fakes = createFakes({ pool: [entry("OD_0001")] });

    await allocateBatch({ validatorId: "VAL_deadbeef" }, dependenciesFor(fakes));

    // Asserted directly rather than inferred from the absence of a batch id: "nothing was persisted"
    // is a different claim from "nothing was returned".
    expect(fakes.countOf("batches.create")).toBe(0);
    expect(fakes.countOf("validations.insert")).toBe(0);
    expect(fakes.stored.size).toBe(0);
  });

  it("does not read the pool either, so an unknown identifier costs one query", async () => {
    const fakes = createFakes({ pool: [entry("OD_0001")] });

    await allocateBatch({ validatorId: "VAL_deadbeef" }, dependenciesFor(fakes));

    expect(fakes.countOf("validators.findById")).toBe(1);
    expect(fakes.countOf("datasetEntries.listActive")).toBe(0);
    expect(fakes.countOf("validations.listForEntries")).toBe(0);
  });
});

describe("an exhausted pool", () => {
  it("reports exhausted when every remaining entry was already answered", async () => {
    const fakes = createFakes({
      pool: [entry("OD_0001"), entry("OD_0002")],
      responses: [
        response({ datasetEntryId: "OD_0001", validatorId: VALIDATOR }),
        response({ datasetEntryId: "OD_0002", validatorId: VALIDATOR }),
      ],
    });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    expect(outcome).toEqual({ status: "exhausted" });
  });

  it("reports exhausted when every remaining entry has reached the target", async () => {
    const fakes = createFakes({
      pool: [entry("OD_0001")],
      responses: ["VAL_0000eee1", "VAL_0000eee2", "VAL_0000eee3"].map((validatorId) =>
        response({ datasetEntryId: "OD_0001", validatorId }),
      ),
    });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    expect(outcome).toEqual({ status: "exhausted" });
  });

  it("reports exhausted when the pool is empty, without persisting anything", async () => {
    const fakes = createFakes({ pool: [] });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    expect(outcome).toEqual({ status: "exhausted" });
    expect(fakes.countOf("batches.create")).toBe(0);
  });

  it("carries no batch and no batch id", async () => {
    const fakes = createFakes({
      pool: [entry("OD_0001")],
      responses: [response({ datasetEntryId: "OD_0001", validatorId: VALIDATOR })],
    });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    expect(outcome).not.toHaveProperty("batchId");
    expect(outcome).not.toHaveProperty("entries");
  });

  it("stays distinguishable from a persistence failure", async () => {
    // Collapsing them would tell a validator who has finished the study that something is broken, and
    // would make the coverage-monitoring figure uncomputable.
    const exhaustedFakes = createFakes({
      pool: [entry("OD_0001")],
      responses: [response({ datasetEntryId: "OD_0001", validatorId: VALIDATOR })],
    });
    const failingFakes = createFakes({ pool: [entry("OD_0001")] });
    failingFakes.failOn(
      "validations.listForEntries",
      new RepositoryError("validations.listForEntries", "select failed"),
    );

    const exhausted = await allocateBatch(request, dependenciesFor(exhaustedFakes));
    const failed = await allocateBatch(request, dependenciesFor(failingFakes));

    expect(exhausted).not.toEqual(failed);
    expect(failed).toEqual({ status: "failed", reason: "persistence" });
  });
});

describe("a successful allocation", () => {
  it("never reports a batch with no entries", async () => {
    const fakes = createFakes({ pool: [entry("OD_0001"), entry("OD_0002")] });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    expect(allocated(outcome).entries.length).toBeGreaterThan(0);
  });

  it("persists the batch against the requesting validator", async () => {
    const fakes = createFakes({ pool: [entry("OD_0001")] });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    const created = fakes.calls.find((call) => call.method === "batches.create");
    expect(created?.argument).toMatchObject({ validatorId: VALIDATOR });
    expect(allocated(outcome).batchId).toBe((created?.argument as BatchRecord).id);
  });

  it("hands the repository a server-minted instant, so the NOT NULL backfill column can be written", async () => {
    // The fake at the top of this file has recorded `batches.create.createdAt` since an earlier change,
    // with a comment claiming that "a later change that stopped passing it would be invisible here
    // otherwise". **That was a claim of coverage with no assertion behind it** — nothing in this file read
    // the recorded instant, so the fake recorded a value nobody checked and the comment described a
    // guarantee that did not exist. The independent verification pass found it.
    //
    // What makes it worth asserting rather than deleting the recorder: the `interrupted-batch-recovery`
    // migration makes `validation_batches.created_at` `NOT NULL` with **no default**, and the backfill
    // only covers rows that existed when the migration ran. So from that migration forward the service
    // MUST pass the instant, and a service that stopped passing it would still pass every other test in
    // this file — `create` returns the batch either way, and the only place the omission is visible is a
    // real database rejecting the insert.
    //
    // Asserted against the **injected** clock rather than `expect.any(Date)`, because a service that
    // called `new Date()` itself would satisfy the weaker check and the point of the injection is that
    // the instant is the server's and is testable.
    const fakes = createFakes({ pool: [entry("OD_0001")] });

    await allocateBatch(request, dependenciesFor(fakes));

    const recorded = fakes.calls.find((call) => call.method === "batches.create.createdAt");
    // Assert the CALL happened, not merely that the value is plausible: an undefined instant would fail
    // the equality below, but a missing call and a call with `undefined` are the same defect and should
    // not depend on which shape a reader happened to imagine.
    //
    // The instant is an ISO **string**, not a `Date`. That is what the first draft of this assertion got
    // wrong — it asserted `toBeInstanceOf(Date)` and went red on `'2026-09-30T12:00:00.000Z'` — and the
    // red is worth keeping rather than quietly rewriting: the service serialises before handing the
    // instant over, which is the right shape for PostgREST and the wrong thing to assume without reading.
    expect(recorded).toBeDefined();
    expect(recorded?.argument).toBe(FIXED_NOW.toISOString());
  });

  it("records each entry at the 1-based position it occupies in the server-selected order", async () => {
    const fakes = createFakes({ pool: [entry("OD_0001"), entry("OD_0002"), entry("OD_0003")] });

    await allocateBatch(request, dependenciesFor(fakes, { config: config({ batchSize: 3 }) }));

    const created = fakes.calls.find((call) => call.method === "batches.create");
    const placements = (created?.argument as BatchRecord).entries;
    expect(placements.map((placement) => placement.position)).toEqual([1, 2, 3]);
  });

  it("ignores extra keys on the request, including a client-supplied order", async () => {
    // ==========================================================================================
    // WHAT THIS TEST PROVES, AND WHAT IT DOES NOT. The distinction was measured, not assumed.
    // ==========================================================================================
    // THIS PROVES: the service reads nothing but `validatorId` and `requestedSize` off the request, so
    // extra keys — including a plausible batch order — do not change what gets persisted.
    //
    // THIS DOES NOT PROVE: the spec scenario "a client cannot dictate the batch order". It cannot,
    // and the attempt to make it do so is recorded because the failure is instructive. An independent
    // verification pass built the mutation a developer would really write — the intent schema gains a
    // `clientOrder` field AND the service honours it — and the suite stayed green at `51 passed (51)`.
    // The obvious repair was THIS test: smuggle an order and assert it is ignored. It was written, and
    // measured, and it does not close the gap: the mutation honours a field named `clientOrder`, this
    // test smuggles `order` and `positions`, the mutation never fires, and the suite was still
    // `52 passed (52)`. Enumerating plausible key names cannot help, because a mutation may name its
    // field anything. The guarantee is the ABSENCE OF A PARAMETER, and absence is not something a
    // runtime assertion can observe.
    //
    // So the scenario is pinned at the type layer instead, in `domain-types.test.ts`, where adding ANY
    // third key to `AllocationRequest` — whatever it is called — fails `pnpm run typecheck`. That pin
    // was measured too: control `exit=0 / 0 errors`, with a third field added `exit=2`,
    // `TS2322: Type 'true' is not assignable to type 'never'`.
    //
    // The two layers together cover the scenario: that the field does not EXIST (type layer, here
    // referenced), that an extra key is REFUSED at the boundary (`allocation-actions.test.ts`), and
    // that positions are DERIVED from the selected order (the test above).
    const smuggledOrder = ["OD_0003", "OD_0002", "OD_0001"];

    // The cast is the point rather than a shortcut. A real client-supplied order arrives exactly like
    // this: an extra key on a payload the server never declared. Building it as a variable keeps the
    // value assignable to the declared request type while still carrying the extra keys, which an
    // inline object literal would not.
    const smuggled = {
      validatorId: VALIDATOR,
      order: smuggledOrder,
      positions: [
        { datasetEntryId: "OD_0003", position: 1 },
        { datasetEntryId: "OD_0002", position: 2 },
        { datasetEntryId: "OD_0001", position: 3 },
      ],
    } as unknown as { readonly validatorId: AnonymousValidatorId };

    const persistOrder = async (
      payload: Parameters<typeof allocateBatch>[0],
    ): Promise<string[]> => {
      const fakes = createFakes({
        pool: [entry("OD_0001"), entry("OD_0002"), entry("OD_0003")],
      });
      await allocateBatch(payload, dependenciesFor(fakes, { config: config({ batchSize: 3 }) }));
      const created = fakes.calls.find((call) => call.method === "batches.create");
      return (created?.argument as BatchRecord).entries.map(
        (placement) => `${placement.datasetEntryId}@${placement.position}`,
      );
    };

    const withoutClientOrder = await persistOrder(request);
    const withClientOrder = await persistOrder(smuggled);

    // PRECONDITION, asserted rather than assumed: if the server's own order ever coincided with the
    // smuggled one, the comparison below would pass for the wrong reason and this test would be
    // vacuous. Failing here says so out loud instead of reporting a green that proves nothing.
    expect(withoutClientOrder).not.toEqual(smuggledOrder.map((id, index) => `${id}@${index + 1}`));

    // THE CLAIM, at the only layer this test can reach: the two runs persisted the same order, so the
    // extra keys changed nothing.
    expect(withClientOrder).toEqual(withoutClientOrder);
  });

  it("records no entry twice within one batch", async () => {
    const fakes = createFakes({ pool: [entry("OD_0001"), entry("OD_0002"), entry("OD_0003")] });

    await allocateBatch(request, dependenciesFor(fakes, { config: config({ batchSize: 3 }) }));

    const created = fakes.calls.find((call) => call.method === "batches.create");
    const ids = (created?.argument as BatchRecord).entries.map(
      (placement) => placement.datasetEntryId,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns entries in the order the repository STORED, not the order the service selected", async () => {
    // The reason the batch is read back rather than echoed: a repository that stored a different order
    // must be reported as it is, because the persisted order is the research record. Echoing the
    // argument would let a storage bug be papered over by the service that built the request.
    const fakes = createFakes({ pool: [entry("OD_0001"), entry("OD_0002")] });
    const original = fakes.dependencies.batches.create;
    fakes.dependencies.batches = {
      ...fakes.dependencies.batches,
      create: async (batch, createdAt) => {
        const stored = await original(batch, createdAt);
        return { ...stored, entries: [...stored.entries].reverse() };
      },
    };

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    // Expected against what was WRITTEN, read back off the recorded call rather than hard-coded. A
    // hard-coded pair would be a third assertion about the selection order wearing a claim about the
    // read-back, and the constant-zero source produces a specific permutation that is not "input
    // order" — so a hard-coded expectation here would pass or fail for the wrong reason.
    const written = (
      fakes.calls.find((call) => call.method === "batches.create")?.argument as BatchRecord
    ).entries;
    const writtenIds = written.map((placement) => placement.datasetEntryId);

    expect(allocated(outcome).entries.map((candidate) => candidate.id)).toEqual(
      [...writtenIds].reverse(),
    );
  });

  it("honours a SMALLER requested size and refuses a larger one", async () => {
    const pool = Array.from({ length: 12 }, (_, index) =>
      entry(`OD_${String(index + 1).padStart(4, "0")}`),
    );
    const small = createFakes({ pool });
    const large = createFakes({ pool });

    const shorter = await allocateBatch(
      { validatorId: VALIDATOR, requestedSize: 3 },
      dependenciesFor(small, { config: config({ batchSize: 10 }) }),
    );
    const greedier = await allocateBatch(
      { validatorId: VALIDATOR, requestedSize: 500 },
      dependenciesFor(large, { config: config({ batchSize: 10 }) }),
    );

    expect(allocated(shorter).entries).toHaveLength(3);
    // The ceiling is server-side configuration the client does not hold.
    expect(allocated(greedier).entries).toHaveLength(10);
  });

  it("produces the same order for the same inputs and the same supplied randomness", async () => {
    const pool = [entry("OD_0001"), entry("OD_0002"), entry("OD_0003")];
    const first = createFakes({ pool });
    const second = createFakes({ pool });

    const a = await allocateBatch(
      request,
      dependenciesFor(first, { config: config({ batchSize: 3 }) }),
    );
    const b = await allocateBatch(
      request,
      dependenciesFor(second, { config: config({ batchSize: 3 }) }),
    );

    expect(allocated(a).entries.map((candidate) => candidate.id)).toEqual(
      allocated(b).entries.map((candidate) => candidate.id),
    );
  });

  it("derives the batch id from the validator's own identifier and the injected clock", async () => {
    const fakes = createFakes({ pool: [entry("OD_0001")] });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    // A batch id is readable to the validator who owns it, so it encodes that validator's id and
    // nothing about anyone else.
    expect(allocated(outcome).batchId).toBe(`${VALIDATOR}-${FIXED_NOW.toISOString()}`);
  });
});

describe("what the requesting validator is shown", () => {
  it("carries only the fields needed to render an entry", async () => {
    const fakes = createFakes({ pool: [entry("OD_0001")] });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    expect(Object.keys(allocated(outcome).entries[0] ?? {}).sort()).toEqual([
      "category",
      "destination",
      "id",
      "instruction",
      "origin",
      "transitMode",
    ]);
  });

  it("carries no archival copy of the source record", async () => {
    // `sourcePayload` is the copy that exists so an unmodelled source field survives in the database.
    // It is not research output and has no business crossing to a browser. The type cannot express it
    // (`tests/unit/domain-types.test.ts` proves that at compile time); this proves the runtime value
    // does not carry it even when the pool entry did.
    const fakes = createFakes({
      pool: [
        {
          ...entry("OD_0001"),
          sourcePayload: { origin: "Bangon", transit_mode: null, something_unmodelled: 42 },
        } as unknown as DatasetEntry,
      ],
    });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    const shown = allocated(outcome).entries[0] ?? {};
    expect(shown).not.toHaveProperty("sourcePayload");
    expect(JSON.stringify(allocated(outcome))).not.toContain("something_unmodelled");
  });

  it("carries no coverage figure, no other validator's response, and no screening answer", async () => {
    const fakes = createFakes({
      pool: [entry("OD_0001"), entry("OD_0002")],
      responses: [
        response({
          datasetEntryId: "OD_0001",
          validatorId: "VAL_0000fff1",
          evaluation: "incorrect",
        }),
      ],
    });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    // Internal coverage is a research variable no validator has any business seeing: it would tell them
    // which entries are under-collected.
    const serialized = JSON.stringify(allocated(outcome));
    expect(serialized).not.toContain("VAL_0000fff1");
    expect(serialized).not.toContain("ilocanoProficiency");
    expect(serialized).not.toContain("from Bangon to the Municipal Hall");
    for (const candidate of allocated(outcome).entries) {
      expect(Object.keys(candidate)).not.toContain("coverage");
    }
  });

  it("carries no ingestion timestamp or active flag", async () => {
    const fakes = createFakes({ pool: [entry("OD_0001")] });

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    const shown = allocated(outcome).entries[0] ?? {};
    expect(shown).not.toHaveProperty("createdAt");
    expect(shown).not.toHaveProperty("isActive");
  });
});

describe("a failed write", () => {
  it("reports persistence rather than an empty successful batch", async () => {
    const fakes = createFakes({ pool: [entry("OD_0001")] });
    fakes.failOn(
      "batches.create",
      new RepositoryError("validation_batches.insert", "insert rejected", { detail: "23505" }),
    );

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    expect(outcome).toEqual({ status: "failed", reason: "persistence" });
  });

  it("reports no batch id on a failed write", async () => {
    // A client that can read a batch id out of a failed response will treat it as stored.
    const fakes = createFakes({ pool: [entry("OD_0001")] });
    fakes.failOn(
      "batches.create",
      new RepositoryError("validation_batches.insert", "insert rejected"),
    );

    const outcome = await allocateBatch(request, dependenciesFor(fakes));

    expect(outcome).not.toHaveProperty("batchId");
  });

  it("propagates a non-repository error instead of reporting it as a persistence failure", async () => {
    const fakes = createFakes({ pool: [entry("OD_0001")] });
    fakes.failOn(
      "validations.listForEntries",
      new TypeError("a programming error, not a query failure"),
    );

    // Swallowing an unknown throwable is how a real bug becomes a "persistence failure" that nobody
    // investigates.
    await expect(allocateBatch(request, dependenciesFor(fakes))).rejects.toThrow(TypeError);
  });
});

describe("the read pattern", () => {
  it("reads the pool's responses ONCE for the whole pool", async () => {
    const pool = Array.from({ length: 25 }, (_, index) =>
      entry(`OD_${String(index + 1).padStart(4, "0")}`),
    );
    const fakes = createFakes({ pool });

    await allocateBatch(request, dependenciesFor(fakes));

    // Per-entry reads would be up to 600 round trips for one request, and each a separate chance to
    // observe a different snapshot of coverage.
    const call = fakes.calls.find((candidate) => candidate.method === "validations.listForEntries");
    expect((call?.argument as DatasetEntryId[]).length).toBe(25);
  });

  it("requests the whole pool without a category filter", async () => {
    const fakes = createFakes({ pool: [entry("OD_0001")] });

    await allocateBatch(request, dependenciesFor(fakes));

    // Category-conditional allocation would let a category with no under-covered entries starve while
    // another had them, and that is a coverage-reporting question rather than an allocation one.
    expect(
      fakes.calls.find((call) => call.method === "datasetEntries.listActive")?.argument,
    ).toBeUndefined();
  });

  it("derives the effective size from configuration, not from the request alone", async () => {
    const pool = Array.from({ length: 8 }, (_, index) =>
      entry(`OD_${String(index + 1).padStart(4, "0")}`),
    );
    const fakes = createFakes({ pool });

    const outcome = await allocateBatch(
      { validatorId: VALIDATOR },
      dependenciesFor(fakes, { config: config({ batchSize: 2 }) }),
    );

    expect(allocated(outcome).entries).toHaveLength(2);
  });
});
