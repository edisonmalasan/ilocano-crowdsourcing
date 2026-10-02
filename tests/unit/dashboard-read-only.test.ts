/**
 * The dashboard performs no writes, proven at the source level.
 *
 * This is the second half of the delta's scenario "The import runs as an operator command, not
 * as a page" — the first half (no request path writes a dataset entry) is enforced by
 * `tests/unit/import-dataset-command.test.ts` over `src/app/**` and `"use server"` modules, and
 * this file extends the same technique to the dashboard's own surface: the researcher routes plus
 * the dashboard service module.
 *
 * The subject is precise: WRITE CALLS, not imports and not words. `createSupabaseRepositories()`
 * appears in the dashboard pages because reads need a client, so forbidding the import would
 * forbid reading. What performs a write is a call — `.insert(`, `.update(`, `.upsert(`,
 * `.delete(`, `.rpc(` — or a `"use server"` directive, which is the only other mechanism a
 * request can invoke. Comments are stripped before matching, so documentation about writes is
 * not a write; string literals are NOT stripped, so a write hiding inside a string would still
 * match, which is the conservative direction for this scan.
 *
 * THE POSITIVE CONTROLS ARE REAL PRODUCTION WRITERS, not fixtures. Pointing the same patterns
 * at `validation-actions-core.ts` (which calls `.insert(`) and `validation/actions.ts` (which
 * opens with `"use server"`) must hit — if the patterns ever stop matching real writes, the
 * control fails rather than the guard silently passing.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const RESEARCHER = path.join(SRC, "app", "researcher");
const DASHBOARD_SERVICE = path.join(SRC, "lib", "admin", "dashboard.ts");

// A production module that really writes (repository `.insert(`/core delegation)…
const KNOWN_WRITER = path.join(SRC, "lib", "validation", "validation-actions-core.ts");
// …and a production module that really is a Server Action.
const KNOWN_SERVER_ACTION = path.join(SRC, "lib", "validation", "actions.ts");

/** Write calls this scan forbids on the dashboard surface. */
const WRITE_CALLS = [/\.insert\(/, /\.update\(/, /\.upsert\(/, /\.delete\(/, /\.rpc\(/];

/** A `"use server"` directive at a line start — a comment mentioning one does not match. */
const SERVER_DIRECTIVE = /^"use server"/m;

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function walkModules(directory: string): string[] {
  const found: string[] = [];
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkModules(full));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      found.push(full);
    }
  }
  return found;
}

const relative = (file: string): string => path.relative(ROOT, file).split(path.sep).join("/");

function writeCallsFound(source: string): string[] {
  const code = stripComments(source);
  return WRITE_CALLS.filter((pattern) => pattern.test(code)).map(String);
}

describe("the dashboard performs no writes", () => {
  it("PROVES THE SCAN CAN FIRE: real production writers are detected", () => {
    expect(existsSync(KNOWN_WRITER)).toBe(true);
    expect(existsSync(KNOWN_SERVER_ACTION)).toBe(true);

    const writerHits = writeCallsFound(readFileSync(KNOWN_WRITER, "utf8"));
    expect(writerHits.length).toBeGreaterThan(0);
    expect(writerHits.join(" ")).toContain("insert");

    const actionSource = readFileSync(KNOWN_SERVER_ACTION, "utf8");
    expect(SERVER_DIRECTIVE.test(actionSource)).toBe(true);
  });

  it("finds no repository write call in any researcher route or the dashboard service", () => {
    const files = [...walkModules(RESEARCHER), DASHBOARD_SERVICE];
    // Non-empty and naming the new routes, or the scan passes on nothing.
    expect(files.length).toBeGreaterThan(0);
    const names = files.map(relative);
    expect(names).toContain("src/app/researcher/(protected)/page.tsx");
    expect(names).toContain("src/app/researcher/(protected)/entries/[id]/page.tsx");
    expect(names).toContain("src/lib/admin/dashboard.ts");

    for (const file of files) {
      expect(
        writeCallsFound(readFileSync(file, "utf8")),
        `${relative(file)} must not perform a write`,
      ).toEqual([]);
    }
  });

  it("finds no Server Action in any researcher route or the dashboard service", () => {
    for (const file of [...walkModules(RESEARCHER), DASHBOARD_SERVICE]) {
      expect(
        SERVER_DIRECTIVE.test(readFileSync(file, "utf8")),
        `${relative(file)} must not be a Server Action`,
      ).toBe(false);
    }
  });
});
