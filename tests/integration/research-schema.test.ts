/**
 * Schema verification for the research tables.
 *
 * Everything here runs against a real PostgreSQL engine (PGlite, PostgreSQL compiled to
 * WebAssembly), applied from `supabase/migrations/` — the directory the platform actually ships
 * from, which until this test existed was never exercised by anything.
 *
 * What this does NOT prove: Supabase Auth, Storage, Realtime, PostgREST behaviour, or Row Level
 * Security as enforced by the Supabase API gateway rather than by the database engine. Applying
 * these migrations to a hosted project remains a separate, credential-blocked step.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, readMigrations, type MigrationFile } from "./support/migrations";
import {
  applySql,
  asRole,
  closeTestDatabase,
  createTestDatabase,
  query,
  truncateAll,
  type TestDatabase,
} from "./support/pglite";

// As PostgreSQL's default collation orders them. `validation_batches`, `validation_sessions` and
// `validations` all precede `validators` because `i` sorts before `o` at the diverging position.
const EXPECTED_TABLES = [
  "batch_entries",
  "dataset_entries",
  "validation_batches",
  "validation_sessions",
  "validations",
  "validators",
];

const EXPECTED_MIGRATION = "20260930120000_research_schema.sql";

const VALIDATOR = "VAL_0000beef";
const OTHER_VALIDATOR = "VAL_0000feed";
const ENTRY = "OD_0001";
const OTHER_ENTRY = "OD_0002";
const BATCH = "batch_01";
const INSTRUCTION = "Iti Baguio Athletic Bowl ti ayanko ita.";

describe("research schema migrations", () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createTestDatabase();
    // No directory argument on purpose: this is the default `supabase/migrations/` path, which
    // had no caller anywhere in the repository before this change.
    await applyMigrations(db);
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  beforeEach(async () => {
    await truncateAll(db);
    await seed(db);
  });

  /** Asserts the statement is rejected, and that the reason matches. */
  async function expectRejected(sql: string, pattern: RegExp): Promise<void> {
    await expect(applySql(db, sql, "statement expected to be rejected")).rejects.toThrow(pattern);
  }

  /** Inserts a validation, which most tests need but none should inherit from the seed. */
  async function insertValidation(id: string, validatorId: string, entryId: string): Promise<void> {
    await applySql(
      db,
      `insert into public.validations (id, validator_id, dataset_entry_id, batch_id, evaluation)
       values ('${id}', '${validatorId}', '${entryId}', '${BATCH}', 'correct_natural')`,
      `validation ${id}`,
    );
  }

  describe("applying the migration set", () => {
    it("reads from the production migrations directory, not a test fixture", async () => {
      // Asserting the exact list, not a count. `applyMigrations` returns an empty list for a
      // missing or empty directory and still succeeds, so a count check would pass on a broken
      // path or a typo'd glob and report a green test for the wrong reason.
      const migrations = await readMigrations();
      expect(migrations.map((m: MigrationFile) => m.filename)).toEqual([EXPECTED_MIGRATION]);
    });

    it("applies exactly the expected migration", async () => {
      const fresh = await createTestDatabase();
      try {
        const { applied } = await applyMigrations(fresh);
        expect(applied).toEqual([EXPECTED_MIGRATION]);
      } finally {
        await closeTestDatabase(fresh);
      }
    });
  });

  describe("tables", () => {
    it("creates the six research tables and nothing else", async () => {
      const tables = await query<{ table_name: string }>(
        db,
        "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
      );
      expect(tables.map((row) => row.table_name)).toEqual(EXPECTED_TABLES);
    });

    it("keys dataset entries by the source identifier, not a uuid surrogate", async () => {
      const columns = await query<{ data_type: string }>(
        db,
        `select data_type from information_schema.columns
         where table_schema = 'public' and table_name = 'dataset_entries' and column_name = 'id'`,
      );
      expect(columns).toHaveLength(1);
      expect(columns[0]?.data_type).toBe("text");
    });

    it("gives validators no column that could hold an identifying detail", async () => {
      const columns = await query<{ column_name: string }>(
        db,
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'validators'`,
      );
      const names = columns.map((row) => row.column_name);
      expect(names).toEqual(
        expect.arrayContaining([
          "id",
          "ilocano_proficiency",
          "created_at",
          "last_active_at",
          "total_validations",
        ]),
      );
      // The anonymity invariant is enforced twice: once by the strictObject domain schema, once
      // here. A column added later for a name or an email address would fail this test.
      for (const forbidden of ["name", "email", "student_id", "phone", "address"]) {
        expect(names).not.toContain(forbidden);
      }
    });

    it("never references an authentication subject", async () => {
      // The schema is anonymous by design. No foreign key may point outside the research tables,
      // and specifically not at the `auth` schema — the PGlite harness provides no auth.users
      // table at all, so such a reference would fail to apply. This states the intent so the
      // failure is understood rather than puzzling.
      const rows = await query<{ ref_schema: string; ref_table: string }>(
        db,
        `select ccu.table_schema as ref_schema, ccu.table_name as ref_table
         from information_schema.table_constraints tc
         join information_schema.constraint_column_usage ccu
           on ccu.constraint_name = tc.constraint_name
          and ccu.constraint_schema = tc.constraint_schema
         where tc.constraint_type = 'FOREIGN KEY'
           and tc.table_schema = 'public'`,
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.map((row) => row.ref_schema)).not.toContain("auth");
      for (const row of rows) {
        expect(EXPECTED_TABLES).toContain(row.ref_table);
      }
    });
  });

  describe("the at-most-once constraint", () => {
    it("rejects a second validation for the same validator and entry", async () => {
      await insertValidation("res_01", VALIDATOR, ENTRY);
      await expectRejected(
        `insert into public.validations (id, validator_id, dataset_entry_id, batch_id, evaluation)
         values ('res_02', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_natural')`,
        /validations_validator_entry_unique|duplicate key/i,
      );
    });

    it("accepts the same entry from a different validator", async () => {
      // Different validators are expected to receive overlapping entries; coverage is defined in
      // terms of independent validators, so this must not be treated as a duplicate.
      await insertValidation("res_01", VALIDATOR, ENTRY);
      await insertValidation("res_02", OTHER_VALIDATOR, ENTRY);
      const rows = await query<{ count: number }>(
        db,
        "select count(*)::int as count from public.validations",
      );
      expect(rows[0]?.count).toBe(2);
    });

    it("lets one validator hold many validations across different entries", async () => {
      await insertValidation("res_01", VALIDATOR, ENTRY);
      await insertValidation("res_02", VALIDATOR, OTHER_ENTRY);
      const rows = await query<{ count: number }>(
        db,
        "select count(*)::int as count from public.validations where validator_id = $1",
        [VALIDATOR],
      );
      expect(rows[0]?.count).toBe(2);
    });

    it("counts distinct validators for coverage, which is why the constraint matters", async () => {
      await insertValidation("res_01", VALIDATOR, ENTRY);
      await insertValidation("res_02", OTHER_VALIDATOR, ENTRY);
      const rows = await query<{ independent_validators: number }>(
        db,
        "select count(distinct validator_id)::int as independent_validators from public.validations where dataset_entry_id = $1",
        [ENTRY],
      );
      expect(rows[0]?.independent_validators).toBe(2);
    });
  });

  describe("vocabulary checks", () => {
    it("rejects an evaluation outside the four approved values", async () => {
      await expectRejected(
        `insert into public.validations (id, validator_id, dataset_entry_id, batch_id, evaluation)
         values ('res_bad', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'looks_fine')`,
        /validations_evaluation_known|check constraint/i,
      );
    });

    it("rejects the display label casing rather than the stored value", async () => {
      // A guard against the exact mistake of writing the check against `Correct and natural`,
      // which would make the column unwritable for every real validator.
      await expectRejected(
        `insert into public.validations (id, validator_id, dataset_entry_id, batch_id, evaluation)
         values ('res_label', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'Correct and natural')`,
        /validations_evaluation_known|check constraint/i,
      );
    });

    it("rejects an unapproved proficiency value", async () => {
      await expectRejected(
        `insert into public.validators (id, ilocano_proficiency) values ('VAL_0000cafe', 'expert')`,
        /validators_proficiency_known|check constraint/i,
      );
    });

    it("rejects an unapproved translation language", async () => {
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, translation_language, translation_text)
         values ('res_tr', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_natural', 'french', 'bonjour')`,
        /validations_translation_language_known|check constraint/i,
      );
    });

    it("rejects a blank correction, so absent and empty stay distinguishable", async () => {
      // `''` would make "the validator supplied a correction" indistinguishable from "the
      // validator left it blank" — the exact ambiguity normalizeResearchText returns null to avoid.
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, corrected_instruction)
         values ('res_blank', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'incorrect', '   ')`,
        /validations_corrected_instruction_not_blank|check constraint/i,
      );
    });

    it("accepts absent optional fields", async () => {
      // A validator may exist before screening, and `cannot_evaluate` carries no correction and
      // no translation. Both are legitimate, so neither may be blocked by a not-null constraint.
      await applySql(
        db,
        `insert into public.validators (id, ilocano_proficiency) values ('VAL_0000cafe', null)`,
        "validator without screening",
      );
      await applySql(
        db,
        `insert into public.validations (id, validator_id, dataset_entry_id, batch_id, evaluation)
         values ('res_05', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'cannot_evaluate')`,
        "cannot_evaluate with no correction and no translation",
      );
    });
  });

  describe("referential integrity", () => {
    it("rejects a validation for a validator that does not exist", async () => {
      await expectRejected(
        `insert into public.validations (id, validator_id, dataset_entry_id, batch_id, evaluation)
         values ('res_orphan', 'VAL_deadbeef', '${ENTRY}', '${BATCH}', 'correct_natural')`,
        /foreign key|violates/i,
      );
    });

    it("rejects a validation for a dataset entry that does not exist", async () => {
      await expectRejected(
        `insert into public.validations (id, validator_id, dataset_entry_id, batch_id, evaluation)
         values ('res_orphan2', '${VALIDATOR}', 'OD_9999', '${BATCH}', 'correct_natural')`,
        /foreign key|violates/i,
      );
    });

    it("rejects a validation for a batch that does not exist", async () => {
      await expectRejected(
        `insert into public.validations (id, validator_id, dataset_entry_id, batch_id, evaluation)
         values ('res_orphan3', '${VALIDATOR}', '${ENTRY}', 'batch_nope', 'correct_natural')`,
        /foreign key|violates/i,
      );
    });

    it("refuses to delete a validator who has responses", async () => {
      // Deleting a validator must not take their research responses with it as a side effect.
      await insertValidation("res_01", VALIDATOR, ENTRY);
      await expectRejected(
        `delete from public.validators where id = '${VALIDATOR}'`,
        /foreign key|violates/i,
      );
    });

    it("refuses to delete a dataset entry that has responses", async () => {
      await insertValidation("res_01", VALIDATOR, ENTRY);
      await expectRejected(
        `delete from public.dataset_entries where id = '${ENTRY}'`,
        /foreign key|violates/i,
      );
    });
  });

  describe("correction immutability", () => {
    it("leaves the dataset entry instruction untouched when a correction is stored", async () => {
      const corrected = "Iti Baguio Athletic Bowl ti ayanko ita, napay a duman.";
      await applySql(
        db,
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, corrected_instruction)
         values ('res_corr', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_unnatural', '${corrected}')`,
        "validation with a correction",
      );

      const rows = await query<{ instruction: string }>(
        db,
        "select instruction from public.dataset_entries where id = $1",
        [ENTRY],
      );
      expect(rows[0]?.instruction).toBe(INSTRUCTION);
      expect(rows[0]?.instruction).not.toBe(corrected);
    });

    it("stores the correction on the validation, not on the entry", async () => {
      const corrected = "Iti Baguio Athletic Bowl ti ayanko ita, napay a duman.";
      await applySql(
        db,
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, corrected_instruction)
         values ('res_corr', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_unnatural', '${corrected}')`,
        "validation with a correction",
      );
      const rows = await query<{ corrected_instruction: string }>(
        db,
        "select corrected_instruction from public.validations where id = $1",
        ["res_corr"],
      );
      expect(rows[0]?.corrected_instruction).toBe(corrected);
    });

    it("keeps the source payload intact alongside the typed columns", async () => {
      const rows = await query<{ source_payload: Record<string, unknown> }>(
        db,
        "select source_payload from public.dataset_entries where id = $1",
        [ENTRY],
      );
      expect(rows[0]?.source_payload).toEqual({ id: ENTRY });
    });
  });

  describe("row level security", () => {
    it("returns no rows to anon, and does not raise", async () => {
      // Deny-all is asymmetric, and this is the quiet half: a denied SELECT returns zero rows
      // with NO error. At the call site that is indistinguishable from a legitimate "no such
      // entry", which is exactly why a repository must not treat empty as proof of success.
      const rows = await asRole(db, { role: "anon" }, async (tx) => {
        const result = await tx.query<{ id: string }>("select id from public.dataset_entries");
        return result.rows;
      });
      expect(rows).toEqual([]);
    });

    it("returns no rows to authenticated", async () => {
      const rows = await asRole(db, { role: "authenticated" }, async (tx) => {
        const result = await tx.query<{ id: string }>("select id from public.validators");
        return result.rows;
      });
      expect(rows).toEqual([]);
    });

    it("rejects a write from anon with a row level security error", async () => {
      // The loud half. The tables must be reached through applyMigrations, which applies the
      // grants: createTestDatabase does not grant privileges, so a test that built its own
      // tables would see "permission denied for table" for every role and mistake a grant
      // problem for an RLS result.
      await expect(
        asRole(db, { role: "anon" }, async (tx) => {
          await tx.query("insert into public.validators (id) values ($1)", ["VAL_0000dead"]);
        }),
      ).rejects.toThrow(/row-level security/i);
    });

    it("still lets the privileged role read research data", async () => {
      // Demonstrating the refusal with this role would prove nothing: it has BYPASSRLS.
      const rows = await asRole(db, { role: "service_role" }, async (tx) => {
        const result = await tx.query<{ id: string }>("select id from public.dataset_entries");
        return result.rows;
      });
      expect(rows).toHaveLength(2);
    });
  });

  describe("indexes", () => {
    it("provides every index the coverage and review paths depend on", async () => {
      const rows = await query<{ indexname: string }>(
        db,
        "select indexname from pg_indexes where schemaname = 'public'",
      );
      const names = rows.map((row) => row.indexname);
      for (const required of [
        "batch_entries_dataset_entry_id_idx",
        "dataset_entries_active_category_idx",
        "validations_batch_id_idx",
        "validations_dataset_entry_id_idx",
        "validations_validator_id_idx",
        "validation_batches_validator_id_idx",
        "validation_sessions_validator_id_idx",
      ]) {
        expect(names).toContain(required);
      }
    });

    it("serves the active-pool query from a partial index that excludes retired entries", async () => {
      const rows = await query<{ indexdef: string }>(
        db,
        `select indexdef from pg_indexes
         where schemaname = 'public' and indexname = 'dataset_entries_active_category_idx'`,
      );
      expect(rows[0]?.indexdef).toMatch(/where/i);
    });
  });
});

/**
 * Seeds two validators, three batches, and two entries. Deliberately inserts NO validation: the
 * uniqueness constraint is the subject under test, and a seeded response would make several
 * assertions collide with the seed instead of testing what they claim to.
 */
async function seed(database: TestDatabase): Promise<void> {
  await applySql(
    database,
    `insert into public.validators (id) values ('${VALIDATOR}'), ('${OTHER_VALIDATOR}');
     insert into public.validation_batches (id, validator_id, requested_size)
       values ('${BATCH}', '${VALIDATOR}', 10), ('${BATCH}_2', '${VALIDATOR}', 10),
              ('${BATCH}_3', '${OTHER_VALIDATOR}', 10);
     insert into public.dataset_entries (id, category, instruction, source_payload)
       values ('${ENTRY}', 'origin_destination', '${INSTRUCTION}', '{"id":"${ENTRY}"}'::jsonb),
              ('${OTHER_ENTRY}', 'origin_destination', 'Ibaba ti centro.', '{"id":"${OTHER_ENTRY}"}'::jsonb);`,
    "seed",
  );
}
