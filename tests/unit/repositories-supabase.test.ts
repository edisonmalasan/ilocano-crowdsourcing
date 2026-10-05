import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type { DatasetEntry, DatasetEntryId } from "@/schemas/dataset";
import type { ValidatorProfile } from "@/schemas/validator";
import type { ValidationResponse } from "@/schemas/validation";

import { RepositoryError, isRepositoryError, type RepositoryOperation } from "@/lib/repositories";
import type {
  FilterHandleLike,
  PostgrestErrorLike,
  PostgrestResultLike,
  SelectOptionsLike,
  SupabaseClientLike,
  TableHandleLike,
} from "@/lib/repositories/supabase/client";
import { SupabaseBatchesRepository } from "@/lib/repositories/supabase/batches";
import { SupabaseDatasetEntriesRepository } from "@/lib/repositories/supabase/dataset-entries";
import {
  BATCHES_OPERATIONS,
  DATASET_ENTRIES_OPERATIONS,
  ENTRY_RESERVATIONS_OPERATIONS,
  VALIDATIONS_OPERATIONS,
  VALIDATORS_OPERATIONS,
} from "@/lib/repositories/supabase/operations";
import { SupabaseValidationsRepository } from "@/lib/repositories/supabase/validations";
import { SupabaseValidatorsRepository } from "@/lib/repositories/supabase/validators";

// `server-only` throws when its module body is evaluated outside a server bundle, which is the
// enforcement mechanism but makes it unimportable under Vitest. Stubbing the marker is the
// established approach in this project (`tests/unit/env.test.ts`, `tests/unit/write-intake.test.ts`)
// and is why the boundary itself is asserted at the source level further down instead.
vi.mock("server-only", () => ({}));

/**
 * WHAT THESE TESTS PROVE, AND WHAT THEY CANNOT
 * -------------------------------------------
 * They prove the translation and error-mapping logic: that a row becomes a domain value, that a
 * failure becomes a `RepositoryError` naming the right operation, and that "absent" and "failed"
 * stay distinguishable. They run against a fake with no network, because no Supabase project and no
 * credential exist in this environment.
 *
 * They prove NOTHING about PostgREST. Not that `.in()` filters as expected, not that
 * `.select(cols, { count: "exact" })` returns a count, not that a uniqueness violation arrives
 * with code `23505`, and not that any of this code works against a real database. The one
 * PostgREST-derived fact these tests encode — the `23505` SQLSTATE for a unique-constraint
 * violation — is the documented PostgreSQL code, not an observed payload.
 */

/** A scripted outcome for one call: either a response envelope, or a thrown transport failure. */
type ScriptedOutcome = PostgrestResultLike | { throws: unknown };

interface RecordedFilter {
  kind: "eq" | "in" | "order" | "limit" | "range";
  column?: string;
  value?: unknown;
  from?: number;
  to?: number;
  ascending?: boolean;
}

interface RecordedCall {
  table: string;
  method: "select" | "insert" | "update";
  columns?: string;
  options?: SelectOptionsLike;
  /**
   * The written payload, in EITHER form `TableHandleLike.insert` accepts.
   *
   * The array form is not hypothetical: `SupabaseBatchesRepository.create` writes every
   * `batch_entries` row in one request. Recording it as a union rather than widening it to
   * `unknown` is deliberate — `unknown` would let a test accidentally compare a write to anything
   * at all, and a widened-for-convenience type here would hide exactly the mistake this recorder
   * exists to catch. `writtenRow` and `writtenRows` below narrow it, and both throw rather than
   * coercing, so "the wrong write shape was used" is a named failure instead of a passing
   * assertion against a value that never matched.
   */
  write?: Record<string, unknown> | readonly Record<string, unknown>[];
  filters: RecordedFilter[];
  terminal: "await" | "single" | "maybeSingle" | null;
}

function isSingleRowWrite(
  write: NonNullable<RecordedCall["write"]>,
): write is Record<string, unknown> {
  return !Array.isArray(write);
}

/** The write of a call that must have written ONE row. Throws if it wrote an array instead. */
function writtenRow(call: RecordedCall): Record<string, unknown> {
  const write = call.write;
  if (write === undefined || !isSingleRowWrite(write)) {
    throw new Error(`${call.table}.${call.method} did not write a single row`);
  }
  return write;
}

/** The write of a call that must have written SEVERAL rows. Throws if it wrote one row instead. */
function writtenRows(call: RecordedCall): readonly Record<string, unknown>[] {
  const write = call.write;
  if (write === undefined || isSingleRowWrite(write)) {
    throw new Error(`${call.table}.${call.method} did not write multiple rows`);
  }
  return write;
}

/**
 * A recording fake for the narrow client interface.
 *
 * It records what was asked for — table, method, column list, filters, terminal — because the
 * query SHAPE is part of what these tests verify: an explicit column list, `head: true` on a count,
 * `maybeSingle()` rather than `single()`. A fake that only returned data would let any of those
 * regress silently.
 *
 * Responses are queued, so a test scripts exactly the outcomes one call may take. An unscripted
 * call is a test bug and rejects loudly rather than returning an empty result that would look like
 * a legitimate "no rows".
 */
function createFakeClient() {
  const calls: RecordedCall[] = [];
  const queued: ScriptedOutcome[] = [];

  const finish = (call: RecordedCall): Promise<PostgrestResultLike> => {
    calls.push(call);
    const next = queued.shift();
    if (next === undefined) {
      return Promise.reject(
        new Error(
          `fake client received an unscripted call: ${call.table}.${call.method}` +
            `${call.terminal === null ? "" : ` (${call.terminal})`}`,
        ),
      );
    }
    if ("throws" in next) return Promise.reject(next.throws);
    return Promise.resolve(next);
  };

  const createFilterHandle = (call: RecordedCall): FilterHandleLike => {
    const handle: FilterHandleLike = {
      select(columns, options) {
        call.columns = columns;
        call.options = options;
        return handle;
      },
      eq(column, value) {
        call.filters.push({ kind: "eq", column, value });
        return handle;
      },
      in(column, value) {
        call.filters.push({ kind: "in", column, value });
        return handle;
      },
      order(column, options) {
        call.filters.push({ kind: "order", column, ascending: options?.ascending });
        return handle;
      },
      limit(count) {
        call.filters.push({ kind: "limit", value: count });
        return handle;
      },
      range(from, to) {
        call.filters.push({ kind: "range", from, to });
        return handle;
      },
      single() {
        call.terminal = "single";
        return finish(call);
      },
      maybeSingle() {
        call.terminal = "maybeSingle";
        return finish(call);
      },
      then(onfulfilled, onrejected) {
        call.terminal = "await";
        return finish(call).then(onfulfilled, onrejected);
      },
    };
    return handle;
  };

  const from = (table: string): TableHandleLike => ({
    select(columns, options) {
      return createFilterHandle({
        table,
        method: "select",
        columns,
        options,
        filters: [],
        terminal: null,
      });
    },
    insert(values) {
      const call: RecordedCall = {
        table,
        method: "insert",
        write: values,
        filters: [],
        terminal: null,
      };
      return createFilterHandle(call);
    },
    update(values) {
      const call: RecordedCall = {
        table,
        method: "update",
        write: values,
        filters: [],
        terminal: null,
      };
      return createFilterHandle(call);
    },
  });

  const client: SupabaseClientLike = {
    from,
    // Present but NOT SCRIPTED, deliberately. `rpc` arrived with the researcher sign-in attempt
    // limit, and this fake's scripted outcomes are shaped like table-operation rows (`data` as an
    // array) while a function returns a scalar. A fake that quietly returned a table-shaped envelope
    // from `rpc` would let the sign-in-attempts repository's own shape checks pass without the shape
    // ever being exercised, so the honest fake refuses instead. `tests/unit/repositories-sign-in-
    // attempts.test.ts` supplies a function-shaped fake and asserts the translation.
    rpc() {
      throw new Error(
        "This fake does not script `rpc`. Use the function-shaped fake in " +
          "tests/unit/repositories-sign-in-attempts.test.ts, which asserts what the sign-in " +
          "attempt repository sends and how it reads the answer.",
      );
    },
  };

  return {
    client,
    calls,
    /** Scripts the next `n` outcomes. */
    enqueue(...outcomes: ScriptedOutcome[]): void {
      queued.push(...outcomes);
    },
    lastCall(): RecordedCall {
      const call = calls.at(-1);
      if (call === undefined) throw new Error("no call was recorded");
      return call;
    },
  };
}

const postgrestError = (code: string, message: string): PostgrestErrorLike => ({ code, message });

/** Success envelope with a row array. */
const rows = (data: unknown[], count: number | null = null): PostgrestResultLike => ({
  data,
  error: null,
  count,
});

/** Success envelope with no body — what `head: true` returns. */
const countOnly = (count: number | null): PostgrestResultLike => ({
  data: null,
  error: null,
  count,
});

/** Failure envelope. */
const failure = (code: string, message: string): PostgrestResultLike => ({
  data: null,
  error: postgrestError(code, message),
  count: null,
});

/** A `timestamptz` exactly as PostgREST serializes one: ISO 8601 with the server's UTC offset. */
const TIMESTAMPTZ = "2026-09-30T08:00:00+08:00";
const ISO_UTC = "2026-09-30T00:00:00.000Z";

const SOURCE_PAYLOAD = {
  id: "OD_1",
  instruction: "Gemahen nga agpangide ti jeep.",
  output: { origin: "Baguio", destination: "Bangco Sentral", transit_mode: null },
  // A field the domain does not model. It exists only in the archival copy.
  annotator_note: "checked against the field notebook",
};

const ENTRY_ROW = {
  id: "OD_1",
  category: "origin_destination",
  source_entry_id: 1,
  category_name: "Origin + Destination",
  instruction: "Gemahen nga agpangide ti jeep.",
  origin: "Baguio",
  destination: "Bangco Sentral",
  transit_mode: null,
  source_payload: SOURCE_PAYLOAD,
  is_active: true,
  created_at: TIMESTAMPTZ,
};

const ENTRY: DatasetEntry = {
  id: "OD_1",
  category: "origin_destination",
  sourceEntryId: 1,
  categoryName: "Origin + Destination",
  instruction: "Gemahen nga agpangide ti jeep.",
  origin: "Baguio",
  destination: "Bangco Sentral",
  transitMode: null,
  createdAt: ISO_UTC,
  isActive: true,
};

const VALIDATOR_ROW = {
  id: "VAL_a81d92c1",
  ilocano_proficiency: "fluent",
  created_at: TIMESTAMPTZ,
  last_active_at: TIMESTAMPTZ,
  total_validations: 3,
};

const PROFILE: ValidatorProfile = {
  id: "VAL_a81d92c1",
  ilocanoProficiency: "fluent",
  createdAt: ISO_UTC,
  lastActiveAt: ISO_UTC,
  totalValidations: 3,
};

/**
 * A `correct_natural` row carrying BOTH translations, because that is now the only shape a
 * `correct_natural` record can legally have. `CANNOT_EVALUATE_ROW` covers the one legal shape with
 * no translations, and it exists so the NULL-to-absent-key mapping is proved on a record that is
 * actually readable rather than on one the domain would reject anyway.
 */
const VALIDATION_ROW = {
  id: "res_01",
  validator_id: "VAL_a81d92c1",
  dataset_entry_id: "OD_1",
  batch_id: "batch_01",
  evaluation: "correct_natural",
  corrected_instruction: null,
  english_translation: "Ride the jeep.",
  filipino_translation: "Sumakay ng jeep.",
  created_at: TIMESTAMPTZ,
  updated_at: TIMESTAMPTZ,
};

