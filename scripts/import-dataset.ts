/**
 * Operator command: import the synthetic dataset into a hosted Supabase project.
 *
 * WHY A COMMAND AND NOT A SCRIPT INSIDE THE APP
 * ---------------------------------------------
 * `src/lib/repositories/supabase/dataset-entries.ts` states that its sink is "not allowed to be
 * reachable from a request path". An HTTP route that imports 600 records would put an unbounded,
 * unauthenticated, credential-holding operation on the public internet, and it would make the
 * import re-runnable by anyone who found the URL. There is no version of this that belongs in the
 * application, so it is an operator command that a person runs deliberately.
 *
 * WHY `tsx`
 * ---------
 * Node 26 executes a `.ts` file directly, but plain Node does NOT resolve the `@/*` path alias, and
 * the import path reaches three `@/` imports across four modules. Rewriting them to relative paths
 * to suit a script would break the convention the whole repository uses. `tsx` resolves
 * `tsconfig` `paths`; it is a devDependency and ships in no bundle. This is design decision D2 and it
 * is recorded there so `tsx` does not become an unexplained dependency.
 *
 * WHY THE ENVIRONMENT IS READ HERE AND NOT THROUGH `@/lib/env/server`
 * -----------------------------------------------------------------
 * `@/lib/env/server` carries `import "server-only"`, whose package entry point THROWS outside a
 * React Server Component render — including in this command, which is plain Node. Design decision
 * D2 states the resolution: the command does not need that module, so it does not import it. The
 * cost is that this command validates its own two variables rather than sharing the application's
 * schema, and that is a real duplication rather than a tidy one. It is stated here so a reader does
 * not have to discover it.
 *
 * THE TWO PROMISES THIS FILE MAKES
 * --------------------------------
 * 1. **The source dataset is never written.** This module contains no filesystem write, rename, or
 *    delete call, and `tests/unit/import-dataset-command.test.ts` scans it for one — a textual scan,
 *    because a scan by monkey-patched `fs` can only observe the paths this run happens to execute,
 *    and an unexecuted write path is exactly what is being looked for.
 * 2. **No credential is ever printed.** Not in progress, not in the report, not in an error. The
 *    only facts about a credential this command can print are its VARIABLE NAME and its LENGTH.
 */

import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  importDatasetEntries,
  readAndParseDatasetFile,
  type DatasetEntrySink,
  type DatasetImportResult,
} from "@/lib/dataset/import-dataset";
import type { DatasetParseReport, ImportedDatasetEntry } from "@/lib/dataset/synthetic-source";
import { SupabaseDatasetEntrySink } from "@/lib/dataset/supabase-sink";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { RepositoryError } from "@/lib/repositories";

/** The immutable research source. Its path is a constant so no argument can redirect the import. */
export const DEFAULT_SOURCE_PATH = "data/ilocano-synthetic-data.json";

/** How often progress is printed. 600 round trips take minutes; silence for minutes is a bug report. */
const PROGRESS_EVERY = 50;

export const EXIT_OK = 0;
export const EXIT_REFUSED = 1;
export const EXIT_MISCONFIGURED = 2;

// ---------------------------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------------------------

export interface ImportCredentials {
  url: string;
  key: string;
}

/**
 * What the command may say about a credential.
 *
 * Deliberately narrow: a variable NAME and a character count. A project URL is not a secret, but it
 * identifies the project and the repository's standing instruction is to report environment values by
 * name and length only, so the URL is held to the same rule as the key.
 */
export interface CredentialDescription {
  name: string;
  length: number;
}

export type EnvironmentOutcome =
  | { ok: true; credentials: ImportCredentials; described: CredentialDescription[] }
  | { ok: false; missing: string[] };

/**
 * Reads the two variables the command needs.
 *
 * `env` is a parameter so the decision is testable without mutating the real process environment —
 * a unit test that set `process.env` would have to restore it, and a test that failed to restore it
 * would change the behaviour of every test that ran after it.
 *
 * A missing variable is reported by NAME and never by value, and a blank string counts as missing:
 * `SUPABASE_SERVICE_ROLE_KEY=` in a shell profile is a much more common way to reach this command
 * than an absent line, and it fails at the gateway rather than here if it is not caught.
 */
