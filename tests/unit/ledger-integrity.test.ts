/**
 * Does the ledger describe the repository it lives in?
 *
 * `docs/ROADMAP.md` carries an `Archived Changes` table and a `Project Status` block that both quote
 * figures about the change archive. Both are HAND-MAINTAINED, and this repository has recorded four
 * consecutive archives in which one of them was stale on arrival — a count that read thirteen when the
 * directory held fifteen, a phase row still describing the previous phase as live, a placeholder that
 * outlived its pull request, and three archived changes the table never named. Each was caught by
 * reading, which is not a mechanism. This file is the mechanism.
 *
 * ============================================================================
 * WHAT THE GUARD COVERS, AND WHAT IT DOES NOT
 * ============================================================================
 * It checks DIRECTORY NAMES and ONE COUNT SENTENCE. It does not check the `Merged as` column, the
 * notes, or any prose — those were found wrong by an independent verification pass and are recorded
 * as a known scope gap rather than pretended covered. A guard that cannot see a claim must not be
 * described as if it could.
 *
 * ============================================================================
 * WHY THE TABLE IS READ BY STRUCTURE, NEVER BY LINE NUMBER
 * ============================================================================
 * An earlier table-shape checker in this repository decided "is this a row?" with
 * `startsWith("|") && endsWith("|")`, and that discarded the very row it existed to catch: a row that
 * had lost its closing delimiter failed `endsWith`, so it was not counted — and the branch that
 * handled a non-row also reset the table header, so every row BELOW it stopped being checked too. One
 * malformed row blinded eight.
 *
 * Three rules here, and each was written after measuring the alternative:
 *
 *   - A ROW IS COUNTED AND REPORTED. A row that opens with `|` but has lost its closing `|` is
 *     malformed, and it is STILL counted. Reporting without counting would let a damaged row hide a
 *     change; counting without reporting would let it pass unnoticed. The verification pass measured
 *     both halves of that: an unclosed row with an intact path was previously counted and never
 *     reported.
 *   - ROWS ARE NOT DETECTED BY CELL COUNT. This ledger carries at least one literal pipe inside a
 *     cell, so splitting on `|` reports a different cell count than the row really has — a defect this
 *     file's own tooling notes already record. Rows are located by the archive path they carry.
 *   - THE READ STOPS AT THE TABLE'S END. A row appended BELOW the table is therefore not counted, so
 *     its change appears MISSING and the check fails loudly. Continuing past the blank line to "find"
 *     such a row would mean parsing unrelated tables further down the document, and a check that reads
 *     more than its subject stops being a check of that subject.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ROADMAP = path.join(ROOT, "docs", "ROADMAP.md");
const ARCHIVE = path.join(ROOT, "openspec", "changes", "archive");

/** The header line of the archived-changes table, exactly as the ledger writes it. */
const TABLE_HEADER = "| Change | Archived | Merged as | Notes |";

/** An archived change's directory name, as it appears in a table row's path cell. */
const ARCHIVE_PATH = /changes\/archive\/([0-9]{4}-[0-9]{2}-[0-9]{2}-[a-z0-9-]+)\//;