/** The `cannot_evaluate` shape: no correction and no translations, which is legal. */
const CANNOT_EVALUATE_ROW = {
  ...VALIDATION_ROW,
  id: "res_02",
  evaluation: "cannot_evaluate",
  english_translation: null,
  filipino_translation: null,
};

const RESPONSE: ValidationResponse = {
  id: "res_01",
  validatorId: "VAL_a81d92c1",
  datasetEntryId: "OD_1",
  batchId: "batch_01",
  evaluation: "correct_natural",
  englishTranslation: "Ride the jeep.",
  filipinoTranslation: "Sumakay ng jeep.",
  createdAt: ISO_UTC,
  updatedAt: ISO_UTC,
};

// Written out rather than spread from RESPONSE, because the point is that the translation keys are
// ABSENT — a spread would carry them across, and `{ englishTranslation: undefined }` would not be
// the same object shape the repository produces.
const CANNOT_EVALUATE_RESPONSE: ValidationResponse = {
  id: "res_02",
  validatorId: "VAL_a81d92c1",
  datasetEntryId: "OD_1",
  batchId: "batch_01",
  evaluation: "cannot_evaluate",
  createdAt: ISO_UTC,
  updatedAt: ISO_UTC,
};

const catchError = async (work: Promise<unknown>): Promise<unknown> =>
  work.then(
    () => null,
    (caught: unknown) => caught,
  );

/**
 * The ten `validations` columns, sorted, for the read-shape assertions to compare against.
 *
 * Duplicated here rather than imported from `validations.ts` on purpose. Importing it would make
 * every "selects exactly these columns" assertion vacuously true — it would compare the
 * implementation's list against itself — and the whole point of those tests is that a column
 * silently added or dropped is a failure. This list is the EXPECTATION, written out.
 */
const VALIDATION_COLUMN_SET = [
  "batch_id",
  "corrected_instruction",
  "created_at",
  "dataset_entry_id",
  "english_translation",
  "evaluation",
  "filipino_translation",
  "id",
  "updated_at",
  "validator_id",
];

/**
 * `count` legal `validations` rows with ids `res_<start>` … `res_<start + count - 1>`.
 *
 * Every row is `correct_natural` with both translations, so a page of any size translates
 * successfully and the paging tests measure PAGING rather than tripping over a fixture that the
 * domain rejects. Ids are unique and derived from the offset, which is what lets the paging test
 * assert the pages did not overlap.
 */
function responseRows(start: number, count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, offset) => ({
    ...VALIDATION_ROW,
    id: `res_${start + offset}`,
  }));
}

/**
 * A stored `validation_batches` row, carrying the instant migration `20261001120000` added.
 *
 * The value is written WITH A NON-ZERO UTC OFFSET on purpose. PostgREST serialises `timestamptz`
 * with the server's offset, so a fixture using only `Z` would make `toIsoDateTime` look like a
 * no-op — and the whole reason this column is normalised at the persistence boundary is that a
 * domain value must be ONE representation regardless of where the server runs.
 */
const BATCH_ROW = {
  id: "batch_01",
  validator_id: "VAL_a81d92c1",
  created_at: "2026-10-01T09:15:00+08:00",
};

/** What `BATCH_ROW.created_at` must normalise to, which is not the string on the wire. */
const BATCH_ROW_CREATED_AT = "2026-10-01T01:15:00.000Z";

/**
 * Three `batch_entries` rows, shuffled relative to their own `position` values.
 *
 * A database is free to return rows in any order, and a `create` that read back in storage order
 * would hand a validator a batch whose first entry is its third. The positions are 3, 1, 2 rather
 * than 2, 1 specifically so that the fixture distinguishes THREE candidate implementations from
 * each other rather than two:
 *
 *   - echoing the `create` argument, which would return 1, 2, 3 and pass a merely-unordered fixture;
 *   - returning the rows in the order the wire gave them, which returns 3, 1, 2;
 *   - sorting by `position`, which returns 1, 2, 3.
 *
 * Only the third is correct, and with an "already in order" fixture the first would be
 * indistinguishable from it.
 */
const BATCH_ENTRY_ROWS_SHUFFLED = [
  { batch_id: "batch_01", dataset_entry_id: "OD_3", position: 3 },
  { batch_id: "batch_01", dataset_entry_id: "OD_1", position: 1 },
  { batch_id: "batch_01", dataset_entry_id: "OD_2", position: 2 },
];

const BATCH_RECORD = {
  id: "batch_01",
  validatorId: "VAL_a81d92c1",
  entries: [
    { datasetEntryId: "OD_1", position: 1 },
    { datasetEntryId: "OD_2", position: 2 },
    { datasetEntryId: "OD_3", position: 3 },
  ],
};

/**
 * The creation instant `create` is told to write.
 *
 * A CONSTANT rather than `new Date()` at the call site, for the reason every other fixture here is
 * fixed: an assertion about what was written must not depend on when the suite ran. It is also the
 * value the tests assert the insert carries, so the fixture and the claim cannot drift apart.
 */
const BATCH_CREATED_AT = "2026-10-01T09:15:00.000Z";

