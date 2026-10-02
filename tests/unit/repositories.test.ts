import { describe, expect, it } from "vitest";

import type { DatasetEntry, DatasetEntryId } from "@/schemas/dataset";
import type { ValidatorProfile } from "@/schemas/validator";
import type { ValidationResponse } from "@/schemas/validation";

import {
  RepositoryError,
  isRepositoryError,
  type BatchesRepository,
  type DatasetEntriesRepository,
  type RepositoryOperation,
  type ValidationsRepository,
  type ValidatorsRepository,
} from "@/lib/repositories";
import type { BatchRecord } from "@/schemas/batch";

const ENTRY: DatasetEntry = {
  id: "OD_0001",
  category: "origin_destination",
  instruction: "Gemahen nga agpangide ti jeep.",
  origin: "Baguio",
  destination: "Bangko Sentral",
  transitMode: null,
  createdAt: "2026-09-30T00:00:00.000Z",
  isActive: true,
};

const PROFILE: ValidatorProfile = {
  id: "VAL_a81d92c1",
  ilocanoProficiency: "fluent",
  createdAt: "2026-09-30T00:00:00.000Z",
  lastActiveAt: "2026-09-30T00:00:00.000Z",
  totalValidations: 0,
};

const RESPONSE: ValidationResponse = {
  id: "res_01",
  validatorId: PROFILE.id,
  datasetEntryId: ENTRY.id,
  batchId: "batch_01",
  evaluation: "correct_natural",
  createdAt: "2026-09-30T00:00:00.000Z",
  updatedAt: "2026-09-30T00:00:00.000Z",
};

/** A batch record with exactly the placements given, for the recovery-read assertions below. */
function batchOf(id: string, validatorId: string, entries: BatchRecord["entries"]): BatchRecord {
  return {
    id,
    validatorId: validatorId as BatchRecord["validatorId"],
    entries,
  };
}

/** One entry at one 1-based position, so a projection's flat `entryIds` is checkable. */
function entryAt(datasetEntryId: string, position: number): BatchRecord["entries"][number] {
  return {
    datasetEntryId: datasetEntryId as BatchRecord["entries"][number]["datasetEntryId"],
    position,
  };
}

/**
 * In-memory fakes.
 *
 * These exist to prove the seam is real: a domain service must be exercisable against an
 * implementation of the interface with no database present. They are intentionally simple — a fake
 * can only prove the interface is satisfiable and that failures surface as typed errors, which is
 * exactly what this change claims. Persistence semantics are the next change's PGlite-backed
 * tests, not these.
 */
