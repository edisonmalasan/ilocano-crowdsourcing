/**
 * The dataset-entry import FUNCTION, against a real PostgreSQL engine, from the production
 * migrations directory.
 *
 * WHY THIS FILE IS NOT A RESTATEMENT OF `dataset-import.test.ts`
 * -------------------------------------------------------------
 * That file already proves the importer writes all 800 records correctly, but it proves it through a
 * TEST-LOCAL `upsertWithParams` function written in TypeScript. This file proves the thing that
 * actually ships: the `public.dataset_entries_import` function created by
 * `20261003120000_dataset_entries_import.sql`, driven through the PRODUCTION
 * `SupabaseDatasetEntrySink`.
 *
 * The difference is not stylistic. A test-local upsert expresses its immutability guarantee as an
 * omission in a TypeScript object literal, which a future edit could add a line to. The migration
 * expresses the same guarantee as an absence in a SQL update list, and the structural guard at the
 * end of this file reads that list off `pg_proc.prosrc` — the engine's own copy of the statement —
 * rather than off the source file a test happens to have open.
 *
 * ── WHAT IS ACTUALLY PROVEN HERE, AND WHAT IS NOT ────────────────────────────────────────────────────
 * PGlite is PostgreSQL compiled to WebAssembly. It evaluates SQL, constraints, privileges, and
 * privileges-as-enforced-by-the-engine with no mocking of any kind. It does NOT reproduce the
 * Supabase API gateway: no PostgREST, no JWT, no `service_role` key. So the `anon` refusal proved
 * below is the engine's `permission denied` for a missing `grant`, which is what the revoke
 * produces — and it is NOT a measurement of what a real gateway returns. Task 7.3 measures that,
 * on the hosted project, separately.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { SupabaseDatasetEntrySink } from "@/lib/dataset/supabase-sink";
import { importDatasetEntries } from "@/lib/dataset/import-dataset";
import { parseSyntheticDataset } from "@/lib/dataset/synthetic-source";
import type { SupabaseRpcResultLike } from "@/lib/repositories/supabase/rpc";

import { applyMigrations, applyMigrationsUntil, readMigrations } from "./support/migrations";
import {
  applySql,
  closeTestDatabase,
  createTestDatabase,
  query,
  truncateAll,
  type QueryExecutor,
  type TestDatabase,
} from "./support/pglite";

const SOURCE_PATH = path.resolve(process.cwd(), "data", "merged-ilocano-synthetic-data.json");
const IMPORT_MIGRATION = "20261003120000_dataset_entries_import.sql";
const PROVENANCE_MIGRATION = "20261005120000_merged_dataset_provenance.sql";
const GUARD_MIGRATION = "20261004120000_dataset_entries_import_guard.sql";

/**
 * The eleven parameters of `dataset_entries_import_v3`, in the migration's own declaration order.
 *
 * Written as an explicit tuple rather than derived from the argument object's keys, because the
 * positional mapping IS the contract: PostgREST's `rpc` matches a named argument object to the
 * function by NAME, so an argument sent under a name the function does not declare would be
 * silently ignored by a real gateway rather than rejected. A tuple cannot drift from the migration
 * by accident, but it can by hand — which is why the round-trip test below asserts the stored row
 * equals what was sent, and the `rg` probe against `prosrc` asserts the signature itself.
 */
const PARAMETER_ORDER = [
  "p_id",
  "p_category",
  "p_source_entry_id",
  "p_category_name",
  "p_instruction",
  "p_origin",
  "p_destination",
  "p_transit_mode",
  "p_transit_modes",
  "p_source_payload",
  "p_is_active",
] as const;

const FUNCTION_SIGNATURE =
  "public.dataset_entries_import_v3(text, text, integer, text, text, text, text, text, text[], jsonb, boolean)";

/** v1 stays deployed as history; this is what the guard migration still pins. */
const V1_FUNCTION_NAME = "dataset_entries_import";

/**
 * `created_at`, read as an epoch NUMBER's text rather than as a `timestamptz`.
 *
 * The reason is precision rather than convenience, and both halves of it were measured here rather
 * than reasoned about.
 *
 * PGlite hands a `timestamptz` back as a JS `Date`, and `toBe` on two `Date`s that carry the same
 * instant FAILS on identity — the comparison would then be testing `Date` internals, and it did
 * exactly that on this file's first run, reporting `2026-10-02T07:46:42.079Z` against itself.
 *
 * `extract(epoch …)` rather than `timestamptz::text`, because the latter renders MILLISECONDS. This
 * repository has already recorded that millisecond rendering cannot distinguish `now()` from
 * `clock_timestamp()` inside one statement, so an immutability assertion built on it would be
 * asserting a precision the comparison does not have. The epoch text keeps microseconds.
 */
const CREATED_AT_AS_EPOCH_TEXT =
  "select instruction, source_payload, " +
  "extract(epoch from created_at)::text as created_at, origin " +
  "from public.dataset_entries where id = $1";

const CREATED_AT_AS_EPOCH_TEXT_V2 =
  "select instruction, source_payload, " +
  "extract(epoch from created_at)::text as created_at, origin, category, source_entry_id, category_name " +
  "from public.dataset_entries where id = $1";

/**
 * A `SupabaseRpcClientLike` over PGlite.
 *
 * Maps `rpc(fn, args)` onto a positional `select public.fn($1, …, $10)`, which is what PostgREST
 * does with a named argument object. That equivalence is the reason this adapter can stand in for
 * the real client: the migration's parameter names are checked by name against `PARAMETER_ORDER`
 * below, so an argument renamed on the TypeScript side fails here rather than passing as a call
 * that "worked".
 */
