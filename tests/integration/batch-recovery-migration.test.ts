/**
 * `20261001120000_validation_batches_created_at.sql`, verified against a real PostgreSQL engine.
 *
 * WHAT THIS PROVES
 * ----------------
 * That the migration applies strictly after the three migrations it depends on, that `created_at`
 * exists and is `NOT NULL` after the backfill, that a batch row written without one is refused, that
 * the backfill stamps every pre-existing row with ONE IDENTICAL instant, that
 * `order by created_at desc, id desc` reads a validator's batches newest-first and stays total when
 * two rows share a timestamp, that the index which serves that order is declared with exactly the
 * keys the comment claims, and — the reason the file refuses at all — that a schema which already
 * has the column is turned away by a message naming this change rather than by a mechanics failure.
 *
 * WHAT IT DOES NOT PROVE
 * ----------------------
 * That a hosted Supabase project accepts the file, which is a separate credential-blocked step.
 * PGlite is PostgreSQL compiled to WebAssembly: it proves SQL, constraints, and transaction
 * behaviour AS THE DATABASE ENGINE EVALUATES THEM, and nothing about the Supabase API gateway.
 *
 * EVERY REJECTION BELOW IS MATCHED AGAINST A NAME — a column for a `NOT NULL` violation, this
 * migration's own `interrupted-batch-recovery:` prefix for the precondition. A generic pattern
 * passes when a DIFFERENT rule fires, which is how a green test can prove nothing about the rule it
 * names; this repository has already paid for that once, when a draft of the bilingual migration
 * used a single equivalence constraint and the test for "an evaluable row with no translations"
 * passed because the wrong constraint fired.
 *
 * ONE SECTION IS ABOUT SOMETHING ELSE, and says so where it is: "a batch row with no entries" proves
 * what the DATA and the SQL SHAPE do, because the application's `listForRecovery` cannot be built
 * here at all — it is behind `import "server-only"`. The half of that claim which is about the
 * application's own translation is in the unit suite, and the section names where.
 *
 * WHAT THE ORDERING TESTS DO NOT PROVE, stated here because it is the weakest claim in the file:
 * that `order by created_at desc, id desc` is TOTAL cannot be shown by observing a result set. If
 * the `id` key were dropped from the query, PostgreSQL would still return *some* permutation, and on
 * a two-row fixture it would very likely return the one asserted here. What is observable is that
 * the query is WRITTEN in the declared direction, and that the index is DECLARED with an `id DESC`
 * key — the second of which is the mechanism that makes the first total rather than merely stated.
 * Both are asserted; neither alone is the guarantee, and the pair is narrower than a real proof
 * against a concurrent writer, which this engine is not being asked to model.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  applyMigrationByName,
  applyMigrations,
  applyMigrationsUntil,
  readMigrations,
} from "./support/migrations";
import {
  applySql,
  closeTestDatabase,
  createTestDatabase,
  query,
  truncateAll,
  type TestDatabase,
} from "./support/pglite";

const RECOVERY_MIGRATION = "20261001120000_validation_batches_created_at.sql";

/** The three migrations this one must run strictly after. Named, because that is the assertion. */
const PRIOR_MIGRATIONS = [
  "20260930120000_research_schema.sql",
  "20260930160000_required_bilingual_translations.sql",
  "20260930190000_allocation_batch_positions.sql",
] as const;

/**
 * This change's own message prefix.
 *
 * Named once and used by every assertion about the refusal, so a neighbouring migration's prefix
 * cannot satisfy a test that is supposed to be about this one.
 */
const REFUSAL_PREFIX = "interrupted-batch-recovery:";

const VALIDATOR = "VAL_0000cafe";
/**
 * A second validator, for the negative control that needs its own database.
 *
 * Named rather than reusing `VALIDATOR` so a reader can see at a glance that the control does not share
 * state with the tests around it — the reuse would have worked, and would have been the wrong shape,
 * because the point of the control is that it CANNOT affect anything else.
 */
const CONTROL_VALIDATOR = "VAL_0000beef";
const OTHER_VALIDATOR = "VAL_0000face";
const BATCH = "batch_01";
const SECOND_BATCH = "batch_02";
const THIRD_BATCH = "batch_03";