describe("SupabaseDatasetEntriesRepository", () => {
  it("translates a row to a domain entry, in camelCase, with no persistence field left in it", async () => {
    const fake = createFakeClient();
    fake.enqueue(rows([ENTRY_ROW]));

    const [entry] = await new SupabaseDatasetEntriesRepository(fake.client).listActive();

    expect(entry).toEqual(ENTRY);
    // The domain shape, exactly: no `source_payload`, no `created_at`, no `is_active`.
    expect(Object.keys(entry ?? {}).sort()).toEqual([
      "category",
      "categoryName",
      "createdAt",
      "destination",
      "id",
      "instruction",
      "isActive",
      "origin",
      "sourceEntryId",
      "transitMode",
    ]);
  });

  it("converts a timestamptz with an offset into the canonical UTC ISO 8601 string", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: ENTRY_ROW, error: null, count: null });

    const entry = await new SupabaseDatasetEntriesRepository(fake.client).findById("OD_1");

    expect(entry?.createdAt).toBe(ISO_UTC);
    expect(entry?.createdAt).not.toBe(TIMESTAMPTZ);
  });

  it("maps a Double Transit Mode pair row to the ordered pair domain value", async () => {
    const fake = createFakeClient();
    fake.enqueue({
      data: {
        ...ENTRY_ROW,
        id: "DTM_1",
        category: "double_transit_mode",
        category_name: "Double Transit Mode",
        origin: null,
        destination: "Abanao Square",
        transit_mode: null,
        transit_modes: ["jeepney", "walking"],
      },
      error: null,
      count: null,
    });

    const entry = await new SupabaseDatasetEntriesRepository(fake.client).findById("DTM_1");

    expect(entry?.transitMode).toEqual(["jeepney", "walking"]);
  });

  it("fetches the pair column, because a select without it would drop every DTM pair", async () => {
    const fake = createFakeClient();
    fake.enqueue(rows([ENTRY_ROW], 1));
    await new SupabaseDatasetEntriesRepository(fake.client).listActive();

    const call = fake.lastCall();
    expect(call.method).toBe("select");
    expect((call.columns ?? "").split(",")).toContain("transit_modes");
  });

  it("reads only active entries, of a category when one is given, and asks for an exact count", async () => {
    const fake = createFakeClient();
    fake.enqueue(rows([ENTRY_ROW], 1));

    await new SupabaseDatasetEntriesRepository(fake.client).listActive({
      category: "origin_destination",
    });

    const call = fake.lastCall();
    expect(call.table).toBe("dataset_entries");
    expect(call.filters).toEqual([
      { kind: "eq", column: "is_active", value: true },
      { kind: "eq", column: "category", value: "origin_destination" },
    ]);
    // The count is what makes a truncated response detectable at all.
    expect(call.options).toEqual({ count: "exact" });
  });

  it("translates a page into a single range bound, never a limit and a range together", async () => {
    // Both `limit` and `range` write PostgREST's `limit` parameter, so sending both puts the same
    // bound on the query twice. The range already encodes the page size.
    const fake = createFakeClient();
    fake.enqueue(rows([ENTRY_ROW], 600));

    await new SupabaseDatasetEntriesRepository(fake.client).listActive({ limit: 10, offset: 20 });

    expect(fake.lastCall().filters).toEqual([
      { kind: "eq", column: "is_active", value: true },
      { kind: "range", from: 20, to: 29 },
    ]);
  });

  it("uses a bare limit when there is no offset to page from", async () => {
    const fake = createFakeClient();
    fake.enqueue(rows([ENTRY_ROW], 600));

    await new SupabaseDatasetEntriesRepository(fake.client).listActive({ limit: 10 });

    expect(fake.lastCall().filters).toEqual([
      { kind: "eq", column: "is_active", value: true },
      { kind: "limit", value: 10 },
    ]);
  });

  it("refuses an offset with no limit, because the end of the range would have to be guessed", async () => {
    const fake = createFakeClient();

    await expect(
      new SupabaseDatasetEntriesRepository(fake.client).listActive({ offset: 20 }),
    ).rejects.toMatchObject({ name: "RepositoryError", operation: "dataset_entries.list" });

    // No query was issued: this is a rejected request, not a failed one.
    expect(fake.calls).toHaveLength(0);
  });

  it("raises rather than returning a page the server silently truncated", async () => {
    // PostgREST caps a response and reports the cap only by returning fewer rows than exist. A
    // shorter pool would look like a smaller dataset and would quietly reduce coverage.
    const fake = createFakeClient();
    fake.enqueue(rows([ENTRY_ROW], 1000));

    const error = await catchError(new SupabaseDatasetEntriesRepository(fake.client).listActive());

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("dataset_entries.list");
    expect((error as RepositoryError).detail).toContain("truncated read");
  });

  it("does not treat a deliberately capped page as truncation", async () => {
    const fake = createFakeClient();
    fake.enqueue(rows([ENTRY_ROW], 600));

    const entries = await new SupabaseDatasetEntriesRepository(fake.client).listActive({
      limit: 1,
    });

    expect(entries).toHaveLength(1);
  });

  it("uses maybeSingle for a single read, so an absent entry is null rather than PGRST116", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: null, error: null, count: null });

    const found = await new SupabaseDatasetEntriesRepository(fake.client).findById("OD_799");

    expect(found).toBeNull();
    expect(fake.lastCall().terminal).toBe("maybeSingle");
    expect(fake.lastCall().filters).toEqual([{ kind: "eq", column: "id", value: "OD_799" }]);
  });

  it("returns listByIds in the order the caller asked for, omitting the ids that do not exist", async () => {
    const fake = createFakeClient();
    // Deliberately out of request order, which is what a database is free to do.
    fake.enqueue(rows([{ ...ENTRY_ROW, id: "OD_3" }, ENTRY_ROW]));

    const entries = await new SupabaseDatasetEntriesRepository(fake.client).listByIds([
      "OD_1",
      "OD_799",
      "OD_3",
    ]);

    expect(entries.map((entry) => entry.id)).toEqual(["OD_1", "OD_3"]);
    expect(fake.lastCall().filters).toEqual([
      { kind: "in", column: "id", value: ["OD_1", "OD_799", "OD_3"] },
    ]);
  });

  it("issues no query for an empty id list, because `.in([])` is malformed rather than empty", async () => {
    const fake = createFakeClient();

    const entries = await new SupabaseDatasetEntriesRepository(fake.client).listByIds([]);

    expect(entries).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("the archival copy, and unmodelled fields", () => {
  it("keeps the archival copy out of the domain entry, and surfaces nothing through a read", async () => {
    // `source_payload` carries the source record verbatim, including fields the domain does not
    // model. It is deliberately absent from `DatasetEntry`: widening the type would make every
    // consumer carry a field none of them uses, and reading it back out of a repository would put
    // a persistence record across the seam. The surface for an unmodelled field is the importer's
    // report (`src/lib/dataset/synthetic-source.ts`), which names it at the run that introduces it.
    const fake = createFakeClient();
    fake.enqueue(rows([ENTRY_ROW], 1));

    const [entry] = await new SupabaseDatasetEntriesRepository(fake.client).listActive();

    expect(entry).toEqual(ENTRY);
    expect(Object.keys(entry ?? {})).not.toContain("sourcePayload");
    // The archival copy is still fetched, so it stays in the database and stays recoverable.
    expect(fake.lastCall().columns?.split(",")).toContain("source_payload");
  });

  it("carries the provenance columns from the row onto the domain entry", async () => {
    // `source_entry_id` and `category_name` are fetched and mapped by name, like every other
    // column in this module — spelled out here so a rename on either side fails loudly.
    const fake = createFakeClient();
    fake.enqueue(rows([ENTRY_ROW], 1));

    const [entry] = await new SupabaseDatasetEntriesRepository(fake.client).listActive();

    expect(entry?.sourceEntryId).toBe(1);
    expect(entry?.categoryName).toBe("Origin + Destination");
    expect(fake.lastCall().columns?.split(",")).toEqual(
      expect.arrayContaining(["source_entry_id", "category_name"]),
    );
  });

  it("refuses a legacy row with no provenance rather than inventing it", async () => {
    // Rows predating the provenance columns read NULL here. The schema rejects the row instead
    // of defaulting the join key — a manufactured `source_entry_id` would join a response to
    // the wrong source record, which is worse than a loud failure.
    const { source_entry_id: _dropped, category_name: _name, ...legacy } = ENTRY_ROW;
    expect(_dropped).toBe(1);
    expect(_name).toBe("Origin + Destination");
    const fake = createFakeClient();
    fake.enqueue(rows([legacy], 1));

    await expect(new SupabaseDatasetEntriesRepository(fake.client).listActive()).rejects.toThrow();
  });

  it("never leaks an unmodelled column into the domain entry itself", async () => {
    const fake = createFakeClient();
    fake.enqueue(rows([{ ...ENTRY_ROW, added_by_a_later_migration: "kept" }]));

    const [entry] = await new SupabaseDatasetEntriesRepository(fake.client).listActive();

    expect(entry).toEqual(ENTRY);
    expect(Object.keys(entry ?? {})).not.toContain("added_by_a_later_migration");
  });
});

describe("SupabaseDatasetEntriesRepository.listAllActive", () => {
  // One pool larger than a single PostgREST response, stitched from scripted pages. The fake
  // does not slice by range — it returns what was enqueued — so the page BOUNDARIES are
  // asserted on the recorded calls while the stitched CONTENT is asserted on the result.
  // Ids cycle the five real prefixes, so every row satisfies the domain schema: a row the
  // schema rejects would fail here on mapping rather than on paging, testing the wrong thing.
  const PREFIXES = ["D", "DT", "OD", "ODT", "CPE"] as const;
  const canonicalId = (index: number): string =>
    `${PREFIXES[Math.floor(index / 800) % PREFIXES.length]}_${(index % 800) + 1}`;
  const page = (from: number, to: number, total: number) =>
    rows(
      Array.from({ length: to - from + 1 }, (_, offset) => {
        const index = from + offset;
        return {
          ...ENTRY_ROW,
          id: canonicalId(index),
          source_entry_id: (index % 800) + 1,
        };
      }),
      total,
    );

  it("stitches pages into one pool and asks for the exact count on every page", async () => {
    const fake = createFakeClient();
    fake.enqueue(page(0, 999, 2500), page(1000, 1999, 2500), page(2000, 2499, 2500));

    const entries = await new SupabaseDatasetEntriesRepository(fake.client).listAllActive();

    expect(entries).toHaveLength(2500);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(2500);
    expect(fake.calls).toHaveLength(3);
    expect(fake.calls.map((call) => call.filters)).toEqual([
      [
        { kind: "eq", column: "is_active", value: true },
        { kind: "range", from: 0, to: 999 },
      ],
      [
        { kind: "eq", column: "is_active", value: true },
        { kind: "range", from: 1000, to: 1999 },
      ],
      [
        { kind: "eq", column: "is_active", value: true },
        { kind: "range", from: 2000, to: 2999 },
      ],
    ]);
    for (const call of fake.calls) {
      expect(call.options).toEqual({ count: "exact" });
    }
  });

  it("stops after one page when the pool fits", async () => {
    const fake = createFakeClient();
    fake.enqueue(page(0, 599, 600));

    const entries = await new SupabaseDatasetEntriesRepository(fake.client).listAllActive();

    expect(entries).toHaveLength(600);
    expect(fake.calls).toHaveLength(1);
  });

  it("refuses when the count moves between pages rather than stitching a shifted pool", async () => {
    // A concurrent operator import mid-read: the second page's count disagrees, so rows may
    // have shifted between pages and the stitched result would duplicate one entry and drop
    // another with no error. Refusing is the only honest outcome.
    const fake = createFakeClient();
    fake.enqueue(page(0, 999, 2500), page(1000, 1999, 2501));

    await expect(new SupabaseDatasetEntriesRepository(fake.client).listAllActive()).rejects.toThrow(
      /changed mid-read/,
    );
  });

  it("refuses an empty page that makes no progress rather than looping forever", async () => {
    const fake = createFakeClient();
    fake.enqueue(page(0, 999, 2500), rows([], 2500));

    await expect(new SupabaseDatasetEntriesRepository(fake.client).listAllActive()).rejects.toThrow(
      /no progress/,
    );
  });

  it("narrows by category when one is given", async () => {
    const fake = createFakeClient();
    fake.enqueue(page(0, 599, 600));

    await new SupabaseDatasetEntriesRepository(fake.client).listAllActive({
      category: "origin_destination",
    });

    expect(fake.lastCall().filters).toContainEqual({
      kind: "eq",
      column: "category",
      value: "origin_destination",
    });
  });
});

describe("SupabaseValidatorsRepository", () => {
  it("writes the profile in snake_case and returns the stored row, not the argument", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: { ...VALIDATOR_ROW, total_validations: 4 }, error: null, count: null });

    const created = await new SupabaseValidatorsRepository(fake.client).create({
      ...PROFILE,
      totalValidations: 4,
    });

    expect(fake.lastCall().method).toBe("insert");
    expect(writtenRow(fake.lastCall())).toEqual({
      id: "VAL_a81d92c1",
      ilocano_proficiency: "fluent",
      created_at: ISO_UTC,
      last_active_at: ISO_UTC,
      total_validations: 4,
    });
    // The read-back wins over the argument: 4, not the 4 that was sent, read from the row.
    expect(created).toEqual({ ...PROFILE, totalValidations: 4 });
    expect(created.totalValidations).toBe(4);
  });

  it("never upserts: a duplicate id is an error, and the operation name is validators.insert", async () => {
    const fake = createFakeClient();
    fake.enqueue(
      failure("23505", 'duplicate key value violates unique constraint "validators_pkey"'),
    );

    const error = await catchError(new SupabaseValidatorsRepository(fake.client).create(PROFILE));

    expect(isRepositoryError(error)).toBe(true);
    // The union says `insert` where the method is `create`; operations.ts pins the two together.
    expect((error as RepositoryError).operation).toBe("validators.insert");
    expect((error as RepositoryError).message).toContain("does not upsert");
    // The interface method is `create`, so an insert is the only call the implementation makes.
    expect(fake.lastCall().method).toBe("insert");
  });

  it("rejects a stored proficiency outside the five approved values, naming the operation", async () => {
    const fake = createFakeClient();
    fake.enqueue({
      data: { ...VALIDATOR_ROW, ilocano_proficiency: "expert" },
      error: null,
      count: null,
    });

    const error = await catchError(
      new SupabaseValidatorsRepository(fake.client).findById("VAL_a81d92c1"),
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("validators.findById");
    expect((error as RepositoryError).detail).toContain("ilocanoProficiency");
  });

  it("accepts a null proficiency, which is a validator created before screening", async () => {
    const fake = createFakeClient();
    fake.enqueue({
      data: { ...VALIDATOR_ROW, ilocano_proficiency: null },
      error: null,
      count: null,
    });

    const found = await new SupabaseValidatorsRepository(fake.client).findById("VAL_a81d92c1");

    expect(found?.ilocanoProficiency).toBeNull();
  });

  it("updates last_active_at at the caller's timestamp, without reading the row back", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: null, error: null, count: null });

    await new SupabaseValidatorsRepository(fake.client).touchLastActive(
      "VAL_a81d92c1",
      "2026-10-01T00:00:00.000Z",
    );

    const call = fake.lastCall();
    expect(call.method).toBe("update");
    expect(call.write).toEqual({ last_active_at: "2026-10-01T00:00:00.000Z" });
    expect(call.filters).toEqual([{ kind: "eq", column: "id", value: "VAL_a81d92c1" }]);
    expect(call.columns).toBeUndefined();
  });

  it("raises rather than reporting success when a write returns no row", async () => {
    // An insert that reports success but stores nothing must not be reported as a stored profile.
    const fake = createFakeClient();
    fake.enqueue({ data: null, error: null, count: null });

    await expect(
      new SupabaseValidatorsRepository(fake.client).create(PROFILE),
    ).rejects.toMatchObject({ name: "RepositoryError", operation: "validators.insert" });
  });

  it("returns listByIds in the order the caller asked for, omitting the ids that do not exist", async () => {
    const fake = createFakeClient();
    // Deliberately out of request order, which is what a database is free to do.
    fake.enqueue(
      rows([
        { ...VALIDATOR_ROW, id: "VAL_00000002", ilocano_proficiency: "native" },
        VALIDATOR_ROW,
      ]),
    );

    const profiles = await new SupabaseValidatorsRepository(fake.client).listByIds([
      "VAL_a81d92c1",
      "VAL_missing",
      "VAL_00000002",
    ]);

    expect(profiles.map((profile) => profile.id)).toEqual(["VAL_a81d92c1", "VAL_00000002"]);
    expect(profiles[1]).toMatchObject({ ilocanoProficiency: "native" });
    expect(fake.lastCall().filters).toEqual([
      { kind: "in", column: "id", value: ["VAL_a81d92c1", "VAL_missing", "VAL_00000002"] },
    ]);
  });

  it("issues no query for an empty id list, because `.in([])` is malformed rather than empty", async () => {
    const fake = createFakeClient();

    const profiles = await new SupabaseValidatorsRepository(fake.client).listByIds([]);

    expect(profiles).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it("chunks the id filter past 200 values and keeps caller order across chunks", async () => {
    // Same URL-length wall as the validations read: a study with thousands of attempts would
    // otherwise put every id in one `.in()`. Each chunk returns at most 200 rows, so no chunk
    // can hit the response cap either.
    const ids = Array.from({ length: 250 }, (_, index) => `VAL_${String(index).padStart(8, "0")}`);
    const fake = createFakeClient();
    fake.enqueue(rows(ids.slice(0, 200).map((id) => ({ ...VALIDATOR_ROW, id }))));
    fake.enqueue(rows(ids.slice(200).map((id) => ({ ...VALIDATOR_ROW, id }))));

    const profiles = await new SupabaseValidatorsRepository(fake.client).listByIds(ids);

    expect(fake.calls).toHaveLength(2);
    for (const call of fake.calls) {
      const filter = call.filters.find((entry) => entry.kind === "in");
      expect((filter as { value: unknown[] }).value.length).toBeLessThanOrEqual(200);
    }
    expect(profiles.map((profile) => profile.id)).toEqual(ids);
  });
});

