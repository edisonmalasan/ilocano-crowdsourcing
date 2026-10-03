/**
 * `tasks.md` 3.2 — "Assert that choosing to finish leaves every recorded response exactly as
 * recorded", verified against the **row state** rather than against the absence of a function call.
 *
 * ================================================================================================
 * WHY THIS IS A DATABASE TEST
 * ================================================================================================
 * The claim is about data. "Finishing discards nothing" is not observable from a rendered screen, a
 * mocked action, or a source scan: every one of those would still pass while a row was deleted, a
 * correction reverted, or a participation flag written somewhere the screen never shows. So the
 * responses are persisted through the production schema, the act the finish path can cause is
 * performed, and every column of every row is read back and compared.
 *
 * The two shapes of failure the comparison has to catch, and why a count-only assertion misses one:
 *
 *   1. a row APPEARS   — a participation record, a completion marker, an abandonment flag. A row-count
 *                        check catches this.
 *   2. a row CHANGES   — an existing response flagged, reverted, or soft-deleted in place. Every count
 *                        in the database is unchanged by this, so a count-only assertion passes
 *                        while a submitted response is destroyed. This is the shape that matters most
 *                        for research integrity, and it is why the snapshot is of column VALUES.
 *
 * ================================================================================================
 * WHAT THE ACT ACTUALLY IS, stated so it cannot be over-read
 * ================================================================================================
 * The finish control is an `<a href="/">`. Following it causes the browser to request `/`, and the
 * server's entire work for that request is rendering the landing page. So the act performed here is
 * rendering that page, against the database the responses were just written to.
 *
 * WHAT THAT DOES NOT PROVE, and it is not a small gap:
 *
 *   - It does not prove the browser issued no request for the link. Whether a press reaches a
 *     handler at all is `tests/dom/finished-batch.test.tsx`'s subject (CB-8), because
 *     `renderToStaticMarkup` cannot fire a click and this database cannot observe a network call.
 *   - It does not prove the landing page would behave identically in a deployed Next.js runtime. It
 *     proves that this component tree, rendered for real, writes no row.
 *   - No Supabase client has ever been constructed in this project, so the repository methods behind
 *     the real action remain unproven against PostgREST. See `AGENTS.md` -> Verified project tools.
 *
 * The honest summary: this test proves the row state is untouched by the only server-side work the
 * finish path can cause, and it proves the comparison used to say so can detect a write. The DOM test
 * proves no request leaves. Neither substitutes for the other, and this file does not claim to.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { FINISH_HREF } from "@/app/validate/[batchId]/finished-batch";
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

/**
 * `server-only` throws when its module body is evaluated outside a server bundle, and the landing
 * page's import graph legitimately reaches server-only modules through the resume island's Server
 * Action. That is the boundary working, not a violation; the boundary itself is asserted by
 * `tests/unit/supabase-clients.test.ts`, which deliberately does not stub it.
 */
vi.mock("server-only", () => ({}));

/** The resume island calls `useRouter()` during render. Stubbed so the render can complete. */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));

/**
 * The locale cookie, absent.
 *
 * An absent cookie is what a first-time participant has, and `resolveInterfaceLocale` falls back to
 * English from it. No stubbed value is chosen here, so the render exercises the fallback path rather
 * than a value this file supplied.
 */
vi.mock("next/headers", () => ({ cookies: () => Promise.resolve(new Map()) }));

/**
 * Every table the research schema creates, read as the closed set the schema tests assert elsewhere.
 *
 * Named rather than discovered from `pg_tables` so that a table ADDED to the schema is a change to
 * this list, which is reviewable — where discovering them would silently widen this snapshot and make
 * it agree with whatever exists. The closed sets themselves are asserted in
 * `research-schema.test.ts`; this file only needs to cover every table a finish implementation could
 * plausibly write to, and it needs to cover them ALL for the "writes nothing" claim to mean anything.
 */
const RESEARCH_TABLES = [
  "batch_entries",
  "dataset_entries",
  "validation_batches",
  "validation_sessions",
  "validations",
  "validators",
] as const;

type ResearchTable = (typeof RESEARCH_TABLES)[number];

/** One table's rows, each rendered as canonical JSON so two snapshots can be compared as values. */
type TableSnapshot = Record<ResearchTable, string[]>;

