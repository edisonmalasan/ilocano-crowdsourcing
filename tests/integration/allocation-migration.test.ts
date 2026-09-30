/**
 * `20260930190000_allocation_batch_positions.sql`, verified against a real PostgreSQL engine.
 *
 * WHAT THIS PROVES
 * ----------------
 * That the migration applies in filename order after both prior migrations, that `position` is a
 * required positive integer, that two entries of one batch cannot share a position while the same
 * position in two different batches is fine, and — the reason the file refuses at all — that a
 * database already holding `batch_entries` rows is turned away with a message that names the
 * conflict rather than reporting a mechanics failure.
 *
 * WHAT IT DOES NOT PROVE
 * ----------------------
 * That a hosted Supabase project accepts the file, which is a separate credential-blocked step.
 * PGlite is PostgreSQL compiled to WebAssembly: it proves SQL, constraints, and transaction
 * behaviour AS THE DATABASE ENGINE EVALUATES THEM, and nothing about the Supabase API gateway.
 *
 * EVERY REJECTION BELOW IS MATCHED AGAINST A CONSTRAINT NAME, never the generic phrase
 * `check constraint`. A generic pattern passes when a DIFFERENT constraint fires, which is how a
 * green test can prove nothing about the rule it names — a hazard this repository has already paid
 * for once, when a draft of the bilingual migration used a single equivalence constraint and the
 * test for "an evaluable row with no translations" passed because the wrong constraint fired.
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

const ALLOCATION_MIGRATION = "20260930190000_allocation_batch_positions.sql";

/** The two migrations this one must run strictly after. Named, because that is the assertion. */
const PRIOR_MIGRATIONS = [
  "20260930120000_research_schema.sql",
  "20260930160000_required_bilingual_translations.sql",
] as const;

const VALIDATOR = "VAL_0000beef";
const BATCH = "batch_01";
const OTHER_BATCH = "batch_02";
const ENTRY = "OD_0001";
const OTHER_ENTRY = "OD_0002";
const THIRD_ENTRY = "OD_0003";
const INSTRUCTION = "Iti Baguio Athletic Bowl ti ayanko ita.";

/**
 * Seeds one validator, two batches, and three entries.
 *
 * No `batch_entries` row: `position` is `not null`, so every test that needs one supplies its own
 * and thereby states its position explicitly. A seeded placement would mean every rejection test had
 * to name a position that was not the thing under test.
 */
async function seed(database: TestDatabase): Promise<void> {
  await applySql(
    database,
    `insert into public.validators (id) values ('${VALIDATOR}');
     insert into public.validation_batches (id, validator_id)
       values ('${BATCH}', '${VALIDATOR}'), ('${OTHER_BATCH}', '${VALIDATOR}');
     insert into public.dataset_entries (id, category, instruction, source_payload)
       values ('${ENTRY}', 'origin_destination', '${INSTRUCTION}', '{"id":"${ENTRY}"}'::jsonb),
              ('${OTHER_ENTRY}', 'origin_destination', 'Ibaba ti centro.', '{"id":"${OTHER_ENTRY}"}'::jsonb),
              ('${THIRD_ENTRY}', 'origin_destination', 'Ibaba ti kalsada.', '{"id":"${THIRD_ENTRY}"}'::jsonb);`,
    "seed",
  );
}

const insertEntry = (database: TestDatabase, batchId: string, entryId: string, position: number) =>
  applySql(
    database,
    `insert into public.batch_entries (batch_id, dataset_entry_id, position)
     values ('${batchId}', '${entryId}', ${position})`,
    `batch entry ${batchId}/${entryId}/${position}`,
  );

