/**
 * The dashboard performs no writes, proven at the source level.
 *
 * This file discharges the delta's scenario "Dashboard modules expose no research-data mutation".
 * It is the same technique as `tests/unit/import-dataset-command.test.ts` — a source scan over a
 * route tree — applied to a different surface: the researcher routes plus the dashboard service
 * module. (The first draft of this header cited the delta scenario "The import runs as an operator
 * command, not as a page", which belongs to `openspec/specs/dataset-import/spec.md`, not to this
 * change. The scan it describes is this file's; the citation was not.)
 *
 * The subject is precise: WRITE CALLS, not imports and not words. `createSupabaseRepositories()`
 * appears in the dashboard pages because reads need a client, so forbidding the import would
 * forbid reading. What performs a write is a CALL on the repository the pages hold, or a
 * `"use server"` directive, which is the only other mechanism a request can invoke. Comments are
 * stripped before matching, so documentation about writes is not a write; string literals are NOT
 * stripped, so a write hiding inside a string would still match, which is the conservative
 * direction for this scan.
 *
 * ============================================================================
 * WHY THE WRITE SURFACE IS THE REPOSITORY METHODS, NOT JUST THE CLIENT BUILDER
 * ============================================================================
 * A first draft of this file forbade `.insert(`/`.update(`/`.upsert(`/`.delete(`/`.rpc(` and
 * called that sufficient. It is not, and the reason is a class of write it misses entirely.
 * `createSupabaseRepositories()` returns CONCRETE REPOSITORY INSTANCES, and a dashboard page
 * holds all of them — so the reachable write methods are every method those classes expose,
 * not only the PostgREST builders underneath them. `SupabaseValidatorsRepository.create()` is
 * the live example: a real production write, reachable from a page this scan governs, matching
 * none of the five original patterns. The list below is therefore derived from the repository
 * interfaces' WRITE methods, and `.create(` is in it for that reason.
 *
 * Two further shapes were measured against the original patterns and found to escape:
 * optional-chaining (`t.insert?.(…)`) and a line break before the argument list
 * (`t.insert\n  (…)`). Both are written by real people and both are now matched, because a guard
 * with a measured hole in it reports coverage it is not providing.
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

/**
 * Real production writers, one per write method the scan forbids.
 *
 * Not fixtures: each of these is a module in `src/` that genuinely writes research or
 * operational data. The point of naming them here is that a pattern list with no real writer
 * behind it is a list nobody has tested, and `.create(` reached this file exactly that way —
 * as a pattern nobody had a production module to point at.
 */
const KNOWN_WRITERS = [
  { file: path.join(SRC, "lib", "validation", "validation-actions-core.ts"), method: "insert" },
  { file: path.join(SRC, "lib", "validators", "enrollment.ts"), method: "create" },
  { file: path.join(SRC, "lib", "allocation", "allocate-batch.ts"), method: "create" },
  { file: path.join(SRC, "lib", "admin", "signin-core.ts"), method: "recordAttempt" },
  { file: path.join(SRC, "lib", "admin", "signin-core.ts"), method: "clear" },
] as const;

// A production module that really is a Server Action.
const KNOWN_SERVER_ACTION = path.join(SRC, "lib", "validation", "actions.ts");

/**
 * Write calls this scan forbids on the dashboard surface.
 *
 * Every pattern tolerates whitespace and newlines between the method name and its argument list,
 * and the optional-chaining form, because all three were measured escaping an earlier, tighter
 * list written in this file. `.create(` is here for the reason in the header: it is a real write
 * method on a repository instance the pages hold, and it matched nothing before.
 *
 * The names are the repository interfaces' WRITE methods (`insert`, `create`, `update`,
 * `touchLastActive`, `clear`, `recordAttempt`) plus the PostgREST builders behind them. Reading
 * the interfaces is the honest way to keep this list honest: a new write method is a new entry,
 * and the list cannot drift into covering only the builders.
 */
const WRITE_CALLS = [
  /\.insert\s*\??\./,
  /\.insert\s*\(/,
  /\.update\s*\??\./,
  /\.update\s*\(/,
  /\.upsert\s*\??\./,
  /\.upsert\s*\(/,
  /\.delete\s*\??\./,
  /\.delete\s*\(/,
  /\.rpc\s*\??\./,
  /\.rpc\s*\(/,
  /\.create\s*\??\./,
  /\.create\s*\(/,
  /\.touchLastActive\s*\??\./,
  /\.touchLastActive\s*\(/,
  /\.clear\s*\??\./,
  /\.clear\s*\(/,
  /\.recordAttempt\s*\??\./,
  /\.recordAttempt\s*\(/,
];

/**
 * A `"use server"` directive at a line start — a comment mentioning one does not match.
 *
 * Both quote styles are matched. An earlier draft accepted only the double-quoted form, which
 * meant a single-quoted directive — legal, and something a future edit could plausibly write —
 * would have passed this scan silently.
 */
const SERVER_DIRECTIVE = /^\s*(?:"use server"|'use server')/m;

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
  it("PROVES THE SCAN CAN FIRE: every forbidden method is found in a real production writer", () => {
    for (const writer of KNOWN_WRITERS) {
      expect(existsSync(writer.file), `${relative(writer.file)} must exist`).toBe(true);
      const hits = writeCallsFound(readFileSync(writer.file, "utf8"));
      expect(
        hits.some((pattern) => pattern.includes(writer.method)),
        `${relative(writer.file)} must be detected as calling .${writer.method}(`,
      ).toBe(true);
    }

    expect(existsSync(KNOWN_SERVER_ACTION)).toBe(true);
    expect(SERVER_DIRECTIVE.test(readFileSync(KNOWN_SERVER_ACTION, "utf8"))).toBe(true);
  });

  it("PROVES THE SHAPE-TOLERANT PATTERNS CAN FIRE: the escapes that were measured", () => {
    // Three shapes, each of which a tighter pattern list missed. Written as source strings rather
    // than as real files on purpose: these are the FORMS a future edit might take, and the
    // question is whether the pattern set sees them, not whether the repository happens to contain
    // one today.
    const escapes: readonly string[] = [
      "await table.insert(row);",
      "await table.insert?.(row);",
      "await table.insert\n  (row);",
      "await validators.create(profile);",
      "await validators.create?.(profile);",
      "await validators.touchLastActive(id, at);",
      "await attempts.clear(key);",
    ];

    for (const snippet of escapes) {
      expect(
        writeCallsFound(snippet),
        `this scan must catch: ${JSON.stringify(snippet)}`,
      ).not.toEqual([]);
    }
  });

  it("PROVES THE DIRECTIVE PATTERN CAN FIRE on both quote styles", () => {
    expect(SERVER_DIRECTIVE.test('"use server";')).toBe(true);
    expect(SERVER_DIRECTIVE.test("'use server';")).toBe(true);
    // And a mention inside prose is still not a directive — the guard must not become so blunt
    // that it would flag every file documenting the mechanism.
    expect(SERVER_DIRECTIVE.test('const note = "a use server directive";')).toBe(false);
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
