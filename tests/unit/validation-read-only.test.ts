import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The prefetch read performs no writes, proven at the source level.
 *
 * `requestNextEntryAction` exists to make transitions instant, and the fastest wrong version of
 * it would resolve the next entry as a side effect of a write — or smuggle one in later, when
 * the read and the write live one import apart. This scan asserts the three prefetch modules
 * (`next-entry-actions-core.ts`, `next-entry-actions.ts`, `allocated-entry.ts`) contain no
 * repository write call, no PostgREST write builder, and no `"use server"`-adjacent mutation
 * path beyond the action export itself.
 *
 * The technique mirrors `tests/unit/dashboard-read-only.test.ts`: comments are stripped before
 * matching (documentation about writes is not a write), string literals are NOT stripped (a
 * write hiding inside a string still matches), and the patterns are proved against REAL
 * production writers first — pointing them at `validation-actions-core.ts` must hit, or the
 * guard is a decoration.
 */

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

const PREFETCH_MODULES = [
  "lib/validation/next-entry-actions-core.ts",
  "lib/validation/next-entry-actions.ts",
  "lib/validation/allocated-entry.ts",
] as const;

/** Repository write methods plus the PostgREST builders behind them. */
const WRITE_CALLS = [
  /\.insert\s*\(/,
  /\.update\s*\(/,
  /\.upsert\s*\(/,
  /\.delete\s*\(/,
  /\.rpc\s*\(/,
  /\.create\s*\(/,
  /\.touchLastActive\s*\(/,
  /\.clear\s*\(/,
  /\.recordAttempt\s*\(/,
  /\.releaseReservation\s*\(/,
];

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the next-entry prefetch performs no writes", () => {
  it("PROVES THE SCAN CAN FIRE: the same patterns hit the real validation writer", () => {
    const writer = stripComments(
      readFileSync(path.join(SRC, "lib", "validation", "validation-actions-core.ts"), "utf8"),
    );
    const hits = WRITE_CALLS.filter((pattern) => pattern.test(writer));
    // `.insert(` and `.releaseReservation(`: the write this prefetch must never grow.
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it.each([...PREFETCH_MODULES])("contains no write call in %s", (relative) => {
    const code = stripComments(readFileSync(path.join(SRC, relative), "utf8"));
    const hits = WRITE_CALLS.filter((pattern) => pattern.test(code));
    expect(hits, `${relative} reaches a write path`).toEqual([]);
  });

  it("imports only the read half of each repository interface", () => {
    // The Narrow `Pick`s are the type-level half of this guarantee; this is the textual half,
    // and it fails on the method name rather than on the shape, so a widened Pick that still
    // typechecks is caught here.
    const core = stripComments(
      readFileSync(path.join(SRC, "lib", "validation", "next-entry-actions-core.ts"), "utf8"),
    );
    for (const write of [
      "insert",
      "releaseReservation",
      "create",
      "touchLastActive",
      "listAllIds",
      "listAllValidatorIds",
      "countForValidator",
    ]) {
      expect(
        core,
        `prefetch core names repository write or out-of-scope read ${write}`,
      ).not.toMatch(new RegExp(`\\b${write}\\b`));
    }
  });
});