describe("the allocation batch-position migration", () => {
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
    await seed(db);
  });

  describe("ordering", () => {
    it("sorts strictly after both prior migrations, so it never runs against a half-built schema", async () => {
      // The assertion is on the ORDER of the real directory listing, not on the set of names: a
      // file named `20260930140000_…` would satisfy every other test in this file and fail here,
      // because it would run before the bilingual migration and fail on a column that does not
      // exist yet.
      const filenames = (await readMigrations()).map((migration) => migration.filename);
      const allocationAt = filenames.indexOf(ALLOCATION_MIGRATION);

      expect(allocationAt).toBeGreaterThanOrEqual(0);
      for (const prior of PRIOR_MIGRATIONS) {
        expect(filenames.indexOf(prior), `${prior} must exist`).toBeGreaterThanOrEqual(0);
        expect(
          filenames.indexOf(prior),
          `${prior} must be applied before ${ALLOCATION_MIGRATION}`,
        ).toBeLessThan(allocationAt);
      }
    });
  });

  describe("the column", () => {
    it("exists, and cannot be written without one", async () => {
      const rows = await query<{ column_name: string; is_nullable: string; data_type: string }>(
        db,
        `select column_name, is_nullable, data_type
           from information_schema.columns
          where table_schema = 'public' and table_name = 'batch_entries' and column_name = 'position'`,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.is_nullable).toBe("NO");
      // `integer`, not `bigint` or `text`. `batchEntryPositionSchema` is `z.number().int()`, and a
      // text column would let `'first'` into a column the application reads as a number.
      expect(rows[0]?.data_type).toBe("integer");
    });

    it("refuses a batch entry with no position at all", async () => {
      // The `not null`, reached by omitting the column. It is a NOT NULL violation rather than a
      // `check` constraint, so it is matched as such — and it is the reason the migration's
      // precondition is about MESSAGE QUALITY rather than about whether the migration refuses at
      // all. `alter column set not null` already stops a populated table; what it cannot do is
      // explain that the ORDER is unknown rather than that a column was just added.
      await expect(
        applySql(
          db,
          `insert into public.batch_entries (batch_id, dataset_entry_id)
           values ('${BATCH}', '${ENTRY}')`,
          "placement with no position",
        ),
      ).rejects.toThrow(/null value in column "position"|not-null/i);
    });
  });

  describe("batch_entries_position_positive", () => {
    it("rejects position zero, matched by constraint name", async () => {
      // Zero specifically, not merely "negative": the domain is 1-BASED so a reviewer saying "the
      // third entry of batch 12" needs no subtraction. A `>= 0` check would pass this row.
      await expect(insertEntry(db, BATCH, ENTRY, 0)).rejects.toThrow(
        /check constraint "batch_entries_position_positive"/i,
      );
    });

    it("rejects a negative position, matched by constraint name", async () => {
      await expect(insertEntry(db, BATCH, ENTRY, -1)).rejects.toThrow(
        /check constraint "batch_entries_position_positive"/i,
      );
    });

    it("accepts position 1, the first position, so the constraint is not vacuously refusing everything", async () => {
      // The control for the two above. A check written with an inverted predicate would reject 1 and
      // accept 0, and each of those tests would still pass.
      await insertEntry(db, BATCH, ENTRY, 1);

      const rows = await query<{ position: number }>(
        db,
        "select position from public.batch_entries where batch_id = $1",
        [BATCH],
      );
      expect(rows).toEqual([{ position: 1 }]);
    });
  });

  describe("batch_entries_batch_position_unique", () => {
    it("rejects two entries of one batch sharing a position, matched by constraint name", async () => {
      await insertEntry(db, BATCH, ENTRY, 1);

      // Two "entry 1"s and no "entry 2". A batch whose order is not total is not an order, and a
      // validator handed it would see a sequence with a hole in it.
      await expect(insertEntry(db, BATCH, OTHER_ENTRY, 1)).rejects.toThrow(
        /batch_entries_batch_position_unique|duplicate key/i,
      );
    });

    it("accepts the same position in two DIFFERENT batches", async () => {
      // The other half, and the one that makes the constraint correct rather than merely strict: a
      // global uniqueness rule on `position` would mean the second validator's first entry could
      // never be at position 1, which is nonsense. A uniqueness constraint that is too wide is a
      // functional break, and only the pair of tests above says this one is the right width.
      await insertEntry(db, BATCH, ENTRY, 1);
      await insertEntry(db, OTHER_BATCH, OTHER_ENTRY, 1);

      const rows = await query<{ batch_id: string; position: number }>(
        db,
        "select batch_id, position from public.batch_entries order by batch_id",
      );
      expect(rows).toEqual([
        { batch_id: BATCH, position: 1 },
        { batch_id: OTHER_BATCH, position: 1 },
      ]);
    });

    it("reads back in position order, which is the access pattern findById depends on", async () => {
      // The purpose of the whole column. Inserted out of order, read back in order — and the
      // `order by` here is served by the unique index whose leading column is `batch_id`, which is
      // why no separate index is added for it.
      await insertEntry(db, BATCH, OTHER_ENTRY, 3);
      await insertEntry(db, BATCH, ENTRY, 1);
      await insertEntry(db, BATCH, THIRD_ENTRY, 2);

      const rows = await query<{ dataset_entry_id: string }>(
        db,
        "select dataset_entry_id from public.batch_entries where batch_id = $1 order by position",
        [BATCH],
      );
      expect(rows.map((row) => row.dataset_entry_id)).toEqual([ENTRY, THIRD_ENTRY, OTHER_ENTRY]);
    });
  });

  describe("the refusal", () => {
    /**
     * A SEPARATE database, stopped just before the allocation migration.
     *
     * It cannot be the `db` above. By the time the whole migration set has been applied there,
     * `position` is `not null`, so the row this refusal is about could not have been written at all
     * — the refusal would be unreachable and the test would be asserting a fiction.
     */
    let populated: TestDatabase;

    beforeAll(async () => {
      populated = await createTestDatabase();
      const applied = await applyMigrationsUntil(populated, ALLOCATION_MIGRATION);
      expect(applied.applied).toEqual([...PRIOR_MIGRATIONS]);
      await seed(populated);
    });

    afterAll(async () => {
      await closeTestDatabase(populated);
    });

    it("turns away a database that already holds a batch entry", async () => {
      // The row the precondition exists for. It is LEGAL under the schema as it stands: `position`
      // does not exist yet, so there is nothing about the row that could be wrong. Written BEFORE
      // the migration is attempted, which is the only order in which this state is reachable.
      await applySql(
        populated,
        `insert into public.batch_entries (batch_id, dataset_entry_id)
         values ('${BATCH}', '${ENTRY}')`,
        "pre-existing placement",
      );

      const rows = await query<{ count: number }>(
        populated,
        "select count(*)::int as count from public.batch_entries",
      );
      expect(rows[0]?.count).toBe(1);
    });

    it("refuses the allocation migration, naming the conflict rather than a mechanics failure", async () => {
      const migration = (await readMigrations()).find(
        (file) => file.filename === ALLOCATION_MIGRATION,
      );
      expect(migration, "the allocation migration must exist").toBeDefined();

      const error = await populated
        .transaction(async (tx) => {
          await tx.exec(migration?.sql ?? "");
        })
        .then(
          () => null,
          (caught: unknown) => caught,
        );

      // The migration's own prefix, so the refusal is attributable to THIS file rather than to
      // something else in the schema.
      expect(String((error as Error)?.message ?? "")).toContain("allocation-batch-positions:");
      // The conflict is named...
      expect(String((error as Error)?.message ?? "")).toContain("pre-existing batch_entries rows");
      // ...and what the migration will NOT do is stated, so an operator knows the resolution is
      // theirs. This is the part a bare constraint violation would never say.
      expect(String((error as Error)?.message ?? "")).toContain("will not be invented");
    });

    it("leaves no trace of the refusal, so the database can be resolved and reapplied", async () => {
      // `applyEach` wraps each file in one transaction, so the `raise` rolls the whole file back.
      // Stating it here means the file cannot be edited to escape its own transaction later without
      // this going red.
      const columns = await query<{ column_name: string }>(
        populated,
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'batch_entries' and column_name = 'position'`,
      );
      expect(columns).toEqual([]);

      // And the row the precondition refused is still exactly where it was: not discarded, not
      // modified. Research data survives a failed migration.
      const rows = await query<{ batch_id: string; dataset_entry_id: string }>(
        populated,
        "select batch_id, dataset_entry_id from public.batch_entries",
      );
      expect(rows).toEqual([{ batch_id: BATCH, dataset_entry_id: ENTRY }]);
    });

    it("refuses when the column already exists, so a re-applied file cannot half-run", async () => {
      // The guard the bilingual migration calls property (2) of its ordering note, and the reason
      // it exists in its own right: without it, a second application fails on `add column` with a
      // duplicate-column error that says nothing about whether the data is intact.
      const once = await createTestDatabase();
      try {
        await applyMigrations(once);

        const migration = (await readMigrations()).find((f) => f.filename === ALLOCATION_MIGRATION);
        const error = await once
          .transaction(async (tx) => {
            await tx.exec(migration?.sql ?? "");
          })
          .then(
            () => null,
            (caught: unknown) => caught,
          );

        expect(String((error as Error)?.message ?? "")).toContain(
          "batch_entries.position already exists",
        );
      } finally {
        await closeTestDatabase(once);
      }
    });
  });
});
