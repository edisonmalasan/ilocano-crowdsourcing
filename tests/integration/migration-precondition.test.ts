/**
 * The bilingual migration's safety claim, exercised rather than documented.
 *
 * The migration in question REFUSES to apply when the database already holds an evaluable
 * validation. Its design notes argue that refusing is lossless because the precondition runs
 * BEFORE the column drop: if the precondition passes, every pre-existing row is `cannot_evaluate`,
 * and a `cannot_evaluate` row held no translation data, so dropping the old columns discards
 * nothing.
 *
 * `AGENTS.md` is explicit that a claim about database behaviour must be MEASURED rather than
 * asserted. What this file measures, and what it cannot:
 *
 *   - the refusal is provoked and its message matched BY NAME (task 4.7);
 *   - the drop is observed to have happened when only `cannot_evaluate` rows exist (task 4.8);
 *   - after a refusal the pre-change schema and the pre-existing row are both intact;
 *   - the original migration is proven byte-identical to the one committed on `main` (task 4.9).
 *
 * IT DOES NOT MEASURE THE ORDERING, and it must not be read as doing so. An earlier version of
 * this header claimed the refusal was "observed to have happened BEFORE the drop". A probe
 * falsified that: this harness applies each migration file inside one transaction, so the
 * `raise exception` rolls the file back and any drop that already executed is undone with it. No
 * post-failure assertion in a transactional harness can distinguish "the check ran first" from
 * "the drop ran first", and the test that used to make the claim passed with the ordering
 * deliberately reversed. The ordering is therefore enforced *in the SQL* — the precondition first
 * asserts that `translation_language` still exists — and the test for that asserts the
 * precondition's behaviour when the columns are gone. It simulates the CONDITION by applying the
 * migration twice, which is a proxy for the hazardous state and **not** an observation of statement
 * order; it is red on a genuine reversal, which was verified by building the reversal rather than
 * assumed. The residual non-transactional hazard is reasoned about, not executed, and is recorded
 * in `design.md` section 3 and `AGENTS.md`.
 *
 * The negative control at the end is the part that matters most, because it measures this file
 * rather than the migration. Deleting the precondition block entirely takes 5 of these 9 tests red
 * — the refusal-by-name test, the intact-schema test, the ordering test, the explanatory-failure
 * control, and the preserved-row test — which is worth stating precisely, because an earlier version
 * of this header claimed all of them would still pass. A test that cannot tell a working guard from
 * an absent one is worse than no test.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { MIGRATIONS_DIR, applySql, readMigrations } from "./support/migrations";
import { closeTestDatabase, createTestDatabase, query, type TestDatabase } from "./support/pglite";

const ORIGINAL_MIGRATION = "20260930120000_research_schema.sql";
const BILINGUAL_MIGRATION = "20260930160000_required_bilingual_translations.sql";

/**
 * SHA-256 of `20260930120000_research_schema.sql` as committed on `main`, in BYTES.
 *
 * A forward migration must not rewrite migration history, and this is what makes that checkable
 * rather than merely intended. The constant is the whole assertion — deriving the expected digest
 * from the file under test instead would make the guard unfalsifiable.
 *
 * Derived with `git cat-file -p main:<path>` piped straight into Node's crypto, because a
 * PowerShell pipeline re-encodes the bytes: the same command routed through `git show >` produced
 * three DIFFERENT hashes for one file, which is precisely the failure `AGENTS.md` records about
 * `>` writing UTF-16LE with a BOM. This file is 16280 bytes and has no CRLF, matching
 * `.gitattributes`' `text=auto eol=lf`.
 */
