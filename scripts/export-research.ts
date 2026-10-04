/**
 * The research-data export, as an operator command.
 *
 * ============================================================================
 * WHY A COMMAND AND NOT A ROUTE
 * ============================================================================
 * `import:dataset` is a command because nothing in a request path may WRITE a dataset entry, so the
 * import cannot live where a browser can reach it. The argument inverts cleanly here: nothing in a
 * request path should be able to read the WHOLE corpus and emit it, so the export is a command too.
 * A dashboard download button would additionally have to re-derive authorization for a bulk read and
 * would put a research artifact on a path a browser can reach.
 *
 * ============================================================================
 * WHY THIS FILE IS THIN
 * ============================================================================
 * Every decision about the artifact's CONTENT lives in `@/lib/export/*`, which is pure and imports
 * nothing but the domain predicates. This file reads the environment, reads the corpus through the
 * repositories, calls the serializers, writes files, and maps failures to exit codes. That split is
 * the same one `import-dataset.ts` uses, and for the same reason: a claim about the export that can
 * only be observed by holding a real credential is a claim nobody will test.
 *
 * ============================================================================
 * WHY THIS COMMAND RUNS WITH `--conditions=react-server`
 * ============================================================================
 * The Supabase repository implementations carry `import "server-only"`, whose package entry point
 * THROWS outside a React Server Component render — so a plain Node process cannot import them at all.
 * The alternatives were measured rather than argued:
 *
 *   - Importing `@/lib/env/server` — same problem, worse: the marker is on that module too.
 *   - Adding an exemption to the `WITHOUT_SERVER_ONLY` list in `tests/unit/repositories-supabase.test.ts`.
 *     That list exists precisely to make such a widening a deliberate, documented act, and it would
 *     have meant new query logic outside the repository boundary — duplicating row mapping rather
 *     than reusing it.
 *   - `--conditions=react-server`, which is what this command uses. The `server-only` package's own
 *     `exports` map sends that condition to `empty.js`, so the marker resolves to a no-op and the
 *     repository implementations load normally. This is the SAME condition Next applies when bundling
 *     a Server Component, so the module graph this command loads is the one the application already
 *     loads — not a loosened one.
 *
 * What the flag does NOT do: it is passed to this one process by its own `package.json` script. It
 * does not affect the Next build, the browser bundle, the ESLint boundary rule, or Vitest, so the
 * guard that keeps `server-only` off client components still fires exactly as before.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  collectExportSources,
  renderDocuments,
  SUMMARY_JSON,
  VALIDATED_CSV,
  VALIDATED_JSON,
  VALIDATIONS_CSV,
  VALIDATIONS_JSON,
  type ExportSources,
} from "@/lib/export/documents";
import { createSupabaseAdminClient } from "@/lib/supabase/admin-client";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";

export const EXIT_OK = 0;
export const EXIT_MISCONFIGURED = 2;

/**
 * The document builders live in `@/lib/export/documents`, shared with the researcher web
 * download so both paths are one derivation. They are re-exported here so existing importers
 * (and the operator command below) keep working unchanged.
 */
export {
  collectExportSources,
  EXPORT_DOCUMENT_NAMES,
  renderDocuments,
  SUMMARY_JSON,
  VALIDATED_CSV,
  VALIDATED_JSON,
  VALIDATIONS_CSV,
  VALIDATIONS_JSON,
  type ExportDocumentName,
  type ExportDocuments,
  type ExportResult,
  type ExportSources,
} from "@/lib/export/documents";

const REQUIRED_ENV = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

export interface ExportEnvironment {
  readonly supabaseUrl: string;
  readonly serviceRoleKey: string;
}

export type EnvironmentOutcome =
  | { readonly ok: true; readonly environment: ExportEnvironment }
  | { readonly ok: false; readonly missing: readonly string[] };

/**
 * Validates the environment the command needs.
 *
 * DUPLICATED from `@/lib/env/server` on purpose, for the reason in this file's header: the shared
 * module is `server-only` and cannot be imported by a Node command. The duplication is the lesser
 * evil, and it is stated here so that a future change adding a third variable does not quietly update
 * one copy of the contract and not the other.
 *
 * A blank value counts as missing: a zero-length service-role key produces a 401 from the gateway
 * that reads like a network fault, and refusing here names the actual problem.
 */