describe("SupabaseValidationsRepository", () => {
  it("writes a response in snake_case, turning absent optionals into SQL NULL", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: CANNOT_EVALUATE_ROW, error: null, count: null });

    await new SupabaseValidationsRepository(fake.client).insert(CANNOT_EVALUATE_RESPONSE);

    // The ten named columns, and not one of the removed ones. The set is asserted with `toEqual` on
    // the whole write so a column silently added or dropped here fails.
    expect(fake.lastCall().write).toEqual({
      id: "res_02",
      validator_id: "VAL_a81d92c1",
      dataset_entry_id: "OD_1",
      batch_id: "batch_01",
      evaluation: "cannot_evaluate",
      corrected_instruction: null,
      english_translation: null,
      filipino_translation: null,
      created_at: ISO_UTC,
      updated_at: ISO_UTC,
    });
    expect(Object.keys(fake.lastCall().write ?? {})).not.toContain("translation_language");
    expect(Object.keys(fake.lastCall().write ?? {})).not.toContain("translation_text");
  });

  it("writes both translations as separate columns, never as one text with a language", async () => {
    const fake = createFakeClient();
    fake.enqueue({
      data: {
        ...VALIDATION_ROW,
        evaluation: "incorrect",
        corrected_instruction: "Gemahen ti jeep.",
        english_translation: "Ride the jeep.",
        filipino_translation: "Sumakay ng jeep.",
      },
      error: null,
      count: null,
    });

    const stored = await new SupabaseValidationsRepository(fake.client).insert({
      ...RESPONSE,
      evaluation: "incorrect",
      correctedInstruction: "Gemahen ti jeep.",
      englishTranslation: "Ride the jeep.",
      filipinoTranslation: "Sumakay ng jeep.",
    });

    expect(writtenRow(fake.lastCall()).english_translation).toBe("Ride the jeep.");
    expect(writtenRow(fake.lastCall()).filipino_translation).toBe("Sumakay ng jeep.");
    expect(stored.englishTranslation).toBe("Ride the jeep.");
    expect(stored.filipinoTranslation).toBe("Sumakay ng jeep.");
  });

  it("writes a correction and both translations as response data, never as an update to the entry", async () => {
    const fake = createFakeClient();
    fake.enqueue({
      data: {
        ...VALIDATION_ROW,
        evaluation: "correct_unnatural",
        corrected_instruction: "Gemahen ti jeep.",
        english_translation: "Ride the jeep.",
        filipino_translation: "Sumakay ng jeep.",
      },
      error: null,
      count: null,
    });

    const stored = await new SupabaseValidationsRepository(fake.client).insert({
      ...RESPONSE,
      evaluation: "correct_unnatural",
      correctedInstruction: "Gemahen ti jeep.",
    });

    expect(fake.lastCall().table).toBe("validations");
    expect(writtenRow(fake.lastCall()).corrected_instruction).toBe("Gemahen ti jeep.");
    expect(stored.correctedInstruction).toBe("Gemahen ti jeep.");
    // The correction travels on the response row; there is no write to `dataset_entries` at all.
    expect(fake.calls.every((call) => call.table === "validations")).toBe(true);
  });

  it("maps a uniqueness violation on (validator_id, dataset_entry_id) to validations.insert", async () => {
    const fake = createFakeClient();
    fake.enqueue(
      failure(
        "23505",
        'duplicate key value violates unique constraint "validations_validator_entry_unique"',
      ),
    );

    const error = await catchError(
      new SupabaseValidationsRepository(fake.client).insert({ ...RESPONSE, id: "res_02" }),
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("validations.insert");
    expect((error as RepositoryError).detail).toContain("23505");
    // The original PostgREST error is preserved on `cause` rather than re-wrapped into a message.
    expect((error as { cause?: unknown }).cause).toMatchObject({ code: "23505" });
  });

  it("reads a response back with its correction and both translations restored", async () => {
    const fake = createFakeClient();
    fake.enqueue({
      data: {
        ...VALIDATION_ROW,
        evaluation: "incorrect",
        corrected_instruction: "Gemahen ti jeep.",
        english_translation: "Ride the jeep.",
        filipino_translation: "Sumakay ng jeep.",
      },
      error: null,
      count: null,
    });

    const found = await new SupabaseValidationsRepository(fake.client).findById("res_01");

    expect(found).toEqual({
      ...RESPONSE,
      evaluation: "incorrect",
      correctedInstruction: "Gemahen ti jeep.",
    });
  });

  it("selects exactly the ten current columns, naming neither removed column", async () => {
    // Asserted as a full set, so a column silently reintroduced or dropped fails here. The two
    // removals are checked by name because they are the specific hazard of this change: a
    // `VALIDATION_COLUMNS` entry left behind would ask PostgREST for a column that no longer
    // exists, and that fails at the wire rather than at compile time.
    const fake = createFakeClient();
    // A single row, not an array of one: `findById` uses `maybeSingle`, and handing it an array
    // fails on the row-shape check before the column assertion is ever reached.
    fake.enqueue({ data: VALIDATION_ROW, error: null, count: null });

    await new SupabaseValidationsRepository(fake.client).findById("res_01");

    expect(fake.lastCall().columns?.split(",").sort()).toEqual([
      "batch_id",
      "corrected_instruction",
      "created_at",
      "dataset_entry_id",
      "english_translation",
      "evaluation",
      "filipino_translation",
      "id",
      "updated_at",
      "validator_id",
    ]);
  });

  it("maps a NULL translation column to an ABSENT key, so a cannot_evaluate row still loads", async () => {
    // The load-bearing NULL-to-absent-key decision, now for the translations. Mapping NULL to
    // `{ englishTranslation: null }` would make every legal `cannot_evaluate` record fail its own
    // integrity rule ("a translation is not accepted when the entry cannot be confidently
    // evaluated") on every single read, so a correct write would become unreadable data.
    //
    // `toEqual` alone would NOT prove this: it treats an absent key and an explicit `undefined` as
    // equal, and `toBeNull()` would pass for either an absent key or an explicit `null`. The
    // `in` checks are what actually distinguish the three, and they are asserted explicitly.
    const fake = createFakeClient();
    fake.enqueue(rows([CANNOT_EVALUATE_ROW], 1));

    const [found] = await new SupabaseValidationsRepository(fake.client).findByEntry("OD_1");

    expect(found).toEqual(CANNOT_EVALUATE_RESPONSE);
    const keys = Object.keys(found ?? {});
    expect(keys).not.toContain("correctedInstruction");
    expect(keys).not.toContain("englishTranslation");
    expect(keys).not.toContain("filipinoTranslation");
    expect("englishTranslation" in (found ?? {})).toBe(false);
    expect("filipinoTranslation" in (found ?? {})).toBe(false);
  });

  it("loads a stored row missing its Filipino translation, the validator having skipped it", async () => {
    // Per-response choice means a null translation column is a recorded skip, not a corrupt row.
    // The row-to-domain mapping turns SQL NULL into an absent key, and the domain schema reads
    // absence as a legitimate choice — so the row loads as a judgment with English cover only.
    const fake = createFakeClient();
    fake.enqueue({
      data: { ...VALIDATION_ROW, filipino_translation: null },
      error: null,
      count: null,
    });

    const found = await new SupabaseValidationsRepository(fake.client).findById("res_01");

    expect(found?.englishTranslation).toBe("Ride the jeep.");
    expect("filipinoTranslation" in (found ?? {})).toBe(false);
  });

  it("raises when a stored cannot_evaluate row carries an English translation", async () => {
    // The mirror image, and the one that matters for coverage accounting: a `cannot_evaluate` row
    // carrying a translation is a record the platform must never treat as qualifying, and a
    // successful load is exactly how that would happen quietly.
    const fake = createFakeClient();
    fake.enqueue({
      data: { ...CANNOT_EVALUATE_ROW, english_translation: "Ride the jeep." },
      error: null,
      count: null,
    });

    const error = await catchError(
      new SupabaseValidationsRepository(fake.client).findById("res_02"),
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("validations.findById");
  });

  it("raises when a stored translation is whitespace-only", async () => {
    // The database rejects this via `btrim`, and the domain schema refuses it because a blank in
    // a supplied field is never read as a skip. Two independent implementations again — and the
    // read path must fail loudly rather than inventing absence for a row the write path could
    // never have produced.
    const fake = createFakeClient();
    fake.enqueue({
      data: { ...VALIDATION_ROW, english_translation: "   " },
      error: null,
      count: null,
    });

    const error = await catchError(
      new SupabaseValidationsRepository(fake.client).findById("res_01"),
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("validations.findById");
  });

  it("orders an entry's responses by creation time and asks for an exact count", async () => {
    const fake = createFakeClient();
    fake.enqueue(rows([VALIDATION_ROW], 1));

    await new SupabaseValidationsRepository(fake.client).findByEntry("OD_1");

    const call = fake.lastCall();
    expect(call.filters).toEqual([
      { kind: "eq", column: "dataset_entry_id", value: "OD_1" },
      { kind: "order", column: "created_at", ascending: true },
    ]);
    expect(call.options).toEqual({ count: "exact" });
  });

  it("raises rather than showing a truncated response list as consensus", async () => {
    const fake = createFakeClient();
    fake.enqueue(rows([VALIDATION_ROW], 1000));

    await expect(
      new SupabaseValidationsRepository(fake.client).findByEntry("OD_1"),
    ).rejects.toMatchObject({ name: "RepositoryError", operation: "validations.findByEntry" });
  });
});

describe("the coverage read a pool is measured with", () => {
  it("filters on the entry ids with `in`, and asks for the exact total", async () => {
    // `.in()` rather than a chain of `.eq()`s, and one request rather than one per entry: the pool
    // is the whole dataset at the start of a session. The exact count is not decoration — it is the
    // number the paging loop below is driven by, and a `null` count must raise rather than be
    // treated as "no more rows".
    const fake = createFakeClient();
    fake.enqueue(rows([VALIDATION_ROW], 1));

    await new SupabaseValidationsRepository(fake.client).listForEntries(["OD_1", "OD_2"]);

    const call = fake.lastCall();
    expect(call.table).toBe("validations");
    expect(call.filters).toEqual([
      { kind: "in", column: "dataset_entry_id", value: ["OD_1", "OD_2"] },
      { kind: "range", from: 0, to: 999 },
    ]);
    expect(call.options).toEqual({ count: "exact" });
  });

  it("issues no query for an empty pool, because `.in([])` is malformed rather than empty", async () => {
    const fake = createFakeClient();

    const found = await new SupabaseValidationsRepository(fake.client).listForEntries([]);

    expect(found).toEqual([]);
    expect(fake.calls).toHaveLength(0);
  });

  it("chunks the id filter past 200 values, because a 4800-id URL is refused", async () => {
    // Measured on the hosted gateway: one `.in()` with the corpus's thousands of ids drew a 400.
    // 250 ids therefore travel as 200 + 50, each chunk paging rows on its own count, and the
    // stitched rows keep global order for stable failure attribution.
    const ids = Array.from({ length: 250 }, (_, index) => `OD_${index + 1}`);
    const fake = createFakeClient();
    fake.enqueue(rows([{ ...VALIDATION_ROW, dataset_entry_id: ids[0] }], 1));
    fake.enqueue(rows([{ ...VALIDATION_ROW, dataset_entry_id: ids[200] }], 1));

    const found = await new SupabaseValidationsRepository(fake.client).listForEntries(ids);

    expect(fake.calls).toHaveLength(2);
    for (const call of fake.calls) {
      const filter = call.filters.find((entry) => entry.kind === "in");
      expect(filter).toBeDefined();
      expect((filter as { value: unknown[] }).value.length).toBeLessThanOrEqual(200);
      expect(call.options).toEqual({ count: "exact" });
    }
    expect(found.map((response) => response.datasetEntryId)).toEqual([ids[0], ids[200]]);
  });

  it("returns EVERY stored response, including the ones that do not count toward coverage", async () => {
    // The load-bearing property of this method, and the one a `where` clause would quietly break.
    // `CANNOT_EVALUATE_ROW` contributes nothing to qualifying coverage, so a repository that
    // filtered for qualifying rows would return `[]` here — and would be returning a SECOND
    // implementation of a research rule that has exactly one owner, in a language nothing keeps in
    // agreement with it. The non-qualifying row must come back and be counted by the caller.
    const fake = createFakeClient();
    fake.enqueue(rows([VALIDATION_ROW, CANNOT_EVALUATE_ROW], 2));

    const found = await new SupabaseValidationsRepository(fake.client).listForEntries(["OD_1"]);

    expect(found.map((response) => response.evaluation).sort()).toEqual([
      "cannot_evaluate",
      "correct_natural",
    ]);
    // And the non-qualifying row is genuinely READABLE, not degraded: its NULL translations became
    // absent keys, which is the only way a legal `cannot_evaluate` record survives its own
    // integrity rules. A repository that filtered it out would return one row, and a repository
    // that half-mapped it would raise — so this distinguishes all three outcomes.
    const unevaluable = found.find((response) => response.evaluation === "cannot_evaluate");
    expect(unevaluable).toEqual(CANNOT_EVALUATE_RESPONSE);
    expect("englishTranslation" in (unevaluable ?? {})).toBe(false);
    expect("filipinoTranslation" in (unevaluable ?? {})).toBe(false);
  });

  it("pages on the exact count instead of raising on a truncated pool", async () => {
    // 1500 rows at the documented 1000-row page size: a first page of 1000 with a count of 1500 is
    // exactly the case `findByEntry` refuses. The read was cut off, and treating it as complete
    // would compute coverage over two thirds of the pool and hand already-covered entries out
    // again. Here it issues a SECOND ranged request rather than either truncating or giving up.
    const fake = createFakeClient();
    fake.enqueue(rows(responseRows(0, 1000), 1500));
    fake.enqueue(rows(responseRows(1000, 500), 1500));

    const found = await new SupabaseValidationsRepository(fake.client).listForEntries(["OD_1"]);

    expect(found).toHaveLength(1500);
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0]?.filters).toContainEqual({ kind: "range", from: 0, to: 999 });
    // The offset ADVANCED. Asserting only that a second request happened would also be satisfied by
    // a loop that re-requested page one and got lucky with a shorter fixture.
    expect(fake.calls[1]?.filters).toContainEqual({ kind: "range", from: 1000, to: 1999 });
    // The pages do not overlap: 1500 rows read as 1500 distinct ids, which is the property that
    // makes the concatenated array a coverage input rather than a pile with duplicates in it.
    expect(new Set(found.map((response) => response.id)).size).toBe(1500);
  });

  it("stops paging as soon as the rows read reach the exact count", async () => {
    // The control for the test above. Without it, a loop that always ran one iteration too many
    // would pass the paging test and fail here, and a loop that never paged would fail that one
    // while passing this — so the two are what make "pages exactly as often as needed" a claim.
    const fake = createFakeClient();
    fake.enqueue(rows([VALIDATION_ROW], 1));

    const found = await new SupabaseValidationsRepository(fake.client).listForEntries(["OD_1"]);

    expect(found).toHaveLength(1);
    expect(fake.calls).toHaveLength(1);
  });

  it("raises rather than looping forever on an empty page below the exact count", async () => {
    // The failure the paging loop is most likely to meet in production: a proxy, a gateway, or a
    // row limit that truncates WITHOUT reporting a count on that response. Re-issuing the identical
    // request would spin; reporting what was read would compute a coverage number over a partial
    // pool. Both are wrong, so the read refuses and says which offset it stopped at.
    const fake = createFakeClient();
    fake.enqueue(rows(responseRows(0, 1000), 1500));
    fake.enqueue(rows([], 1500));

    const error = await catchError(
      new SupabaseValidationsRepository(fake.client).listForEntries(["OD_1"]),
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("validations.listForEntries");
    expect((error as RepositoryError).detail).toContain("offset 1000");
    // Two requests, and no third: the loop actually terminated rather than hanging or spinning.
    expect(fake.calls).toHaveLength(2);
  });

  it("raises rather than treating a missing count as zero rows", async () => {
    // A `null` count would make the paging loop stop after the first page and report a partial
    // pool as the whole one, so it must raise before any rows are trusted.
    const fake = createFakeClient();
    fake.enqueue(rows([VALIDATION_ROW], null));

    await expect(
      new SupabaseValidationsRepository(fake.client).listForEntries(["OD_1"]),
    ).rejects.toMatchObject({ name: "RepositoryError", operation: "validations.listForEntries" });
  });

  it("selects the ten columns the predicate reads from, not the five it needs", async () => {
    // A deliberate cost, recorded in `design.md` D1: `countQualifyingValidations` reads five
    // columns and this selects ten, because `toDomain` is the already-tested code that knows a
    // NULL translation means an ABSENT key. A narrower projection is the right revisit at scale,
    // and it should be a projection of columns — never a copy of the predicate in SQL. Asserted as
    // a full set so a column silently dropped from `VALIDATION_COLUMNS` fails here too.
    const fake = createFakeClient();
    fake.enqueue(rows([VALIDATION_ROW], 1));

    await new SupabaseValidationsRepository(fake.client).listForEntries(["OD_1"]);

    expect(fake.lastCall().columns?.split(",").sort()).toEqual(VALIDATION_COLUMN_SET);
  });
});

