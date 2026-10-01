/**
 * The lifetime figure counts every recorded response, including one recorded as "cannot confidently
 * evaluate" (`design.md` D2, `tasks.md` 1.2).
 *
 * WHY A DATABASE TEST AT ALL
 * --------------------------
 * The repository method `SupabaseValidationsRepository.countForValidator` is a PostgREST query, so a
 * unit test with a recording fake can only assert the FILTERS it was given — `[{eq, validator_id}]`
 * — and that is already asserted in `tests/unit/repositories-supabase.test.ts`. What a fake cannot
 * do is show what that filter MEANS against a real schema: whether a `cannot_evaluate` row is even
 * storable, whether it is really invisible to a predicate that excludes it, and whether the count
 * that comes back is the number of answers or the number of confident answers.
 *
 * Those are the two halves of D2, and both are properties of the DATA rather than of the query
 * string, so they are measured here against real rows on a real PostgreSQL engine.
 *
 * WHAT THIS DOES NOT PROVE
 * -----------------------
 * The count is issued by SQL written out below, not by PostgREST. That the Supabase client's
 * `select(..., { count: "exact", head: true })` translates into this predicate is asserted in the
 * unit test above; that translation is not re-proved here, and PGlite is not Supabase. See
 * `AGENTS.md` -> Verified project tools.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { isCorrectionRequired } from "@/lib/domain/validation-response";

import { applyMigrations } from "./support/migrations";
import {
  applySql,
  closeTestDatabase,
  createTestDatabase,
  query,
  truncateAll,
  type TestDatabase,
} from "./support/pglite";

const VALIDATOR = "VAL_0000beef";
const OTHER_VALIDATOR = "VAL_0000feed";
const BATCH = "batch_01";
const OTHER_BATCH = "batch_02";
const CORRECTED_INSTRUCTION = "Ibaba ti centro day ti jeep.";

/**
 * The shape `countForValidator`'s single `.eq("validator_id", …)` produces, written out.
 *
 * Kept as one named constant rather than inlined at each call site, because the whole point of the
 * negative control below is that the two queries differ by ONE PREDICATE and nothing else. If the
 * predicate were spelled separately at each site, a difference in the fixture between the two calls
 * could explain the result, and the control would prove nothing.
 */
const COUNT_FOR_VALIDATOR =
  "select count(*)::int as count from public.validations where validator_id = $1";

/** The same query plus the `evaluation` predicate this change explicitly forbids. */
const COUNT_EXCLUDING_CANNOT_EVALUATE = `${COUNT_FOR_VALIDATOR} and evaluation <> 'cannot_evaluate'`;

interface CountRow {
  count: number;
}

describe("the lifetime figure counts every recorded answer, not only the confident ones", () => {
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

  it("counts a 'cannot confidently evaluate' response as an entry answered", async () => {
    // The row is a REAL insert through the production schema, not a hand-written fixture: a
    // `cannot_evaluate` row is subject to two directional constraints (it must carry NEITHER
    // translation, and `absent_when_unevaluable` is what enforces that), and a fixture that
    // omitted them would be asserting a shape the database forbids.
    await record(db, "res_01", VALIDATOR, "OD_0001", "correct_natural");
    await recordCannotEvaluate(db, "res_02", VALIDATOR, "OD_0002");

    // THE MEASUREMENT. Two against one is the whole claim: the confident answer is counted, and so
    // is the answer the validator declined to judge, because an entry the validator looked at and
    // answered honestly is work done.
    expect(await countFor(db, VALIDATOR)).toEqual({ count: 2 });

    // THE NEGATIVE CONTROL, and it is what makes the number above attributable. The SAME rows, the
    // SAME database, the SAME validator, with exactly one difference: the `evaluation` predicate the
    // method is forbidden from sending. If the rows were not really stored, or if the count were
    // coming from somewhere else, this would read 2 as well and the control would prove nothing. It
    // reads 1, which is what makes the 2 above mean "the excluded row is present and is included".
    expect(await countExcludingCannotEvaluate(db, VALIDATOR)).toEqual({ count: 1 });
  });

  it("keeps the figure rising across batches, and never counts another validator's answers", async () => {
    // Two batches, because "entries answered in total" is a claim about ALL batches and a
    // single-batch fixture cannot distinguish that from "entries answered in this batch" — which is
    // the other figure on the same screen, and the mistake D5 exists to prevent.
    await record(db, "res_01", VALIDATOR, "OD_0001", "correct_natural", BATCH);
    await record(db, "res_02", VALIDATOR, "OD_0002", "incorrect", BATCH);
    await recordCannotEvaluate(db, "res_03", VALIDATOR, "OD_0003", OTHER_BATCH);
    await record(db, "res_04", OTHER_VALIDATOR, "OD_0001", "correct_natural", BATCH);

    // Three for this validator: two in one batch, one in another, including the unevaluable one.
    expect(await countFor(db, VALIDATOR)).toEqual({ count: 3 });

    // And one for the other, whose only response was on an entry this validator also answered.
    // Without this the test could not tell a per-validator count from a global one.
    expect(await countFor(db, OTHER_VALIDATOR)).toEqual({ count: 1 });
  });

  it("reports 0 for a validator who has recorded nothing, rather than failing", async () => {
    // The screen's figure must be able to be zero without the service treating that as a read
    // failure. `readExactCount` in the repository raises on a MISSING count, not on a real zero —
    // and the distinction is only observable against a real engine, where `count(*)` over no rows
    // is `0` rather than NULL.
    await record(db, "res_01", OTHER_VALIDATOR, "OD_0001", "correct_natural", BATCH);

    const rows = await query<CountRow>(db, COUNT_FOR_VALIDATOR, [VALIDATOR]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.count).toBe(0);
  });

  it("refuses a SECOND response from the same validator for the same entry, so the count cannot be inflated", async () => {
    // Not a D2 requirement, but it is what makes a COUNT of answers equal a count of ENTRIES: the
    // unique constraint is the only reason `count(*)` per validator is not "how many times somebody
    // clicked submit". Asserted here because the figure's correctness depends on it, and the
    // duplicate is across two different batches — the case a per-batch check would miss.
    await record(db, "res_01", VALIDATOR, "OD_0001", "correct_natural", BATCH);

    await expect(
      recordCannotEvaluate(db, "res_02", VALIDATOR, "OD_0001", OTHER_BATCH),
    ).rejects.toThrow(/validations_validator_entry_unique/);

    expect(await countFor(db, VALIDATOR)).toEqual({ count: 1 });
  });
});