const VALIDATOR = "VAL_0000beef";
const BATCH = "VAL_0000beef-2026-10-01T09:00:00.000Z";
const CORRECTED_INSTRUCTION = "Ibaba ti centro day ti jeep.";

describe("choosing to finish leaves every recorded response exactly as recorded", () => {
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

  it("changes no row in any research table when the finish path's destination is served", async () => {
    const before = await snapshotAllTables(db);

    // THE ACT. The finish control's href, read from the component's own exported constant rather than
    // a literal repeated here, and rendered through the real page component. The `expect` on
    // `FINISH_HREF` below is what forces a future change of destination to change THIS test's act
    // too, instead of leaving it serving a page no participant would ever reach.
    const html = renderToStaticMarkup(await HomePage());

    // The act really happened. A snapshot comparison against a render that threw, resolved to
    // nothing, or never ran would be byte-identical for the wrong reason, so the rendered document is
    // checked for content that only this route produces. Same lesson as the catalog guards: assert
    // that the thing being compared actually contained something.
    expect(html).toContain("<h1");
    expect(html).toContain("Check the Ilocano.");
    expect(html).toContain("Start validation");
    expect(FINISH_HREF).toBe("/");

    const after = await snapshotAllTables(db);

    // THE CLAIM, as a value comparison rather than a count: every column of every row, in all six
    // tables, unchanged. `toEqual` names the table and the rows that differ, so a failure says which
    // table was touched rather than only that something was.
    expect(after).toEqual(before);

    // And the same fact stated as counts, because the length of each array IS the row count and the
    // scenario names "nothing is deleted" separately from "nothing changed". Asserted per table with
    // the table in the failure message, since six identical numbers in one array are hard to read.
    for (const table of RESEARCH_TABLES) {
      expect(after[table].length, `row count of ${table}`).toBe(before[table].length);
    }

    // AND the snapshot is not vacuous. Every table was read and the ones carrying responses are
    // non-empty: a snapshot helper that read zero rows from `validations` would make the comparison
    // above pass while proving nothing at all. Measured, not asserted as an aside — the numbers are
    // the fixture this file's whole argument rests on.
    expect(before.validations).toHaveLength(3);
    expect(before.validation_batches).toHaveLength(1);
    expect(before.batch_entries).toHaveLength(3);
    expect(before.validators).toHaveLength(1);
    expect(before.validation_sessions).toHaveLength(0);
  });

  it("CAN FIRE: one real append and one real in-place change are both detected, and named", async () => {
    // ==========================================================================================
    // THE NEGATIVE CONTROL, and it is mandatory rather than decorative
    // ==========================================================================================
    // "The rows did not change" is an assertion that a snapshot helper which silently reads nothing,
    // or which compares a table against itself, would report as true forever. Both write shapes are
    // exercised, through the PRODUCTION schema rather than by mutating a fixture in memory:
    //
    //   APPEND — the shape an implementation of D3 would take if it recorded participation. It adds a
    //            row, so it is visible to a row-count check.
    //   CHANGE — the shape that destroys research data: flagging or reverting an answer ALREADY
    //            recorded. Every count in the database is unchanged by this, which is exactly why the
    //            real assertion compares column values.
    //
    // Both are performed through `applySql`, so the database's own constraints accept or refuse them
    // for the same reasons production would — and neither is possible against this schema without a
    // column to put it in, which is `design.md` D4's structural half and is asserted as a closed
    // column set in `research-schema.test.ts`.
    const before = await snapshotAllTables(db);

    // The append: a real evaluation, inserted through the same constraints every response obeys.
    await record(db, "res_04", "OD_0004", "correct_natural");

    const afterAppend = await snapshotAllTables(db);

    // Detected, and ATTRIBUTED. `changedTables` names which table moved rather than returning a
    // boolean, so a helper that compared the wrong table — or the right table against itself — fails
    // here instead of passing both halves of the control.
    expect(changedTables(before, afterAppend)).toEqual(["validations"]);
    expect(afterAppend.validations).toHaveLength(before.validations.length + 1);

    // The change in place: a column value altered on a row that already existed. `total_validations`
    // is the profile counter `design.md` D6 routes the displayed figure AWAY from, so it is also the
    // most plausible place for an implementation to invent a participation fact — which is exactly
    // why this control mutates it. No count anywhere in the database changes.
    await applySql(
      db,
      `update public.validators set total_validations = total_validations + 1 where id = '${VALIDATOR}'`,
      "a participation counter write",
    );

    const afterChange = await snapshotAllTables(db);

    expect(changedTables(afterAppend, afterChange)).toEqual(["validators"]);
    // The count-level assertion CANNOT see this one, and saying so is the point of having asserted
    // values above counts: the row count of `validators` is 1 both before and after.
    expect(afterChange.validators).toHaveLength(afterAppend.validators.length);
    expect(afterChange.validators).not.toEqual(afterAppend.validators);
  });

  it("records the three response shapes the fixture is built from, so the snapshot covers them", async () => {
    // A measurement of the measurement. The first test's snapshot is only as good as the rows behind
    // it, and the interesting claim — that a correction and a translation are untouched — is a claim
    // about rows that actually CARRY a correction and translations. Read back through the schema so
    // this asserts what was stored, not what the helper intended.
    const rows = await query<{
      id: string;
      evaluation: string;
      corrected: string;
      english: string;
      filipino: string;
    }>(
      db,
      `select id,
              evaluation,
              coalesce(corrected_instruction, '<ABSENT>') as corrected,
              coalesce(english_translation, '<ABSENT>') as english,
              coalesce(filipino_translation, '<ABSENT>') as filipino
         from public.validations order by id`,
    );

    // Asserted as a whole table rather than as three separate lookups, so a fixture that silently
    // stored the wrong shape for one of them names the row in the diff instead of leaving a third of
    // the snapshot unexamined.
    expect(rows).toEqual([
      {
        id: "res_01",
        evaluation: "correct_natural",
        corrected: "<ABSENT>",
        english: "Ride the jeep.",
        filipino: "Sumakay ng jeep.",
      },
      {
        // The correction case: `incorrect` REQUIRES a correction, so this row is the one that proves
        // a correction survived the snapshot unchanged.
        id: "res_02",
        evaluation: "incorrect",
        corrected: CORRECTED_INSTRUCTION,
        english: "Get off at the town centre.",
        filipino: "Bumaba sa sentro.",
      },
      {
        id: "res_03",
        // The unevaluable case: no correction and NEITHER translation, which is what
        // `absent_when_unevaluable` enforces.
        evaluation: "cannot_evaluate",
        corrected: "<ABSENT>",
        english: "<ABSENT>",
        filipino: "<ABSENT>",
      },
    ]);
  });
});