describe("the exclusion read", () => {
  it("selects exactly one column and filters on the validator", async () => {
    // One column, because the result IS one column. This is asserted exactly rather than with
    // `toContain`, because the failure this guards against is widening: `listForEntries` already
    // fetched full responses for the pool, and a method that exists to keep the exclusion rule from
    // reading anything about a response is the wrong place to start handing them out.
    const fake = createFakeClient();
    fake.enqueue(rows([{ dataset_entry_id: "OD_1" }, { dataset_entry_id: "OD_2" }]));

    const ids = await new SupabaseValidationsRepository(fake.client).listEntryIdsForValidator(
      "VAL_a81d92c1",
    );

    expect(ids).toEqual(["OD_1", "OD_2"]);
    const call = fake.lastCall();
    expect(call.columns).toBe("dataset_entry_id");
    expect(call.filters).toEqual([{ kind: "eq", column: "validator_id", value: "VAL_a81d92c1" }]);
    // No count and no range: see the method comment for why a truncated result is safe here.
    expect(call.options).toBeUndefined();
    expect(call.filters.some((filter) => filter.kind === "range")).toBe(false);
  });

  it("returns an empty list for a validator who has answered nothing", async () => {
    // `[]` is the honest answer and is distinguishable from a failure, which raises instead.
    const fake = createFakeClient();
    fake.enqueue(rows([]));

    const ids = await new SupabaseValidationsRepository(fake.client).listEntryIdsForValidator(
      "VAL_a81d92c1",
    );

    expect(ids).toEqual([]);
  });

  it("raises rather than excluding nothing when the read fails", async () => {
    // The dangerous direction. A failed read reported as `[]` would mean "this validator has
    // answered nothing", allocation would offer entries they already answered, and the second
    // response would be refused by the database as a duplicate. Raising puts the decision where it
    // is visible.
    const fake = createFakeClient();
    fake.enqueue(failure("42501", "permission denied for table validations"));

    const error = await catchError(
      new SupabaseValidationsRepository(fake.client).listEntryIdsForValidator("VAL_a81d92c1"),
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("validations.listEntryIdsForValidator");
  });

  it("rejects a stored entry id that is not a dataset entry id", async () => {
    // The narrow projection means this row is never translated by `toDomain`, so nothing else
    // validates it. Without this, an id outside the `datasetEntryId` shape would reach the
    // exclusion set and silently exclude a dataset entry that does not exist.
    const fake = createFakeClient();
    fake.enqueue(rows([{ dataset_entry_id: "not-an-entry-id" }]));

    const error = await catchError(
      new SupabaseValidationsRepository(fake.client).listEntryIdsForValidator("VAL_a81d92c1"),
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("validations.listEntryIdsForValidator");
  });
});

describe("SupabaseBatchesRepository", () => {
  /**
   * Scripts the three requests `create` makes: the batch row, the array of entry rows, and the
   * read-back pair (`validation_batches` then `batch_entries`).
   *
   * The entry rows come back SHUFFLED in both the insert echo and the read-back, because
   * `BATCH_ENTRY_ROWS_SHUFFLED` explains why: the fixture is chosen so that echoing the argument,
   * returning the wire's order, and sorting by position are three distinguishable outcomes.
   */
  const scriptCreate = (fake: ReturnType<typeof createFakeClient>): void => {
    fake.enqueue({ data: BATCH_ROW, error: null, count: null });
    fake.enqueue({ data: BATCH_ENTRY_ROWS_SHUFFLED, error: null, count: null });
    fake.enqueue({ data: BATCH_ROW, error: null, count: null });
    fake.enqueue({ data: BATCH_ENTRY_ROWS_SHUFFLED, error: null, count: null });
  };

  it("writes the batch row and all its entries in ONE request, not one per entry", async () => {
    const fake = createFakeClient();
    scriptCreate(fake);

    await new SupabaseBatchesRepository(fake.client).create(BATCH_RECORD, BATCH_CREATED_AT);

    const writes = fake.calls.filter((call) => call.method === "insert");
    expect(writes.map((call) => call.table)).toEqual(["validation_batches", "batch_entries"]);
    // The array form specifically. A per-row loop would produce THREE `batch_entries` writes for a
    // three-entry batch and still pass every content assertion below; asserting on the COUNT of
    // writes is what distinguishes "one request" from "N requests that happen to agree".
    expect(writtenRows(fake.calls[1]!)).toEqual([
      { batch_id: "batch_01", dataset_entry_id: "OD_1", position: 1 },
      { batch_id: "batch_01", dataset_entry_id: "OD_2", position: 2 },
      { batch_id: "batch_01", dataset_entry_id: "OD_3", position: 3 },
    ]);
  });

  it("writes created_at explicitly, so a database default could not quietly supply it", async () => {
    // Migration `20261001120000` sets the column `not null` with NO default, precisely so the
    // application stays the single source of time for a batch's creation instant — the same reason
    // `requested_size` was removed from this table. This is the assertion that keeps that honest:
    // it names the insert's own body, so dropping `created_at` from the object is a failure here
    // rather than a database error nobody would see until a deployment.
    //
    // It also covers a subtler regression: a default added to the column LATER would leave this test
    // green, because the insert would still carry the value. What this catches is the application
    // ceasing to write it, which is the half the application controls.
    const fake = createFakeClient();
    scriptCreate(fake);

    await new SupabaseBatchesRepository(fake.client).create(BATCH_RECORD, BATCH_CREATED_AT);

    const batchInsert = fake.calls.find(
      (call) => call.method === "insert" && call.table === "validation_batches",
    );
    // Closed key set, read off the recorded call. Not `toMatchObject`, which would pass while a fourth
    // column appeared — and a fourth column on this insert is exactly the kind of addition that turns
    // one writer of time into two.
    expect(Object.keys(writtenRow(batchInsert!)).sort()).toEqual([
      "created_at",
      "id",
      "validator_id",
    ]);
    // The value, not just the column's presence: an insert carrying `created_at: null` would satisfy a
    // key-set check and then be refused by the `not null` constraint the migration added.
    expect(writtenRow(batchInsert!).created_at).toBe(BATCH_CREATED_AT);
  });

  it("returns the READ-BACK sorted by position, not the argument and not the wire's order", async () => {
    // The read-back is the whole design: a repository that stored a different order must not be
    // able to report the order the caller wanted. Both wrong answers are ruled out by the same
    // fixture — see `BATCH_ENTRY_ROWS_SHUFFLED` — so this is not satisfiable by echoing.
    const fake = createFakeClient();
    scriptCreate(fake);

    const stored = await new SupabaseBatchesRepository(fake.client).create(
      BATCH_RECORD,
      BATCH_CREATED_AT,
    );

    expect(stored).toEqual(BATCH_RECORD);
    expect(stored.entries.map((entry) => entry.datasetEntryId)).toEqual(["OD_1", "OD_2", "OD_3"]);
    // The read-back went through `findById` rather than being reconstructed from what was sent.
    expect(fake.calls[2]?.table).toBe("validation_batches");
    expect(fake.calls[3]?.filters).toContainEqual({
      kind: "order",
      column: "position",
      ascending: true,
    });
  });

  it("reports the stored order, so a validator is shown the batch that was persisted", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: BATCH_ROW, error: null, count: null });
    fake.enqueue({ data: BATCH_ENTRY_ROWS_SHUFFLED, error: null, count: null });

    const found = await new SupabaseBatchesRepository(fake.client).findById("batch_01");

    expect(found).toEqual(BATCH_RECORD);
    // The order was ASKED FOR and not merely hoped for: `.order()` is what keeps the query correct
    // on the server, and the in-memory sort above keeps the RETURNED VALUE correct even if the
    // narrow interface ever stops asking.
    expect(fake.calls[1]?.filters).toEqual([
      { kind: "eq", column: "batch_id", value: "batch_01" },
      { kind: "order", column: "position", ascending: true },
    ]);
  });

  it("returns null for an absent batch, and does not read its entries at all", async () => {
    // Reading `batch_entries` for a batch row that does not exist is a wasted request, and one
    // whose result would be indistinguishable from a batch with no entries. `maybeSingle` is what
    // makes "absent" arrive as `null` rather than as `PGRST116`.
    const fake = createFakeClient();
    fake.enqueue({ data: null, error: null, count: null });

    const found = await new SupabaseBatchesRepository(fake.client).findById("batch_9999");

    expect(found).toBeNull();
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.terminal).toBe("maybeSingle");
  });

  it("raises on a batch that exists with no entries, rather than reporting an empty allocation", async () => {
    // This is the detectable residue of a partial write, and the reason it is acceptable: a batch
    // with no entries would reach a validator as being given nothing to do, and the service reports
    // `exhausted` for a genuinely empty pool. `batchRecordSchema`'s `.min(1)` turns that into a
    // persistence failure the service can attribute, instead of a presentational surprise.
    const fake = createFakeClient();
    fake.enqueue({ data: BATCH_ROW, error: null, count: null });
    fake.enqueue({ data: [], error: null, count: null });

    const error = await catchError(new SupabaseBatchesRepository(fake.client).findById("batch_01"));

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("validation_batches.findById");
  });

  it("raises when the entry insert reports success but stored a different number of rows", async () => {
    // No error envelope, fewer rows than were sent. Reporting a batch from this would be reporting
    // a batch that is not the one that was allocated — a research record that differs from the one
    // the allocation decided on, discovered by nobody.
    const fake = createFakeClient();
    fake.enqueue({ data: BATCH_ROW, error: null, count: null });
    fake.enqueue({ data: [BATCH_ENTRY_ROWS_SHUFFLED[0]!], error: null, count: null });

    const error = await catchError(
      new SupabaseBatchesRepository(fake.client).create(BATCH_RECORD, BATCH_CREATED_AT),
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).detail).toContain("stored 1 of 3 entries");
    // The read-back was never reached, so nothing was reported to the caller.
    expect(fake.calls).toHaveLength(2);
  });

  it("reports a failed entry insert as a partial write, and names the constraint that likely fired", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: BATCH_ROW, error: null, count: null });
    fake.enqueue(
      failure(
        "23505",
        'duplicate key value violates unique constraint "batch_entries_batch_position_unique"',
      ),
    );

    const error = await catchError(
      new SupabaseBatchesRepository(fake.client).create(BATCH_RECORD, BATCH_CREATED_AT),
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("validation_batches.insert");
    expect((error as RepositoryError).message).toContain("partial write");
    // The message states the residue honestly rather than implying the batch was rolled back:
    // there is no transaction here, and a message claiming otherwise would be a lie in the one
    // situation where someone goes looking.
    expect((error as RepositoryError).message).toContain("carries no entries");
  });

  it("raises rather than reporting a batch as persisted when the batch row read back empty", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: null, error: null, count: null });

    const error = await catchError(
      new SupabaseBatchesRepository(fake.client).create(BATCH_RECORD, BATCH_CREATED_AT),
    );

    expect(isRepositoryError(error)).toBe(true);
    // The exact wording is asserted rather than a looser fragment, because the point is that the
    // write is unconfirmed — not that some error occurred. `toContain("returned no")` would pass
    // on a message that never mentioned the store.
    expect((error as RepositoryError).detail).toBe("validation_batches insert returned no row");
    // Not one entry row was written: the batch row never confirmed, so nothing followed it.
    expect(fake.calls).toHaveLength(1);
  });

  it("raises rather than reporting success when the batch it just wrote reads back absent", async () => {
    // The read-back confirmed absent. Returning the argument here would report a persisted batch on
    // the strength of a write the class could not confirm, which is precisely what the read-back
    // exists to prevent.
    const fake = createFakeClient();
    fake.enqueue({ data: BATCH_ROW, error: null, count: null });
    fake.enqueue({ data: BATCH_ENTRY_ROWS_SHUFFLED, error: null, count: null });
    fake.enqueue({ data: null, error: null, count: null });

    const error = await catchError(
      new SupabaseBatchesRepository(fake.client).create(BATCH_RECORD, BATCH_CREATED_AT),
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).detail).toContain("absent immediately after insert");
  });

  it("maps a duplicate batch id to validation_batches.insert rather than silently upserting", async () => {
    // Batch ids are minted by the allocation service, so a collision is a server bug. It is
    // reported rather than swallowed, and it is attributed to the same operation name `create`
    // always reports so a caller has one name to branch on for "the write failed".
    const fake = createFakeClient();
    fake.enqueue(
      failure("23505", 'duplicate key value violates unique constraint "validation_batches_pkey"'),
    );

    const error = await catchError(
      new SupabaseBatchesRepository(fake.client).create(BATCH_RECORD, BATCH_CREATED_AT),
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("validation_batches.insert");
    expect((error as RepositoryError).detail).toContain("23505");
  });

  it("never asks for `*`, on either of the two tables a batch spans", async () => {
    // `position` is the specific hazard: a `select("*")` would work today and would silently start
    // returning whatever a later migration adds, which for this table is exactly the kind of
    // unknown-field drift the rest of this directory is written to prevent.
    const fake = createFakeClient();
    fake.enqueue({ data: BATCH_ROW, error: null, count: null });
    fake.enqueue({ data: BATCH_ENTRY_ROWS_SHUFFLED, error: null, count: null });

    await new SupabaseBatchesRepository(fake.client).findById("batch_01");

    for (const call of fake.calls) {
      expect(typeof call.columns).toBe("string");
      expect(call.columns).not.toBe("*");
    }
    // `created_at` joined `id,validator_id` with migration `20261001120000`, which the shared
    // `BATCH_COLUMNS` note in `batches.ts` explains: one list for both reads, so a column added later
    // has one place to be added. This assertion is what makes that trade-off checkable.
    expect(fake.calls[0]?.columns).toBe("id,validator_id,created_at");
    expect(fake.calls[1]?.columns).toBe("batch_id,dataset_entry_id,position");
  });

  it("writes no timestamp beyond the one the table now has, and no lifecycle column", async () => {
    // RENAMED, and the rename is the point. This test used to read "writes no timestamp, because the
    // table has none and inventing a column is not a migration" — which was true and is now FALSE,
    // because migration `20261001120000` added `created_at`. A guard whose NAME asserts a falsehood is
    // worse than no guard: the next reader trusts the title and assumes the absence is still being
    // enforced when the assertion underneath has quietly been widened to match new behaviour.
    //
    // What survives is the actual intent. `assigned_at`, `completed_at`, and a lifecycle `status` are
    // still forbidden, and they are the columns most likely to be added by reflex — the structural
    // scenario in the research-schema spec forbids a column no behaviour backs, and the one addition
    // this change DID make had to arrive with a migration and a stated reason, which is what happened
    // to `created_at`. So the guard is now: exactly three columns, one of which is the creation instant
    // the application was told to write, and nothing resembling a lifecycle.
    const fake = createFakeClient();
    scriptCreate(fake);

    await new SupabaseBatchesRepository(fake.client).create(BATCH_RECORD, BATCH_CREATED_AT);

    // Closed key set, so a FOURTH column fails rather than being absorbed.
    expect(Object.keys(writtenRow(fake.calls[0]!)).sort()).toEqual([
      "created_at",
      "id",
      "validator_id",
    ]);
    expect(Object.keys(writtenRows(fake.calls[1]!)[0]!)).not.toContain("assigned_at");
    expect(fake.calls[0]?.columns).not.toContain("assigned_at");
    // The two the header above names, asserted by name rather than by a shape, because a shape
    // assertion would pass while a column named `assignedAt` arrived.
    for (const forbidden of [
      "assigned_at",
      "completed_at",
      "status",
      "abandoned_at",
      "resumed_at",
    ]) {
      expect(writtenRow(fake.calls[0]!)).not.toHaveProperty(forbidden);
      expect(fake.calls[0]?.columns).not.toContain(forbidden);
    }
  });
});