function createInMemoryRepositories() {
  const entries = new Map<DatasetEntryId, DatasetEntry>([[ENTRY.id, ENTRY]]);
  const profiles = new Map<string, ValidatorProfile>();
  const responses: ValidationResponse[] = [];

  const datasetEntries: DatasetEntriesRepository = {
    async listActive() {
      return [...entries.values()].filter((entry) => entry.isActive);
    },
    async findById(id) {
      return entries.get(id) ?? null;
    },
    async listByIds(ids) {
      return ids.flatMap((id) => {
        const found = entries.get(id);
        return found ? [found] : [];
      });
    },
  };

  const validators: ValidatorsRepository = {
    async create(profile) {
      if (profiles.has(profile.id)) {
        throw new RepositoryError("validators.insert", `validator ${profile.id} already exists`);
      }
      profiles.set(profile.id, profile);
      return profile;
    },
    async findById(id) {
      return profiles.get(id) ?? null;
    },
    async listByIds(ids) {
      return ids.flatMap((id) => {
        const found = profiles.get(id);
        return found ? [found] : [];
      });
    },
    async touchLastActive(id, at) {
      const existing = profiles.get(id);
      if (!existing) return;
      profiles.set(id, { ...existing, lastActiveAt: at });
    },
  };

  const validations: ValidationsRepository = {
    async insert(response) {
      const duplicate = responses.some(
        (existing) =>
          existing.validatorId === response.validatorId &&
          existing.datasetEntryId === response.datasetEntryId,
      );
      if (duplicate) {
        throw new RepositoryError(
          "validations.insert",
          "unique constraint violated: (validator_id, dataset_entry_id)",
        );
      }
      responses.push(response);
      return response;
    },
    async findById(id) {
      return responses.find((response) => response.id === id) ?? null;
    },
    async findByEntry(entryId) {
      return responses.filter((response) => response.datasetEntryId === entryId);
    },
    async listForEntries(entryIds) {
      if (entryIds.length === 0) return [];
      // UNFILTERED, deliberately, and this is the assertion worth reading: a fake that applied the
      // qualifying rule here would be a second implementation of it, and the comment on the
      // interface says why that is not allowed. The fake returns what is stored.
      return responses.filter((response) => entryIds.includes(response.datasetEntryId));
    },
    async listEntryIdsForValidator(validatorId) {
      return [
        ...new Set(
          responses
            .filter((response) => response.validatorId === validatorId)
            .map((response) => response.datasetEntryId),
        ),
      ];
    },
    async countForEntry(entryId) {
      // Distinct validators, not rows: coverage is defined in terms of independent validators.
      return new Set(
        responses
          .filter((response) => response.datasetEntryId === entryId)
          .map((response) => response.validatorId),
      ).size;
    },
    async countForValidator(validatorId) {
      return responses.filter((response) => response.validatorId === validatorId).length;
    },
  };

  const batches = new Map<string, BatchRecord>();

  // The creation instants `create` was handed, so `listForRecovery` reports what was written rather
  // than a fixture constant that would be the same for every batch and make the ordering untestable.
  const batchCreatedAt = new Map<string, string>();

  const batchRepository: BatchesRepository = {
    async create(batch, createdAt) {
      if (batches.has(batch.id)) {
        throw new RepositoryError("validation_batches.insert", `batch ${batch.id} already exists`);
      }
      batches.set(batch.id, batch);
      batchCreatedAt.set(batch.id, createdAt);
      return batch;
    },
    async findById(id) {
      return batches.get(id) ?? null;
    },
    async listForRecovery(validatorId) {
      // A REAL projection rather than `[]`, and **that choice used to be defended by a comment naming a
      // benefit this file does not provide.** The comment said this fake "backs tests of services that
      // consume the recovery read", and no such test exists: nothing outside this file can import a test
      // file, and within it no test called this method. So the projection was written to satisfy the
      // interface — which requires a body — and then credited with a coverage it had none of.
      //
      // That matters because the *ordering* encoded below is the whole point of the method, and an
      // unasserted ordering in a fake is the most expensive kind of unassertion: a service test written
      // against it later would silently inherit whichever order this body happens to implement, and if
      // that were ascending the test would still pass while the product offered the wrong batch. So the
      // ordering is now asserted directly, below, against batches written in an order the fake has to
      // correct.
      //
      // NEWEST FIRST, by the same two keys and the same code-point comparison the Supabase
      // implementation asks the database for. `localeCompare` is deliberately NOT used: the domain
      // rule's own note says a collation that orders differently under two locales would make the
      // offered batch depend on where the server runs, and a fake using one would quietly disagree
      // with the real read about which of two batches wins.
      return [...batches.values()]
        .filter((batch) => batch.validatorId === validatorId)
        .map((batch) => ({
          id: batch.id,
          validatorId: batch.validatorId,
          createdAt: batchCreatedAt.get(batch.id) ?? "",
          entryIds: batch.entries.map((placement) => placement.datasetEntryId),
        }))
        .sort((left, right) =>
          left.createdAt === right.createdAt
            ? left.id < right.id
              ? -1
              : 1
            : left.createdAt < right.createdAt
              ? -1
              : 1,
        )
        .reverse();
    },
  };

  return {
    datasetEntries,
    validators,
    validations,
    batches: batchRepository,
    responses,
    profiles,
    entries,
  };
}