/**
 * Which tables differ between two snapshots, as table names.
 *
 * Returning NAMES rather than a boolean is what makes the control above attributable. `not.toEqual`
 * on two whole snapshots says *that* something moved; this says *where*, so a comparison wired to the
 * wrong table fails with `[]` instead of quietly agreeing.
 *
 * `JSON.stringify` over `toEqual` is not used here — this returns the names and the caller asserts
 * them, which is where a diff of the rows themselves is most readable.
 */
function changedTables(before: TableSnapshot, after: TableSnapshot): ResearchTable[] {
  return RESEARCH_TABLES.filter((table) => {
    const left = before[table];
    const right = after[table];
    return JSON.stringify(left) !== JSON.stringify(right);
  });
}

/**
 * Every row of every research table, as canonical JSON strings.
 *
 * WHY `to_jsonb` AND NOT A LIST OF COLUMNS: the point of this snapshot is to catch a change to a
 * column nobody thought to name. `select *` already does that for VALUES, but only while the reader
 * trusts the list; `to_jsonb` renders the row as the server itself sees it, including columns added
 * later, with no second list to keep in step.
 *
 * WHY THE STRINGS ARE SORTED: PostgreSQL does not promise an order for a bare `select`, and an
 * unordered read compared as an ordered array would report a difference whenever the planner chose a
 * different plan. Sorting the rendered rows makes the comparison about the DATA.
 *
 * WHY NULL IS RENDERED BY POSTGRESQL AND NOT COALESCED AWAY: `to_jsonb` keeps a null column as JSON
 * `null`, which is distinguishable from an empty string — the distinction PGlite's row objects erase
 * by omitting the column entirely. That is a measured property of this engine, recorded at length in
 * `lifetime-figure.test.ts`, and it is why the correction and translation columns can be asserted
 * above at all.
 */