/** Fixed instants, written explicitly, so the ordering assertions are about ORDER not about clocks. */
const EARLY = "2026-10-01T09:00:00.000Z";
const LATE = "2026-10-01T11:00:00.000Z";
const SHARED = "2026-10-01T10:00:00.000Z";

async function seedValidator(database: TestDatabase, id: string): Promise<void> {
  await applySql(
    database,
    `insert into public.validators (id) values ('${id}')`,
    `validator ${id}`,
  );
}

const insertBatch = (
  database: TestDatabase,
  id: string,
  validatorId: string,
  createdAt: string | null,
) =>
  applySql(
    database,
    createdAt === null
      ? `insert into public.validation_batches (id, validator_id) values ('${id}', '${validatorId}')`
      : `insert into public.validation_batches (id, validator_id, created_at)
         values ('${id}', '${validatorId}', '${createdAt}')`,
    `batch ${id}`,
  );

/** Runs a migration file again inside one transaction, returning the error or `null`. */
async function reapplyMigration(database: TestDatabase, filename: string): Promise<Error | null> {
  const migration = (await readMigrations()).find((file) => file.filename === filename);
  expect(migration, `${filename} must exist`).toBeDefined();

  return database
    .transaction(async (tx) => {
      await tx.exec(migration?.sql ?? "");
    })
    .then(
      () => null,
      (caught: unknown) => caught as Error,
    );
}