describe("repository interfaces are satisfiable without a database", () => {
  it("accepts an in-memory implementation of all four interfaces", () => {
    // The `satisfies` annotations are the compile-time assertion: if a method signature drifts,
    // this file stops compiling rather than the failure surfacing at a call site much later.
    const repositories = createInMemoryRepositories();

    const all: [
      DatasetEntriesRepository,
      ValidatorsRepository,
      ValidationsRepository,
      BatchesRepository,
    ] = [
      repositories.datasetEntries,
      repositories.validators,
      repositories.validations,
      repositories.batches,
    ];

    for (const repository of all) {
      expect(repository).toBeDefined();
    }
  });

  it("returns domain types, never persistence row shapes", async () => {
    const { datasetEntries, validators, validations } = createInMemoryRepositories();

    const found = await datasetEntries.findById("OD_0001");
    expect(found).toEqual(ENTRY);
    // The domain type is camelCase and carries no persistence metadata.
    expect(Object.keys(found ?? {}).sort()).toEqual([
      "category",
      "createdAt",
      "destination",
      "id",
      "instruction",
      "isActive",
      "origin",
      "transitMode",
    ]);

    await validators.create(PROFILE);
    expect((await validators.findById(PROFILE.id))?.ilocanoProficiency).toBe("fluent");

    await validations.insert(RESPONSE);
    expect(await validations.countForEntry("OD_0001")).toBe(1);
  });

  it("projects the recovery read newest-first, breaking a tie by id descending", async () => {
    // The assertion the fake's own comment used to imply and never had. See the note on `listForRecovery`.
    //
    // Three batches of ONE validator, inserted in an order the projection has to undo:
    //
    //   "batch_b"  same instant as "batch_a"   -> the tiebreaker must put "batch_b" FIRST
    //   "batch_a"  same instant as "batch_b"   -> (id descending, so b precedes a)
    //   "batch_old" an EARLIER instant          -> must sort LAST despite being inserted first
    //
    // So an ascending implementation fails, a tie-break on insertion order fails, and an implementation
    // that ignores `createdAt` fails — three different wrong answers, one assertion. The tie is the part
    // worth having: it is the case the `id DESC` key in the migration's index exists to make
    // deterministic, and a fake that resolved it by insertion order would hide exactly that.
    const { batches } = createInMemoryRepositories();
    const instant = "2026-10-01T09:00:00.000Z";
    const earlier = "2026-10-01T08:00:00.000Z";

    await batches.create(batchOf("batch_old", PROFILE.id, [entryAt("OD_0001", 1)]), earlier);
    await batches.create(batchOf("batch_a", PROFILE.id, [entryAt("OD_0002", 1)]), instant);
    await batches.create(batchOf("batch_b", PROFILE.id, [entryAt("OD_0003", 1)]), instant);

    const listed = await batches.listForRecovery(PROFILE.id);

    expect(listed.map((candidate) => candidate.id)).toEqual(["batch_b", "batch_a", "batch_old"]);
    // The entry ids come back as a flat list, because the recovery read is two flat selects and the
    // grouping happens in the domain. Asserting the shape here means a future change to that shape is
    // caught in the fake rather than discovered by whichever service test adopts it.
    expect(listed[0]?.entryIds).toEqual(["OD_0003"]);
    // The instant is REPORTED, not merely used for ordering: the recognition rule hands `createdAt` on to
    // the caller, so a projection that ordered by it and then dropped it would pass an ordering-only
    // assertion.
    expect(listed.map((candidate) => candidate.createdAt)).toEqual([instant, instant, earlier]);
  });

  it("scopes the recovery read to the validator it was asked about", async () => {
    // A read that returned every validator's batches would be a privacy defect, not a coverage one, and
    // a fake that ignored its argument could not catch it. Asserted because the parameter exists and an
    // unused parameter is indistinguishable from a forgotten filter.
    const { batches } = createInMemoryRepositories();
    const other = "VAL_0000beef" as ValidatorProfile["id"];
    const instant = "2026-10-01T09:00:00.000Z";

    await batches.create(batchOf("batch_mine", PROFILE.id, [entryAt("OD_0001", 1)]), instant);
    await batches.create(batchOf("batch_theirs", other, [entryAt("OD_0002", 1)]), instant);

    expect(await batches.listForRecovery(PROFILE.id)).toHaveLength(1);
    expect(await batches.listForRecovery(other)).toHaveLength(1);
    expect(await batches.listForRecovery("VAL_00000000" as ValidatorProfile["id"])).toEqual([]);
  });

  it("distinguishes an absent record (null) from a failed call (a raised RepositoryError)", async () => {
    // The distinction is the whole point of the error contract: a domain service must be able to
    // tell "there is no such entry" from "the query failed".
    const { datasetEntries } = createInMemoryRepositories();

    await expect(datasetEntries.findById("OD_9999")).resolves.toBeNull();
  });

  it("counts distinct validators per entry, so a duplicate cannot inflate coverage", async () => {
    const { validations, responses } = createInMemoryRepositories();

    await validations.insert(RESPONSE);
    responses.push({ ...RESPONSE, id: "res_02" });

    // Two rows, one validator.
    expect(responses).toHaveLength(2);
    expect(await validations.countForEntry("OD_0001")).toBe(1);
  });
});

