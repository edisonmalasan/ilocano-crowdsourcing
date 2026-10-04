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

import { isCorrectionRequired } from "@/lib/domain/validation-response";
import { EVALUATION_CHOICES } from "@/schemas/validation";
import { ILOCANO_PROFICIENCY_CHOICES } from "@/schemas/validator";

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
/**
 * The six RESEARCH tables, and only those.
 *
 * `researcher_signin_attempts` is deliberately absent, and the reason is the point of this constant
 * rather than an oversight. It arrived with researcher-admin-access and it is a real table in the
 * same schema, but it holds no validator response, no dataset entry, and no proficiency answer: it is
 * an operational rate-limit counter keyed by origin. The research boundary this list protects is
 * "the research data lives in exactly these six tables", and admitting an operational table would
 * weaken the claim without strengthening it.
 *
 * So the guard is split rather than loosened. This list still asserts the six research tables are
 * present, AND `tests/integration/researcher-signin-attempts.test.ts` asserts the counter table
 * exists, references none of the six by foreign key, and denies `anon` — so "nothing else in this
 * schema" is covered from both sides rather than being given up.
 */
const EXPECTED_TABLES = [
  "batch_entries",
  "dataset_entries",
  "validation_batches",
  "validation_sessions",
  "validations",
  "validators",
];

/**
 * Every table in the `public` schema that is NOT one of the six research tables.
 *
 * Held as a CLOSED list for the same reason {@link EXPECTED_TABLES} is: a new table added and not
 * listed here fails, rather than being silently absorbed. An open "anything else is fine" check would
 * pass on a seventh research table, which is precisely the mistake this file exists to prevent.
 *
 * `entry_reservations` joins this list — not the research list — for the reason the
 * counter's exclusion states below it: it holds keys (an entry id, an attempt id, two instants)
 * and no response, correction, translation, or proficiency. Its foreign keys point INTO the
 * research tables for cascade integrity, and the test after next pins that they point nowhere
 * else: keys are not data, but a new column holding data would be.
 */
const EXPECTED_NON_RESEARCH_TABLES = ["entry_reservations", "researcher_signin_attempts"];

const EXPECTED_MIGRATIONS = [
  "20260930120000_research_schema.sql",
  "20260930160000_required_bilingual_translations.sql",
  "20260930190000_allocation_batch_positions.sql",
  // Arrived with interrupted-batch recovery, for one reason: "the most recently created interrupted
  // batch" needs an age the table did not have. Listed here rather than derived from the directory,
  // which is the point of this constant - a migration added and not listed here fails rather than
  // being silently absorbed, which is the only way a CLOSED list stays closed.
  "20261001120000_validation_batches_created_at.sql",
  // Arrived with researcher-admin-access: the durable sign-in attempt counter, plus the two functions
  // that make its increment atomic and unreachable by `anon`. Same reason as the one above — a
  // migration the list does not name must FAIL here.
  "20261002120000_researcher_signin_attempts.sql",
  // Arrived with hosted-dataset-import: the single atomic, instruction-preserving upsert the
  // operator command calls. It ADDS one function and changes no table, so it appears here and in
  // neither table list below — which is the correct outcome rather than an omission. Same reason as
  // the entries above: a migration this list does not name must FAIL here, which is what keeps a
  // CLOSED list closed.
  "20261003120000_dataset_entries_import.sql",
  // Arrived with the hosted-dataset-import repair round: the corrected guard for the import
  // migration above. The import file's own precondition has two arms that cannot fire in the states
  // they name, and that file is applied and therefore immutable history — so the correction is
  // forward-only, in this file, which creates NOTHING (a `DO` block only). Same reason as above:
  // it appears here and in neither table list, because it adds no table and no function.
  "20261004120000_dataset_entries_import_guard.sql",
  // Arrived with entry-reservation-leases: the operational exclusivity table plus the atomic
  // claim and release functions. It ADDS one table and two functions and changes nothing else,
  // so it appears here and in the non-research table list, but not in the research list — which
  // is the correct outcome rather than an omission. Same reason as the entries above: a
  // migration this list does not name must FAIL here, which is what keeps a CLOSED list closed.
  "20261004130000_entry_reservations.sql",
  // Arrived with rpc-execute-hardening: explicit EXECUTE revokes from anon/authenticated on the
  // five privileged RPC functions. It changes no table, policy, or function body, so it appears
  // here and in no table list — which is the correct outcome rather than an omission. Same reason
  // as the entries above: a migration this list does not name must FAIL here.
  "20261004140000_rpc_execute_hardening.sql",
  // Arrived with optional-research-translations: drops the required bilingual pair and keeps a
  // single cannot_evaluate direction. It changes one dropped pair and one added CHECK and no
  // table, column, policy, or function, so it appears here and in no table list. Same reason as
  // the entries above: a migration this list does not name must FAIL here, which is what keeps
  // a CLOSED list closed.
  "20261004150000_translation_choice_allowance.sql",
] as const;

/**
 * The two required research translations, as a `columns`/`values` fragment.
 *
 * Used by every test whose row is meant to be ACCEPTED on a `correct_natural` evaluation where
 * translations are incidental to the rule under test. Translations are optional per response now,
 * so an evaluable insert without this fragment still stores — but the row would then exercise
 * two rules at once, and a failure would name the wrong one.
 */