export function readImportEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): EnvironmentOutcome {
  const required = [
    ["SUPABASE_URL", env.SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY],
  ] as const;

  const missing = required
    .filter(([, value]) => typeof value !== "string" || value === "")
    .map(([name]) => name);

  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    credentials: {
      url: required[0][1] as string,
      key: required[1][1] as string,
    },
    described: required.map(([name, value]) => ({ name, length: (value as string).length })),
  };
}

// ---------------------------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------------------------

/**
 * One credential line for the console.
 *
 * Exported and pure so the promise can be asserted directly. The first version of the corresponding
 * test asserted that `readImportEnvironment`'s RETURN VALUE did not contain the key — which was
 * reported red, correctly, and the assertion was nonsense rather than the code being wrong: the
 * return value carries `credentials` precisely so the caller can build a client with them. The claim
 * is about what reaches a terminal, and the only way to assert that is to isolate the formatter.
 */
export function formatCredentialDescription(description: CredentialDescription): string {
  return `  ${description.name} present (${description.length} characters)`;
}

export interface ProgressLine {
  done: number;
  total: number;
  inserted: number;
  updated: number;
}

/**
 * Progress as one line, with no credential and no instruction text.
 *
 * Counts only. An entry's `instruction` is research material, and a log line that echoes one would
 * put validator-facing content into a terminal scrollback and a CI log for no benefit — the
 * identifier is what an operator needs in order to look a record up.
 */
export function formatProgress(progress: ProgressLine): string {
  return (
    `  ${progress.done}/${progress.total} written ` +
    `(${progress.inserted} inserted, ${progress.updated} updated)`
  );
}

/** The final report. Every figure here is one the command actually counted. */
export function formatReport(result: DatasetImportResult): string {
  const lines = [
    `parsed:   ${result.parsed}`,
    `inserted: ${result.inserted}`,
    `updated:  ${result.updated}`,
    `refused:  ${result.parsed - result.inserted - result.updated}`,
  ];

  // The parse report carries fields the parser did not model. A research dataset with unmodelled
  // fields is worth saying out loud at import time rather than discovering later.
  if (result.report.recordsWithPreservedFields > 0) {
    lines.push(
      `preserved unmapped source fields on ${result.report.recordsWithPreservedFields} record(s):`,
    );
    for (const field of result.report.preservedFields) {
      lines.push(`  ${field.fieldPath} (${field.recordCount} record(s))`);
    }
  }

  return lines.join("\n");
}

/**
 * A refusal, described without the data that caused it.
 *
 * `RepositoryError.message` is already written for this: the migration's refusal names the entry id
 * and explicitly NOT either instruction, so an operator learns WHICH record diverged without either
 * version of a validator-facing sentence reaching a terminal. The stack is deliberately dropped.
 */
export function describeRefusal(error: unknown): string {
  if (error instanceof RepositoryError) return `${error.operation}: ${error.message}`;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return `unknown failure: ${String(error)}`;
}

// ---------------------------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------------------------

export interface RunOptions {
  sourcePath: string;
  credentials: ImportCredentials;
  /** Injected so a test can capture output instead of writing to the real console. */
  write: (line: string) => void;
}

/**
 * Imports every entry and returns a process exit code, reporting as it goes.
 *
 * SEPARATED FROM `runImport` so that every reporting and exit-code decision is reachable with a
 * recording sink and no credential. `runImport` is the only part that touches the environment, the
 * filesystem, and a real client, and a decision that can only be observed by holding a real
 * credential is a decision nobody will test.
 */
export async function importEntries(
  entries: readonly ImportedDatasetEntry[],
  report: DatasetParseReport,
  sink: DatasetEntrySink,
  write: (line: string) => void,
): Promise<number> {
  let inserted = 0;
  let updated = 0;
  let done = 0;

  // A decorator rather than a loop of the command's own, so `importDatasetEntries` remains the thing
  // that decides what an import IS and this file only observes it. A second implementation of the
  // loop here would be a second thing to keep correct.
  const observed: DatasetEntrySink = {
    async upsert(entry) {
      try {
        const outcome = await sink.upsert(entry);
        if (outcome === "inserted") inserted += 1;
        else updated += 1;
        done += 1;
        if (done % PROGRESS_EVERY === 0) {
          write(formatProgress({ done, total: entries.length, inserted, updated }));
        }
        return outcome;
      } catch (error) {
        // The id is named separately from the message so an operator can act on the record even if
        // the error is a gateway failure with no entry id of its own.
        write(`refused ${entry.id}`);
        write(describeRefusal(error));
        throw error;
      }
    },
  };

  try {
    const result = await importDatasetEntries(entries, observed, report);
    write(formatReport(result));
    return EXIT_OK;
  } catch {
    // The counts are printed on the failure path too. "600 parsed, 412 inserted, then a refusal" is
    // materially different information from "the import failed", and an operator who only sees the
    // second cannot tell how far the run got.
    write(
      formatProgress({ done, total: entries.length, inserted, updated }) +
        " — stopped here, the records above are already written",
    );
    return EXIT_REFUSED;
  }
}

