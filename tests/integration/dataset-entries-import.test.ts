/**
 * The dataset-entry import FUNCTION, against a real PostgreSQL engine, from the production
 * migrations directory.
 *
 * WHY THIS FILE IS NOT A RESTATEMENT OF `dataset-import.test.ts`
 * -------------------------------------------------------------
 * That file already proves the importer writes all 600 records correctly, but it proves it through a
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

const SOURCE_PATH = path.resolve(process.cwd(), "data", "ilocano-synthetic-data.json");
const IMPORT_MIGRATION = "20261003120000_dataset_entries_import.sql";
const GUARD_MIGRATION = "20261004120000_dataset_entries_import_guard.sql";

/**
 * The eight parameters, in the migration's own declaration order.
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
  "p_instruction",
  "p_origin",
  "p_destination",
  "p_transit_mode",
  "p_source_payload",
  "p_is_active",
] as const;

const FUNCTION_SIGNATURE =
  "public.dataset_entries_import(text, text, text, text, text, text, jsonb, boolean)";

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

/**
 * A `SupabaseRpcClientLike` over PGlite.
 *
 * Maps `rpc(fn, args)` onto a positional `select public.fn($1, …, $8)`, which is what PostgREST
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
      if (fn !== "dataset_entries_import") {
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
        const result = await executor.query<{ dataset_entries_import: string }>(
          `select public.dataset_entries_import($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
          [
            args.p_id as string,
            args.p_category as string,
            args.p_instruction as string,
            args.p_origin as string | null,
            args.p_destination as string | null,
            args.p_transit_mode as string | null,
            JSON.stringify(args.p_source_payload),
            args.p_is_active as boolean,
          ] as never[],
        );
        return { data: result.rows[0]?.dataset_entries_import ?? null, error: null };
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
        origin: "A DIFFERENT ORIGIN",
        destination: "A DIFFERENT DESTINATION",
        transitMode: "a-different-mode",
      }),
    ).toBe("updated");

    const after = await query<{
      instruction: string;
      source_payload: Record<string, unknown>;
      created_at: string;
      origin: string | null;
    }>(db, CREATED_AT_AS_EPOCH_TEXT, [entry.id]);

    // The three immutable columns are byte-identical.
    expect(after[0]!.instruction).toBe(before[0]!.instruction);
    expect(after[0]!.created_at).toBe(before[0]!.created_at);
    expect(after[0]!.source_payload).toEqual(before[0]!.source_payload);
    // And the mutable one really did change, so the three assertions above are not vacuous: they
    // would pass on a function that updated nothing at all.
    expect(after[0]!.origin).toBe("A DIFFERENT ORIGIN");
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
      `select public.dataset_entries_import($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
      [
        entry.id,
        entry.category,
        DIVERGENT,
        entry.origin,
        entry.destination,
        entry.transitMode,
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
  // All 600 records through the PRODUCTION sink. Task 6.2.
  // ---------------------------------------------------------------------------------------------

  it("imports all 600 records through the production sink with every instruction byte-identical", async () => {
    const { entries, report } = parsedEntries();
    expect(entries.length).toBe(600);

    const result = await importDatasetEntries(entries, sinkFor(), report);
    expect(result).toMatchObject({ parsed: 600, inserted: 600, updated: 0 });

    const stored = await query<{ id: string; instruction: string }>(
      db,
      "select id, instruction from public.dataset_entries order by id",
    );

    // Read the SOURCE, not the parse, so this cannot pass by checking the import against
    // something the import produced.
    const source = JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as {
      id: string;
      instruction: string;
    }[];

    expect(stored).toHaveLength(600);
    expect(stored.map((row) => row.id)).toEqual(source.map((record) => record.id).sort());
    for (const [index, row] of stored.entries()) {
      expect(row.instruction).toBe(source[index]!.instruction);
    }
  });

  it("leaves all 600 rows byte-identical on a second run, reporting 0 inserted / 600 updated", async () => {
    const { entries, report } = parsedEntries();

    await importDatasetEntries(entries, sinkFor(), report);

    const first = await query<{ id: string; instruction: string; created_at: string }>(
      db,
      "select id, instruction, created_at from public.dataset_entries order by id",
    );

    const second = await importDatasetEntries(entries, sinkFor(), report);
    expect(second).toMatchObject({ parsed: 600, inserted: 0, updated: 600 });

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
        `select public.dataset_entries_import('OD_0001', 'origin_destination', 'x', null, null, null, '{}'::jsonb, true)`,
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
       where n.nspname = 'public' and p.proname = 'dataset_entries_import'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]!.has_service_role).toBe(true);
    expect(rows[0]!.has_public).toBe(false);
  });

  it("is SECURITY INVOKER, because a definer function would let `anon` write arbitrary rows", async () => {
    const rows = await query<{ prosecdef: boolean }>(
      db,
      `select p.prosecdef as prosecdef
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'dataset_entries_import'`,
    );
    expect(rows[0]!.prosecdef).toBe(false);
  });

  it("resolves nothing through a writable `search_path`", async () => {
    const rows = await query<{ config: string[] | null }>(
      db,
      `select p.proconfig as config
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'dataset_entries_import'`,
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

    for (const mutable of ["category", "origin", "destination", "transit_mode", "is_active"]) {
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
});

/** The engine's stored source for the function, from `pg_proc`. */
async function functionSource(db: TestDatabase): Promise<string> {
  const rows = await query<{ prosrc: string }>(
    db,
    `select p.prosrc as prosrc
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'dataset_entries_import'`,
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