const BOTH_TRANSLATIONS = {
  columns: ", english_translation, filipino_translation",
  values: ", 'Ride the jeep.', 'Sumakay ng jeep.'",
} as const;

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

  /**
   * Asserts the statement is rejected, and that the reason names the expected constraint.
   *
   * `pattern` must match the constraint NAME, not merely the phrase "check constraint". The engine
   * names the constraint in every violation message — measured, not assumed: an out-of-vocabulary
   * proficiency reports `violates check constraint "validators_proficiency_known"`, and an orphan
   * reports `violates foreign key constraint "validations_validator_id_fkey"` — so the name is
   * available to every caller here. A pattern that accepted the generic phrase would pass when a
   * DIFFERENT constraint fired, which is how a test can be green while proving nothing about the
   * rule it names.
   */
  async function expectRejected(sql: string, pattern: RegExp): Promise<void> {
    await expect(applySql(db, sql, "statement expected to be rejected")).rejects.toThrow(pattern);
  }

  /**
   * Inserts a validation, which most tests need but none should inherit from the seed.
   *
   * `correct_natural` with BOTH translations, because that is the only legal shape for an evaluable
   * row. Several tests below are about uniqueness, foreign keys, or RLS, and their rows must not
   * trip the bilingual constraint on the way in — the failure they assert has to be the one they name.
   */
  async function insertValidation(id: string, validatorId: string, entryId: string): Promise<void> {
    await applySql(
      db,
      `insert into public.validations
         (id, validator_id, dataset_entry_id, batch_id, evaluation${BOTH_TRANSLATIONS.columns})
       values ('${id}', '${validatorId}', '${entryId}', '${BATCH}', 'correct_natural'${BOTH_TRANSLATIONS.values})`,
      `validation ${id}`,
    );
  }

  describe("applying the migration set", () => {
    it("reads from the production migrations directory, not a test fixture", async () => {
      // Asserting the exact list, not a count. `applyMigrations` returns an empty list for a
      // missing or empty directory and still succeeds, so a count check would pass on a broken
      // path or a typo'd glob and report a green test for the wrong reason.
      const migrations = await readMigrations();
      expect(migrations.map((m: MigrationFile) => m.filename)).toEqual([...EXPECTED_MIGRATIONS]);
    });

    it("applies exactly the expected migrations, in filename order", async () => {
      // The ORDER is asserted, not just the set. The bilingual migration's precondition must run
      // before its column drop, and `applyMigrations` is what establishes filename ordering — so
      // the ordering claim is only meaningful if it is read off the applier's actual output.
      const fresh = await createTestDatabase();
      try {
        const { applied } = await applyMigrations(fresh);
        expect(applied).toEqual([...EXPECTED_MIGRATIONS]);
      } finally {
        await closeTestDatabase(fresh);
      }
    });
  });

  describe("tables", () => {
    it("creates the six research tables, and every other table is one this file names", async () => {
      const tables = await query<{ table_name: string }>(
        db,
        "select table_name from information_schema.tables where table_schema = 'public' order by table_name",
      );
      const found = tables.map((row) => row.table_name);

      // TWO CLOSED LISTS whose union must equal what is in the schema, rather than one list and an
      // open "and nothing else". The single-list form stopped being true when the operational
      // sign-in counter arrived, and the two available repairs were both bad: dropping the guard, or
      // adding an operational table to a list named for RESEARCH tables.
      //
      // This keeps the original claim intact and adds the one that was actually missing — that a new
      // table has to be classified. A seventh table fails here unless someone has decided, in writing,
      // whether it is research data or operational state.
      expect(found.filter((name) => EXPECTED_TABLES.includes(name))).toEqual(EXPECTED_TABLES);
      expect(found.filter((name) => !EXPECTED_TABLES.includes(name))).toEqual(
        EXPECTED_NON_RESEARCH_TABLES,
      );
      // And the partition is total, so a table cannot slip through by being in neither list.
      expect([...EXPECTED_TABLES, ...EXPECTED_NON_RESEARCH_TABLES].sort()).toEqual(found);
    });

    it("keeps the operational counter out of the research tables by construction", async () => {
      // The reason the split above is legitimate rather than a loosening. If the counter held research
      // data by reference — a foreign key into `validators`, say — then calling it "operational" would
      // be a naming decision contradicting the schema, and putting it in a separate list would have
      // moved real research data out of the set the research guard watches.
      const rows = await query<{ count: number }>(
        db,
        `select count(*)::int as count
           from pg_constraint c
           join pg_class t on t.oid = c.conrelid
           join pg_namespace n on n.oid = t.relnamespace
          where n.nspname = 'public'
            and t.relname = 'researcher_signin_attempts'
            and c.contype = 'f'`,
      );
      expect(rows[0]?.count).toBe(0);
    });

    it("lets the reservation table reference research rows by key, and nothing else", async () => {
      // Keys are not data: `entry_id` and `validator_id` point at dataset_entries and validators
      // for cascade integrity, which is why this table may live outside the research list. But a
      // future column reaching for response content — a correction, a translation, a proficiency —
      // would make "operational" a lie, so the referenced set is pinned exactly, not as a
      // superset. Two references, both keys, neither content.
      const rows = await query<{ ref_table: string; ref_column: string }>(
        db,
        `select ccu.table_name as ref_table, ccu.column_name as ref_column
           from information_schema.table_constraints tc
           join information_schema.constraint_column_usage ccu
             on ccu.constraint_name = tc.constraint_name
            and ccu.constraint_schema = tc.constraint_schema
          where tc.constraint_type = 'FOREIGN KEY'
            and tc.table_schema = 'public'
            and tc.table_name = 'entry_reservations'
          order by ccu.column_name`,
      );
      expect(rows.map((row) => `${row.ref_table}.${row.ref_column}`).sort()).toEqual([
        "dataset_entries.id",
        "validators.id",
      ]);
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
      // A CLOSED set, not "contains these five and none of these five names". A deny-list has to
      // guess the name of every identifying column someone might add; `full_name`, `ip_address`,
      // `user_agent`, and `region` would all pass it. The closed form cannot be fooled by naming
      // something this test never thought of, and it fails the moment anyone adds a column at
      // all — which is the point, because a new column on this table is a decision that has to be
      // made deliberately against the anonymity invariant rather than slipped in.
      //
      // The invariant is enforced three times over: here, by the `strictObject` domain schema in
      // `@/schemas/validator`, and by the migration having nowhere to put such a value.
      expect(columns.map((row) => row.column_name).sort()).toEqual([
        "created_at",
        "id",
        "ilocano_proficiency",
        "last_active_at",
        "total_validations",
      ]);
    });

    it("gives the structural tables only their identity, their foreign keys, and the two columns behaviour actually reads", async () => {
      // The spec says these three "carry only the columns those foreign keys and their own identity
      // require" — with TWO named exceptions, each added by a delta that shipped behaviour with it:
      //
      //   - `batch_entries.position`, added by the coverage-aware-allocation delta, recording the
      //     server-selected order of its batch.
      //   - `validation_batches.created_at`, added by the interrupted-batch-recovery delta, to make
      //     "the most recently created interrupted batch" a total order rather than a guess.
      //
      // The test is still a CLOSED set, asserted per table, not a "contains the required columns"
      // check that a lifecycle column would pass.
      //
      // ============================================================================================
      // THIS COMMENT PREVIOUSLY NAMED `created_at` AS FORBIDDEN, AND THAT WAS A REAL CLAIM
      // ============================================================================================
      // It said: "that is the assertion that would fail if `status`, `assigned_at`, `completed_at`, or
      // `created_at` were added". Two of those four are still forbidden and still fail this test. The
      // third — `created_at` — was named on the reasonable expectation that it never would arrive,
      // and it arrived, with a migration and a reason.
      //
      // The honest correction is to narrow the list rather than delete the sentence: the guard's VALUE
      // was always in the specific names it refuses, and a comment listing four names of which one is
      // now legitimate would leave a reader trusting the other three and wondering what happened to
      // the fourth. `status`, `assigned_at`, and `completed_at` remain forbidden. So does a SECOND
      // timestamp: `updated_at`, `last_active_at`, and `abandoned_at` are refused here too, because
      // "the column arrived with a reason" must not become "timestamps are welcome" — the reason is
      // per-column, and the next one has not arrived yet.
      //
      // `batch_entries` legitimately carries no `id`: its primary key IS the pair.
      const expected = new Map<string, string[]>([
        ["validation_sessions", ["id", "validator_id"]],
        ["validation_batches", ["created_at", "id", "validator_id"]],
        ["batch_entries", ["batch_id", "dataset_entry_id", "position"]],
      ]);

      for (const [table, columns] of expected) {
        const rows = await query<{ column_name: string }>(
          db,
          `select column_name from information_schema.columns
           where table_schema = 'public' and table_name = $1 order by column_name`,
          [table],
        );
        expect(
          rows.map((row) => row.column_name),
          `columns of ${table}`,
        ).toEqual(columns);
      }

      // The forbidden set as an ENUMERATION of names, stated rather than left to the closed set above.
      // What this adds is the REASON a future author should read: these are the names that keep
      // failing, and one name that used to be on this list is now legitimately expected.
      const batchColumns = (
        await query<{ column_name: string }>(
          db,
          `select column_name from information_schema.columns
           where table_schema = 'public' and table_name = 'validation_batches'`,
          [],
        )
      ).map((row) => row.column_name);

      expect(
        [
          "status",
          "assigned_at",
          "completed_at",
          "updated_at",
          "last_active_at",
          "abandoned_at",
        ].filter((forbidden) => batchColumns.includes(forbidden)),
        "a column arrived that no behaviour reads",
      ).toEqual([]);
    });

    it("defines no constraint describing a lifecycle the batch-completion change has not built", async () => {
      // The companion to the closed column set. A check constraint on a structural table is
      // behavior: `validation_batches` originally carried `requested_size` with a `1..50` bound
      // mirroring `BATCH_SIZE_HARD_MAX`, which is a second authority for a constant the allocation
      // change owns. Foreign keys, each table's primary key, and — on `batch_entries` alone — the
      // two constraints that make `position` mean something are the only constraints these tables
      // may define.
      //
      // NARROWED BY THE SPEC DELTA, and it is worth being explicit that this assertion is WEAKER
      // than the one it replaced. Before the allocation change, `batch_entries` could declare no
      // constraint beyond its foreign keys and its primary key, and this test enforced that. The
      // delta admits `batch_entries_batch_position_unique` and `batch_entries_position_positive`,
      // so the closed set here now has a named exception — which is a real loss of strictness, paid
      // for a behavior the allocation change genuinely implements. What keeps it from becoming a
      // loophole is that the exception is enumerated in `contype` terms only (a `c` and a `u` on
      // one named table), so a LIFECYCLE constraint on `validation_batches` still fails here, and
      // the names themselves are asserted in `migration-precondition.test.ts` rather than left to
      // this count to imply.
      //
      // `pg_constraint.contype` rather than `information_schema.table_constraints`, because the
      // information schema view reports a `NOT NULL` column constraint as a `CHECK` — measured, not
      // assumed: filtering that view for `CHECK` here returned six rows, one per NOT NULL column,
      // which would make the very columns under test look like invented behavior. `pg_constraint`
      // reports what is actually declared, and `NOT NULL` is not a row in it on this engine.
      const rows = await query<{ table_name: string; contype: string }>(
        db,
        `select c.relname as table_name, con.contype
         from pg_constraint con
         join pg_class c on c.oid = con.conrelid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname in ('validation_sessions', 'validation_batches', 'batch_entries')
         order by c.relname, con.contype`,
      );

      // Closed, per table. `batch_entries` has two foreign keys and no `id`, because its primary
      // key is the pair, plus exactly the two `position` constraints the delta admits — ordered
      // `c`, `f`, `f`, `p`, `u`, which is PostgreSQL's own collation over `contype`. The
      // `requested_size between 1 and 50` bound this replaces is a `contype = 'c'` here, so adding
      // lifecycle behavior back to `validation_batches` fails the test rather than passing behind an
      // `arrayContaining`.
      expect(rows.map((row) => `${row.table_name}:${row.contype}`)).toEqual([
        "batch_entries:c",
        "batch_entries:f",
        "batch_entries:f",
        "batch_entries:p",
        "batch_entries:u",
        "validation_batches:f",
        "validation_batches:p",
        "validation_sessions:f",
        "validation_sessions:p",
      ]);
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
      // Carries both translations, because otherwise the bilingual constraint would fire first and
      // the named uniqueness constraint would never be reached. The pattern allows the generic
      // "duplicate key" phrase too, since a unique violation is reported as `23505` with that
      // wording, but the test is about uniqueness and must not pass on the wrong failure.
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation${BOTH_TRANSLATIONS.columns})
         values ('res_02', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_natural'${BOTH_TRANSLATIONS.values})`,
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
    // Rows here are about the evaluation and proficiency VOCABULARIES, not about translations, so
    // each one supplies `BOTH_TRANSLATIONS` to hold translations constant. Without them an
    // evaluable row would still store — translations are optional now — but the row would then
    // exercise two rules at once, and a failure would name the wrong one.

    it("rejects an evaluation outside the four approved values", async () => {
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation${BOTH_TRANSLATIONS.columns})
         values ('res_bad', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'looks_fine'${BOTH_TRANSLATIONS.values})`,
        /validations_evaluation_known/i,
      );
    });

    it("rejects the display label casing rather than the stored value", async () => {
      // A guard against the exact mistake of writing the check against `Correct and natural`,
      // which would make the column unwritable for every real validator.
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation${BOTH_TRANSLATIONS.columns})
         values ('res_label', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'Correct and natural'${BOTH_TRANSLATIONS.values})`,
        /validations_evaluation_known/i,
      );
    });

    it("rejects an unapproved proficiency value", async () => {
      await expectRejected(
        `insert into public.validators (id, ilocano_proficiency) values ('VAL_0000cafe', 'expert')`,
        /validators_proficiency_known/i,
      );
    });

    it("rejects a blank correction, so absent and empty stay distinguishable", async () => {
      // `''` would make "the validator supplied a correction" indistinguishable from "the
      // validator left it blank" — the exact ambiguity normalizeResearchText returns null to avoid.
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, corrected_instruction${BOTH_TRANSLATIONS.columns})
         values ('res_blank', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'incorrect', '   '${BOTH_TRANSLATIONS.values})`,
        /validations_corrected_instruction_not_blank/i,
      );
    });

    it("rejects a blank translation, so absent and empty stay distinguishable", async () => {
      // The same defect class as the blank correction, on each of the two new columns. A bare
      // `is not null` check would accept `'   '`, which carries no translation at all while
      // satisfying a not-null test — the reason these constraints use `btrim`.
      for (const column of ["english_translation", "filipino_translation"]) {
        const other =
          column === "english_translation" ? "filipino_translation" : "english_translation";
        const constraint =
          column === "english_translation"
            ? "validations_english_translation_not_blank"
            : "validations_filipino_translation_not_blank";
        await expectRejected(
          `insert into public.validations
             (id, validator_id, dataset_entry_id, batch_id, evaluation, ${column}, ${other})
           values ('res_bt', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_natural', '   ', 'Ride the jeep.')`,
          new RegExp(constraint, "i"),
        );
      }
    });

    it("accepts every approved evaluation, so the checks cannot be too strict to write", async () => {
      // The other direction, and the one a set of rejection tests can never establish. If
      // `cannot_evaluate` were dropped, or one evaluation value were misspelled in the CHECK, every
      // rejection test above would stay green while a real validator's answer became unwritable.
      // The values are read from the shipped domain module rather than retyped here, so this also
      // fails if the SQL and the domain ever disagree.
      //
      // Each row is built from the DOMAIN PREDICATES, not from a retyped table, so it is what a
      // real validator's submission looks like for that evaluation in its MINIMAL form: the
      // correction only where `isCorrectionRequired`, and no translations at all. Absence is a
      // legitimate choice now, so the minimal form is the strictest proof the checks are not too
      // strict — a row carrying translations would pass a check that wrongly demanded them.
      for (const [index, choice] of EVALUATION_CHOICES.entries()) {
        const entryId = `OD_1${String(index).padStart(3, "0")}`;
        const other = `VAL_00${String(index).padStart(4, "0")}`;
        const correction = isCorrectionRequired(choice.value);
        const columns = [
          "id",
          "validator_id",
          "dataset_entry_id",
          "batch_id",
          "evaluation",
          ...(correction ? ["corrected_instruction"] : []),
        ].join(", ");
        const values = [
          `'res_${choice.value}'`,
          `'${other}'`,
          `'${entryId}'`,
          `'${BATCH}'`,
          `'${choice.value}'`,
          ...(correction ? ["'Ti sentro ti ospital.'"] : []),
        ].join(", ");
        await applySql(
          db,
          `insert into public.validators (id) values ('${other}');
           insert into public.dataset_entries
             (id, category, instruction, source_payload)
           values ('${entryId}', 'origin_destination', 'Ti sentro.', '{"id":"${entryId}"}'::jsonb);
           insert into public.validations (${columns}) values (${values});`,
          `approved evaluation ${choice.value}`,
        );
      }
      const rows = await query<{ evaluation: string }>(
        db,
        "select evaluation from public.validations order by evaluation",
      );
      expect(rows.map((row) => row.evaluation)).toEqual(
        [...EVALUATION_CHOICES.map((choice) => choice.value)].sort(),
      );
    });

    it("accepts all five approved proficiency values, and absent", async () => {
      // Same reasoning for the proficiency vocabulary. A dropped value would not fail any
      // rejection test; it would make one of the five screening answers unrecordable.
      // Scoped to this test's own id prefix: the table also holds the seed's two validators, and
      // an unscoped count would be a statement about the fixture rather than about the vocabulary.
      const prefix = "VAL_01";
      const values = [...ILOCANO_PROFICIENCY_CHOICES.map((choice) => choice.value), null];
      for (const [index, value] of values.entries()) {
        await applySql(
          db,
          `insert into public.validators (id, ilocano_proficiency)
           values ('${prefix}${String(index).padStart(4, "0")}', ${value === null ? "null" : `'${value}'`})`,
          `approved proficiency ${value ?? "absent"}`,
        );
      }
      const rows = await query<{ ilocano_proficiency: string | null }>(
        db,
        "select ilocano_proficiency from public.validators where id like $1 order by id",
        [`${prefix}%`],
      );
      expect(rows).toHaveLength(values.length);
      // A sorted set, not `toContain` per value. `toContain` would pass if two rows carried the
      // same value and another approved value were never stored at all, so the multiset is
      // compared directly.
      expect(rows.map((row) => row.ilocano_proficiency).sort()).toEqual(
        values.map((value) => value).sort(),
      );
    });

    it("names both required translation columns, and no language column at all", async () => {
      // A CLOSED column set for `validations`, because the removal of the language discriminator is
      // the structural claim this change makes: the languages are named by the columns that hold
      // them, so a request naming a language is unrepresentable rather than rejected at runtime.
      //
      // Proved by reading `pg_catalog` rather than by inserting into a column that should not exist,
      // because the absence of a column is not an error to catch — a wrong column name simply fails
      // with "column does not exist", which is a statement about the query, not about the schema.
      const columns = await query<{ column_name: string }>(
        db,
        `select column_name from information_schema.columns
         where table_schema = 'public' and table_name = 'validations' order by column_name`,
      );

      expect(columns.map((row) => row.column_name)).toEqual([
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

    it("accepts both required translations, so the not-blank checks are not over-tight", async () => {
      // The direction a rejection test can never establish. If a `btrim` check were written
      // around a `lower()` or a length bound, real translations could become unwritable while
      // every rejection test stayed green.
      //
      // Self-contained: it writes its own row rather than reading one another test inserted, so it
      // cannot pass or fail depending on test order. That dependence was a real defect once — an
      // earlier version read `res_ok1`, which only exists after a different test has run.
      await applySql(
        db,
        `insert into public.validators (id) values ('VAL_0000b001');
         insert into public.validation_batches (id, validator_id, created_at)
      values ('batch_b1', 'VAL_0000b001', '2026-09-30T12:00:00.000Z');
         insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation${BOTH_TRANSLATIONS.columns})
         values ('res_both', 'VAL_0000b001', '${OTHER_ENTRY}', 'batch_b1', 'correct_natural'${BOTH_TRANSLATIONS.values});`,
        "a complete bilingual response",
      );
      const rows = await query<{ english_translation: string; filipino_translation: string }>(
        db,
        `select english_translation, filipino_translation from public.validations where id = $1`,
        ["res_both"],
      );
      expect(rows[0]?.english_translation).toBe("Ride the jeep.");
      expect(rows[0]?.filipino_translation).toBe("Sumakay ng jeep.");
    });

    it("accepts absent optional fields", async () => {
      // A validator may exist before screening, and `cannot_evaluate` carries no correction and no
      // translations. Both are legitimate, so neither may be blocked by a not-null constraint. This
      // is the one evaluable-looking row that has NULL translations, and it must be legal.
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
      const stored = await query<{
        english_translation: string | null;
        filipino_translation: string | null;
      }>(
        db,
        "select english_translation, filipino_translation from public.validations where id = $1",
        ["res_05"],
      );
      expect(stored[0]?.english_translation).toBeNull();
      expect(stored[0]?.filipino_translation).toBeNull();
    });
  });

  describe("cross-column integrity", () => {
    // Per-column checks cannot express these, so a row can satisfy every vocabulary and not-blank
    // constraint above and still be a record the domain schema rejects. Each test here pins one
    // such combination, in both directions: the combination the domain refuses is rejected, and
    // the combination it allows is accepted. A test that only proved the rejection would pass
    // against a constraint that was accidentally far too strict.
    //
    // Every rejection below matches the constraint BY NAME. A generic `check constraint` pattern
    // would pass when a different constraint fired, which is how a green test can prove nothing.

    it("requires a correction for the two evaluations that demand one", async () => {
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation${BOTH_TRANSLATIONS.columns})
         values ('res_nocorr', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'incorrect'${BOTH_TRANSLATIONS.values})`,
        /validations_correction_matches_evaluation/i,
      );
    });

    it("refuses a correction on an evaluation that does not take one", async () => {
      // The other direction. A constraint that only required corrections would allow this, and the
      // result would be a `correct_natural` record carrying an edit nobody asked for.
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, corrected_instruction${BOTH_TRANSLATIONS.columns})
         values ('res_extra', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_natural', 'Gemahen ti jeep.'${BOTH_TRANSLATIONS.values})`,
        /validations_correction_matches_evaluation/i,
      );
    });

    // The translation-choice quadrants. Each evaluable shape below is ACCEPTED: per-response
    // choice means an evaluable row may carry neither, either, or both translations. Only
    // `cannot_evaluate` refuses translations, matched to the NAMED constraint that refuses them.

    it("accepts an evaluable validation with NO translations, the validator having skipped", async () => {
      // The behavioural statement of the methodology change at the storage layer. Both not-blank
      // checks pass vacuously on NULL, and no cross-column constraint demands translations of an
      // evaluable row — so the skipped-translation response stores as a judgment without cover.
      await applySql(
        db,
        `insert into public.validations (id, validator_id, dataset_entry_id, batch_id, evaluation)
         values ('res_notr', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_natural')`,
        "skipped-translation evaluable row",
      );
      const rows = await query<{ id: string }>(
        db,
        "select id from public.validations where id = 'res_notr'",
      );
      expect(rows.map((row) => row.id)).toEqual(["res_notr"]);
    });

    it("accepts an evaluable validation with only the English translation", async () => {
      await applySql(
        db,
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, english_translation)
         values ('res_enonly', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_natural', 'Ride the jeep.')`,
        "English-only evaluable row",
      );
      const rows = await query<{ id: string }>(
        db,
        "select id from public.validations where id = 'res_enonly'",
      );
      expect(rows.map((row) => row.id)).toEqual(["res_enonly"]);
    });

    it("accepts an evaluable validation with only the Filipino translation", async () => {
      await applySql(
        db,
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, filipino_translation)
         values ('res_filonly', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_natural', 'Sumakay ng jeep.')`,
        "Filipino-only evaluable row",
      );
      const rows = await query<{ id: string }>(
        db,
        "select id from public.validations where id = 'res_filonly'",
      );
      expect(rows.map((row) => row.id)).toEqual(["res_filonly"]);
    });

    it("rejects a translation on an entry the validator could not evaluate", async () => {
      // `cannot_evaluate` means the validator was not confident enough to judge the entry, so there
      // is no reliable content to translate. The domain refuses this combination outright.
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, english_translation, filipino_translation)
         values ('res_cantr', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'cannot_evaluate',
                 'Ride the jeep.', 'Sumakay ng jeep.')`,
        /validations_no_translation_when_unevaluable/i,
      );
    });

    it("rejects an English-only translation on a cannot_evaluate response", async () => {
      // The other half of the pair below, and the row the `domain-contracts` delta calls out by name
      // ("A response missing one translation does not qualify"). Asserting only the Filipino-only
      // direction would leave the English-only one untested, and the two are symmetric by
      // construction rather than by observation — the constraint's predicate tests them alike, but
      // "alike in the source" is not evidence that a typo in one column name is caught.
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, english_translation)
         values ('res_cantr1', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'cannot_evaluate', 'Ride the jeep.')`,
        /validations_no_translation_when_unevaluable/i,
      );
    });

    it("rejects a Filipino-only translation on a cannot_evaluate response", async () => {
      // The half-translated `cannot_evaluate` row, which is the case a single
      // "both must be null" test would miss.
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, filipino_translation)
         values ('res_cantr2', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'cannot_evaluate', 'Sumakay ng jeep.')`,
        /validations_no_translation_when_unevaluable/i,
      );
    });

    it("rejects a correction on a cannot_evaluate response, independently of translations", async () => {
      // Asserted with both translations absent, so the correction constraint is what fires. If the
      // bilingual constraint were removed entirely this test would still pass — that is the point:
      // the two rules are independent, and a change to one must not be masked by the other.
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, corrected_instruction)
         values ('res_cancorr', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'cannot_evaluate', 'Gemahen ti jeep.')`,
        /validations_correction_matches_evaluation/i,
      );
    });

    it("accepts every combination the domain allows", async () => {
      // The other direction, and the reason the constraints are worth having: a schema that
      // refused these would destroy real research responses, which is the worse failure. Seven
      // accepted shapes, one row each: the four legacy shapes plus the three translation-choice
      // shapes (skipped, English-only, Filipino-only) this change adds.
      //
      // A third validator and entry are seeded here because `UNIQUE (validator_id,
      // dataset_entry_id)` allows one response per pair, and the four legacy rows already hold
      // all four pairs of the two seeded parents.
      await applySql(
        db,
        `insert into public.validators (id) values ('VAL_0000cafe');
         insert into public.dataset_entries (id, category, instruction, source_payload)
         values ('OD_0003', 'origin_destination', 'Umasideg ti plaza.', '{"id":"OD_0003"}'::jsonb);
         insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation${BOTH_TRANSLATIONS.columns})
         values ('res_ok1', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_natural'${BOTH_TRANSLATIONS.values});
         insert into public.validations (id, validator_id, dataset_entry_id, batch_id, evaluation)
         values ('res_ok2', '${OTHER_VALIDATOR}', '${OTHER_ENTRY}', '${BATCH}_2', 'cannot_evaluate');
         insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, corrected_instruction${BOTH_TRANSLATIONS.columns})
         values ('res_ok3', '${VALIDATOR}', '${OTHER_ENTRY}', '${BATCH}', 'incorrect',
                 'Gemahen ti jeep.'${BOTH_TRANSLATIONS.values});
         insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, corrected_instruction${BOTH_TRANSLATIONS.columns})
         values ('res_ok4', '${OTHER_VALIDATOR}', '${ENTRY}', '${BATCH}_2', 'correct_unnatural',
                 'Gemahen ti jeep.'${BOTH_TRANSLATIONS.values});
         insert into public.validations (id, validator_id, dataset_entry_id, batch_id, evaluation)
         values ('res_ok5', 'VAL_0000cafe', 'OD_0003', '${BATCH}_2', 'correct_natural');
         insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, english_translation)
         values ('res_ok6', 'VAL_0000cafe', '${ENTRY}', '${BATCH}_2', 'correct_natural',
                 'Ride the jeep.');
         insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, filipino_translation)
         values ('res_ok7', 'VAL_0000cafe', '${OTHER_ENTRY}', '${BATCH}_3', 'correct_natural',
                 'Sumakay ng jeep.');`,
        "the accepted combinations",
      );
      const rows = await query<{ count: number }>(
        db,
        "select count(*)::int as count from public.validations",
      );
      expect(rows[0]?.count).toBe(7);
    });
  });

  describe("referential integrity", () => {
    // Each pattern names the specific constraint, because a generic one would pass on the wrong
    // failure. "rejects a validation for a dataset entry that does not exist" must not be satisfied
    // by a foreign key on `validator_id` firing instead.

    it("rejects a validation for a validator that does not exist", async () => {
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation${BOTH_TRANSLATIONS.columns})
         values ('res_orphan', 'VAL_deadbeef', '${ENTRY}', '${BATCH}', 'correct_natural'${BOTH_TRANSLATIONS.values})`,
        /foreign key constraint "validations_validator_id_fkey"/i,
      );
    });

    it("rejects a validation for a dataset entry that does not exist", async () => {
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation${BOTH_TRANSLATIONS.columns})
         values ('res_orphan2', '${VALIDATOR}', 'OD_9999', '${BATCH}', 'correct_natural'${BOTH_TRANSLATIONS.values})`,
        /foreign key constraint "validations_dataset_entry_id_fkey"/i,
      );
    });

    it("rejects a validation for a batch that does not exist", async () => {
      await expectRejected(
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation${BOTH_TRANSLATIONS.columns})
         values ('res_orphan3', '${VALIDATOR}', '${ENTRY}', 'batch_nope', 'correct_natural'${BOTH_TRANSLATIONS.values})`,
        /foreign key constraint "validations_batch_id_fkey"/i,
      );
    });

    it("refuses to delete a validator who has responses", async () => {
      // Deleting a validator must not take their research responses with it as a side effect. The
      // constraint named here is on `validation_batches`, not on `validations`: the seed gives this
      // validator a batch, and that reference is checked before the deeper one is reached. Both
      // are `on delete restrict`, so the guarantee holds either way — but a pattern that accepted
      // any foreign key would not distinguish which one fired.
      await insertValidation("res_01", VALIDATOR, ENTRY);
      await expectRejected(
        `delete from public.validators where id = '${VALIDATOR}'`,
        /foreign key constraint "validation_batches_validator_id_fkey"/i,
      );
    });

    it("refuses to delete a dataset entry that has responses", async () => {
      await insertValidation("res_01", VALIDATOR, ENTRY);
      await expectRejected(
        `delete from public.dataset_entries where id = '${ENTRY}'`,
        /foreign key constraint "validations_dataset_entry_id_fkey"/i,
      );
    });
  });

  describe("correction immutability", () => {
    it("leaves the dataset entry instruction untouched when a correction is stored", async () => {
      const corrected = "Iti Baguio Athletic Bowl ti ayanko ita, napay a duman.";
      await applySql(
        db,
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, corrected_instruction${BOTH_TRANSLATIONS.columns})
         values ('res_corr', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_unnatural', '${corrected}'${BOTH_TRANSLATIONS.values})`,
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

    it("stores the correction and both translations on the validation, not on the entry", async () => {
      const corrected = "Iti Baguio Athletic Bowl ti ayanko ita, napay a duman.";
      await applySql(
        db,
        `insert into public.validations
           (id, validator_id, dataset_entry_id, batch_id, evaluation, corrected_instruction${BOTH_TRANSLATIONS.columns})
         values ('res_corr', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_unnatural', '${corrected}'${BOTH_TRANSLATIONS.values})`,
        "validation with a correction",
      );
      const rows = await query<{
        corrected_instruction: string;
        english_translation: string;
        filipino_translation: string;
      }>(
        db,
        "select corrected_instruction, english_translation, filipino_translation from public.validations where id = $1",
        ["res_corr"],
      );
      expect(rows[0]?.corrected_instruction).toBe(corrected);
      expect(rows[0]?.english_translation).toBe("Ride the jeep.");
      expect(rows[0]?.filipino_translation).toBe("Sumakay ng jeep.");

      // And the immutable source is still untouched after storing all three pieces of response data.
      const entries = await query<{ instruction: string; source_payload: Record<string, unknown> }>(
        db,
        "select instruction, source_payload from public.dataset_entries where id = $1",
        [ENTRY],
      );
      expect(entries[0]?.instruction).toBe(INSTRUCTION);
      expect(entries[0]?.source_payload).toEqual({ id: ENTRY });
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

    it("rejects an insert from anon with a row level security error", async () => {
      // The LOUD half, and the only loud one. The tables must be reached through applyMigrations,
      // which applies the grants: createTestDatabase does not grant privileges, so a test that
      // built its own tables would see "permission denied for table" for every role and mistake a
      // grant problem for an RLS result.
      await expect(
        asRole(db, { role: "anon" }, async (tx) => {
          await tx.query("insert into public.validators (id) values ($1)", ["VAL_0000dead"]);
        }),
      ).rejects.toThrow(/row-level security/i);
    });

    it("fails SILENTLY on a denied update or delete, and says so rather than claiming loudness", async () => {
      // Measured, not assumed. A deny-all policy filters the rows an update or delete may see
      // rather than refusing the statement, so it completes against zero rows with no error. The
      // data is untouched — which is why the asymmetry is recorded instead of a loudness the
      // posture does not provide.
      //
      // This is also the sharpest reason the repository contract forbids reading an unremarkable
      // write as success: `SupabaseValidatorsRepository.touchLastActive` is an update, and a
      // caller holding a public credential would see it succeed while nothing changed.
      for (const role of ["anon", "authenticated"] as const) {
        const affected = await asRole(db, { role }, async (tx) => {
          const updated = await tx.query(
            "update public.validators set total_validations = 99 where id = $1",
            [VALIDATOR],
          );
          const deleted = await tx.query("delete from public.validators where id = $1", [
            OTHER_VALIDATOR,
          ]);
          return { updated: updated.rows.length, deleted: deleted.rows.length };
        });

        // No throw is the assertion. Had the statement been refused, `asRole` would have rejected.
        expect(affected).toEqual({ updated: 0, deleted: 0 });
      }

      // And the data really is unchanged, so "silent" is not "unsound".
      const rows = await query<{ id: string; total_validations: number }>(
        db,
        "select id, total_validations from public.validators order by id",
      );
      expect(rows).toEqual([
        { id: VALIDATOR, total_validations: 0 },
        { id: OTHER_VALIDATOR, total_validations: 0 },
      ]);
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
     -- \`created_at\` is supplied because migration \`20261001120000\` makes it \`not null\` with no
     -- default, so an insert that omits it is refused rather than dated by the database. The third
     -- row belongs to a DIFFERENT validator and carries the newest instant of the three, which is
     -- what makes it a real test of the ownership filter rather than of the ordering.
     insert into public.validation_batches (id, validator_id, created_at)
       values ('${BATCH}', '${VALIDATOR}', '2026-09-30T12:00:00.000Z'),
              ('${BATCH}_2', '${VALIDATOR}', '2026-09-30T12:30:00.000Z'),
              ('${BATCH}_3', '${OTHER_VALIDATOR}', '2026-09-30T13:00:00.000Z');
     insert into public.dataset_entries (id, category, instruction, source_payload)
       values ('${ENTRY}', 'origin_destination', '${INSTRUCTION}', '{"id":"${ENTRY}"}'::jsonb),
              ('${OTHER_ENTRY}', 'origin_destination', 'Ibaba ti centro.', '{"id":"${OTHER_ENTRY}"}'::jsonb);`,
    "seed",
  );
}
