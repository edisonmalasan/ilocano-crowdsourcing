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
import { SupabaseDatasetEntriesRepository } from "@/lib/repositories/supabase/dataset-entries";
import {
  DATASET_ENTRIES_OPERATIONS,
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
  write?: Record<string, unknown>;
  filters: RecordedFilter[];
  terminal: "await" | "single" | "maybeSingle" | null;
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

  const client: SupabaseClientLike = { from };

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
  id: "OD_0001",
  instruction: "Gemahen nga agpangide ti jeep.",
  output: { origin: "Baguio", destination: "Bangco Sentral", transit_mode: null },
  // A field the domain does not model. It exists only in the archival copy.
  annotator_note: "checked against the field notebook",
};

const ENTRY_ROW = {
  id: "OD_0001",
  category: "origin_destination",
  instruction: "Gemahen nga agpangide ti jeep.",
  origin: "Baguio",
  destination: "Bangco Sentral",
  transit_mode: null,
  source_payload: SOURCE_PAYLOAD,
  is_active: true,
  created_at: TIMESTAMPTZ,
};

const ENTRY: DatasetEntry = {
  id: "OD_0001",
  category: "origin_destination",
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
  dataset_entry_id: "OD_0001",
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
  datasetEntryId: "OD_0001",
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
  datasetEntryId: "OD_0001",
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

describe("SupabaseDatasetEntriesRepository", () => {
  it("translates a row to a domain entry, in camelCase, with no persistence field left in it", async () => {
    const fake = createFakeClient();
    fake.enqueue(rows([ENTRY_ROW]));

    const [entry] = await new SupabaseDatasetEntriesRepository(fake.client).listActive();

    expect(entry).toEqual(ENTRY);
    // The domain shape, exactly: no `source_payload`, no `created_at`, no `is_active`.
    expect(Object.keys(entry ?? {}).sort()).toEqual([
      "category",
      "createdAt",
      "destination",
      "id",
      "instruction",
      "isActive",
      "origin",
      "transitMode",
    ]);
  });

  it("converts a timestamptz with an offset into the canonical UTC ISO 8601 string", async () => {
    const fake = createFakeClient();
    fake.enqueue({ data: ENTRY_ROW, error: null, count: null });

    const entry = await new SupabaseDatasetEntriesRepository(fake.client).findById("OD_0001");

    expect(entry?.createdAt).toBe(ISO_UTC);
    expect(entry?.createdAt).not.toBe(TIMESTAMPTZ);
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

    const found = await new SupabaseDatasetEntriesRepository(fake.client).findById("OD_9999");

    expect(found).toBeNull();
    expect(fake.lastCall().terminal).toBe("maybeSingle");
    expect(fake.lastCall().filters).toEqual([{ kind: "eq", column: "id", value: "OD_9999" }]);
  });

  it("returns listByIds in the order the caller asked for, omitting the ids that do not exist", async () => {
    const fake = createFakeClient();
    // Deliberately out of request order, which is what a database is free to do.
    fake.enqueue(rows([{ ...ENTRY_ROW, id: "OD_0003" }, ENTRY_ROW]));

    const entries = await new SupabaseDatasetEntriesRepository(fake.client).listByIds([
      "OD_0001",
      "OD_9999",
      "OD_0003",
    ]);

    expect(entries.map((entry) => entry.id)).toEqual(["OD_0001", "OD_0003"]);
    expect(fake.lastCall().filters).toEqual([
      { kind: "in", column: "id", value: ["OD_0001", "OD_9999", "OD_0003"] },
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

  it("never leaks an unmodelled column into the domain entry itself", async () => {
    const fake = createFakeClient();
    fake.enqueue(rows([{ ...ENTRY_ROW, added_by_a_later_migration: "kept" }]));

    const [entry] = await new SupabaseDatasetEntriesRepository(fake.client).listActive();

    expect(entry).toEqual(ENTRY);
    expect(Object.keys(entry ?? {})).not.toContain("added_by_a_later_migration");
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
    expect(fake.lastCall().write).toEqual({
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
      dataset_entry_id: "OD_0001",
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

    expect(fake.lastCall().write?.english_translation).toBe("Ride the jeep.");
    expect(fake.lastCall().write?.filipino_translation).toBe("Sumakay ng jeep.");
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
    expect(fake.lastCall().write?.corrected_instruction).toBe("Gemahen ti jeep.");
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

    const [found] = await new SupabaseValidationsRepository(fake.client).findByEntry("OD_0001");

    expect(found).toEqual(CANNOT_EVALUATE_RESPONSE);
    const keys = Object.keys(found ?? {});
    expect(keys).not.toContain("correctedInstruction");
    expect(keys).not.toContain("englishTranslation");
    expect(keys).not.toContain("filipinoTranslation");
    expect("englishTranslation" in (found ?? {})).toBe(false);
    expect("filipinoTranslation" in (found ?? {})).toBe(false);
  });

  it("raises when a stored row is missing its Filipino translation", async () => {
    // The migration's cross-column check rejects this on the way in, so the database should never
    // hold such a row. The domain schema rejects it on the way out, and this is the last line of
    // defence: a row that somehow exists must fail loudly rather than load as a valid response and
    // be counted toward coverage. It is a real defence rather than dead code because the column
    // constraint and the domain rule are two independent implementations of the same rule, and
    // only one of them is exercised by a given write.
    const fake = createFakeClient();
    fake.enqueue({
      data: { ...VALIDATION_ROW, filipino_translation: null },
      error: null,
      count: null,
    });

    const error = await catchError(
      new SupabaseValidationsRepository(fake.client).findById("res_01"),
    );

    expect(isRepositoryError(error)).toBe(true);
    expect((error as RepositoryError).operation).toBe("validations.findById");
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
    // The database rejects this via `btrim`, and the domain schema rejects it because
    // `normalizeResearchText` maps a blank to `null`. Two independent implementations again.
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

    await new SupabaseValidationsRepository(fake.client).findByEntry("OD_0001");

    const call = fake.lastCall();
    expect(call.filters).toEqual([
      { kind: "eq", column: "dataset_entry_id", value: "OD_0001" },
      { kind: "order", column: "created_at", ascending: true },
    ]);
    expect(call.options).toEqual({ count: "exact" });
  });

  it("raises rather than showing a truncated response list as consensus", async () => {
    const fake = createFakeClient();
    fake.enqueue(rows([VALIDATION_ROW], 1000));

    await expect(
      new SupabaseValidationsRepository(fake.client).findByEntry("OD_0001"),
    ).rejects.toMatchObject({ name: "RepositoryError", operation: "validations.findByEntry" });
  });
});

describe("coverage counting", () => {
  it("asks the database for an exact count of validator_id, with no row body", async () => {
    const fake = createFakeClient();
    fake.enqueue(countOnly(3));

    const count = await new SupabaseValidationsRepository(fake.client).countForEntry("OD_0001");

    expect(count).toBe(3);
    const call = fake.lastCall();
    expect(call.columns).toBe("validator_id");
    expect(call.options).toEqual({ count: "exact", head: true });
    expect(call.filters).toEqual([{ kind: "eq", column: "dataset_entry_id", value: "OD_0001" }]);
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
      new SupabaseValidationsRepository(fake.client).countForEntry("OD_0001"),
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
      new SupabaseValidationsRepository(fake.client).countForEntry("OD_0001"),
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
    await repository.findById("OD_0001");
    fake.enqueue(rows([ENTRY_ROW], 1));
    await repository.listByIds(["OD_0001"]);

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
      new SupabaseDatasetEntriesRepository(fake.client).findById("OD_0001"),
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
  };

  it("pins both places the union and the method name disagree", () => {
    // `RepositoryOperation` says `validators.insert` where the method is `create`, and
    // `dataset_entries.list` where the method is `listActive`. The link is a type-level
    // `satisfies` in operations.ts; this is its readable half, and it is two assertions rather
    // than one because there are two divergences, not one.
    expect(maps.validators.create).toBe("validators.insert");
    expect(maps.datasetEntries.listActive).toBe("dataset_entries.list");
  });

  it("gives every method of one interface its own operation name", () => {
    for (const [name, map] of Object.entries(maps)) {
      const values = Object.values(map);
      expect(new Set(values).size, `${name} reuses an operation name`).toBe(values.length);
    }
  });

  it("uses only names from the RepositoryOperation union", () => {
    // The exhaustive check is the compiler's job (`satisfies` in operations.ts); this is the
    // runtime half, and it fails loudly if a name is edited in one place only.
    const declared: RepositoryOperation[] = [
      "dataset_entries.list",
      "dataset_entries.findById",
      "dataset_entries.listByIds",
      "validators.insert",
      "validators.findById",
      "validators.touchLastActive",
      "validations.insert",
      "validations.findById",
      "validations.findByEntry",
      "validations.countForEntry",
      "validations.countForValidator",
    ];
    const used = Object.values(maps).flatMap((map) => Object.values(map));

    expect(used.every((name) => declared.includes(name))).toBe(true);
    // Nothing in the union is left unattached to a method, which is what "reconciled" means.
    expect([...used].sort()).toEqual([...declared].sort());
  });
});

describe("the privileged boundary of this directory", () => {
  const directory = fileURLToPath(new URL("../../src/lib/repositories/supabase/", import.meta.url));

  it('declares `import "server-only"` as the very first import of every module', () => {
    // `server-only` is stubbed in this file, so the marker cannot prove anything at runtime here.
    // Reading the source is the same approach `tests/unit/supabase-clients.test.ts` uses, and it is
    // the only way to check "first" rather than "present".
    const files = readdirSync(directory).filter((name) => name.endsWith(".ts"));

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(`${directory}${file}`, "utf8");
      const firstImport = /^\s*import\s+["'][^"']+["'];?/m.exec(source)?.[0];
      expect(firstImport, `${file} must import "server-only" first`).toBe('import "server-only";');
    }
  });

  it("resolves ids and profiles through the domain schemas, not through loose casts", () => {
    // A type-only sanity check that the fixtures really are domain values, so a test that compares
    // against them cannot pass because both sides were built from the same wrong assumption.
    const entryId: DatasetEntryId = ENTRY.id;
    expect(entryId).toBe("OD_0001");
    expect(ENTRY.category).toBe("origin_destination");
    expect(PROFILE.totalValidations).toBe(3);
  });
});