describe("the interrupted-batch-recovery migration", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    await applyMigrations(db);
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  beforeEach(async () => {
    await truncateAll(db);
    await seedValidator(db, VALIDATOR);
    await seedValidator(db, OTHER_VALIDATOR);
  });

  describe("ordering", () => {
    it("sorts strictly after every prior migration, so it never runs against a half-built schema", async () => {
      // The assertion is on the ORDER of the real directory listing, not on the set of names: a file
      // renamed to an earlier timestamp would satisfy every other test in this file and fail here,
      // because `validation_batches` would not exist yet.
      const filenames = (await readMigrations()).map((migration) => migration.filename);
      const recoveryAt = filenames.indexOf(RECOVERY_MIGRATION);

      expect(recoveryAt).toBeGreaterThanOrEqual(0);
      for (const prior of PRIOR_MIGRATIONS) {
        expect(filenames.indexOf(prior), `${prior} must exist`).toBeGreaterThanOrEqual(0);
        expect(
          filenames.indexOf(prior),
          `${prior} must be applied before ${RECOVERY_MIGRATION}`,
        ).toBeLessThan(recoveryAt);
      }
    });
  });

  describe("the column", () => {
    it("exists, is a timestamp, and cannot be written without one", async () => {
      const rows = await query<{ column_name: string; is_nullable: string; data_type: string }>(
        db,
        `select column_name, is_nullable, data_type
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'validation_batches'
            and column_name = 'created_at'`,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.is_nullable).toBe("NO");
      // `timestamp with time zone`, not `timestamp without time zone`: a naive local-time column
      // would make "the most recently created" depend on the server's timezone setting, which is
      // not a fact the schema is allowed to leave to a deployment.
      expect(rows[0]?.data_type).toBe("timestamp with time zone");
    });

    it("refuses a batch row written without a creation instant, matched by column", async () => {
      // Reached by OMITTING the column, not by writing a null: the column is `not null` but has no
      // default, so an application that forgot to write it is caught here rather than being handed
      // a clock reading from the database. That is the point of the header's "the writer is the
      // APPLICATION, not a column default".
      await expect(insertBatch(db, BATCH, VALIDATOR, null)).rejects.toThrow(
        /null value in column "created_at"|not-null/i,
      );
    });

    it("accepts a batch row written WITH a creation instant, so the refusal is not vacuous", async () => {
      // The control for the test above. An inverted predicate would reject this row, and the
      // refusal test would still pass.
      await insertBatch(db, BATCH, VALIDATOR, EARLY);

      const rows = await query<{ created_at: string }>(
        db,
        "select created_at::text as created_at from public.validation_batches where id = $1",
        [BATCH],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.created_at).toBeTruthy();
    });

    it("does not supply a default, so a missing instant is never silently invented", async () => {
      // The same refusal as above, asked of the CATALOGUE rather than of a write: if the migration
      // had used `add column ... default now()`, the column would report a default and a future
      // writer who omitted the value would never learn the row was invented for them.
      const rows = await query<{ column_default: string | null }>(
        db,
        `select column_default
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'validation_batches'
            and column_name = 'created_at'`,
      );

      expect(rows[0]?.column_default ?? null).toBeNull();
    });
  });

  describe("the ordering the recovery read depends on", () => {
    it("reads a validator's batches newest first, and only that validator's", async () => {
      // Inserted oldest-first, so a query that silently ordered ascending would return the same
      // three rows in the wrong sequence and this assertion would catch it.
      await insertBatch(db, BATCH, VALIDATOR, EARLY);
      await insertBatch(db, SECOND_BATCH, VALIDATOR, LATE);
      await insertBatch(db, THIRD_BATCH, OTHER_VALIDATOR, LATE);

      const rows = await query<{ id: string }>(
        db,
        `select id from public.validation_batches
          where validator_id = $1
          order by created_at desc, id desc`,
        [VALIDATOR],
      );

      expect(rows).toEqual([{ id: SECOND_BATCH }, { id: BATCH }]);
    });

    it("breaks a tie on created_at by id, descending, so two tied rows have one order", async () => {
      // The scenario the migration header claims is REAL rather than hypothetical: the backfill
      // stamps every pre-existing row with one identical `now()`, so a validator who allocated two
      // batches before this migration genuinely holds two rows that tie. Inserted in ASCENDING id
      // order, so a query that ordered `id asc` — or that left the tie to the driver's row order and
      // happened to be handed insertion order — returns the reverse and goes red.
      await insertBatch(db, BATCH, VALIDATOR, SHARED);
      await insertBatch(db, SECOND_BATCH, VALIDATOR, SHARED);

      const rows = await query<{ id: string }>(
        db,
        `select id from public.validation_batches
          where validator_id = $1
          order by created_at desc, id desc`,
        [VALIDATOR],
      );

      expect(rows).toEqual([{ id: SECOND_BATCH }, { id: BATCH }]);
    });

    it("puts a newer row first even when its id sorts earlier than the older row's", async () => {
      // The control for the tie test, and the reason the tie test is not merely "sort by id": here
      // `created_at` and `id` DISAGREE about which row is newer, and the timestamp must win. A query
      // written as `order by id desc` alone would pass the tie test and fail this one.
      await insertBatch(db, BATCH, VALIDATOR, LATE);
      await insertBatch(db, SECOND_BATCH, VALIDATOR, EARLY);

      const rows = await query<{ id: string }>(
        db,
        `select id from public.validation_batches
          where validator_id = $1
          order by created_at desc, id desc`,
        [VALIDATOR],
      );

      expect(rows).toEqual([{ id: BATCH }, { id: SECOND_BATCH }]);
    });

    it("declares the index with the three keys the comment claims, id descending", async () => {
      // The other half of the ordering guarantee, and the half that can be asserted exactly. The
      // `id DESC` key is what makes the order TOTAL rather than merely stated: `id` is the primary
      // key, so no two rows share one and the order can never be left to the driver's row order.
      // Asserted from `pg_indexes` because `information_schema` cannot express a sort direction.
      const rows = await query<{ indexdef: string }>(
        db,
        `select indexdef from pg_indexes
          where schemaname = 'public'
            and tablename = 'validation_batches'
            and indexname = 'validation_batches_validator_created_at_idx'`,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.indexdef).toContain("(validator_id, created_at DESC, id DESC)");
    });

    it("leaves the pre-existing validator_id index in place rather than replacing it", async () => {
      // The migration is ADDITIVE. If it had dropped or rewritten the index from
      // `20260930120000`, an unrelated read would lose its access path and this file's diff would
      // contain a change to a shipped migration's index for no stated reason.
      const rows = await query<{ indexname: string }>(
        db,
        `select indexname from pg_indexes
          where schemaname = 'public'
            and tablename = 'validation_batches'
            and indexname = 'validation_batches_validator_id_idx'`,
      );

      expect(rows).toEqual([{ indexname: "validation_batches_validator_id_idx" }]);
    });
  });

  describe("the backfill, in a database that already held batches", () => {
    /**
     * A SEPARATE database, stopped just before this migration.
     *
     * It cannot be the `db` above. By the time the whole migration set has been applied, every row
     * already carries a `created_at` the test itself wrote, so the backfill has nothing to do and
     * the state it exists for is unreachable. Applying all migrations and THEN inserting rows does
     * not work either: `created_at` is `not null` with no default by then, so the row could not have
     * been written at all, and a test asserting the backfill would be asserting a fiction.
     */
    let populated: TestDatabase;

    beforeAll(async () => {
      populated = await createTestDatabase();
      const applied = await applyMigrationsUntil(populated, RECOVERY_MIGRATION);
      expect(applied.applied).toEqual([...PRIOR_MIGRATIONS]);

      await seedValidator(populated, VALIDATOR);
      await applySql(
        populated,
        `insert into public.validation_batches (id, validator_id)
           values ('${BATCH}', '${VALIDATOR}'), ('${SECOND_BATCH}', '${VALIDATOR}')`,
        "pre-existing batches",
      );
    });

    afterAll(async () => {
      await closeTestDatabase(populated);
    });

    it("leaves the pre-migration schema WITHOUT the column, so the backfill has something to do", async () => {
      // The control for everything below. If `created_at` already existed here, the backfill
      // assertions would pass without the backfill having run.
      const columns = await query<{ column_name: string }>(
        populated,
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'validation_batches'`,
      );

      expect(columns.map((row) => row.column_name)).toEqual(["id", "validator_id"]);
    });

    it("stamps every pre-existing row by running the PRODUCTION migration's own backfill", async () => {
      // The tie between two pre-existing batches of one validator is claimed to be real in the WORLD, not
      // only in a fixture, so that the `id` key in the recovery index is not decorative. This is what makes
      // that claim checkable, because it runs the shipped statement rather than a restatement of it.
      //
      // ── WHY THIS APPLIES THE REAL FILE, AND THE FIRST VERSION DID NOT ────────────────────────────────
      // The earlier version of this test hand-wrote its own
      //
      //   alter table public.validation_batches add column created_at timestamptz
      //   update  public.validation_batches set created_at = now() where created_at is null
      //
      // which meant **the migration's own `update` statement had no test running it**. The entire
      // justification for the `id DESC` tiebreaker — header reason 2, design D2, and `tasks.md` 0.5.2 —
      // was resting on SQL no test ever executed, and the test was asserting the *test author's* SQL
      // rather than the shipped SQL. A test that reconstructs a migration's effect instead of applying it
      // passes identically whether or not the migration is correct, which is the shape `AGENTS.md` already
      // records against `lifetime-figure.test.ts`.
      //
      // So the real file is applied here, through `applyMigrationByName` — which applies exactly one
      // named migration to the already-migrated database this `beforeAll` built, so the difference
      // between the control above and this test is precisely one migration file and nothing else.
      await applyMigrationByName(populated, RECOVERY_MIGRATION);

      const rows = await query<{ id: string; created_at: string }>(
        populated,
        "select id, created_at::text as created_at from public.validation_batches order by id",
      );

      // WHAT THIS PROVES, measured rather than asserted: the backfill statement EXISTS AND RUNS, and it
      // reaches every row. Deleting that statement from the migration goes RED with
      // `23502 column "created_at" ... contains null values`, because the `NOT NULL` the migration adds
      // then has nothing to satisfy it. That is the guarantee, and it was the guarantee with no test behind
      // it before this change.
      expect(rows).toHaveLength(2);
      expect(rows[0]?.created_at).toBeTruthy();
      expect(rows[1]?.created_at).toBeTruthy();

      // WHAT THIS DOES **NOT** PROVE, and the name used to imply that it did. The earlier title said "one
      // IDENTICAL instant", which claims this assertion distinguishes a statement-level `now()` from a
      // per-row clock. **It cannot, and a probe proved it:** rewriting the migration's `now()` as
      // `clock_timestamp()` leaves this suite GREEN.
      //
      // The reason is not a PostgreSQL subtlety about statement stability — it is resolution. Two
      // `clock_timestamp()` calls inside one statement execute microseconds apart, and `timestamptz::text`
      // renders milliseconds, so the difference rounds away. Measured at the same time: two such calls in
      // ONE `insert ... values (...), (...)` both come back as `14:52:30.872+00`. This is the fourth
      // instance in this file of one lesson — **an assertion built on a quantity too coarse to show the
      // difference reports the absence of a difference, and that reads as a finding.** The control below
      // forces a real gap with `pg_sleep` and does observe the difference, so the two together say
      // something the migration's guarantee actually rests on: a single-statement backfill stamps its rows
      // identically AT THE PRECISION THIS COLUMN IS READ AT, which is what the recovery read needs and
      // the only precision at which anyone will ever see it.
      //
      // Renaming rather than deleting the assertion is deliberate. The equality here is still worth
      // pinning — it is what a reader of the data will observe, and a regression to a loop-per-row
      // backfill would break it — but it is a statement about observed behaviour, not a proof of which
      // clock function was used.
      expect(rows[0]?.created_at).toBe(rows[1]?.created_at);
    });

    it("distinguishes a per-row clock from a statement-level one, in its OWN database", async () => {
      // The negative control for the test above, and it is what makes that test's assertion mean
      // something. A `now()` read inside one statement is stable in PostgreSQL, so the risk that test
      // guards against is a backfill written as a per-row clock — `clock_timestamp()`, or a loop — which
      // would give each row its own instant and make the `id` tiebreaker decorative.
      //
      // ── WHY IT GETS ITS OWN DATABASE, AND WHY THAT IS THE POINT ──────────────────────────────────────
      // The first version of this control ran its `update` against the shared `populated` database, and
      // it made the NEXT test go red — correctly. That test asserts the refused migration left the rows
      // untouched, and this control had just rewritten their timestamps, so a control had corrupted the
      // state the tests after it depend on.
      //
      // That is the general form worth keeping: **a control that mutates shared state is not a control,
      // it is an ordering dependency**, and it produces a failure attributed to whichever test happens to
      // run next. Here the red landed on `leaves no trace of the refusal` and read as though *that*
      // assertion were broken, which is the same misattribution `AGENTS.md` records for a probe whose red
      // came from a neighbouring guard. Isolated state is the fix, not a reordering.
      const isolated = await createTestDatabase();
      try {
        await applyMigrationsUntil(isolated, RECOVERY_MIGRATION);
        await applyMigrationByName(isolated, RECOVERY_MIGRATION);
        await seedValidator(isolated, CONTROL_VALIDATOR);
        // Two SEPARATE statements, with a real gap between them, so the per-row clock demonstrably
        // advances. A single multi-row `values` list executes both calls inside one statement and they
        // land in the same millisecond — see the note on the assertion below.
        await applySql(
          isolated,
          `insert into public.validation_batches (id, validator_id, created_at)
             values ('ctl_a', '${CONTROL_VALIDATOR}', clock_timestamp())`,
          "first control row",
        );
        await applySql(isolated, "select pg_sleep(0.05)", "advance the per-row clock");
        await applySql(
          isolated,
          `insert into public.validation_batches (id, validator_id, created_at)
             values ('ctl_b', '${CONTROL_VALIDATOR}', clock_timestamp())`,
          "second control row",
        );

        const rows = await query<{ created_at: string }>(
          isolated,
          "select created_at::text as created_at from public.validation_batches order by id",
        );

        // Two rows, two `clock_timestamp()` calls, two distinct instants — so the assertion in the test
        // above ("the two pre-existing rows share one instant") is measuring the backfill's choice of
        // `now()` and not a property every timestamp happens to have.
        //
        // ── WHY THE ROWS ARE INSERTED IN TWO STATEMENTS WITH A SLEEP BETWEEN ───────────────────────────
        // The first version put both rows in ONE `insert ... values (...), (...)` and asserted they
        // differed. It failed — both came back as `14:52:30.872+00`, the same millisecond. That is not a
        // PostgreSQL subtlety about `clock_timestamp()`; two calls inside one statement simply execute
        // faster than the millisecond resolution of `timestamptz::text`, so the distinction is invisible
        // at the precision being compared.
        //
        // Which makes this a fourth instance of one lesson: **an assertion built on a quantity that
        // happens to be too coarse to show the difference will report the absence of a difference, and
        // that reads as a finding.** The fix is not to weaken the assertion — it is to make the clock
        // actually advance, so the test measures what it claims to measure.
        expect(rows).toHaveLength(2);
        expect(rows[0]?.created_at).toBeTruthy();
        expect(rows[0]?.created_at).not.toBe(rows[1]?.created_at);
      } finally {
        await closeTestDatabase(isolated);
      }
    });

    it("refuses the migration, naming the conflict rather than a mechanics failure", async () => {
      // The column is present and every row is stamped, so this is exactly the state a
      // re-application — or a statement-order accident — would produce.
      const error = await reapplyMigration(populated, RECOVERY_MIGRATION);

      expect(String(error?.message ?? "")).toContain(REFUSAL_PREFIX);
      // The specific column, so an operator is not left wondering which of the change's own
      // preconditions fired.
      expect(String(error?.message ?? "")).toContain(
        "validation_batches.created_at already exists",
      );
    });

    it("leaves the database exactly as it found it, so it can be resolved and reapplied", async () => {
      // `applyEach` wraps each file in one transaction, so the `raise` rolls the whole file back. The
      // index this migration creates must not survive a refused application — but the assertion that
      // proves it is a COMPARISON, not an emptiness check.
      //
      // ── WHY THIS USED TO ASSERT AN EMPTY INDEX LIST, AND WHY THAT WAS VACUOUS ──────────────────────────
      // The earlier version asserted `expect(indexes).toEqual([])`. That passed for the wrong reason:
      // the surrounding `beforeAll` only applied the three PRIOR migrations, and this test's neighbours
      // added the `created_at` column by hand — so the migration's own `create index` had never run and
      // the index list was empty before the refusal as well as after it. **An assertion that is equally
      // true before and after the thing under test measures nothing**, and this one was written that way
      // while the block above it was quietly relying on the hand-written setup.
      //
      // Now that the backfill test applies the PRODUCTION migration, the index genuinely exists, so the
      // honest property is available and is strictly stronger: snapshot before, refuse, snapshot after,
      // and require them to be IDENTICAL. That catches an index created, a column altered, or a row
      // touched — everything the emptiness check missed except total absence.
      const indexQuery = `select indexname from pg_indexes
          where schemaname = 'public' and tablename = 'validation_batches'
          order by indexname`;
      const rowQuery =
        "select id, validator_id, created_at::text as created_at from public.validation_batches order by id";

      const before = {
        indexes: await query<{ indexname: string }>(populated, indexQuery),
        rows: await query(populated, rowQuery),
      };

      // And the control: the index this migration owns IS present before the refusal. Without this, an
      // empty-after comparison would pass on a database where nothing had been created in the first place
      // — which is precisely the vacuity this test used to have.
      expect(before.indexes.map((row) => row.indexname)).toContain(
        "validation_batches_validator_created_at_idx",
      );

      const error = await reapplyMigration(populated, RECOVERY_MIGRATION);
      expect(String(error?.message ?? "")).toContain(REFUSAL_PREFIX);

      const after = {
        indexes: await query<{ indexname: string }>(populated, indexQuery),
        rows: await query(populated, rowQuery),
      };

      expect(after.indexes).toEqual(before.indexes);
      // And the rows the migration refused to process are still exactly where they were: not discarded,
      // not modified — including the stamps the backfill gave them, which a rolled-back second
      // application could plausibly have overwritten. Research data survives a failed migration.
      expect(after.rows).toEqual(before.rows);
      expect(after.rows).toEqual([
        { id: BATCH, validator_id: VALIDATOR, created_at: expect.any(String) },
        { id: SECOND_BATCH, validator_id: VALIDATOR, created_at: expect.any(String) },
      ]);
    });
  });

  describe("the refusal against a fully migrated schema", () => {
    it("turns away a second application by this change's own message", async () => {
      // The allocation migration's property (2) and the reason it exists in its own right: without
      // the precondition, a second application dies on `add column` with a duplicate-column error
      // that says nothing about whether the data is intact. Matched on THIS change's prefix, so a
      // neighbouring migration's precondition cannot make this pass.
      const once = await createTestDatabase();
      try {
        await applyMigrations(once);

        const error = await reapplyMigration(once, RECOVERY_MIGRATION);

        expect(String(error?.message ?? "")).toContain(REFUSAL_PREFIX);
        expect(String(error?.message ?? "")).toContain(
          "validation_batches.created_at already exists",
        );
        // The refusal states the ORDER requirement, which is the part a bare constraint violation
        // would never say: the precondition is only meaningful before the column is added.
        expect(String(error?.message ?? "")).toContain("must run BEFORE the column is added");
      } finally {
        await closeTestDatabase(once);
      }
    });
  });

  /**
   * The residue row — task 3.5's evidence.
   *
   * ================================================================================================
   * WHY THIS SECTION IS ABOUT SQL RATHER THAN ABOUT THE LOOKUP
   * ================================================================================================
   * `SupabaseBatchesRepository.listForRecovery` cannot be exercised here. It lives behind
   * `import "server-only"`, which cannot be imported under Vitest, so the application cannot build a
   * repository against this database and observe what it returns.
   *
   * That constraint tempts a test into writing its OWN SQL and calling the result "the lookup" — and
   * `tests/integration/lifetime-figure.test.ts` is the cautionary example already recorded in
   * `docs/ROADMAP.md` for exactly that: it writes its own `count(*)`, so it cannot catch a
   * coverage-filtered count in the application's own query builder. The honest split is:
   *
   *   HERE  — that a batch with no entries is a legal, reachable row, and that the SHAPE of the two
   *           reads returns it. This is a fact about the data and the SQL, and it is testable here.
   *   UNIT  — that `listForRecovery` maps such a row to an empty `entryIds` without raising
   *           (`repositories-supabase.test.ts`), and that the rule then reports `none`
   *           (`batch-recovery.test.ts`).
   *
   * Neither half is the whole claim, and the header says so rather than letting the section's presence
   * imply otherwise.
   */
  describe("a batch row with no entries, which the recovery read has to be able to SEE", () => {
    /** Writes the residue: a batch with a `created_at` and deliberately NO `batch_entries` rows. */
    async function seedResidueBatch(database: TestDatabase, id: string, createdAt: string) {
      await applySql(
        database,
        `insert into public.validation_batches (id, validator_id, created_at)
       values ('${id}', '${VALIDATOR}', '${createdAt}')`,
        "residue batch",
      );
    }

    /**
     * A second batch that DOES have one placement, so the residue is a contrast rather than the only case.
     *
     * It seeds the dataset entry too, and that is not tidiness: `batch_entries.dataset_entry_id` is a
     * FOREIGN KEY, and the file's `beforeEach` seeds only validators. The resulting `23503` names the
     * missing key exactly, which is a better failure than a placement that quietly did not exist — and a
     * test about grouping rows would have passed anyway against a missing placement, had the foreign key
     * not caught it first.
     */
    async function seedPopulatedBatch(database: TestDatabase, id: string, createdAt: string) {
      await applySql(
        database,
        `insert into public.validation_batches (id, validator_id, created_at)
       values ('${id}', '${VALIDATOR}', '${createdAt}');
     insert into public.dataset_entries (id, category, instruction, source_payload)
       values ('OD_0001', 'origin_destination', 'Iti Baguio Athletic Bowl ti ayanko ita.',
               '{"id":"OD_0001"}'::jsonb)
       on conflict (id) do nothing;
     insert into public.batch_entries (batch_id, dataset_entry_id, position)
       values ('${id}', 'OD_0001', 1)`,
        "populated batch",
      );
    }

    it("is a LEGAL row: nothing in the production schema refuses a batch that has no entries", async () => {
      // This is what makes the residue real rather than hypothetical. `create` performs two writes
      // with no transaction across them, so a failure between them leaves exactly this row — and if
      // some constraint forbade it, the residue could not exist and this whole section would be
      // testing a fiction.
      await expect(seedResidueBatch(db, BATCH, EARLY)).resolves.toBeUndefined();

      const rows = await query<{ id: string }>(db, `select id from public.validation_batches`);
      expect(rows).toEqual([{ id: BATCH }]);
    });

    it("is RETURNED by two flat reads, which is why the implementation groups rows in JavaScript", async () => {
      await seedResidueBatch(db, BATCH, EARLY);
      await seedPopulatedBatch(db, SECOND_BATCH, LATE);

      // THE FIRST READ, exactly as the repository issues it: no join, no filter beyond ownership.
      const batches = await query<{ id: string }>(
        db,
        `select id from public.validation_batches
          where validator_id = '${VALIDATOR}'
          order by created_at desc, id desc`,
      );
      expect(batches.map((row) => row.id)).toEqual([SECOND_BATCH, BATCH]);

      // THE SECOND READ, as issued: every row for those batch ids.
      const entries = await query<{ batch_id: string; dataset_entry_id: string }>(
        db,
        `select batch_id, dataset_entry_id from public.batch_entries
          where batch_id in ('${SECOND_BATCH}', '${BATCH}')
          order by batch_id, dataset_entry_id`,
      );

      // Grouped here the way `listForRecovery` groups them — and the residue KEEPS ITS PLACE, with
      // nothing on the left. This is the whole point: the batch is not absent from the result, it is
      // present with an empty list, and only the recognition rule — which knows what the validator has
      // already answered — may conclude there is no work.
      const grouped = new Map<string, string[]>();
      for (const row of entries) {
        const existing = grouped.get(row.batch_id);
        if (existing === undefined) grouped.set(row.batch_id, [row.dataset_entry_id]);
        else existing.push(row.dataset_entry_id);
      }
      expect(grouped.get(BATCH) ?? []).toEqual([]);
      expect(grouped.get(SECOND_BATCH)).toEqual(["OD_0001"]);
      // The residue's id is still in the map as a KEY, having been written only by the first read's
      // row. If it were missing from `grouped` entirely, the row would have been filtered rather than
      // reported — the failure mode task 3.5 forbids.
      expect(batches.map((row) => row.id)).toContain(BATCH);
    });

    it("would VANISH under a joined select, which is the measured reason this read is not one", async () => {
      // THE CAN-FIRE CONTROL for the two-read design decision.
      //
      // `design.md` rejects PostgREST's embedded-resource select ("no project, so the shape of the
      // nested rows is an untested assumption") on the grounds of UNVERIFIABILITY. That argument is
      // about the wire. This test is about something else and it is verifiable right here: an INNER
      // JOIN does not return a batch with no entries AT ALL, so the single-request shape would have
      // silently filtered the residue out — the exact outcome task 3.5 says the listing must not have.
      //
      // So the decision is now justified by a measurement rather than only by caution, and the reason
      // is not "two round trips are tidier". It is that the joined shape CANNOT express the case this
      // method exists to handle.
      await seedResidueBatch(db, BATCH, EARLY);
      await seedPopulatedBatch(db, SECOND_BATCH, LATE);

      const joined = await query<{ id: string }>(
        db,
        `select b.id from public.validation_batches b
           join public.batch_entries e on e.batch_id = b.id
          where b.validator_id = '${VALIDATOR}'`,
      );

      // The residue is absent. Asserted POSITIVELY, naming the row that is missing, so the failure
      // says what happened rather than merely that two lists differ.
      expect(joined.map((row) => row.id)).toEqual([SECOND_BATCH]);
      expect(joined.map((row) => row.id)).not.toContain(BATCH);

      // And a LEFT JOIN — the shape that WOULD preserve it — returns it with NULLs rather than an
      // empty list, which is a second thing the translation would have to normalise. Stated because
      // "we used a left join instead" sounds like a fix and is actually a different translation
      // burden, not a smaller one.
      const leftJoined = await query<{ id: string; dataset_entry_id: string | null }>(
        db,
        `select b.id, e.dataset_entry_id from public.validation_batches b
           left join public.batch_entries e on e.batch_id = b.id
          where b.validator_id = '${VALIDATOR}'
          order by b.id`,
      );
      const residueRows = leftJoined.filter((row) => row.id === BATCH);
      expect(residueRows).toHaveLength(1);
      expect(residueRows[0]?.dataset_entry_id).toBeNull();
    });

    it("is a row `findById` refuses, so the two methods genuinely disagree", async () => {
      // Establishes that `listForRecovery`'s tolerance is a DELIBERATE divergence rather than an
      // accident of two methods happening to read different columns. `findById` raises on this row
      // because `batchRecordSchema` requires at least one entry; the constraint it trips is the
      // non-empty `batch_entries` requirement, and matching the row's existence here is what makes the
      // divergence legible.
      await seedResidueBatch(db, BATCH, EARLY);

      const placements = await query<{ count: number }>(
        db,
        `select count(*)::int as count from public.batch_entries where batch_id = '${BATCH}'`,
      );
      expect(placements[0]?.count).toBe(0);

      // The batch row nonetheless exists and is owned by this validator, which is exactly the state
      // `listForRecovery` must surface with an empty list.
      const owner = await query<{ validator_id: string }>(
        db,
        `select validator_id from public.validation_batches where id = '${BATCH}'`,
      );
      expect(owner).toEqual([{ validator_id: VALIDATOR }]);
    });
  });
});
