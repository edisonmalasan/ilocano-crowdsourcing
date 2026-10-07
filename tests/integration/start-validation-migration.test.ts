import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The start orchestration ships no migration.
 *
 * The change's migration plan is code-only: the orchestration composes the existing
 * versioned allocation function with read-only lookups, so no new table, column,
 * function, or grant exists. This file asserts the migration directory carries no
 * start-validation artefact. The source half of the same proof — the orchestration
 * reaches persistence only through the existing seam — lives in
 * `tests/unit/start-validation-boundary.test.ts`.
 */
describe("no migration serves the start orchestration", () => {
  it("no migration file introduces a start-validation function", () => {
    const directory = "supabase/migrations";
    const files = readdirSync(directory).filter((name) => name.endsWith(".sql"));

    // Guard the guard: an empty directory read would pass every assertion below while
    // proving nothing.
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const contents = readFileSync(`${directory}/${file}`, "utf8");
      expect(contents, `migration ${file} names a start-validation artefact`).not.toMatch(
        /start_validation/i,
      );
    }
  });

  it("no migration file is named for validation start", () => {
    const directory = "supabase/migrations";
    const files = readdirSync(directory).filter((name) => name.endsWith(".sql"));

    for (const file of files) {
      expect(file).not.toMatch(/start/i);
    }
  });
});