/**
 * `listForRecovery` — the interrupted-batch read.
 *
 * ============================================================================================
 * WHAT THESE TESTS PROVE, AND WHAT THEY CANNOT
 * ============================================================================================
 * They prove the FILTERS, THE COLUMNS, and THE ORDER the implementation handed the client, and how it
 * translated what came back. They prove nothing about PostgREST: no Supabase project exists in this
 * repository, so `.order(a).order(b)` is recorded here and never sent anywhere. In particular:
 *
 *   - that PostgREST composes two `.order` calls into `order=a.desc,b.desc` at all;
 *   - that it applies them in the order written;
 *   - that `timestamptz` arrives as a string with an offset (the fixture ASSUMES this);
 *   - that `.in("batch_id", [...])` binds an array of unknown length.
 *
 * The ordering test below is therefore deliberately written to pin the REQUEST, and its comment says
 * why that is the most this layer can honestly assert.
 */
describe("SupabaseBatchesRepository.listForRecovery", () => {
  const RECOVERY_ROWS = [
    {
      id: "batch_02",
      validator_id: "VAL_a81d92c1",
      created_at: "2026-10-02T10:00:00+08:00",
    },
    {
      id: "batch_01",
      validator_id: "VAL_a81d92c1",
      created_at: "2026-10-01T09:15:00+08:00",
    },
  ];

  it("asks for this validator's batches, newest first, on BOTH keys in order", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: RECOVERY_ROWS, error: null, count: null });
    fake.enqueue({
      data: [
        { batch_id: "batch_02", dataset_entry_id: "OD_3" },
        { batch_id: "batch_01", dataset_entry_id: "OD_1" },
        { batch_id: "batch_01", dataset_entry_id: "OD_2" },
      ],
      error: null,
      count: null,
    });

    await new SupabaseBatchesRepository(fake.client).listForRecovery("VAL_a81d92c1");

    const read = fake.calls[0]!;
    expect(read.table).toBe("validation_batches");
    // `created_at` has to be selectable to be orderable. A change that ordered by it without
    // selecting it would still be a valid query and would fail here, which is the point.
    expect(read.columns).toBe("id,validator_id,created_at");

    // THE WHOLE `filters` ARRAY, in order. Not "contains an order on created_at": the RECOVERY
    // REQUIREMENT is that the choice between two batches is TOTAL, which is a property of the
    // sequence — `id` only breaks a tie on `created_at` if it comes second. An assertion that
    // checked each key independently would pass on `.order("id").order("created_at")`, which orders
    // by identifier FIRST and is a different query that happens to mention both columns.
    //
    // This is the can-fire control for the ordering: reversing the two `.order` calls in
    // `batches.ts` changes this array and fails it by name. Proven, not assumed — and proven in BOTH
    // ways of getting it wrong: swapping the two clauses (`1 failed | 79 passed (80)`) and flipping
    // one to `ascending: true` (the same). The second is the mistake a reader is likelier to make and
    // the one an "ordered by created_at?" assertion would never catch.
    //
    // The probe that proved this had to be repaired first, and the repair is the fifth occurrence of
    // a defect this repository has now seen five times: its anchor string occurs TWICE in `batches.ts`
    // — once in this method's own documentation, which quotes the query it describes, and once in the
    // query — so it edited a sentence and reported GREEN for both probes. A GREEN from a probe whose
    // mutation never reached the code is indistinguishable from a guard that cannot fire, which is the
    // one thing the probe existed to rule out. The probe now resolves the anchor only when it occurs
    // exactly once AND does not begin a comment line.
    expect(read.filters).toEqual([
      { kind: "eq", column: "validator_id", value: "VAL_a81d92c1" },
      { kind: "order", column: "created_at", ascending: false },
      { kind: "order", column: "id", ascending: false },
    ]);
  });

  it("reads the entries of exactly those batches, without asking for the stored order", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: RECOVERY_ROWS, error: null, count: null });
    fake.enqueue({
      data: [
        { batch_id: "batch_02", dataset_entry_id: "OD_3" },
        { batch_id: "batch_01", dataset_entry_id: "OD_1" },
        { batch_id: "batch_01", dataset_entry_id: "OD_2" },
      ],
      error: null,
      count: null,
    });

    await new SupabaseBatchesRepository(fake.client).listForRecovery("VAL_a81d92c1");

    const entries = fake.calls[1]!;
    expect(entries.table).toBe("batch_entries");
    // `position` is deliberately absent. This read asks which entries REMAIN; the batch's own order
    // is read through `findById` by the batch's route. Fetching it here would put the research order
    // within reach of a second renderer, which is the whole risk the interface's note describes.
    expect(entries.columns).toBe("batch_id,dataset_entry_id");
    expect(entries.filters).toEqual([
      { kind: "in", column: "batch_id", value: ["batch_02", "batch_01"] },
    ]);
  });

  it("normalises the instant, so the domain holds one representation whatever the server's offset", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: [BATCH_ROW], error: null, count: null });
    fake.enqueue({
      data: [{ batch_id: "batch_01", dataset_entry_id: "OD_1" }],
      error: null,
      count: null,
    });

    const [batch] = await new SupabaseBatchesRepository(fake.client).listForRecovery(
      "VAL_a81d92c1",
    );

    // `+08:00` on the wire, `Z` in the domain. A pass-through would leave `+08:00` here and this
    // assertion fails — and it is the reason `toIsoDateTime` is called at all rather than trusted.
    expect(batch?.createdAt).toBe(BATCH_ROW_CREATED_AT);
  });

  it("returns an entry-less batch with an empty list, rather than raising as findById does", async () => {
    // THE DECISION task 3.5 asks for, and it is a real divergence between two methods of one class.
    // `findById` RAISES on this row; this method must not. The row is the residue of `create`'s two
    // untransacted writes, and a rule that cannot SEE it cannot decide there is no work — whereas a
    // route that rendered it would present a database fault as "nothing was left for you".
    const fake = createFakeClient();
    fake.enqueue({
      data: [
        { id: "batch_01", validator_id: "VAL_a81d92c1", created_at: "2026-10-01T09:15:00+08:00" },
      ],
      error: null,
      count: null,
    });
    // NO entry rows at all — the residue, exactly.
    fake.enqueue({ data: [], error: null, count: null });

    const batches = await new SupabaseBatchesRepository(fake.client).listForRecovery(
      "VAL_a81d92c1",
    );

    expect(batches).toHaveLength(1);
    expect(batches[0]?.entryIds).toEqual([]);
    // And the row is still there. Filtering it out would have produced `[]` and this would fail — which
    // is the distinction between "no interrupted batch" and "there is a batch I cannot offer", and the
    // recognition rule is the only thing entitled to make it.
    expect(batches[0]?.id).toBe("batch_01");
  });

  it("groups entries onto the right batch, without reordering them", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: RECOVERY_ROWS, error: null, count: null });
    fake.enqueue({
      data: [
        { batch_id: "batch_01", dataset_entry_id: "OD_2" },
        { batch_id: "batch_02", dataset_entry_id: "OD_3" },
        { batch_id: "batch_01", dataset_entry_id: "OD_1" },
      ],
      error: null,
      count: null,
    });

    const batches = await new SupabaseBatchesRepository(fake.client).listForRecovery(
      "VAL_a81d92c1",
    );

    // The DATABASE's order for batch_01 is OD_2 then OD_1, and that is what must come back.
    // Sorting them would assert an order this read has no reason to establish — and the batch's real
    // order is `position`, which is not even selected here.
    //
    // In BATCH order, which is the database's own: batch_02 first, because that is the row order the
    // batch read returned.
    expect(batches.map((batch) => batch.entryIds)).toEqual([["OD_3"], ["OD_2", "OD_1"]]);
    expect(batches.map((batch) => batch.id)).toEqual(["batch_02", "batch_01"]);
  });

  it("reads nothing about entries when the validator has no batches", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: [], error: null, count: null });

    const batches = await new SupabaseBatchesRepository(fake.client).listForRecovery(
      "VAL_a81d92c1",
    );

    // "No batches" is the NORMAL answer and must not be paid for with a second round trip. A second
    // call here would be unscripted and this fake REJECTS it, so the assertion below is a
    // measurement rather than a hope: it can fail.
    expect(batches).toEqual([]);
    expect(fake.calls).toHaveLength(1);
  });

  it("names the recovery operation when either read fails", async () => {
    // Two cases that look identical to a caller and must not: a failure to list the batches and a
    // failure to list their entries are different faults, and both must be attributable rather than
    // surfacing as an empty list — which would be reported as "no interrupted batch", i.e. as a
    // successful answer to a research question nobody asked.
    const batchReadFails = createFakeClient();
    batchReadFails.enqueue({ data: null, error: { message: "boom", code: "XX000" }, count: null });
    await expect(
      new SupabaseBatchesRepository(batchReadFails.client).listForRecovery("VAL_a81d92c1"),
    ).rejects.toMatchObject({ operation: "validation_batches.listForRecovery" });

    const entryReadFails = createFakeClient();
    entryReadFails.enqueue({ data: RECOVERY_ROWS, error: null, count: null });
    entryReadFails.enqueue({
      data: null,
      error: { message: "boom", code: "XX000" },
      count: null,
    });
    await expect(
      new SupabaseBatchesRepository(entryReadFails.client).listForRecovery("VAL_a81d92c1"),
    ).rejects.toMatchObject({ operation: "validation_batches.listForRecovery" });
  });

  it("refuses an unreadable creation instant rather than handing the rule a broken string", async () => {
    // The repository boundary, not the rule: `recognizeInterruptedBatch` has its own raise for this,
    // and that guard is unreachable THROUGH the repository. Both exist, and this is the one a caller
    // actually meets.
    const fake = createFakeClient();
    fake.enqueue({
      data: [{ id: "batch_01", validator_id: "VAL_a81d92c1", created_at: "not-a-timestamp" }],
      error: null,
      count: null,
    });
    fake.enqueue({ data: [], error: null, count: null });

    await expect(
      new SupabaseBatchesRepository(fake.client).listForRecovery("VAL_a81d92c1"),
    ).rejects.toMatchObject({ operation: "validation_batches.listForRecovery" });
  });
});