describe("the fixture the lifetime figure is measured against", () => {
  // Not a product test — a measurement of the measurement. Every assertion above compares a count
  // against a literal, and a literal is only meaningful if the rows behind it are the ones the
  // comments describe. Without this, a seed that silently inserted zero `cannot_evaluate` rows
  // would leave "2 against 1" passing for the wrong reason.
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

  it("has enough validators, entries and batches for every case above", async () => {
    const [validators, entries, batches] = await Promise.all([
      query<{ n: number }>(db, "select count(*)::int as n from public.validators"),
      query<{ n: number }>(db, "select count(*)::int as n from public.dataset_entries"),
      query<{ n: number }>(db, "select count(*)::int as n from public.validation_batches"),
    ]);

    // Asserted as exact numbers rather than `toBeGreaterThan`, because the fixtures name OD_0001 to
    // OD_0003 and two batches by id: a seed with fewer rows would make a specific fixture reference
    // fail for a reason the test above names as a count.
    expect(validators[0]?.n).toBe(2);
    expect(entries[0]?.n).toBe(3);
    expect(batches[0]?.n).toBe(2);
  });

  it("stores exactly one 'cannot_evaluate' row from the helper the case above uses", async () => {
    await recordCannotEvaluate(db, "res_01", VALIDATOR, "OD_0002");

    // Read the row back THROUGH THE SCHEMA, so this asserts what was stored rather than what the
    // helper intended to store: a helper that silently wrote `correct_natural` would leave the
    // control comparison in the first test still reading 1 — for the wrong reason.
    //
    // The two translation columns are read as `coalesce(..., '')` rather than selected directly.
    // That is a measurement, not a style choice: PGlite's row objects OMIT a NULL column rather
    // than setting it to `null`, so a direct select gives `undefined` and
    // `expect(row.english).toBeNull()` FAILS on a row that is genuinely absent — an assertion that
    // is red for the correct reason and green for none. Coalescing turns "absent" into a value that
    // can be asserted, and a blank string is exactly what "no translation was recorded" must not be.
    const rows = await query<{ evaluation: string; english: string; filipino: string }>(
      db,
      `select evaluation,
              coalesce(english_translation, '') as english,
              coalesce(filipino_translation, '') as filipino
         from public.validations where id = $1`,
      ["res_01"],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.evaluation).toBe("cannot_evaluate");
    // Both translations genuinely absent — the property `absent_when_unevaluable` enforces, and the
    // one that makes this row a "cannot confidently evaluate" rather than a half-answered one.
    expect(rows[0]?.english).toBe("");
    expect(rows[0]?.filipino).toBe("");
  });
});

/**
 * `select count(*)` as `countForValidator`'s single filter produces it.
 *
 * `db` is a PARAMETER, not a module-level constant, because each describe block owns its own
 * database. A first draft closed over the block's `db` from a module-scope helper, which compiles
 * and then fails every call with `ReferenceError: db is not defined` — the helper is not in the
 * block's scope. Passing it makes the dependency explicit and costs one argument.
 */
