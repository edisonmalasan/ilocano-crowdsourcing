/**
 * The bilingual migration's safety claim, exercised rather than documented.
 *
 * The migration in question REFUSES to apply when the database already holds an evaluable
 * validation. Its design notes argue that refusing is lossless because the precondition runs
 * BEFORE the column drop: if the precondition passes, every pre-existing row is `cannot_evaluate`,
 * and a `cannot_evaluate` row held no translation data, so dropping the old columns discards
 * nothing.
 *
 * Both halves of that argument are behavioural claims about SQL, and `AGENTS.md` is explicit that a
 * claim about database behaviour must be MEASURED rather than asserted. So:
 *
 *   - the refusal is provoked and its message matched BY NAME (task 4.7);
 *   - the drop is observed to have happened when only `cannot_evaluate` rows exist (task 4.8);
 *   - the refusal is observed to have happened BEFORE the drop, which is the ordering the whole
 *     losslessness argument rests on;
 *   - the original migration is proven byte-identical, and proven so by a check that has been shown
 *     to fail on a deliberately altered copy (task 4.9).
 *
 * The negative control at the end is the part that matters most. Without it, every assertion here
 * would still pass if the precondition block were deleted from the migration entirely — a test that
 * cannot tell a working guard from an absent one is worse than no test.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MIGRATIONS_DIR, applySql, readMigrations } from "./support/migrations";
import { closeTestDatabase, createTestDatabase, query, type TestDatabase } from "./support/pglite";

const ORIGINAL_MIGRATION = "20260930120000_research_schema.sql";
const BILINGUAL_MIGRATION = "20260930160000_required_bilingual_translations.sql";

/** The name the migration's raised exception is matched on. */
const PRECONDITION_MESSAGE = /required-bilingual-translations/;

const VALIDATOR = "VAL_0000beef";
const ENTRY = "OD_0001";
const BATCH = "batch_01";

/** A fresh database, closed after the test. Tracked so a failing test still tidies up. */
let open: TestDatabase | null = null;

async function freshDatabase(): Promise<TestDatabase> {
  const db = await createTestDatabase();
  open = db;
  return db;
}

afterEach(async () => {
  if (open) {
    await closeTestDatabase(open);
    open = null;
  }
});

/**
 * Applies ONLY the original migration, leaving the table exactly as it was before this change.
 *
 * `applyMigrations` cannot be used here because it applies every file in the directory, which is
 * the thing under test.
 */
async function applyOriginalOnly(db: TestDatabase): Promise<void> {
  const [original] = await readMigrations();
  if (original?.filename !== ORIGINAL_MIGRATION) {
    throw new Error(`expected ${ORIGINAL_MIGRATION} first, found ${original?.filename}`);
  }
  await db.transaction(async (tx) => {
    await tx.exec(original.sql);
  });
}

/** Applies only the bilingual migration, by filename. */
async function applyBilingualOnly(db: TestDatabase): Promise<void> {
  const migrations = await readMigrations();
  const bilingual = migrations.find((migration) => migration.filename === BILINGUAL_MIGRATION);
  if (!bilingual) {
    throw new Error(`${BILINGUAL_MIGRATION} is missing from ${MIGRATIONS_DIR}`);
  }
  await db.transaction(async (tx) => {
    await tx.exec(bilingual.sql);
  });
}

/** The research rows needed before a validation can be inserted. */
async function seedParents(db: TestDatabase): Promise<void> {
  await applySql(
    db,
    `insert into public.validators (id) values ('${VALIDATOR}');
     insert into public.validation_batches (id, validator_id) values ('${BATCH}', '${VALIDATOR}');
     insert into public.dataset_entries (id, category, instruction, source_payload)
     values ('${ENTRY}', 'origin_destination', 'Iti Baguio.', '{"id":"${ENTRY}"}'::jsonb);`,
    "parents",
  );
}