/**
 * Reads the source, builds the privileged sink, and imports every entry.
 *
 * NEVER returns a code that hides a partial import: a run that refused reports `EXIT_REFUSED`, and a
 * run that could not read its credentials or its dataset reports `EXIT_MISCONFIGURED`.
 *
 * FAIL-FAST ON THE FIRST REFUSAL, and that is a decision rather than an omission. `importDatasetEntries`
 * is sequential, and the refusal this command can hit is a stored instruction that differs from the
 * source's — which means the research source has been revised after entries were imported. That is a
 * question for the thesis team, not something a retry loop should resolve by writing the other 599
 * records into a project whose source nobody has reviewed. Stopping leaves the table in a state that
 * is easy to read back.
 */
export async function runImport(options: RunOptions): Promise<number> {
  const { sourcePath, credentials, write } = options;

  let entries;
  let report;
  try {
    ({ entries, report } = await readAndParseDatasetFile(sourcePath));
  } catch (error) {
    write(`Cannot read the synthetic dataset from ${sourcePath}.`);
    write(describeRefusal(error));
    return EXIT_MISCONFIGURED;
  }

  write(`read ${entries.length} record(s) from ${sourcePath}`);

  const client = createSupabaseAdminClient(credentials.url, credentials.key);
  return importEntries(entries, report, new SupabaseDatasetEntrySink(client), write);
}

/**
 * Resolves the entry point.
 *
 * Exported so a unit test can drive it with an injected environment, writer, and credential
 * factory — this is the whole reason the side effects live in a function rather than at the top
 * level of the module.
 */
export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Promise<number> {
  // The source path is NOT taken from argv. `data/ilocano-synthetic-data.json` is immutable research
  // material, and an argument that chooses which file to import is an argument that chooses which
  // file gets treated as the research record. An unknown argument is refused rather than ignored, so
  // a typo cannot silently import the real thing when the operator meant something else.
  const unknown = argv.filter((argument) => argument.startsWith("-"));
  if (unknown.length > 0) {
    throw new Error(
      `This command takes no arguments. Received: ${unknown.join(", ")}. The source dataset path ` +
        "is a constant so no argument can redirect a research import.",
    );
  }

  const environment = readImportEnvironment(env);
  if (!environment.ok) {
    // Names, never values, and never a value's length for a variable that was not supplied.
    throw new Error(
      `Missing environment variable(s): ${environment.missing.join(", ")}. Both are required; a ` +
        "blank value is treated as missing.",
    );
  }

  for (const description of environment.described) {
    // The only place either credential influences output, and it contributes a NAME and a LENGTH.
    // Both facts are useful — a zero-length key and a truncated one look identical from the outside —
    // and neither is the credential.
    console.info(formatCredentialDescription(description));
  }

  return runImport({
    sourcePath: DEFAULT_SOURCE_PATH,
    credentials: environment.credentials,
    write: (line) => console.info(line),
  });
}

/**
 * Runs only when this file is the process entry point.
 *
 * A top-level `await main(...)` would execute on import, which is how every unit test that imported
 * this module for its pure functions would find itself running an operator command against whatever
 * credentials happened to be in the developer's shell. The comparison is against `import.meta.url`,
 * which is the module's own identity, rather than against a filename.
 */
const isEntryPoint = (): boolean => {
  const invoked = process.argv[1];
  if (invoked === undefined) return false;
  try {
    return pathToFileURL(path.resolve(invoked)).href === import.meta.url;
  } catch {
    // An `argv[1]` that cannot be turned into a URL is not this file, and saying so is safer than
    // proceeding on a comparison that could not be made.
    return false;
  }
};

if (isEntryPoint()) {
  main(process.argv.slice(2), process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(describeRefusal(error));
      process.exitCode = EXIT_MISCONFIGURED;
    },
  );
}