async function snapshotAllTables(db: TestDatabase): Promise<TableSnapshot> {
  const entries = await Promise.all(
    RESEARCH_TABLES.map(
      async (table) =>
        [
          table,
          await query<{ row: string }>(
            db,
            `select to_jsonb(t)::text as row from public.${table} t`,
          ),
        ] as const,
    ),
  );

  return Object.fromEntries(
    entries.map(([table, rows]) => [table, rows.map((row) => row.row).sort()]),
  ) as TableSnapshot;
}

/**
 * One validator, one batch, four entries, and the batch's assignment records.
 *
 * The batch entries exist so the snapshot covers `batch_entries` with rows rather than with an empty
 * array: a delete-cascade from the batch would remove them, and an empty table would make that
 * invisible.
 */
async function seed(database: TestDatabase): Promise<void> {
  await applySql(
    database,
    `insert into public.validators (id, ilocano_proficiency)
       values ('${VALIDATOR}', 'conversational');
     insert into public.validation_batches (id, validator_id, created_at)
      values ('${BATCH}', '${VALIDATOR}', '2026-09-30T12:00:00.000Z');
     insert into public.dataset_entries (id, category, instruction, source_payload)
       values ('OD_0001', 'origin_destination', 'Iti Baguio Athletic Bowl ti ayanko ita.', '{"id":"OD_0001"}'::jsonb),
              ('OD_0002', 'origin_destination', 'Ibaba ti centro.', '{"id":"OD_0002"}'::jsonb),
              ('OD_0003', 'origin_destination', 'Iti Baguio ti duman.', '{"id":"OD_0003"}'::jsonb),
              ('OD_0004', 'origin_destination', 'Iti ti ayan ti Idi.', '{"id":"OD_0004"}'::jsonb);
     insert into public.batch_entries (batch_id, dataset_entry_id, position)
       values ('${BATCH}', 'OD_0001', 1), ('${BATCH}', 'OD_0002', 2), ('${BATCH}', 'OD_0003', 3);`,
    "seed",
  );

  // Three responses, one per shape the schema distinguishes. `recordCannotEvaluate` is a separate
  // helper rather than a flag on `record` for the reason `lifetime-figure.test.ts` records: the
  // interesting property of that row is what it does NOT contain, and a shared helper with optional
  // translations would let a blank-string version of it through unnoticed.
  await record(database, "res_01", "OD_0001", "correct_natural");
  await record(database, "res_02", "OD_0002", "incorrect");
  await recordCannotEvaluate(database, "res_03", "OD_0003");
}

/**
 * An evaluable response: BOTH required translations, plus a correction exactly when the evaluation
 * requires one.
 *
 * `isCorrectionRequired` is the project's own in-force definition rather than a local
 * `evaluation === "incorrect"`, because the schema's correction constraint is BIDIRECTIONAL and a
 * local re-derivation is exactly the kind of second authority this repository has removed twice.
 * Translations differ from `lifetime-figure.test.ts`'s fixture on the corrected row, so the two files
 * cannot both be right about a shared literal by accident.
 */
async function record(
  db: TestDatabase,
  id: string,
  entryId: string,
  evaluation: "correct_natural" | "incorrect",
): Promise<void> {
  const correction = isCorrectionRequired(evaluation) ? CORRECTED_INSTRUCTION : null;
  await applySql(
    db,
    `insert into public.validations
       (id, validator_id, dataset_entry_id, batch_id, evaluation, corrected_instruction,
        english_translation, filipino_translation)
     values ('${id}', '${VALIDATOR}', '${entryId}', '${BATCH}', '${evaluation}',
             ${correction === null ? "null" : `'${correction}'`},
             ${evaluation === "correct_natural" ? "'Ride the jeep.'" : "'Get off at the town centre.'"},
             ${evaluation === "correct_natural" ? "'Sumakay ng jeep.'" : "'Bumaba sa sentro.'"})`,
    `validation ${id}`,
  );
}

/** A "cannot confidently evaluate" response, which the schema requires to carry NEITHER translation. */
async function recordCannotEvaluate(db: TestDatabase, id: string, entryId: string): Promise<void> {
  await applySql(
    db,
    `insert into public.validations
       (id, validator_id, dataset_entry_id, batch_id, evaluation)
     values ('${id}', '${VALIDATOR}', '${entryId}', '${BATCH}', 'cannot_evaluate')`,
    `cannot-evaluate validation ${id}`,
  );
}