describe("coverage counting", () => {
  it("asks the database for an exact count of validator_id, with no row body", async () => {
    const fake = createFakeClient();
    fake.enqueue(countOnly(3));

    const count = await new SupabaseValidationsRepository(fake.client).countForEntry("OD_1");

    expect(count).toBe(3);
    const call = fake.lastCall();
    expect(call.columns).toBe("validator_id");
    expect(call.options).toEqual({ count: "exact", head: true });
    expect(call.filters).toEqual([{ kind: "eq", column: "dataset_entry_id", value: "OD_1" }]);
  });

  it("counts a validator's own completions the same way", async () => {
    const fake = createFakeClient();
    fake.enqueue(countOnly(7));

    const count = await new SupabaseValidationsRepository(fake.client).countForValidator(
      "VAL_a81d92c1",
    );

    expect(count).toBe(7);
    expect(fake.lastCall().filters).toEqual([
      { kind: "eq", column: "validator_id", value: "VAL_a81d92c1" },
    ]);
  });

  it("raises rather than reporting 0 when the server sends no count", async () => {
    // 0 would tell allocation an entry is uncovered, which is the opposite of the truth.
    const fake = createFakeClient();
    fake.enqueue(countOnly(null));

    await expect(
      new SupabaseValidationsRepository(fake.client).countForEntry("OD_1"),
    ).rejects.toMatchObject({ name: "RepositoryError", operation: "validations.countForEntry" });
  });

  it("refuses a second validation from the same validator for the same entry", async () => {
    // This is the half of "count distinct validators" that lives in the database: the row count
    // countForEntry asks for IS the distinct-validator count only because this write is refused.
    // The constraint itself is proved by the PGlite test, not by anything in this file.
    const fake = createFakeClient();
    fake.enqueue(
      failure(
        "23505",
        'duplicate key value violates unique constraint "validations_validator_entry_unique"',
      ),
    );

    const error = await catchError(
      new SupabaseValidationsRepository(fake.client).insert({ ...RESPONSE, id: "res_02" }),
    );

    expect((error as RepositoryError).operation).toBe("validations.insert");
  });
});