function pgliteRpcClient(executor: QueryExecutor) {
  return {
    async rpc(fn: string, args: Record<string, unknown>): Promise<SupabaseRpcResultLike> {
      // The only function any caller here may name. Refusing rather than interpolating means a
      // test cannot accidentally prove something about a different function.
      if (fn !== "dataset_entries_import_v3") {
        return { data: null, error: { code: "TESTREFUSED", message: `unexpected fn ${fn}` } };
      }

      const missing = PARAMETER_ORDER.filter((name) => !(name in args));
      if (missing.length > 0) {
        return {
          data: null,
          error: {
            code: "TESTREFUSED",
            message: `rpc called without ${missing.join(", ")}; PostgREST would ignore them`,
          },
        };
      }

      try {
        const result = await executor.query<{ dataset_entries_import_v3: string }>(
          `select public.dataset_entries_import_v3($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
          [
            args.p_id as string,
            args.p_category as string,
            args.p_source_entry_id as number,
            args.p_category_name as string,
            args.p_instruction as string,
            args.p_origin as string | null,
            args.p_destination as string | null,
            args.p_transit_mode as string | null,
            args.p_transit_modes as readonly string[] | null,
            JSON.stringify(args.p_source_payload),
            args.p_is_active as boolean,
          ] as never[],
        );
        return { data: result.rows[0]?.dataset_entries_import_v3 ?? null, error: null };
      } catch (cause) {
        // PostgREST reports a raised `raise exception` as an error envelope rather than a rejected
        // promise, and the sink's `expectNoError` is what turns it into a `RepositoryError`.
        // Reproducing that shape here is what makes the sink's error path exercised at all.
        return {
          data: null,
          error: { code: "P0001", message: (cause as Error).message },
        };
      }
    },
  };
}

describe("the dataset_entries_import function", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    await applyMigrations(db);
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  beforeEach(async () => {
    // `truncateAll`, not a bare `truncate public.dataset_entries`: `batch_entries` and
    // `validations` both hold foreign keys into that table.
    await truncateAll(db);
  });

  const sinkFor = (executor: QueryExecutor = db) =>
    new SupabaseDatasetEntrySink(pgliteRpcClient(executor));

  /** Parses the real source file, so no assertion is made against a derived artifact. */
  const parsedEntries = () => parseSyntheticDataset(JSON.parse(readFileSync(SOURCE_PATH, "utf8")));

  // ---------------------------------------------------------------------------------------------
  // The discriminator. Task 6.1.
  // ---------------------------------------------------------------------------------------------

  it("reports `inserted` for a first write and `updated` for a re-run, from the engine's own answer", async () => {
    const { entries } = parsedEntries();
    const first = entries[0]!;
    const second = entries[1]!;

    expect(await sinkFor().upsert(first)).toBe("inserted");
    expect(await sinkFor().upsert(second)).toBe("inserted");
    expect(await sinkFor().upsert(first)).toBe("updated");
  });

  it("decides inserted-versus-updated with `xmax` rather than a prior read, so the two cannot disagree", async () => {
    // The discriminator is read off `pg_proc.prosrc`. This is a textual assertion about the
    // engine's stored copy of the statement, and its limit is stated rather than hidden: it proves
    // the token is PRESENT, not that it evaluates correctly. The behavioural half is the test
    // above, which would fail if `xmax` were replaced by a constant.
    const body = await functionSource(db);
    expect(body).toContain("xmax");
  });

  // ---------------------------------------------------------------------------------------------
  // Immutability. The claim this function exists for.
  // ---------------------------------------------------------------------------------------------

  it("leaves `instruction`, `source_payload`, and `created_at` untouched when a re-run carries a different projection", async () => {
    const { entries } = parsedEntries();
    const entry = entries[0]!;

    await sinkFor().upsert(entry);

    const before = await query<{
      instruction: string;
      source_payload: Record<string, unknown>;
      created_at: string;
      origin: string | null;
    }>(db, CREATED_AT_AS_EPOCH_TEXT, [entry.id]);
    expect(before).toHaveLength(1);

    // A SECOND write of the same id with every mutable projection changed and the instruction
    // IDENTICAL — the only re-run the function accepts.
    expect(
      await sinkFor().upsert({
        ...entry,
        category: "destination_only",
        sourceEntryId: 7,
        categoryName: "Destination Only",
        origin: "A DIFFERENT ORIGIN",
        destination: "A DIFFERENT DESTINATION",
        transitMode: "walking",
      }),
    ).toBe("updated");

    const after = await query<{
      instruction: string;
      source_payload: Record<string, unknown>;
      created_at: string;
      origin: string | null;
      category: string;
      source_entry_id: number;
      category_name: string;
    }>(db, CREATED_AT_AS_EPOCH_TEXT_V2, [entry.id]);

    // The three immutable columns are byte-identical.
    expect(after[0]!.instruction).toBe(before[0]!.instruction);
    expect(after[0]!.created_at).toBe(before[0]!.created_at);
    expect(after[0]!.source_payload).toEqual(before[0]!.source_payload);
    // And the mutable ones really did change, so the three assertions above are not vacuous: they
    // would pass on a function that updated nothing at all. Provenance converges rather than
    // freezing a first-write value beside a corrected file.
    expect(after[0]!.origin).toBe("A DIFFERENT ORIGIN");
    expect(after[0]!.category).toBe("destination_only");
    expect(after[0]!.source_entry_id).toBe(7);
    expect(after[0]!.category_name).toBe("Destination Only");
  });

  it("keeps `source_payload` immutable even though nothing forbids it, because it CONTAINS the instruction", async () => {
    // The reason this is not the obvious answer is recorded in the migration's header. The test
    // exists so that reason is enforced rather than merely argued: a re-run that changes the
    // payload alone, with the instruction unchanged, would leave the row holding two different
    // instructions in two columns and nothing would error.
    const { entries } = parsedEntries();
    const entry = entries[0]!;

    await sinkFor().upsert(entry);
    const before = await query<{ source_payload: Record<string, unknown> }>(
      db,
      "select source_payload from public.dataset_entries where id = $1",
      [entry.id],
    );

    await sinkFor().upsert({
      ...entry,
      sourcePayload: { ...entry.sourcePayload, injected: "a field the source file does not have" },
    });

    const after = await query<{ source_payload: Record<string, unknown> }>(
      db,
      "select source_payload from public.dataset_entries where id = $1",
      [entry.id],
    );

    expect(after[0]!.source_payload).toEqual(before[0]!.source_payload);
    expect(after[0]!.source_payload).not.toHaveProperty("injected");
  });

  it("refuses by name when a re-run carries a DIFFERENT instruction, and reproduces neither text", async () => {
    const { entries } = parsedEntries();
    const entry = entries[0]!;
    const DIVERGENT = "ITANI A COMPLETELY DIFFERENT INSTRUCTION";
    expect(entry.instruction).not.toBe(DIVERGENT);

    await sinkFor().upsert(entry);

    await expect(sinkFor().upsert({ ...entry, instruction: DIVERGENT })).rejects.toThrow(
      /dataset_entries_instruction_diverged/,
    );

    // The stored row is untouched — the refusal is not "updated with a warning".
    const stored = await query<{ instruction: string }>(
      db,
      "select instruction from public.dataset_entries where id = $1",
      [entry.id],
    );
    expect(stored[0]!.instruction).toBe(entry.instruction);
  });

  it("names the entry id in the refusal and neither instruction text", async () => {
    const { entries } = parsedEntries();
    const entry = entries[3]!;
    const DIVERGENT = "ITANI A SECOND COMPLETELY DIFFERENT INSTRUCTION";

    await sinkFor().upsert(entry);

    // Caught as the RAW engine message rather than through the sink, because the sink's
    // `RepositoryError` message is a rendered summary; the claim is about what the DATABASE puts
    // in the log, and Ilocano research text must not end up there.
    const failure = await rawFailure(
      db,
      `select public.dataset_entries_import_v3($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
      [
        entry.id,
        entry.category,
        entry.sourceEntryId,
        entry.categoryName,
        DIVERGENT,
        entry.origin,
        entry.destination,
        entry.transitMode,
        null,
        JSON.stringify(entry.sourcePayload),
        true,
      ] as never[],
    );

    expect(failure).toContain("dataset_entries_instruction_diverged");
    expect(failure).toContain(entry.id);
    expect(failure).not.toContain(DIVERGENT);
    expect(failure).not.toContain(entry.instruction);
  });

  // ---------------------------------------------------------------------------------------------
  // All 3,000 records through the PRODUCTION sink.
  // ---------------------------------------------------------------------------------------------

  it("imports all 4800 records through the production sink with every instruction byte-identical", async () => {
    const { entries, report } = parsedEntries();
    expect(entries.length).toBe(4800);

    const result = await importDatasetEntries(entries, sinkFor(), report);
    expect(result).toMatchObject({ parsed: 4800, inserted: 4800, updated: 0 });

    const stored = await query<{ id: string; instruction: string }>(
      db,
      "select id, instruction from public.dataset_entries order by id",
    );

    // Read the SOURCE, not the parse, so this cannot pass by checking the import against
    // something the import produced. Canonical ids are read verbatim here — the expectation
    // is the filed id itself, so a parser that reminted ids would fail against the source.
    const document = JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as {
      categories: { category_name: string; entries: { id: string; instruction: string }[] }[];
    };
    const expected = new Map<string, string>();
    document.categories.forEach((block) => {
      for (const record of block.entries) {
        expected.set(record.id, record.instruction);
      }
    });

    expect(stored).toHaveLength(4800);
    expect(new Set(stored.map((row) => row.id))).toEqual(new Set(expected.keys()));
    for (const row of stored) {
      expect(row.instruction, `instruction for ${row.id}`).toBe(expected.get(row.id));
    }
  });

  it("stores provenance on every row: 800 per category, local ids 1..800, payloads verbatim", async () => {
    const { entries, report } = parsedEntries();
    await importDatasetEntries(entries, sinkFor(), report);

    const stored = await query<{
      id: string;
      category: string;
      source_entry_id: number;
      category_name: string;
      source_payload: { id: unknown };
    }>(
      db,
      "select id, category, source_entry_id, category_name, source_payload from public.dataset_entries",
    );

    expect(stored).toHaveLength(4800);
    const byCategory = new Map<string, { locals: number[]; names: Set<string> }>();
    for (const row of stored) {
      // The payload preserves the ORIGINAL source record: the filed string id, identical to
      // the stored canonical id — verbatim, not reminted.
      expect(row.source_payload.id).toBe(row.id);
      const group = byCategory.get(row.category) ?? { locals: [], names: new Set<string>() };
      group.locals.push(row.source_entry_id);
      group.names.add(row.category_name);
      byCategory.set(row.category, group);
    }
    expect([...byCategory.keys()].sort()).toEqual(
      [
        "complex_preference_expressions",
        "destination_only",
        "destination_transit_mode",
        "double_transit_mode",
        "origin_destination",
        "origin_destination_transit_mode",
      ].sort(),
    );
    for (const [category, group] of byCategory) {
      expect(group.locals.sort((a, b) => a - b)).toEqual(
        Array.from({ length: 800 }, (_, index) => index + 1),
      );
      expect(group.names.size, `category names for ${category}`).toBe(1);
    }
  });

  it("leaves all 4800 rows byte-identical on a second run, reporting 0 inserted / 4800 updated", async () => {
    const { entries, report } = parsedEntries();

    await importDatasetEntries(entries, sinkFor(), report);

    const first = await query<{ id: string; instruction: string; created_at: string }>(
      db,
      "select id, instruction, created_at from public.dataset_entries order by id",
    );

    const second = await importDatasetEntries(entries, sinkFor(), report);
    expect(second).toMatchObject({ parsed: 4800, inserted: 0, updated: 4800 });

    const after = await query<{ id: string; instruction: string; created_at: string }>(
      db,
      "select id, instruction, created_at from public.dataset_entries order by id",
    );
    expect(after).toEqual(first);
  });

  // ---------------------------------------------------------------------------------------------
  // Privileges. The revoke is the barrier; RLS is the backstop.
  // ---------------------------------------------------------------------------------------------

  it("refuses to EXECUTE for `anon` and `authenticated`, which is the revoke working", async () => {
    // Refused by a MISSING GRANT. Distinguishing that from an RLS rejection matters: this test
    // asserts the revoke, and an `insert`-violates-RLS message would mean the revoke was absent and
    // the policy had caught it instead — a different fact, and one task 1.4's `PGRST202` note warns
    // about in the gateway's terms.
    for (const role of ["anon", "authenticated"] as const) {
      const failure = await asRoleFailure(
        db,
        role,
        `select public.dataset_entries_import_v3('DTM_1', 'double_transit_mode', 1, 'Double Transit Mode', 'x', null, 'Abanao Square', null, array['jeepney','walking'], '{}'::jsonb, true)`,
      );
      expect(failure).toMatch(/permission denied/i);
    }
  });

  it("grants EXECUTE to `service_role` and revokes it from PUBLIC", async () => {
    const rows = await query<{
      has_service_role: boolean;
      has_public: boolean;
      prosecdef: boolean;
      provolatile: string;
      config: string[] | null;
    }>(
      db,
      `select
         has_function_privilege('service_role', '${FUNCTION_SIGNATURE}', 'execute') as has_service_role,
         has_function_privilege('public', '${FUNCTION_SIGNATURE}', 'execute') as has_public,
         p.prosecdef as prosecdef,
         p.provolatile::text as provolatile,
         p.proconfig as config
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'dataset_entries_import_v3'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.has_service_role).toBe(true);
    expect(rows[0]!.has_public).toBe(false);
  });

  it("leaves v1 and v2 deployed with their signatures, because history is not rewritten", async () => {
    // v1 and v2 are superseded, not deleted: the old guard migration pins v1's signature, the
    // provenance migration pins v2's, and deleting either function would turn a deployed guard
    // into a check against a ghost.
    const rows = await query<{ count: number }>(
      db,
      `select count(*)::int as count from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and (p.proname = '${V1_FUNCTION_NAME}' or p.proname = 'dataset_entries_import_v2')`,
    );
    expect(rows[0]!.count).toBe(2);
  });

  it("is SECURITY INVOKER, because a definer function would let `anon` write arbitrary rows", async () => {
    const rows = await query<{ prosecdef: boolean }>(
      db,
      `select p.prosecdef as prosecdef
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'dataset_entries_import_v3'`,
    );
    expect(rows[0]!.prosecdef).toBe(false);
  });

  it("resolves nothing through a writable `search_path`", async () => {
    const rows = await query<{ config: string[] | null }>(
      db,
      `select p.proconfig as config
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'dataset_entries_import_v3'`,
    );
    expect(rows).toHaveLength(1);
    // The stored value is `search_path=""` — the EMPTY path, quoted — not `search_path=`. Asserted
    // against what `pg_proc.proconfig` actually holds rather than against how the clause reads in
    // the migration file: the file and the catalogue normalise differently, and a guard written
    // from the file's spelling fails on a correct function.
    expect(rows[0]!.config ?? []).toEqual(['search_path=""']);
  });

  // ---------------------------------------------------------------------------------------------
  // Structural guards read off the ENGINE's copy of the statement.
  // ---------------------------------------------------------------------------------------------

  it("omits `instruction`, `source_payload`, and `created_at` from the update list the engine stored", async () => {
    // THE POINT OF A STRUCTURAL GUARD: a behavioural test cannot catch an ADDED column in the
    // update list, because adding `instruction = excluded.instruction` changes nothing the tests
    // above observe — every re-run they perform carries an identical instruction, so the update
    // would write the same bytes back. The immutability guarantee would be silently gone and every
    // test above would still pass. Only reading the statement sees it.
    //
    // The limit is stated: this is a scan of `pg_proc.prosrc`, the engine's stored source. It
    // proves a column name is absent from the `do update set` clause. It does not prove the clause
    // is reached at all — that is `pg_proc`'s business and the behavioural tests' — and it is not a
    // parse, so a column named inside a comment would be a false positive. Hence the count of
    // occurrences below, which is 1 for each mutable column and 0 for each immutable one.
    const body = await functionSource(db);

    // ── WHY THIS SLICE IS BOUNDED, WHICH IS THE NON-TRIVIAL PART ───────────────────────────────────
    // Slicing from `do update` to the `where` and no further. A slice running to the end of the
    // statement ALSO matches `where entries.instruction = excluded.instruction` — the guard's own
    // required second half — and would therefore report `instruction =` present on a correct
    // function. It did exactly that on this file's first run.
    //
    // The generalisation is the one this repository keeps re-learning in a new costume: a guard
    // that scans too much is a guard that cannot pass, and "it failed" gets read as "the code is
    // wrong" when the guard was. Both ends are located by the statement's OWN keywords, and the
    // `toBeLessThan` below fails loudly if either keyword is ever renamed rather than silently
    // producing an empty or unbounded slice.
    const updateStart = body.indexOf("do update");
    const guardStart = body.indexOf("where entries.instruction");
    expect(updateStart).toBeGreaterThan(-1);
    expect(guardStart).toBeGreaterThan(updateStart);

    const updateClause = body.slice(updateStart, guardStart);

    for (const mutable of [
      "category",
      "source_entry_id",
      "category_name",
      "origin",
      "destination",
      "transit_mode",
      "transit_modes",
      "is_active",
    ]) {
      expect(updateClause.match(new RegExp(`\\b${mutable}\\s*=`, "g"))).toHaveLength(1);
    }
    for (const immutable of ["instruction", "source_payload", "created_at"]) {
      expect(updateClause.match(new RegExp(`\\b${immutable}\\s*=`, "g"))).toBeNull();
    }
  });

  it("guards the conflict update with the instruction comparison that makes a divergence reachable", async () => {
    // Without the `where`, the conflict update would run unconditionally and the `v_outcome is
    // null` refusal would be unreachable — so the refusal test above would be asserting a fiction
    // that a removal of this clause turns into a silent overwrite.
    const body = await functionSource(db);
    expect(body).toMatch(/where\s+entries\.instruction\s*=\s*excluded\.instruction/i);
  });

  it("guards the conflict update on `id`, so a conflicting row is the same entry", async () => {
    const body = await functionSource(db);
    expect(body).toMatch(/on\s+conflict\s*\(\s*id\s*\)/i);
  });

  // ---------------------------------------------------------------------------------------------
  // The precondition, task 6.4.
  // ---------------------------------------------------------------------------------------------

  it("refuses to create the function against a database that has no `dataset_entries`", async () => {
    // A SEPARATE database, because the precondition cannot be observed in a migrated one: the
    // table exists there by definition.
    //
    // `applyMigrationsUntil`, NOT `applyMigrations` — the EXCLUSIVE boundary. Applying everything
    // would create the very function this test then asserts was not created, so the "nothing was
    // created" count would read 1 and mean nothing about the precondition. That is not a
    // hypothetical: this test did exactly that on its first run, and the precondition fired
    // correctly while the count beside it failed. A guard whose subject is polluted by its own
    // setup measures the setup, not the thing under test.
    const bare = await createTestDatabase();
    try {
      await applyMigrationsUntil(bare, IMPORT_MIGRATION);
      // The five predecessors are applied, so the table EXISTS; drop it again, which is the state a
      // mis-targeted deployment produces — the function migration landing on a project without the
      // research schema.
      await applySql(bare, "drop table public.dataset_entries cascade", "drop dataset_entries");

      const sql = (await readMigrations()).find((m) => m.filename === IMPORT_MIGRATION)!.sql;
      const failure = await execFailure(bare, sql);
      expect(failure).toContain("dataset_entries_import precondition failed");
      expect(failure).toContain("does not exist");

      // Nothing was created — the point of a precondition is that it stops rather than half-applying.
      const created = await query<{ count: number }>(
        bare,
        `select count(*)::int as count from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'dataset_entries_import'`,
      );
      expect(created[0]!.count).toBe(0);
    } finally {
      await closeTestDatabase(bare);
    }
  });

  it("applies cleanly once `dataset_entries` is present, so the precondition is a CONDITION and not a blanket refusal", async () => {
    // THE NEGATIVE CONTROL, and without it the test above proves only that the file refuses
    // SOMETHING. A precondition that fired on a correct schema too would satisfy that test
    // completely, and the only way to tell the two apart is to apply the same file to a database
    // where its condition holds.
    const bare = await createTestDatabase();
    try {
      await applyMigrationsUntil(bare, IMPORT_MIGRATION);
      const sql = (await readMigrations()).find((m) => m.filename === IMPORT_MIGRATION)!.sql;

      expect(await execFailure(bare, sql)).toBe("");

      const created = await query<{ count: number }>(
        bare,
        `select count(*)::int as count from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'dataset_entries_import'`,
      );
      expect(created[0]!.count).toBe(1);
    } finally {
      await closeTestDatabase(bare);
    }
  });

  it("records the precondition's refusal in the migration file, so the guarantee is in the artefact", async () => {
    // Structural, and the limit is the same as every other textual guard here: it proves the
    // string is present. It is here because the alternative — a refusal that exists only in this
    // test — would leave a mis-targeted deployment with no explanation, which is the specific
    // value the earlier `ADD CONSTRAINT` precondition in this repository was measured to add.
    const sql = (await readMigrations()).find((m) => m.filename === IMPORT_MIGRATION)!.sql;
    expect(sql).toContain("dataset_entries_import precondition failed");
  });

  // ---------------------------------------------------------------------------------------------
  // The guard migration: the corrected precondition, task 6.4 repaired.
  // ---------------------------------------------------------------------------------------------
  //
  // `20261003120000_dataset_entries_import.sql` carries a precondition whose column arm and
  // primary-key arm CANNOT FIRE in the states they name — `not exists (... in (nine columns))`
  // is true only when zero of the nine match, and `contype = 'p'` asks "any primary key?" rather
  // than "the key on `id`?". That file is applied and therefore immutable history, so the
  // correction is forward-only, in `20261004120000_dataset_entries_import_guard.sql`. Every test
  // below puts a database into the state an arm names and asks whether it fires — the control
  // first, so a harness that cannot report a pass is caught before any probe is trusted.
  describe("the import guard migration", () => {
    const guardSql = async (): Promise<string> =>
      (await readMigrations()).find((m) => m.filename === GUARD_MIGRATION)!.sql;

    async function guardedDatabase(): Promise<TestDatabase> {
      // Every predecessor INCLUDING the import migration, so the database under test holds the
      // function this guard checks for. `applyMigrationsUntil` stops BEFORE the named file, which
      // is the guard itself here.
      const bare = await createTestDatabase();
      await applyMigrationsUntil(bare, GUARD_MIGRATION);
      return bare;
    }

    it("applies cleanly to a correct schema, so the guard is a CONDITION and not a blanket refusal", async () => {
      // THE NEGATIVE CONTROL. Without it, every refusal below proves only that the file refuses
      // SOMETHING — a guard that fired on a correct schema too would satisfy all of them, and the
      // only way to tell the two apart is to run the same file where its condition holds.
      const bare = await guardedDatabase();
      try {
        expect(await execFailure(bare, await guardSql())).toBe("");
      } finally {
        await closeTestDatabase(bare);
      }
    });

    it("refuses when a column is missing, and NAMES it", async () => {
      // The arm the old file could not fire: `source_payload` is gone, the other eight remain, and
      // the old `not exists (... in (...))` form would have applied cleanly here. The refusal must
      // name the column, because "a column is missing" without a name sends the operator to go and
      // find out, which is the whole value of failing fast.
      const bare = await guardedDatabase();
      try {
        await applySql(
          bare,
          "alter table public.dataset_entries drop column source_payload",
          "drop source_payload",
        );

        const failure = await execFailure(bare, await guardSql());
        expect(failure).toContain("dataset_entries_import guard failed");
        expect(failure).toContain("source_payload");
      } finally {
        await closeTestDatabase(bare);
      }
    });

    it("refuses when the primary key is on the wrong column, and NAMES the actual key", async () => {
      // The second arm the old file could not fire: a primary key EXISTS, so `contype = 'p'`
      // passes, but it is on `category` rather than `id` and `on conflict (id)` has no arbiter.
      // `cascade` is required because two foreign keys point at this key; dropping them in a test
      // database that is about to be closed is the state under test, not collateral damage.
      const bare = await guardedDatabase();
      try {
        await applySql(
          bare,
          "alter table public.dataset_entries drop constraint dataset_entries_pkey cascade",
          "drop the id primary key",
        );
        await applySql(
          bare,
          "alter table public.dataset_entries add primary key (category)",
          "re-key on category",
        );

        const failure = await execFailure(bare, await guardSql());
        expect(failure).toContain("dataset_entries_import guard failed");
        expect(failure).toContain("category");
      } finally {
        await closeTestDatabase(bare);
      }
    });

    it("refuses when there is no primary key at all", async () => {
      // The one arm of the old file that DID fire, kept here so the guard is whole: three arms in
      // the artefact, three behavioural tests, no arm resting on a substring.
      const bare = await guardedDatabase();
      try {
        await applySql(
          bare,
          "alter table public.dataset_entries drop constraint dataset_entries_pkey cascade",
          "drop the id primary key",
        );

        const failure = await execFailure(bare, await guardSql());
        expect(failure).toContain("dataset_entries_import guard failed");
        expect(failure).toContain("no primary key");
      } finally {
        await closeTestDatabase(bare);
      }
    });

    it("refuses when the table itself is absent", async () => {
      const bare = await guardedDatabase();
      try {
        await applySql(bare, "drop table public.dataset_entries cascade", "drop dataset_entries");

        const failure = await execFailure(bare, await guardSql());
        expect(failure).toContain("dataset_entries_import guard failed");
        expect(failure).toContain("does not exist");
      } finally {
        await closeTestDatabase(bare);
      }
    });

    it("refuses when the function it guards is absent", async () => {
      // "The table is right" and "the function is deployed" are different facts, and the guard is
      // the last file that can check both together. Dropping the function with its full signature,
      // so there is no ambiguity about which overload is meant.
      const bare = await guardedDatabase();
      try {
        await applySql(
          bare,
          "drop function public.dataset_entries_import(text, text, text, text, text, text, jsonb, boolean)",
          "drop the import function",
        );

        const failure = await execFailure(bare, await guardSql());
        expect(failure).toContain("dataset_entries_import guard failed");
        expect(failure).toContain("does not exist");
      } finally {
        await closeTestDatabase(bare);
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  // The provenance migration: columns, checks, and the versioned function.
  // ---------------------------------------------------------------------------------------------

  describe("the provenance migration", () => {
    it("adds the provenance columns without disturbing existing rows", async () => {
      const columns = await query<{ column_name: string; is_nullable: string }>(
        db,
        `select column_name, is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'dataset_entries'
            and column_name in ('source_entry_id', 'category_name')
          order by column_name`,
      );
      expect(columns.map((column) => column.column_name)).toEqual([
        "category_name",
        "source_entry_id",
      ]);
      // Nullable, so the migration applies over a table that already holds rows.
      expect(new Set(columns.map((column) => column.is_nullable))).toEqual(new Set(["YES"]));
    });

    it("rejects a source-local id outside 1..800 and a blank category name", async () => {
      for (const [column, value, check] of [
        ["source_entry_id", 0, "dataset_entries_source_entry_id_range"],
        ["source_entry_id", 801, "dataset_entries_source_entry_id_range"],
        ["category_name", "   ", "dataset_entries_category_name_not_blank"],
      ] as const) {
        const failure = await rawFailure(
          db,
          `insert into public.dataset_entries (id, category, ${column}, instruction, source_payload) values ('PROV_${column}_${String(value).trim()}', 'origin_destination', $1, 'Provenance check.', '{}'::jsonb)`,
          [value] as never[],
        );
        expect(failure, `${column} = ${JSON.stringify(value)}`).toContain(check);
      }
    });

    it("accepts the full revised suffix range at both ends", async () => {
      for (const value of [1, 600, 800]) {
        const failure = await rawFailure(
          db,
          `insert into public.dataset_entries (id, category, source_entry_id, instruction, source_payload) values ('PROV_edge_${value}', 'origin_destination', $1, 'Provenance check.', '{}'::jsonb)`,
          [value] as never[],
        );
        expect(failure, `source_entry_id = ${value}`).toBe("");
      }
      await applySql(
        db,
        "delete from public.dataset_entries where id like 'PROV_edge_%'",
        "clean edges",
      );
    });

    it("applies cleanly to a correct schema, so its precondition is a CONDITION", async () => {
      const bare = await createTestDatabase();
      try {
        await applyMigrationsUntil(bare, PROVENANCE_MIGRATION);
        const sql = (await readMigrations()).find((m) => m.filename === PROVENANCE_MIGRATION)!.sql;
        expect(await execFailure(bare, sql)).toBe("");
      } finally {
        await closeTestDatabase(bare);
      }
    });

    it("refuses against a database with no `dataset_entries`, creating nothing", async () => {
      const bare = await createTestDatabase();
      try {
        await applyMigrationsUntil(bare, PROVENANCE_MIGRATION);
        await applySql(bare, "drop table public.dataset_entries cascade", "drop dataset_entries");
        const sql = (await readMigrations()).find((m) => m.filename === PROVENANCE_MIGRATION)!.sql;

        const failure = await execFailure(bare, sql);
        expect(failure).toContain("merged_dataset_provenance precondition failed");
        expect(failure).toContain("does not exist");
      } finally {
        await closeTestDatabase(bare);
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  // The Double Transit Mode migration: pair column, CHECKs, and the versioned v3 function.
  // ---------------------------------------------------------------------------------------------

  describe("the double_transit_mode migration", () => {
    const PAIR_MIGRATION = "20261007120000_double_transit_mode.sql";

    it("adds the nullable pair column without disturbing existing rows", async () => {
      const columns = await query<{ column_name: string; is_nullable: string }>(
        db,
        `select column_name, is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'dataset_entries'
            and column_name = 'transit_modes'`,
      );
      expect(columns.map((column) => column.column_name)).toEqual(["transit_modes"]);
      expect(new Set(columns.map((column) => column.is_nullable))).toEqual(new Set(["YES"]));
    });

    it("declares the three pair CHECKs under stable names", async () => {
      const rows = await query<{ name: string }>(
        db,
        `select conname as name from pg_constraint
          where conrelid = 'public.dataset_entries'::regclass
            and conname like 'dataset_entries_transit_%'
          order by conname`,
      );
      expect(rows.map((row) => row.name)).toEqual([
        "dataset_entries_transit_mode_pair_absent",
        "dataset_entries_transit_modes_pair_required",
        "dataset_entries_transit_modes_pair_shape",
        "dataset_entries_transit_modes_scalar_absent",
      ]);
    });

    it("stores a Double Transit Mode pair ordered through the production sink", async () => {
      const { entries } = parsedEntries();
      const dtm = entries.filter((entry) => entry.category === "double_transit_mode");
      expect(dtm).toHaveLength(800);

      const first = dtm[0]!;
      expect(first.id).toBe("DTM_1");
      expect(await sinkFor().upsert(first)).toBe("inserted");

      const stored = await query<{ transit_mode: string | null; transit_modes: string[] | null }>(
        db,
        "select transit_mode, transit_modes from public.dataset_entries where id = $1",
        [first.id],
      );
      expect(stored[0]!.transit_mode).toBe(null);
      expect(stored[0]!.transit_modes).toEqual(["jeepney", "walking"]);
    });

    it("refuses a malformed pair by the named shape CHECK", async () => {
      for (const [modes, check] of [
        [["walking"], "dataset_entries_transit_modes_pair_shape"],
        [["walking", "jeepney", "taxi"], "dataset_entries_transit_modes_pair_shape"],
        [["walking", "walking"], "dataset_entries_transit_modes_pair_shape"],
        [["bus", "taxi"], "dataset_entries_transit_modes_pair_shape"],
      ] as const) {
        const failure = await rawFailure(
          db,
          `insert into public.dataset_entries (id, category, transit_modes, instruction, source_payload) values ($1, 'double_transit_mode', $2, 'Pair shape check.', '{}'::jsonb)`,
          [`PROV_pair_${modes.join("_")}`, modes] as never[],
        );
        expect(failure, JSON.stringify(modes)).toContain(check);
      }
      await applySql(
        db,
        "delete from public.dataset_entries where id like 'PROV_pair_%'",
        "clean pairs",
      );
    });

    it("refuses a Double Transit Mode row with no pair at all", async () => {
      const failure = await rawFailure(
        db,
        `insert into public.dataset_entries (id, category, instruction, source_payload) values ('PROV_pair_missing', 'double_transit_mode', 'Pair required check.', '{}'::jsonb)`,
      );
      expect(failure).toContain("dataset_entries_transit_modes_pair_required");
      await applySql(
        db,
        "delete from public.dataset_entries where id = 'PROV_pair_missing'",
        "clean missing",
      );
    });

    it("refuses a scalar mode on a Double Transit Mode row and a pair on a scalar row", async () => {
      const scalarOnPair = await rawFailure(
        db,
        `insert into public.dataset_entries (id, category, transit_mode, instruction, source_payload) values ('PROV_scalar_on_pair', 'double_transit_mode', 'walking', 'Pair absent check.', '{}'::jsonb)`,
      );
      expect(scalarOnPair).toContain("dataset_entries_transit_mode_pair_absent");

      const pairOnScalar = await rawFailure(
        db,
        `insert into public.dataset_entries (id, category, transit_modes, instruction, source_payload) values ('PROV_pair_on_scalar', 'origin_destination', array['jeepney','walking'], 'Pair absent check.', '{}'::jsonb)`,
      );
      expect(pairOnScalar).toContain("dataset_entries_transit_modes_scalar_absent");

      await applySql(
        db,
        "delete from public.dataset_entries where id like 'PROV_%_on_%'",
        "clean cross",
      );
    });

    it("refuses to EXECUTE v3 for `anon` and `authenticated`, and grants it to `service_role`", async () => {
      for (const role of ["anon", "authenticated"] as const) {
        const failure = await asRoleFailure(
          db,
          role,
          `select public.dataset_entries_import_v3('DTM_1', 'double_transit_mode', 1, 'Double Transit Mode', 'x', null, 'Abanao Square', null, array['jeepney','walking'], '{}'::jsonb, true)`,
        );
        expect(failure).toMatch(/permission denied/i);
      }
      const rows = await query<{ has_service_role: boolean; prosecdef: boolean }>(
        db,
        `select
           has_function_privilege('service_role', '${FUNCTION_SIGNATURE}', 'execute') as has_service_role,
           p.prosecdef as prosecdef
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'dataset_entries_import_v3'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.has_service_role).toBe(true);
      expect(rows[0]!.prosecdef).toBe(false);
    });

    it("applies cleanly to a correct schema and converges on re-run", async () => {
      const bare = await createTestDatabase();
      try {
        await applyMigrationsUntil(bare, PAIR_MIGRATION);
        const sql = (await readMigrations()).find((m) => m.filename === PAIR_MIGRATION)!.sql;
        expect(await execFailure(bare, sql)).toBe("");
        expect(await execFailure(bare, sql)).toBe("");
      } finally {
        await closeTestDatabase(bare);
      }
    });

    it("refuses against a database with no `dataset_entries`, creating nothing", async () => {
      const bare = await createTestDatabase();
      try {
        await applyMigrationsUntil(bare, PAIR_MIGRATION);
        await applySql(bare, "drop table public.dataset_entries cascade", "drop dataset_entries");
        const sql = (await readMigrations()).find((m) => m.filename === PAIR_MIGRATION)!.sql;

        const failure = await execFailure(bare, sql);
        expect(failure).toContain("double_transit_mode precondition failed");
        expect(failure).toContain("does not exist");
      } finally {
        await closeTestDatabase(bare);
      }
    });
  });

  // ---------------------------------------------------------------------------------------------
  // The range-800 migration: the same constraint name, widened to the revised corpus.
  // ---------------------------------------------------------------------------------------------

  describe("the source_entry_id range-800 migration", () => {
    const RANGE_MIGRATION = "20261006120000_source_entry_id_range_800.sql";

    it("replaces the expression while keeping the constraint name", async () => {
      const rows = await query<{ check: string }>(
        db,
        `select pg_get_constraintdef(oid) as check from pg_constraint where conname = 'dataset_entries_source_entry_id_range'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.check).toContain("800");
      expect(rows[0]!.check).not.toContain("600");
    });

    it("creates the v3 function beside v1 and v2 and changes no earlier function", async () => {
      const rows = await query<{ name: string }>(
        db,
        `select p.proname as name from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname like 'dataset_entries_import%'
          order by p.proname`,
      );
      expect(rows.map((row) => row.name)).toEqual([
        "dataset_entries_import",
        "dataset_entries_import_v2",
        "dataset_entries_import_v3",
      ]);
    });

    it("applies cleanly to a correct schema and converges on re-run", async () => {
      const bare = await createTestDatabase();
      try {
        await applyMigrationsUntil(bare, RANGE_MIGRATION);
        const sql = (await readMigrations()).find((m) => m.filename === RANGE_MIGRATION)!.sql;
        // First application: replaces the 1..600 expression.
        expect(await execFailure(bare, sql)).toBe("");
        // Second application: converges rather than erroring on its own constraint.
        expect(await execFailure(bare, sql)).toBe("");
      } finally {
        await closeTestDatabase(bare);
      }
    });

    it("refuses against a database with no `dataset_entries`", async () => {
      const bare = await createTestDatabase();
      try {
        await applyMigrationsUntil(bare, RANGE_MIGRATION);
        await applySql(bare, "drop table public.dataset_entries cascade", "drop dataset_entries");
        const sql = (await readMigrations()).find((m) => m.filename === RANGE_MIGRATION)!.sql;

        const failure = await execFailure(bare, sql);
        expect(failure).toContain("source_entry_id_range_800 precondition failed");
        expect(failure).toContain("does not exist");
      } finally {
        await closeTestDatabase(bare);
      }
    });
  });
});

/** The engine's stored source for the function, from `pg_proc`. */
async function functionSource(db: TestDatabase): Promise<string> {
  const rows = await query<{ prosrc: string }>(
    db,
    `select p.prosrc as prosrc
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'dataset_entries_import_v3'`,
  );
  expect(rows).toHaveLength(1);
  return rows[0]!.prosrc;
}

/** The engine's error message for a statement that raised, or `null` when it succeeded. */
async function rawFailure(
  executor: QueryExecutor,
  sql: string,
  params: readonly unknown[] = [],
): Promise<string> {
  try {
    await executor.query(sql, params as never[]);
    return "";
  } catch (cause) {
    return (cause as Error).message;
  }
}

/**
 * The engine's error message for a MULTI-STATEMENT script, or `null` when every statement ran.
 *
 * A separate helper from `rawFailure` because PGlite's `query` is prepared-statement mode and
 * refuses a second command with `cannot insert multiple commands into a prepared statement`. A
 * migration file is a script, so running one through `query` fails on the PROTOCOL rather than on
 * the precondition, and the resulting message contains nothing about the precondition at all. That
 * is a harness failure that reads exactly like a finding: on this file's first run it reported the
 * precondition as not firing, when in truth the file was never executed past its first statement.
 *
 * `exec` is the only path that runs a script, and it is also what `applyMigrations` uses — so the
 * statement that fires here is the same one a real deployment would run.
 */
async function execFailure(db: TestDatabase, sql: string): Promise<string> {
  try {
    await db.exec(sql);
    return "";
  } catch (cause) {
    return (cause as Error).message;
  }
}

/** The engine's error message for a statement run as `role`, or `null` when it succeeded. */
async function asRoleFailure(
  db: TestDatabase,
  role: "anon" | "authenticated" | "service_role",
  sql: string,
): Promise<string> {
  let message = "";
  await db.transaction(async (tx) => {
    await tx.query(`set local role ${role}`);
    message = await rawFailure(tx, sql);
  });
  return message;
}
