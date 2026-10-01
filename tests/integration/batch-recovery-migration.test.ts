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

import { applyMigrations, applyMigrationsUntil, readMigrations } from "./support/migrations";
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

    it("stamps every pre-existing row with one IDENTICAL instant", async () => {
      // This is the measurement the migration header's second reason rests on. The tie between two
      // batches of one validator is claimed to be real in the WORLD, not only in a fixture, and
      // this is what makes that claim checkable: if the backfill used a per-row function or a
      // per-row clock reading, the two rows would differ and the `id` key in the index would be
      // decorative.
      await applySql(
        populated,
        `alter table public.validation_batches
                                  add column created_at timestamptz`,
        "add column",
      );
      await applySql(
        populated,
        `update public.validation_batches set created_at = now() where created_at is null`,
        "backfill",
      );

      const rows = await query<{ id: string; created_at: string }>(
        populated,
        "select id, created_at::text as created_at from public.validation_batches order by id",
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]?.created_at).toBeTruthy();
      expect(rows[0]?.created_at).toBe(rows[1]?.created_at);
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

    it("leaves no trace of the refusal, so the database can be resolved and reapplied", async () => {
      // `applyEach` wraps each file in one transaction, so the `raise` rolls the whole file back —
      // the index this migration creates must not survive a refused application. Stating it here
      // means the file cannot be edited to escape its own transaction later without this going red.
      const indexes = await query<{ indexname: string }>(
        populated,
        `select indexname from pg_indexes
          where schemaname = 'public'
            and tablename = 'validation_batches'
            and indexname = 'validation_batches_validator_created_at_idx'`,
      );

      expect(indexes).toEqual([]);

      // And the rows the migration refused to process are still exactly where they were: not
      // discarded, not modified. Research data survives a failed migration.
      const rows = await query<{ id: string; validator_id: string }>(
        populated,
        "select id, validator_id from public.validation_batches order by id",
      );
      expect(rows).toEqual([
        { id: BATCH, validator_id: VALIDATOR },
        { id: SECOND_BATCH, validator_id: VALIDATOR },
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
});