const EXPECTED_ORIGINAL_MIGRATION_SHA256 =
  "1b94e7f962b7974ddc134355936d843594ec809a4004c84bab3e8ac59f8a1500";

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
    // WHAT THIS PROVES, stated precisely because an earlier version of this comment claimed more.
    //
    // It does NOT prove "the precondition runs before the drop". A probe settled that: the harness
    // applies each migration file inside a transaction, so the `raise exception` rolls the file
    // back and any drop that had already executed is undone with it. This test passed with the
    // ordering deliberately reversed, so it could not have detected the reversal.
    //
    // What it does prove is the property that actually matters: after a refusal, the pre-change
    // schema and the pre-existing row are both intact, and the new columns were never added. That
    // is worth asserting, and it is what "refusing is lossless" means in practice on a runner that
    // does use a transaction.
    //
    // The non-transactional hazard is closed in the SQL instead, by the precondition's own
    // assertion that `translation_language` still exists — and THAT is what the next test checks.
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

  it("refuses by name if the superseded columns are already gone, closing the ordering hazard", async () => {
    // The real ordering guard, and unlike the test above it is genuinely red-on-reversal.
    //
    // The migration's precondition first asserts that `translation_language` still exists. If the
    // drop were moved above the precondition, that assertion would fire, name this migration, and
    // explain the required order — so a drop-then-check file fails loudly instead of quietly
    // proceeding from a schema that has already lost the columns holding the data.
    //
    // This closes the hazard in the SQL rather than in a test, which is the only way to close it:
    // the harness cannot distinguish the two orderings, because rollback hides the difference.
    // Simulated here by applying the migration twice — the second run finds the columns gone.
    const db = await freshDatabase();
    await applyOriginalOnly(db);
    await seedParents(db);
    await applyBilingualOnly(db);

    await expect(applyBilingualOnly(db)).rejects.toThrow(
      /must run BEFORE the superseded columns are dropped/i,
    );
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
    //
    // The assertion is on the EVALUABLE-ROW branch specifically. The precondition block also
    // contains the ordering assertion, and the mutated file keeps the drop AFTER the block, so
    // removing the whole block removes both branches at once — which is why this asserts the
    // evaluable-row message rather than merely "no longer the named message".
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
  it("is byte-identical to the file committed on the base branch", async () => {
    // THE GUARD. A FIXED expected hash, because that is the only form of this assertion that can
    // fail. An earlier version of this test derived the digest from the file itself and then
    // compared it against a MUTATED COPY OF ITSELF — satisfied by construction, and true of any
    // file content whatsoever. It proved SHA-256 is not the identity function and nothing else.
    // A probe confirmed it: renaming an index inside the original migration left all 7 tests green.
    //
    // This is the same pattern `immutable-dataset.test.ts` already uses for the dataset blob, and
    // for the same reason: a research source that can be edited silently is not a research source.
    // The constant below is the SHA-256 of the file as committed on `main`, obtained with
    // `git cat-file -p main:<path>` and hashed in Node so no PowerShell pipeline can re-encode the
    // bytes in transit. Re-derive it the same way if the constant ever needs checking.
    const bytes = await readFile(path.join(MIGRATIONS_DIR, ORIGINAL_MIGRATION));
    const digest = createHash("sha256").update(bytes).digest("hex");

    expect(digest).toBe(EXPECTED_ORIGINAL_MIGRATION_SHA256);
    // The file is a real migration, not a stub that happens to hash correctly.
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("still describes the PRE-change schema, so a hash match is not the whole claim", async () => {
    // The companion to the hash guard, and deliberately not redundant with it. A hash proves "this
    // file is unchanged"; it cannot prove "this file is the right thing to be unchanged at". If the
    // wrong file were ever committed under this name, or a hash constant were updated in the same
    // commit as an unwanted edit, this is the assertion that would object.
    //
    // It has to OBJECT, not merely agree, and that is why the table assertions below are anchored
    // on a terminator rather than on a bare substring. `toContain("create table public.validations")`
    // is satisfied by `create table public.validations_renamed (`, which was measured: renaming
    // either `validations` or `validation_sessions` left this test GREEN. Every statement in the
    // file ends its table name with ` (` so the paren is the terminator, and a rename moves it.
    const contents = await readFile(path.join(MIGRATIONS_DIR, ORIGINAL_MIGRATION), "utf8");

    expect(contents).toContain("translation_language");
    expect(contents).toContain("translation_text");
    expect(contents).not.toContain("english_translation");
    expect(contents).not.toContain("filipino_translation");
    // And it is the migration that creates the six research tables, not a fragment.
    for (const table of [
      "dataset_entries",
      "validators",
      "validation_sessions",
      "validation_batches",
      "batch_entries",
      "validations",
    ]) {
      expect(contents, `creates ${table}`).toContain(`create table public.${table} (`);
    }
  });
});
