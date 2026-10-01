import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { applySql, grantPublicPrivileges, type TestDatabase } from "./pglite";

/**
 * Applies the project's real Supabase migrations, in filename order, to a test database.
 *
 * Filename order matters: Supabase orders migrations lexically by filename, so the same
 * `YYYYMMDDHHMMSS_name.sql` convention must hold here or the test database would not reflect the
 * deployed schema.
 *
 * There is deliberately no fallback. If the migrations directory is missing or empty, that is a
 * real condition the caller must know about, not something to paper over.
 */

export const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase", "migrations");

export interface MigrationFile {
  filename: string;
  sql: string;
}

/** Reads `*.sql` from a migrations directory, sorted lexically. */
export async function readMigrations(directory = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  let entries: string[];

  try {
    entries = await readdir(directory);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw cause;
  }

  const files = entries.filter((name) => name.endsWith(".sql")).sort();

  return Promise.all(
    files.map(async (filename) => ({
      filename,
      sql: await readFile(path.join(directory, filename), "utf8"),
    })),
  );
}

export interface ApplyResult {
  applied: string[];
}

/** Applies every migration in order and returns the filenames that ran. */
export async function applyMigrations(
  db: TestDatabase,
  directory = MIGRATIONS_DIR,
): Promise<ApplyResult> {
  const migrations = await readMigrations(directory);
  await applyEach(db, migrations);
  return { applied: migrations.map((migration) => migration.filename) };
}

/**
 * Applies migrations in filename order, STOPPING BEFORE `untilFilename`.
 *
 * ================================================================================================
 * WHY THIS EXISTS, and what it is for
 * ================================================================================================
 * A migration precondition can only be observed by putting the database in the state that makes it
 * fire. For `20260930190000_allocation_batch_positions.sql` that means: apply everything before it,
 * insert a `batch_entries` row — which is legal under the schema as it stands — and only then apply
 * the migration. `applyMigrations` cannot express that, because it applies everything or nothing.
 *
 * The obvious alternative, applying all migrations and then INSERTING the row, does not work and is
 * worth recording why: by then `position` is `not null`, so the row the refusal is about could not
 * have been written in the first place. The refusal would then be unreachable, and a test that
 * asserted it would be asserting a fiction.
 *
 * It stops BEFORE the named file rather than AFTER it, because "everything up to and including X"
 * is what a reader expects the argument to mean in every other use of this helper's name, and a
 * helper whose flag points the opposite way from its name is a helper that is used backwards once.
 * `untilFilename` is EXCLUSIVE and the doc says so in the parameter name's own comment below.
 *
 * The excluded filename is not found in the directory => throws. Silently applying everything would
 * turn a typo in a test into a test that passes for an unrelated reason.
 */
export async function applyMigrationsUntil(
  db: TestDatabase,
  untilFilename: string,
  directory = MIGRATIONS_DIR,
): Promise<ApplyResult> {
  const migrations = await readMigrations(directory);
  const boundary = migrations.findIndex((migration) => migration.filename === untilFilename);

  if (boundary === -1) {
    throw new Error(
      `applyMigrationsUntil: ${untilFilename} is not in ${directory}. Refusing to apply ` +
        "everything, because a typo in the boundary would silently turn a precondition test into a " +
        "test of some other migration's precondition.",
    );
  }

  const applicable = migrations.slice(0, boundary);
  await applyEach(db, applicable);

  return { applied: applicable.map((migration) => migration.filename) };
}

/**
 * Applies EXACTLY ONE migration file, by name, to an already-migrated database.
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT A LOOP HOLE ────────────────────────────────────────────────────
 * `applyMigrationsUntil` always applies from the first migration, so it cannot be used to advance a
 * database that already holds its predecessors — doing so re-runs `create table public.dataset_entries`
 * and dies with `42P07 relation already exists`. That failure is informative rather than mysterious, but
 * it leaves a test unable to exercise a migration against a database it genuinely needs to be pre-migrated.
 *
 * The temptation this function is deliberately shaped against is `for (const m of migrations) await exec(m)`
 * with the boundary applied inline — a test that applies "the migrations up to the one under test" will
 * quietly apply the *whole* directory if the boundary is ever computed wrongly, and a test that applies
 * the wrong migration passes for the same reason a test that applies none does.
 *
 * So this takes a NAME, refuses an unknown name with the same message `applyMigrationsUntil` uses, and
 * applies the single file whose filename equals it. There is no boundary to get wrong because there is no
 * boundary: a typo throws rather than degrading into a different migration's test.
 */
export async function applyMigrationByName(
  db: TestDatabase,
  filename: string,
  directory = MIGRATIONS_DIR,
): Promise<MigrationFile> {
  const migrations = await readMigrations(directory);
  const found = migrations.find((migration) => migration.filename === filename);

  if (found === undefined) {
    // The same refusal as `applyMigrationsUntil`, for the same reason: a name that does not match must
    // not fall back to "apply the one that looks closest".
    throw new Error(
      `applyMigrationByName: ${filename} is not in ${directory}. Refusing to apply anything, ` +
        "because a typo in the name would silently turn a test of one migration into a test of " +
        "whatever migration happened to sort next to it.",
    );
  }

  await db.transaction(async (tx) => {
    try {
      await tx.exec(found.sql);
    } catch (cause) {
      throw new Error(
        `PGlite failed applying migration ${found.filename}: ${(cause as Error).message}`,
        {
          cause,
        },
      );
    }
  });

  return found;
}

/** Applies each migration in its own transaction, naming the file that failed. */
async function applyEach(db: TestDatabase, migrations: MigrationFile[]): Promise<void> {
  for (const migration of migrations) {
    // Applied as one transaction per file, matching how Supabase applies each migration, so a
    // failure cannot leave a half-applied file behind.
    await db.transaction(async (tx) => {
      try {
        await tx.exec(migration.sql);
      } catch (cause) {
        throw new Error(
          `PGlite failed applying migration ${migration.filename}: ${(cause as Error).message}`,
          { cause },
        );
      }
    });
  }

  // Supabase provisions its API roles with schema usage and table privileges before any
  // application request runs. Plain PostgreSQL does not, so the same grants are applied here;
  // without them every RLS test fails for reasons unrelated to the policy under test.
  await grantPublicPrivileges(db);
}

export { applySql };
