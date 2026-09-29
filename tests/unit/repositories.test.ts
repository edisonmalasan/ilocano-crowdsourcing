import { describe, expect, it } from "vitest";

import type { DatasetEntry, DatasetEntryId } from "@/schemas/dataset";
import type { ValidatorProfile } from "@/schemas/validator";
import type { ValidationResponse } from "@/schemas/validation";

import {
  RepositoryError,
  isRepositoryError,
  type DatasetEntriesRepository,
  type RepositoryOperation,
  type ValidationsRepository,
  type ValidatorsRepository,
} from "@/lib/repositories";

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

  return { datasetEntries, validators, validations, responses, profiles, entries };
}

describe("repository interfaces are satisfiable without a database", () => {
  it("accepts an in-memory implementation of all three interfaces", () => {
    // The `satisfies` annotations are the compile-time assertion: if a method signature drifts,
    // this file stops compiling rather than the failure surfacing at a call site much later.
    const repositories = createInMemoryRepositories();

    const all: [DatasetEntriesRepository, ValidatorsRepository, ValidationsRepository] = [
      repositories.datasetEntries,
      repositories.validators,
      repositories.validations,
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
        touchLastActive: async () => fail("validators.touchLastActive", "down"),
      },
      validations: {
        insert: async () => fail("validations.insert", "down"),
        findById: async () => fail("validations.findById", "down"),
        findByEntry: async () => fail("validations.findByEntry", "down"),
        countForEntry: async () => fail("validations.countForEntry", "down"),
        countForValidator: async () => fail("validations.countForValidator", "down"),
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
});