export function readExportEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): EnvironmentOutcome {
  const missing = REQUIRED_ENV.filter((name) => (env[name] ?? "").trim().length === 0);
  if (missing.length > 0) return { ok: false, missing };

  return {
    ok: true,
    environment: {
      supabaseUrl: (env.SUPABASE_URL ?? "").trim(),
      serviceRoleKey: (env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim(),
    },
  };
}

/**
 * Runs the export and returns a process exit code.
 *
 * Separated from {@link main} so that writing, reporting, and exit-code decisions are reachable with
 * an injected writer and a fake source set — no credential, no database, no real directory.
 */
export async function runExport(options: {
  readonly sources: ExportSources;
  readonly destination: string;
  readonly write: (line: string) => void;
}): Promise<number> {
  const { entries, sources } = await collectExportSources(options.sources, options.write);
  const documents = renderDocuments(sources, entries);

  try {
    await mkdir(options.destination, { recursive: true });
    await writeFile(
      path.join(options.destination, VALIDATIONS_JSON),
      documents.validationsJson,
      "utf8",
    );
    await writeFile(
      path.join(options.destination, VALIDATIONS_CSV),
      documents.validationsCsv,
      "utf8",
    );
    await writeFile(path.join(options.destination, SUMMARY_JSON), documents.summaryJson, "utf8");
    await writeFile(
      path.join(options.destination, VALIDATED_JSON),
      documents.validatedJson,
      "utf8",
    );
    await writeFile(path.join(options.destination, VALIDATED_CSV), documents.validatedCsv, "utf8");
  } catch (error) {
    // The destination is named in the refusal. An export that fails quietly is the worst outcome
    // available: the operator believes they have a dataset and do not.
    throw new Error(
      `Could not write the export into ${options.destination}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  options.write(
    `wrote ${VALIDATIONS_JSON}, ${VALIDATIONS_CSV}, ${SUMMARY_JSON}, ${VALIDATED_JSON} and ${VALIDATED_CSV} into ${options.destination}`,
  );
  options.write(
    `${documents.result.entries} entries, ${documents.result.responses} responses, ${documents.result.qualifying} qualifying, ${documents.result.validated} validated`,
  );
  return EXIT_OK;
}

export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
): Promise<number> {
  // Arguments are validated BEFORE the environment, matching `import-dataset.ts`. The order matters
  // for the message a reader gets: a usage error reported as "missing SUPABASE_URL" sends an
  // operator to fix their deployment when the mistake was a typo in the command they just ran.
  //
  // A LONE `--` is dropped first, and that is not a special case invented for convenience: `pnpm run
  // <script> -- <args>` forwards the separator to the script as a literal argument, so the
  // documented invocation `pnpm run export:research -- ./research-export` arrives here as
  // `["--", "./research-export"]`. Without this, the command refuses the exact invocation its own
  // error message tells the operator to type. A gate probe running against the real project caught
  // this; a unit test over a hand-built argv would not have, because it would have passed the
  // directory alone.
  const forwarded = argv.filter((argument) => argument !== "--");
  const destination = forwarded.find((argument) => !argument.startsWith("-"));
  const unknown = forwarded.filter((argument) => argument.startsWith("-"));
  if (unknown.length > 0) {
    throw new Error(
      `This command takes one argument: the output directory. Received unknown argument(s): ${unknown.join(", ")}.`,
    );
  }
  if (destination === undefined) {
    throw new Error(
      "No output directory given. Pass the directory the export should be written to, for example " +
        "`pnpm run export:research -- ./research-export`.",
    );
  }

  const environment = readExportEnvironment(env);
  if (!environment.ok) {
    throw new Error(
      `Missing environment variable(s): ${environment.missing.join(", ")}. ` +
        "Names only; no value is printed.",
    );
  }

  const admin = createSupabaseAdminClient(
    environment.environment.supabaseUrl,
    environment.environment.serviceRoleKey,
  );
  // The real repositories, reused rather than reimplemented. Only the three reads are destructured,
  // and `ExportSources` is `Pick`s of the read methods, so the write methods are not reachable from
  // this file at all — the read-only property is the type layer's, not a habit.
  const { datasetEntries, validations, validators } = createSupabaseRepositories(admin);
  return runExport({
    sources: { entries: datasetEntries, validations, validators },
    destination,
    write: (line) => console.info(line),
  });
}

/**
 * Runs only when this file is the process entry point.
 *
 * A top-level `await main(...)` would execute on import, so every unit test importing this module
 * for its pure functions would find itself running an operator command against whatever credentials
 * happened to be in the developer's shell.
 */
const isEntryPoint = (): boolean => {
  const invoked = process.argv[1];
  if (invoked === undefined) return false;
  try {
    return pathToFileURL(path.resolve(invoked)).href === import.meta.url;
  } catch {
    return false;
  }
};

if (isEntryPoint()) {
  main(process.argv.slice(2), process.env).then(
    (code) => {
      process.exitCode = code;
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = EXIT_MISCONFIGURED;
    },
  );
}