describe("failures never become an empty result", () => {
  it("maps a PostgREST error envelope to a RepositoryError naming the operation", async () => {
    const fake = createFakeClient();
    fake.enqueue(failure("42501", "permission denied for table dataset_entries"));

    const error = await catchError(new SupabaseDatasetEntriesRepository(fake.client).listActive());

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("dataset_entries.list");
    expect((error as RepositoryError).detail).toBe(
      "PostgREST 42501: permission denied for table dataset_entries",
    );
  });

  it("maps a rejected transport call to a RepositoryError that keeps the original cause", async () => {
    const fake = createFakeClient();
    const cause = new Error("socket hang up");
    fake.enqueue({ throws: cause });

    const error = await catchError(
      new SupabaseValidatorsRepository(fake.client).findById("VAL_a81d92c1"),
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("validators.findById");
    expect((error as { cause?: unknown }).cause).toBe(cause);
  });

  it("treats a null row array as a failure rather than as zero rows", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: null, error: null, count: null });

    const error = await catchError(new SupabaseDatasetEntriesRepository(fake.client).listActive());

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("dataset_entries.list");
  });

  it("names the operation a coverage count failed under, so the caller knows which query it was", async () => {
    const fake = createFakeClient();
    fake.enqueue({ throws: new Error("ETIMEDOUT") });

    await expect(
      new SupabaseValidationsRepository(fake.client).countForEntry("OD_1"),
    ).rejects.toMatchObject({ operation: "validations.countForEntry" });
  });

  it("reports an update failure rather than a silently recorded activity timestamp", async () => {
    const fake = createFakeClient();
    fake.enqueue(failure("23505", "no such row"));

    await expect(
      new SupabaseValidatorsRepository(fake.client).touchLastActive("VAL_a81d92c1", ISO_UTC),
    ).rejects.toMatchObject({ operation: "validators.touchLastActive" });
  });
});

describe("the query shape these implementations depend on", () => {
  it("never asks for `*` or for an implicit column list", async () => {
    // This is the mechanism behind "unknown fields are not silently dropped": a column the
    // mapping does not model is never fetched, so there is nothing to discard. `select("*")` or a
    // bare `select()` would reintroduce the problem, and only the shape of the call can catch it.
    const fake = createFakeClient();
    const repository = new SupabaseDatasetEntriesRepository(fake.client);

    fake.enqueue(rows([ENTRY_ROW], 1));
    await repository.listActive();
    fake.enqueue({ data: ENTRY_ROW, error: null, count: null });
    await repository.findById("OD_1");
    fake.enqueue(rows([ENTRY_ROW], 1));
    await repository.listByIds(["OD_1"]);

    expect(fake.calls.length).toBeGreaterThan(0);
    for (const call of fake.calls) {
      if (call.method !== "select") continue;
      expect(typeof call.columns).toBe("string");
      expect(call.columns).not.toBe("*");
      expect((call.columns ?? "").split(",")).toContain("source_payload");
    }
  });

  it("rejects a stored timestamp it cannot read, rather than passing a broken string through", async () => {
    const fake = createFakeClient();
    fake.enqueue({
      data: { ...ENTRY_ROW, created_at: "not a timestamp" },
      error: null,
      count: null,
    });

    const error = await catchError(
      new SupabaseDatasetEntriesRepository(fake.client).findById("OD_1"),
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).detail).toContain("created_at");
  });
});

describe("the operation name each method reports", () => {
  const maps = {
    datasetEntries: DATASET_ENTRIES_OPERATIONS,
    validators: VALIDATORS_OPERATIONS,
    validations: VALIDATIONS_OPERATIONS,
    batches: BATCHES_OPERATIONS,
    entryReservations: ENTRY_RESERVATIONS_OPERATIONS,
  };

  it("pins every place the union and the method name disagree", () => {
    // `RepositoryOperation` says `validators.insert` where the method is `create`,
    // `dataset_entries.list` where the method is `listActive`, and `validation_batches.insert`
    // where the method is `create`. The link is a type-level `satisfies` in operations.ts; this is
    // its readable half, and it is three assertions rather than one because there are three
    // divergences, not one. A new divergence would need a new entry here, and the `declared` list
    // below is what makes an unrecorded one impossible.
    expect(maps.validators.create).toBe("validators.insert");
    expect(maps.datasetEntries.listActive).toBe("dataset_entries.list");
    expect(maps.batches.create).toBe("validation_batches.insert");
    // And the one that is NOT a divergence, pinned so its lack of a comment reads as deliberate.
    expect(maps.batches.findById).toBe("validation_batches.findById");
    // Two more of the same aggregate-vs-persistence shape: the methods ask domain questions while
    // the union names the persistence call on the table.
    expect(maps.entryReservations.claimReservations).toBe("entry_reservations.claim");
    expect(maps.entryReservations.releaseReservation).toBe("entry_reservations.release");
  });

  it("gives every method of one interface its own operation name", () => {
    for (const [name, map] of Object.entries(maps)) {
      const values = Object.values(map);
      expect(new Set(values).size, `${name} reuses an operation name`).toBe(values.length);
    }
  });

  it("uses only names from the RepositoryOperation union", () => {
    // The exhaustive check is the compiler's job (`satisfies` in operations.ts); this is the
    // runtime half, and it fails loudly if a name is edited in one place only. The assertion is
    // bidirectional — every name used is declared AND every declared name is used — because a
    // one-directional check would pass while an operation sat in the union unattached to any
    // method, which is the opposite of "reconciled".
    const declared: RepositoryOperation[] = [
      "dataset_entries.list",
      // Arrived with the merged corpus: the whole pool no longer fits one PostgREST response,
      // so the paged whole-pool read carries its own operation name under the same contract.
      "dataset_entries.listAll",
      "dataset_entries.findById",
      "dataset_entries.listByIds",
      "validators.insert",
      "validators.findById",
      // Arrived with the dashboard's bulk profile read, and this row is what proves the union and
      // the method map were BOTH updated: adding the method without the union entry fails the
      // compiler, and adding the union entry without the method fails HERE.
      "validators.listByIds",
      "validators.touchLastActive",
      "validations.insert",
      "validations.findById",
      "validations.findByEntry",
      "validations.listForEntries",
      "validations.listEntryIdsForValidator",
      "validations.countForEntry",
      "validations.countForValidator",
      "validation_batches.insert",
      "validation_batches.findById",
      // Arrived with `listForRecovery`, and this row is what proves the union and the method map were
      // BOTH updated: the check is bidirectional, so adding the method without the union entry fails
      // the compiler and adding the union entry without the method fails HERE.
      "validation_batches.listForRecovery",
      // Arrived with the reservation seam, under the same contract: the compiler catches a method
      // without a union entry, and this list catches a union entry without a method.
      "entry_reservations.claim",
      "entry_reservations.release",
    ];
    const used = Object.values(maps).flatMap((map) => Object.values(map));

    expect(used.every((name) => declared.includes(name))).toBe(true);
    // Nothing in the union is left unattached to a method, which is what "reconciled" means.
    expect([...used].sort()).toEqual([...declared].sort());
  });
});

describe("the privileged boundary of this directory", () => {
  const directory = fileURLToPath(new URL("../../src/lib/repositories/supabase/", import.meta.url));

  /**
   * The modules here that must NOT carry `import "server-only"`, and why each one is exempt.
   *
   * Written as a NAMED list rather than as a rule of the shape "every file except…", because an
   * exemption expressed as a pattern is an exemption that widens by itself. This list was added
   * when the hosted dataset import arrived and `rpc.ts` had to become loadable by a plain-Node
   * operator command — the `server-only` package's entry point THROWS outside a React Server
   * Component render, so a module carrying the marker cannot be imported by `scripts/import-dataset.ts`
   * at all. Until that, the guard below read "every module" and was TRUE by having nothing to
   * except.
   *
   * `rpc.ts` holds no credential and reads no environment variable; it is the shared PostgREST
   * error vocabulary, and its specifier is listed in `eslint.config.mjs` so a client import fails
   * lint by name. Adding a module here is a deliberate widening of what a browser bundle may
   * reach, which is exactly why it requires a line in this array and a sentence above it.
   */
  const WITHOUT_SERVER_ONLY = ["rpc.ts"];

  const filesInDirectory = () => readdirSync(directory).filter((name) => name.endsWith(".ts"));

  it('declares `import "server-only"` as the very first import of every module EXCEPT a named one', () => {
    // `server-only` is stubbed in this file, so the marker cannot prove anything at runtime here.
    // Reading the source is the same approach `tests/unit/supabase-clients.test.ts` uses, and it is
    // the only way to check "first" rather than "present".
    const files = filesInDirectory();

    expect(files.length).toBeGreaterThan(0);
    for (const file of files.filter((name) => !WITHOUT_SERVER_ONLY.includes(name))) {
      const source = readFileSync(`${directory}${file}`, "utf8");
      const firstImport = /^\s*import\s+["'][^"']+["'];?/m.exec(source)?.[0];
      expect(firstImport, `${file} must import "server-only" first`).toBe('import "server-only";');
    }
  });

  it("exempts only files that genuinely LACK the marker, so the list cannot rot into a permission", () => {
    // The half that makes the array above meaningful. Without it, `WITHOUT_SERVER_ONLY` could name
    // a module that HAS the marker, the loop above would skip it, and the directory's boundary
    // would silently shrink — an exemption list that grants protection it does not check for is
    // worse than no list, because a reader counts it as coverage.
    for (const file of WITHOUT_SERVER_ONLY) {
      const source = readFileSync(`${directory}${file}`, "utf8");
      expect(source, `${file} is exempted but does import "server-only"`).not.toContain(
        'from "server-only"',
      );
      expect(source, `${file} is exempted but does declare the marker`).not.toMatch(
        /^\s*import\s+["']server-only["'];?/m,
      );
      // And the file it was created for must still exist, or the exemption names nothing.
      expect(filesInDirectory(), `${file} is exempted but does not exist`).toContain(file);
    }
  });

  it("names every marker-less module in the directory, so a NEW one fails instead of passing quietly", () => {
    // This is what makes the first test a guard rather than a convention. A module added without
    // `import "server-only"` and without a line above is simply not in the list, so it is checked
    // — and fails. MEASURED, not assumed: adding `src/lib/repositories/supabase/extra.ts` with no
    // marker turns this file red with the new module named.
    const unmarked = filesInDirectory().filter((file) => {
      const source = readFileSync(`${directory}${file}`, "utf8");
      return !/^\s*import\s+["']server-only["'];?/m.test(source);
    });

    expect(unmarked.sort()).toEqual([...WITHOUT_SERVER_ONLY].sort());
  });

  it("resolves ids and profiles through the domain schemas, not through loose casts", () => {
    // A type-only sanity check that the fixtures really are domain values, so a test that compares
    // against them cannot pass because both sides were built from the same wrong assumption.
    const entryId: DatasetEntryId = ENTRY.id;
    expect(entryId).toBe("OD_1");
    expect(ENTRY.category).toBe("origin_destination");
    expect(PROFILE.totalValidations).toBe(3);
  });
});
