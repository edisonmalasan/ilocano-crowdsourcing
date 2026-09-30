import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { AUDITED_FILES, GUARD_WEAKNESS } from "./guard-weakness";

/**
 * The guard audit, and the assertion that makes it non-skippable.
 *
 * =============================================================================================
 * WHAT THIS FORCES
 * =============================================================================================
 * Every `it(` in every audited file must account for its own weakest mutation, either as an inline
 * `WEAKNESS:` comment or as an entry in `guard-weakness.ts`. The task this comes from asked for the
 * audit to be verified by "asserting the count of guards found equals the count of tests present",
 * and this is that assertion — but a count alone is not enough, because a count is satisfied by a
 * table of sixty-three copies of the word "weak". So four further properties are asserted:
 *
 *   - the PARSE is self-consistent (below), so a formatting change cannot silently mis-key entries;
 *   - no entry names a test that no longer exists, so the table cannot rot;
 *   - no entry is shorter than 80 characters, so a placeholder fails;
 *   - no two entries are byte-identical, so copy-paste boilerplate fails.
 *
 * =============================================================================================
 * WHY THE PARSE IS ASSERTED RATHER THAN TRUSTED
 * =============================================================================================
 * `it` names are NOT unique: `onboarding-routes.test.tsx` has three tests named "has exactly one
 * h1" and two named "declares real route metadata rather than a placeholder". Keys are therefore
 * `describe path > it name`, which requires tracking the describe stack — and a stack-tracking
 * parser that is wrong is worse than no parser, because it would report coverage that does not
 * exist. The same defect appeared once already in this change's own tooling: an extraction that
 * never popped its stack produced describe paths that accumulated and were wrong.
 *
 * So the parser is only trusted when it agrees with three independent counts, and it derives its
 * keys from the same source as the counts. A formatting change that breaks the
 * `^});$`-closes-a-describe assumption makes this file go RED rather than quietly clear less.
 */

interface ParsedTest {
  readonly key: string;
  readonly line: number;
  /** The test's own text: from its `it(` to the next `it(`, `describe(`, or column-0 `});`. */
  readonly body: string;
}

const QUOTE = "[" + "`" + "'" + '"' + "]";

function leadingName(line: string, kind: "describe" | "it"): string | null {
  const match = new RegExp("^\\s*" + kind + "\\((" + QUOTE + ")((?:[^\\\\])*?)\\1\\s*,").exec(line);
  return match ? match[2] : null;
}

function parseTests(file: string): { readonly tests: ParsedTest[]; readonly rawCount: number } {
  const lines = readFileSync(file, "utf8").replace(/\r\n/g, "\n").split("\n");
  const stack: string[] = [];
  const tests: ParsedTest[] = [];
  let rawCount = 0;

  lines.forEach((line, index) => {
    const described = leadingName(line, "describe");
    if (described !== null) {
      stack.push(described);
      return;
    }
    const tested = leadingName(line, "it");
    if (tested !== null) {
      rawCount += 1;
      tests.push({
        key: stack.concat(tested).join(" > "),
        line: index + 1,
        body: "",
      });
      return;
    }
    if (/^\}\);\s*$/.test(line)) stack.pop();
  });

  // Second pass for bodies, now that every boundary is known. Done as a separate pass on purpose:
  // interleaving it with the stack walk would mean re-deriving boundaries twice, and the two
  // passes cannot disagree because they read the same array.
  const withBodies = tests.map((test, position) => {
    const start = test.line; // 1-based line of the `it(`
    let end = lines.length;
    for (const other of tests) {
      if (other.line > start && other.line < end) end = other.line;
    }
    for (let line = start; line < lines.length; line += 1) {
      if (line + 1 > end) break;
      if (line + 1 > start && leadingName(lines[line], "describe") !== null) {
        end = line;
        break;
      }
      if (/^\}\);\s*$/.test(lines[line])) {
        end = line;
        break;
      }
    }
    return { ...test, body: lines.slice(start - 1, end).join("\n") };
  });

  return { tests: withBodies, rawCount };
}

/** The inline marker. Deliberately a full word: `WEAKNESS` cannot be satisfied by a prose aside. */
const INLINE_MARKER = /\bWEAKNESS:/;