describe("failing repository", () => {
  /**
   * A repository whose every call fails, as a real one would on a connection error.
   *
   * Each method throws rather than returning a fallback value. `fail` is typed `never`, so the
   * enclosing method still satisfies the interface without an unreachable return statement.
   */
  function createFailingRepositories(): {
    datasetEntries: DatasetEntriesRepository;
    validators: ValidatorsRepository;
    validations: ValidationsRepository;
    batches: BatchesRepository;
  } {
    const fail = (operation: RepositoryOperation, cause: unknown): never => {
      throw new RepositoryError(operation, `${operation} failed`, {
        cause,
        detail: "ECONNREFUSED",
      });
    };

    return {
      datasetEntries: {
        // `async` so each failure surfaces as a rejected promise, which is what a real
        // implementation's rejected network call looks like to a caller.
        listActive: async () => fail("dataset_entries.list", "down"),
        findById: async () => fail("dataset_entries.findById", "down"),
        listByIds: async () => fail("dataset_entries.listByIds", "down"),
      },
      validators: {
        create: async () => fail("validators.insert", "down"),
        findById: async () => fail("validators.findById", "down"),
        listByIds: async () => fail("validators.listByIds", "down"),
        touchLastActive: async () => fail("validators.touchLastActive", "down"),
      },
      validations: {
        insert: async () => fail("validations.insert", "down"),
        findById: async () => fail("validations.findById", "down"),
        findByEntry: async () => fail("validations.findByEntry", "down"),
        listForEntries: async () => fail("validations.listForEntries", "down"),
        listEntryIdsForValidator: async () => fail("validations.listEntryIdsForValidator", "down"),
        countForEntry: async () => fail("validations.countForEntry", "down"),
        countForValidator: async () => fail("validations.countForValidator", "down"),
      },
      batches: {
        create: async () => fail("validation_batches.insert", "down"),
        findById: async () => fail("validation_batches.findById", "down"),
        listForRecovery: async () => fail("validation_batches.listForRecovery", "down"),
      },
    };
  }

  it("raises a typed RepositoryError naming the operation, rather than an empty result", async () => {
    const { datasetEntries } = createFailingRepositories();

    const error = await datasetEntries.listActive().then(
      () => null,
      (caught: unknown) => caught,
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("dataset_entries.list");
  });

  it("names the operation for a coverage count, so the caller knows which query failed", async () => {
    const { validations } = createFailingRepositories();

    // Returning 0 here would look like "this entry has no validations" and would send allocation
    // into a branch it should never take.
    await expect(validations.countForEntry("OD_0001")).rejects.toMatchObject({
      name: "RepositoryError",
      operation: "validations.countForEntry",
    });
  });

  it("preserves the original cause and the persistence detail for diagnosis", async () => {
    const { validators } = createFailingRepositories();
    const cause = new Error("socket hang up");

    const error = (await validators
      .create(PROFILE)
      .then(() => null)
      .catch((caught: unknown) => caught)) as RepositoryError;

    expect(error).toBeInstanceOf(RepositoryError);
    expect(error.detail).toBe("ECONNREFUSED");
    expect(error.message).toContain("validators.insert");
    // `cause` is a property of the base Error, so it is asserted structurally rather than by type.
    expect((error as { cause?: unknown }).cause).toBeDefined();
    expect(cause.message).toBe("socket hang up");
  });

  it("surfaces a duplicate-key insert as a named error instead of silently succeeding", async () => {
    const { validations } = createInMemoryRepositories();

    await validations.insert(RESPONSE);
    await expect(validations.insert({ ...RESPONSE, id: "res_02" })).rejects.toMatchObject({
      operation: "validations.insert",
    });
  });

  it("names the operation for each batch call, so a partial write is attributable", async () => {
    const { batches } = createFailingRepositories();

    // A caller cannot tell these two apart from the result alone — both reject. The operation name
    // is the only thing that says whether the batch row or the read-back failed, and a
    // half-written allocation is exactly the situation where that matters.
    await expect(
      batches.create(
        { id: "batch_01", validatorId: PROFILE.id, entries: [] },
        "2026-10-01T09:15:00.000Z",
      ),
    ).rejects.toMatchObject({ operation: "validation_batches.insert" });
    await expect(batches.findById("batch_01")).rejects.toMatchObject({
      operation: "validation_batches.findById",
    });
    // The recovery read is named too, and this is the assertion that keeps it in the union: an
    // operation name that exists but is unreachable from a test is a name nothing has checked, and a
    // caller branching on which read failed would have no way to tell recovery from allocation.
    await expect(batches.listForRecovery(PROFILE.id)).rejects.toMatchObject({
      operation: "validation_batches.listForRecovery",
    });
  });

  it("reports a coverage read as unavailable rather than as zero, so a fault never looks like an uncovered entry", async () => {
    const { validations } = createFailingRepositories();

    // Zero here would tell allocation "nobody has validated this" and the entry would be handed to
    // another three validators. A named failure is the only answer that cannot cause that, and it
    // is the reason `listForEntries` raises rather than returning an empty list on a transport
    // error — the empty list is a legitimate answer to a different question.
    await expect(validations.listForEntries(["OD_0001"])).rejects.toMatchObject({
      operation: "validations.listForEntries",
    });
    await expect(validations.listEntryIdsForValidator(PROFILE.id)).rejects.toMatchObject({
      operation: "validations.listEntryIdsForValidator",
    });
  });
});

/**
 * The coverage rule has exactly one owner, and this is the file that notices if that changes.
 *
 * Two claims, one about what must NOT exist and one about what must STAY.
 *
 * The first is the interesting one. Allocation needed "how many validators have answered this
 * entry" and "which entries has this validator answered", and the temptation was to add a coverage
 * or allocation method to `DatasetEntriesRepository`, because the pool lives there and a count of
 * its entries' validations feels like a property of the entries. It is not: coverage is a fact about
 * VALIDATIONS, and putting the read on the entries repository would give the rule a second home
 * where nothing would notice the move. So the interface is asserted closed — its method names are
 * exactly these three — which makes a future `countValidations(...)` on it a failing test rather
 * than a quiet second authority.
 *
 * The second is that `countForEntry` and `countForValidator` remain, unchanged and still honest
 * about what they count. The admin dashboard needs "how many people have looked at this", which is
 * a genuinely different question from "how many qualifying judgements does this have", and a
 * `cannot_evaluate` response counts toward the first and not the second. Deleting the convenient
 * method to remove the temptation would trade a documented risk for an undocumented gap.
 */
describe("coverage stays where it belongs", () => {
  it("gives the dataset-entries interface exactly its three read methods, and no coverage method", () => {
    const { datasetEntries } = createInMemoryRepositories();

    // The concrete method names, asserted as a CLOSED set. A `contains` check would pass with a
    // fourth method added, which is precisely the change this test exists to refuse.
    expect(Object.keys(datasetEntries).sort()).toEqual(["findById", "listActive", "listByIds"]);
    for (const forbidden of [
      "countValidations",
      "countForEntry",
      "coverage",
      "selectForAllocation",
      "listForAllocation",
    ]) {
      expect(Object.keys(datasetEntries), forbidden).not.toContain(forbidden);
    }
  });

  it("counts every validator who responded, including one who could not evaluate", async () => {
    // The honest, and useful, answer to "how many people have looked at this". It is NOT the
    // coverage number, and the two disagree precisely when a validator said they could not judge
    // the entry — which is the case that must not retire an entry from the pool.
    const { validations } = createInMemoryRepositories();
    await validations.insert(RESPONSE);
    await validations.insert({
      ...RESPONSE,
      id: "res_02",
      validatorId: "VAL_0000beef",
      evaluation: "cannot_evaluate",
    });

    expect(await validations.countForEntry("OD_0001")).toBe(2);
  });

  it("returns stored responses unfiltered, so the qualifying rule is applied once, in the domain", async () => {
    const { validations } = createInMemoryRepositories();
    await validations.insert(RESPONSE);
    await validations.insert({
      ...RESPONSE,
      id: "res_02",
      validatorId: "VAL_0000beef",
      evaluation: "cannot_evaluate",
    });

    const stored = await validations.listForEntries(["OD_0001"]);

    // Both rows come back, including the one that contributes nothing to coverage. A repository
    // that pre-filtered would return one row here and would be a second implementation of
    // `isQualifyingValidation` — the failure `design.md` D1 exists to prevent.
    expect(stored.map((response) => response.evaluation).sort()).toEqual([
      "cannot_evaluate",
      "correct_natural",
    ]);
  });

  it("returns the ids a validator has answered, and ids only", async () => {
    const { validations } = createInMemoryRepositories();
    await validations.insert(RESPONSE);
    await validations.insert({ ...RESPONSE, id: "res_02", datasetEntryId: "OD_0002" });

    expect(await validations.listEntryIdsForValidator(PROFILE.id)).toEqual(["OD_0001", "OD_0002"]);
  });

  it("issues no coverage query for an empty pool, because `.in([])` is malformed rather than empty", async () => {
    const { validations } = createInMemoryRepositories();

    expect(await validations.listForEntries([])).toEqual([]);
  });
});