/** The archived directories, read from disk. Never from the ledger. */
function archivedDirectories(): string[] {
  if (!existsSync(ARCHIVE)) return [];
  return readdirSync(ARCHIVE, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * The archived-change directory names a ledger source names, plus anything wrong with its shape.
 *
 * Parameterised on the source text so the reader's own behaviour can be tested over synthetic ledgers.
 * That is what makes the malformed-row and appended-row cases reachable at all: without a parameter,
 * a test of either would have to corrupt the real ledger to produce the input it is testing.
 */
export function rowsNamingArchivedChanges(source: string): {
  listed: string[];
  malformed: string[];
} {
  const lines = source.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim() === TABLE_HEADER);
  if (headerIndex < 0) return { listed: [], malformed: [] };

  const listed: string[] = [];
  const malformed: string[] = [];

  // The header is already located, so the loop starts BELOW it: every line examined here is a
  // candidate row, and nothing in this loop can consume the header.
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    const trimmed = line.trim();
    // The end of the table. A row appended below it is not counted, and its change therefore reads as
    // missing — which is the loud failure, and is asserted as such below.
    if (trimmed === "") break;

    const opensRow = trimmed.startsWith("|");
    const closesRow = trimmed.endsWith("|");
    const named = ARCHIVE_PATH.exec(line);

    if (opensRow && named?.[1]) {
      listed.push(named[1]);
      // A row carrying its archive path but missing its closing delimiter is damaged. It is counted
      // AND reported: counting alone would let a damaged row pass unnoticed, which is the defect the
      // earlier checker had.
      if (!closesRow) {
        malformed.push(
          `line ${i + 1} lost its closing delimiter but still names a change: ${trimmed.slice(0, 80)}`,
        );
      }
      continue;
    }

    if (!opensRow) {
      malformed.push(
        `line ${i + 1} continues the archived-changes table without opening a row: ${trimmed.slice(0, 80)}`,
      );
      continue;
    }

    if (!/^\|[\s|:-]+\|?$/.test(trimmed)) {
      malformed.push(
        `line ${i + 1} sits inside the archived-changes table but names no archive path: ${trimmed.slice(0, 80)}`,
      );
    }
  }

  return { listed, malformed };
}

/** The reader over the ledger as it actually is. */
const readRealLedger = () => rowsNamingArchivedChanges(readFileSync(ROADMAP, "utf8"));

/** A synthetic ledger table, for the reader's own behaviour. */
const TICK = String.fromCharCode(96);
const syntheticRow = (name: string) =>
  `| ${TICK}${name}${TICK} | ${TICK}openspec/changes/archive/2026-01-01-${name}/${TICK} | PR #1 | note |`;

describe("the table reader behaves as the requirement states", () => {
  it("counts every well-formed row and reports none as malformed", () => {
    const source = [
      TABLE_HEADER,
      "| --- | --- | --- | --- |",
      syntheticRow("a"),
      syntheticRow("b"),
      "",
    ].join("\n");

    const { listed, malformed } = rowsNamingArchivedChanges(source);

    expect(listed).toEqual(["2026-01-01-a", "2026-01-01-b"]);
    expect(malformed).toEqual([]);
  });

  it("counts AND reports a row that lost its closing delimiter", () => {
    // Both halves are the point. Counting alone would let a damaged row pass unnoticed; reporting
    // alone would let it hide a change. The verification pass measured that an unclosed row with an
    // intact path was previously counted and NEVER reported.
    const damaged =
      "  | " +
      TICK +
      "b" +
      TICK +
      " | " +
      TICK +
      "openspec/changes/archive/2026-01-01-b/" +
      TICK +
      " | PR #1 | truncated";
    const source = [TABLE_HEADER, "| --- | --- | --- | --- |", syntheticRow("a"), damaged, ""].join(
      "\n",
    );

    const { listed, malformed } = rowsNamingArchivedChanges(source);

    expect(listed, "a damaged row must still be counted").toEqual(["2026-01-01-a", "2026-01-01-b"]);
    expect(malformed, "a damaged row must be reported").toHaveLength(1);
    expect(malformed[0]).toMatch(/lost its closing delimiter/);
  });

  it("stops at the table's end, so a row APPENDED BELOW it is not counted", () => {
    // Stated as the behaviour it is, rather than as the behaviour the first draft of the requirement
    // claimed. The consequence — the appended change reads as MISSING — is what makes this safe, and
    // the next assertion is the one that matters.
    const source = [
      TABLE_HEADER,
      "| --- | --- | --- | --- |",
      syntheticRow("a"),
      "",
      syntheticRow("b"),
      "",
    ].join("\n");

    const { listed, malformed } = rowsNamingArchivedChanges(source);

    expect(listed, "the row below the table is outside the table").toEqual(["2026-01-01-a"]);
    // And it is out of SCOPE rather than damaged: it is neither counted nor reported as malformed,
    // because a reader that kept going would be reading past the end of its subject. Which is only
    // safe because of the next assertion.
    expect(malformed, "a row outside the table is out of scope, not damaged").toEqual([]);
    // And it fails LOUDLY rather than silently: a directory on disk that this reader cannot see shows
    // up as missing, which is the whole safety property.
    const onDisk = archivedDirectories();
    const seen = new Set(listed);
    expect(onDisk.filter((directory) => !seen.has(directory)).length).toBeGreaterThan(0);
  });

  it("reports a line that sits inside the table without opening a row", () => {
    const source = [
      TABLE_HEADER,
      "| --- | --- | --- | --- |",
      syntheticRow("a"),
      "not a row",
      "",
    ].join("\n");

    const { malformed } = rowsNamingArchivedChanges(source);

    expect(malformed).toHaveLength(1);
    expect(malformed[0]).toMatch(/without opening a row/);
  });
});