describe("every guard accounts for the mutation it does not catch", () => {
  for (const file of AUDITED_FILES) {
    describe(file, () => {
      const { tests, rawCount } = parseTests(file);
      const registry = GUARD_WEAKNESS[file] ?? {};

      it("parses itself consistently, so a coverage claim cannot be silently wrong", () => {
        // A guard that silently read nothing passes every one of its own checks — the failure
        // mode found in this repository's copy-catalog test, which matched ZERO of the 600 real
        // records and had been reporting coverage since the day it was written.
        expect(tests.length, `${file} yielded no tests at all`).toBeGreaterThan(0);
        expect(tests.length, "parsed test count disagrees with the raw `it(` count").toBe(rawCount);

        // Key uniqueness. Without this, three tests sharing a name would need three entries and
        // the mismatch would look like a coverage failure rather than an ambiguity.
        const keys = tests.map((test) => test.key);
        const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
        expect(duplicates, `duplicate audit keys in ${file}`).toEqual([]);
      });

      it("has a stated weakness for every test in it", () => {
        const uncovered = tests
          .filter((test) => !INLINE_MARKER.test(test.body) && !(test.key in registry))
          .map((test) => `${file}:${test.line}  ${test.key}`);

        expect(
          uncovered,
          `${uncovered.length} test(s) state no weakest mutation. Add an inline ` +
            `\`WEAKNESS:\` comment or an entry in guard-weakness.ts.`,
        ).toEqual([]);
      });

      it("has no entry for a test that no longer exists", () => {
        const known = new Set(tests.map((test) => test.key));
        const stale = Object.keys(registry).filter((key) => !known.has(key));

        expect(
          stale,
          `${stale.length} entr(ies) in guard-weakness.ts name a test that is gone. ` +
            `A stale entry is worse than none: it reports coverage for a guard nobody reads.`,
        ).toEqual([]);
      });
    });
  }

  describe("the recorded weaknesses are substantive, not placeholders", () => {
    const everyEntry = Object.entries(GUARD_WEAKNESS).flatMap(([file, byKey]) =>
      Object.entries(byKey).map(([key, text]) => ({ file, key, text })),
    );

    it("found the entries it was supposed to find", () => {
      // The same non-vacuity guard. `everyEntry` cannot be checked for quality if it is empty.
      expect(everyEntry.length).toBeGreaterThan(60);
    });

    it("states a mutation in every entry, long enough to be one", () => {
      const thin = everyEntry
        .filter((entry) => entry.text.trim().length < 80)
        .map((entry) => `${entry.file}  ${entry.key}`);
      expect(thin, `${thin.length} entr(ies) are too short to state a mutation`).toEqual([]);
    });

    it("contains no two identical entries, so copy-paste boilerplate fails", () => {
      // THE reason this file exists rather than a bare count. Sixty-three copies of one sentence
      // satisfy every other assertion here and describe nothing.
      const byText = new Map<string, string[]>();
      for (const entry of everyEntry) {
        const seen = byText.get(entry.text) ?? [];
        seen.push(`${entry.file}  ${entry.key}`);
        byText.set(entry.text, seen);
      }
      const duplicated = [...byText.entries()]
        .filter(([, occurrences]) => occurrences.length > 1)
        .map(
          ([text, occurrences]) =>
            `${occurrences.length}x: ${occurrences.join(" | ")}\n      ${text}`,
        );

      expect(
        duplicated,
        `${duplicated.length} weakness entr(ies) are byte-identical duplicates`,
      ).toEqual([]);
    });
  });

  describe("the feasibility spike is deliberately outside the audit", () => {
    it("declares itself a spike rather than a guard", () => {
      // `tests/dom/feasibility-spike.test.tsx` is NOT in `AUDITED_FILES`, and that is a decision
      // rather than an oversight: it exists to prove `happy-dom` can observe a click and a
      // pending window, so its assertions are about the APPROACH. Auditing it would either
      // require it to become a guard (duplicating `resume-validator.test.tsx`) or pretend it
      // already is one. It is asserted here instead, so the exclusion is recorded rather than
      // forgotten — the same reason `AGENTS.md` is listed as excluded from `format:check`.
      const spike = readFileSync("tests/dom/feasibility-spike.test.tsx", "utf8");

      expect(AUDITED_FILES).not.toContain("tests/dom/feasibility-spike.test.tsx");
      expect(spike).toMatch(/not a guard/i);
    });
  });
});
