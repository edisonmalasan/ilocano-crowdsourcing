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

  return { applied: migrations.map((migration) => migration.filename) };
}

export { applySql };