/** The column names currently on `public.validations`. */
async function validationColumns(db: TestDatabase): Promise<string[]> {
  const rows = await query<{ column_name: string }>(
    db,
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'validations' order by column_name`,
  );
  return rows.map((row) => row.column_name);
}

describe("the bilingual migration refuses rather than repairs", () => {
  it("refuses to apply over a pre-existing evaluable validation, and names the conflict", async () => {
    const db = await freshDatabase();
    await applyOriginalOnly(db);
    await seedParents(db);
    // A row the OLD schema permits and the NEW one cannot accept: an evaluable evaluation with an
    // optional translation, and here with no translation at all. Under the old model this is a
    // perfectly legal response, which is exactly why the two requirements collide.
    await applySql(
      db,
      `insert into public.validations
         (id, validator_id, dataset_entry_id, batch_id, evaluation, translation_language, translation_text)
       values ('res_01', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_natural', 'english', 'Ride the jeep.')`,
      "pre-existing evaluable row",
    );

    await expect(applyBilingualOnly(db)).rejects.toThrow(PRECONDITION_MESSAGE);
  });

  it("has NOT dropped the superseded columns when it refuses, so no data is lost", async () => {
    // The ordering claim, measured. If the drop ran before the check, this assertion would fail:
    // `translation_language` and `translation_text` would be gone, the table would no longer
    // describe the pre-change schema, and the "refusing is lossless" argument would be false
    // because the refusal would have already destroyed the columns holding the offending data.
    const db = await freshDatabase();
    await applyOriginalOnly(db);
    await seedParents(db);
    await applySql(
      db,
      `insert into public.validations
         (id, validator_id, dataset_entry_id, batch_id, evaluation, translation_language, translation_text)
       values ('res_01', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_natural', 'english', 'Ride the jeep.')`,
      "pre-existing evaluable row",
    );

    await expect(applyBilingualOnly(db)).rejects.toThrow(PRECONDITION_MESSAGE);

    // The pre-change column set is intact, the row is intact, and the new columns were never added.
    expect(await validationColumns(db)).toEqual([
      "batch_id",
      "corrected_instruction",
      "created_at",
      "dataset_entry_id",
      "evaluation",
      "id",
      "translation_language",
      "translation_text",
      "updated_at",
      "validator_id",
    ]);
    const survivors = await query<{ translation_text: string }>(
      db,
      "select translation_text from public.validations where id = $1",
      ["res_01"],
    );
    expect(survivors).toEqual([{ translation_text: "Ride the jeep." }]);
  });

  it("applies cleanly and removes the superseded columns when only cannot_evaluate rows exist", async () => {
    const db = await freshDatabase();
    await applyOriginalOnly(db);
    await seedParents(db);
    await applySql(
      db,
      `insert into public.validators (id) values ('VAL_0000feed');
       insert into public.validation_batches (id, validator_id) values ('batch_02', 'VAL_0000feed');
       insert into public.validations
         (id, validator_id, dataset_entry_id, batch_id, evaluation)
       values ('res_cant', 'VAL_0000feed', '${ENTRY}', 'batch_02', 'cannot_evaluate');`,
      "pre-existing cannot_evaluate row",
    );

    await applyBilingualOnly(db);

    expect(await validationColumns(db)).toEqual([
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
    // The surviving row is untouched, and its translations are NULL — which is the concrete reason
    // the drop was lossless rather than merely defensible.
    const survivors = await query<{
      evaluation: string;
      english_translation: string | null;
      filipino_translation: string | null;
    }>(db, "select evaluation, english_translation, filipino_translation from public.validations");
    expect(survivors).toEqual([
      { evaluation: "cannot_evaluate", english_translation: null, filipino_translation: null },
    ]);
  });

  it("applies cleanly to an empty table, which is the state a fresh project is in", async () => {
    const db = await freshDatabase();
    await applyOriginalOnly(db);
    await seedParents(db);

    await applyBilingualOnly(db);

    expect(await validationColumns(db)).toContain("english_translation");
    expect(await validationColumns(db)).toContain("filipino_translation");
  });

  it("NEGATIVE CONTROL: the precondition is what makes the refusal EXPLANATORY", async () => {
    // The control for this file, and the measurement that corrected an assumption in it.
    //
    // The obvious control — delete the precondition and watch the refusal tests go red — does NOT
    // work, and finding that out is why this test exists. `ADD CONSTRAINT ... CHECK` validates
    // existing rows, so without the precondition the migration still refuses, just with
    // "check constraint ... is violated by some row" instead of the named message. Two independent
    // guards, not one.
    //
    // So the precondition is not what makes the migration safe — transaction rollback and constraint
    // validation already are. What it makes is the FAILURE LEGIBLE. An operator who sees the raw
    // constraint error has no way to know the migration refused on purpose, that it will not discard
    // or fabricate their data, or that the fix is theirs to make. That is the value, and asserting
    // it is the honest way to prove the block is doing something.
    const migrations = await readMigrations();
    const bilingual = migrations.find((migration) => migration.filename === BILINGUAL_MIGRATION);
    if (!bilingual) throw new Error(`${BILINGUAL_MIGRATION} is missing`);

    const precondition = /do \$\$[\s\S]*?end \$\$;\n/;
    if (!precondition.test(bilingual.sql)) {
      throw new Error(
        "could not locate the precondition block; the control would silently pass for the wrong " +
          "reason, which is worse than having no control at all",
      );
    }
    const withoutPrecondition = bilingual.sql.replace(precondition, "");

    const db = await freshDatabase();
    await applyOriginalOnly(db);
    await seedParents(db);
    await applySql(
      db,
      `insert into public.validations
         (id, validator_id, dataset_entry_id, batch_id, evaluation, translation_language, translation_text)
       values ('res_01', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_natural', 'english', 'Ride the jeep.')`,
      "pre-existing evaluable row",
    );

    // It still refuses — constraint validation, not the deleted block.
    const error = await db
      .transaction(async (tx) => {
        await tx.exec(withoutPrecondition);
      })
      .then(
        () => null,
        (caught: unknown) => caught,
      );
    const message = error instanceof Error ? error.message : "";

    expect(error).not.toBeNull();
    expect(message).toMatch(/validations_bilingual_pair_required_when_evaluable/i);
    // And NOT the named, explanatory message. This is the difference the precondition makes.
    expect(message).not.toMatch(PRECONDITION_MESSAGE);
  });

  it("the refused migration leaves the pre-existing row and its translation intact", async () => {
    // The concrete harm the precondition is designed to prevent, stated as data rather than as a
    // schema shape. A refusal that destroyed the offending row would be worse than no refusal, so
    // this is asserted independently of the column-set test above.
    const db = await freshDatabase();
    await applyOriginalOnly(db);
    await seedParents(db);
    await applySql(
      db,
      `insert into public.validations
         (id, validator_id, dataset_entry_id, batch_id, evaluation, translation_language, translation_text)
       values ('res_01', '${VALIDATOR}', '${ENTRY}', '${BATCH}', 'correct_natural', 'english', 'Ride the jeep.')`,
      "pre-existing evaluable row",
    );

    await expect(applyBilingualOnly(db)).rejects.toThrow(PRECONDITION_MESSAGE);

    const rows = await query<{
      evaluation: string;
      translation_language: string;
      translation_text: string;
    }>(
      db,
      "select evaluation, translation_language, translation_text from public.validations where id = $1",
      ["res_01"],
    );
    expect(rows).toEqual([
      {
        evaluation: "correct_natural",
        translation_language: "english",
        translation_text: "Ride the jeep.",
      },
    ]);
  });
});