async function countFor(db: TestDatabase, validatorId: string): Promise<CountRow> {
  const rows = await query<CountRow>(db, COUNT_FOR_VALIDATOR, [validatorId]);
  expect(rows).toHaveLength(1);
  return rows[0] as CountRow;
}

/** The forbidden variant: the same query with the `evaluation` predicate added. */
async function countExcludingCannotEvaluate(
  db: TestDatabase,
  validatorId: string,
): Promise<CountRow> {
  const rows = await query<CountRow>(db, COUNT_EXCLUDING_CANNOT_EVALUATE, [validatorId]);
  expect(rows).toHaveLength(1);
  return rows[0] as CountRow;
}

/**
 * An evaluable response: BOTH translations, plus a correction exactly when the evaluation requires
 * one.
 *
 * The correction is derived from `isCorrectionRequired` rather than from a local `evaluation ===
 * "incorrect"` test, because the schema constraint is BIDIRECTIONAL — `validations_correction_matches_evaluation`
 * states `(evaluation in ('correct_unnatural','incorrect')) = (corrected_instruction is not null)` —
 * so a row is refused both when a required correction is missing AND when an unrequired one is
 * present. Two drafts of this helper were wrong in opposite directions and both were caught by the
 * engine naming the constraint: the first omitted the correction from an `incorrect` row, and the
 * second, "fixed" by adding it unconditionally, put one on a `correct_natural` row. Calling the
 * project's own in-force definition removes the possibility of a third divergence between this
 * fixture and `domain-contracts`.
 *
 * `research-schema.test.ts` asserts these constraints as the subject of its own cases; this helper
 * only obeys them, which is why these failures were reported here as fixture defects.
 */
async function record(
  db: TestDatabase,
  id: string,
  validatorId: string,
  entryId: string,
  evaluation: "correct_natural" | "incorrect",
  batchId = BATCH,
): Promise<void> {
  const correction = isCorrectionRequired(evaluation) ? CORRECTED_INSTRUCTION : null;
  await applySql(
    db,
    `insert into public.validations
       (id, validator_id, dataset_entry_id, batch_id, evaluation, corrected_instruction,
        english_translation, filipino_translation)
     values ('${id}', '${validatorId}', '${entryId}', '${batchId}', '${evaluation}',
             ${correction === null ? "null" : `'${correction}'`},
             'Ride the jeep.', 'Sumakay ng jeep.')`,
    `validation ${id}`,
  );
}

/**
 * A "cannot confidently evaluate" response, which the schema requires to carry NEITHER translation.
 *
 * Written as an insert and not as a variant of `record` with empty strings, because the interesting
 * part of this row is precisely what it does NOT contain, and a shared helper with an optional
 * translation pair would let a blank-string version pass unnoticed in some future caller.
 */
async function recordCannotEvaluate(
  db: TestDatabase,
  id: string,
  validatorId: string,
  entryId: string,
  batchId = BATCH,
): Promise<void> {
  await applySql(
    db,
    `insert into public.validations
       (id, validator_id, dataset_entry_id, batch_id, evaluation)
     values ('${id}', '${validatorId}', '${entryId}', '${batchId}', 'cannot_evaluate')`,
    `cannot-evaluate validation ${id}`,
  );
}

/**
 * Two validators, two batches (both belonging to `VALIDATOR`), and three entries.
 *
 * Two batches rather than one, because the third case in the first describe block asserts a figure
 * that spans batches; a single-batch seed would let that assertion pass on a per-batch count.
 */
async function seed(database: TestDatabase): Promise<void> {
  await applySql(
    database,
    `insert into public.validators (id) values ('${VALIDATOR}'), ('${OTHER_VALIDATOR}');
     -- \`created_at\` is supplied because migration \`20261001120000\` makes it \`not null\` with no
     -- default. These rows exist AFTER that migration, so they are dated the way the application dates
     -- a batch rather than by a database default.
     insert into public.validation_batches (id, validator_id, created_at)
       values ('${BATCH}', '${VALIDATOR}', '2026-09-30T12:00:00.000Z'),
              ('${OTHER_BATCH}', '${VALIDATOR}', '2026-09-30T12:30:00.000Z');
     insert into public.dataset_entries (id, category, instruction, source_payload)
       values ('OD_0001', 'origin_destination', 'Iti Baguio Athletic Bowl ti ayanko ita.', '{"id":"OD_0001"}'::jsonb),
              ('OD_0002', 'origin_destination', 'Ibaba ti centro.', '{"id":"OD_0002"}'::jsonb),
              ('OD_0003', 'origin_destination', 'Iti Baguio ti duman.', '{"id":"OD_0003"}'::jsonb);`,
    "seed",
  );
}