describe("the ledger describes the archive directory", () => {
  it("reads a NON-EMPTY archive directory, so a match over nothing cannot pass", () => {
    // The emptiness guard. Without it, an empty archive would "agree" with an empty table.
    expect(existsSync(ROADMAP), "docs/ROADMAP.md must exist").toBe(true);
    expect(archivedDirectories().length, "the archive directory must not be empty").toBeGreaterThan(
      0,
    );
  });

  it("reads a NON-EMPTY enumeration, so a table that failed to parse cannot pass", () => {
    const { listed, malformed } = readRealLedger();
    expect(malformed.join("\n")).toBe("");
    expect(
      listed.length,
      "the ledger's archived-changes table must name something",
    ).toBeGreaterThan(0);
  });

  it("reports NO malformed row in the archived-changes table", () => {
    const { malformed } = readRealLedger();
    expect(malformed, `malformed rows:\n${malformed.join("\n")}`).toEqual([]);
  });

  it("names EVERY archived change, and no change that does not exist", () => {
    const onDisk = archivedDirectories();
    const { listed } = readRealLedger();
    const listedSet = new Set(listed);

    const missing = onDisk.filter((directory) => !listedSet.has(directory));
    const phantom = listed.filter((directory) => !onDisk.includes(directory));

    expect(
      missing,
      `archived changes the ledger does not name: ${missing.join(", ") || "(none)"}`,
    ).toEqual([]);
    expect(
      phantom,
      `changes the ledger names that are not on disk: ${phantom.join(", ") || "(none)"}`,
    ).toEqual([]);
  });

  it("names each archived change exactly once", () => {
    const { listed } = readRealLedger();
    const duplicates = listed.filter((name, index) => listed.indexOf(name) !== index);
    expect(duplicates, `listed more than once: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("reports an archived count equal to the directory's contents", () => {
    const onDisk = archivedDirectories();
    const { listed } = readRealLedger();

    // The count is READ from the ledger's own sentence, then compared with the directory — so this
    // fails on a stale figure rather than restating whatever the ledger happens to say.
    //
    // The pattern does NOT require bold markers before the number. A first version did, and it reported
    // "must state an archived count: null" against a ledger that stated the count correctly, because
    // a scripted edit had stripped the bold from that sentence's opening.
    const roadmap = readFileSync(ROADMAP, "utf8");
    const claimed = /(\w+) changes are archived and readable/.exec(roadmap);
    expect(claimed, "the Project Status block must state an archived count").not.toBeNull();

    const word = claimed?.[1] ?? "";
    const expected =
      onDisk.length === 16
        ? "Sixteen"
        : onDisk.length === 15
          ? "Fifteen"
          : onDisk.length === 14
            ? "Fourteen"
            : onDisk.length === 13
              ? "Thirteen"
              : null;

    expect(
      expected,
      `the archived-count sentence must be updated: the directory holds ${onDisk.length}`,
    ).not.toBeNull();
    expect(word).toBe(expected);
    expect(new Set(listed).size).toBe(onDisk.length);
  });
});