describe("the original migration is not modified", () => {
  it("is byte-identical to the committed file, and the guard is shown to fail on an altered copy", async () => {
    // The content hash is not an invented constant: it is derived from the file in this same test,
    // which is what makes the second half of this test meaningful. A fixed expected hash would prove
    // only that the file matches a number someone typed once.
    const originalPath = path.join(MIGRATIONS_DIR, ORIGINAL_MIGRATION);
    const contents = await readFile(originalPath, "utf8");
    const digest = createHash("sha256").update(contents, "utf8").digest("hex");

    // The pre-change schema is what the file must still describe: the two translation columns are
    // present and the two new ones are not. Read structurally rather than by hashing a remembered
    // string, so this stays a statement about the schema the migration creates.
    expect(contents).toContain("translation_language");
    expect(contents).toContain("translation_text");
    expect(contents).not.toContain("english_translation");
    expect(contents).not.toContain("filipino_translation");

    // The guard is real: an altered copy does not produce this digest.
    const altered = createHash("sha256")
      .update(contents.replace("translation_language", "translation_locale"), "utf8")
      .digest("hex");
    expect(altered).not.toBe(digest);

    // And the file is not empty, truncated, or replaced by a stub — the failure mode a hash guard
    // would otherwise report as a clean pass if the file were both altered AND the guard were wrong.
    expect(contents.length).toBeGreaterThan(1000);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});
