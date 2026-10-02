/**
 * Does the ledger describe the repository it lives in?
 *
 * `docs/ROADMAP.md` carries an `Archived Changes` table and a `Project Status` block that both quote
 * figures about the change archive. Both are HAND-MAINTAINED, and this repository has recorded three
 * consecutive archives in which one of them was stale on arrival — a count that read thirteen when the
 * directory held fifteen, a phase row still describing the previous phase as live, and a placeholder
 * that outlived its pull request. Each was caught by reading, which is not a mechanism.
 *
 * So this is the assertion the file's own note asks for: *"a hand-maintained index drifts as a matter
 * of course, so an index that must stay correct needs an assertion, not a habit."*
 *
 * ============================================================================
 * WHY THE TABLE IS READ BY STRUCTURE, NEVER BY LINE NUMBER
 * ============================================================================
 * An earlier table-shape checker in this repository decided "is this a row?" with
 * `startsWith("|") && endsWith("|")`, and that discarded the very row it existed to catch: a row that
 * had lost its closing delimiter failed `endsWith`, so it was not counted as a row — and the branch
 * that handled a non-row also reset the table header, so every row BELOW it stopped being checked too.
 * One malformed row blinded eight. Here the table is located by its own header line, a line that OPENS
 * a row inside a known table is a row whether or not it is closed, and anything unexpected is REPORTED
 * rather than skipped.
 *
 * Two more rules, both earned:
 *
 *   - ROWS ARE NOT DETECTED BY CELL COUNT. This ledger carries at least one literal pipe inside a cell,
 *     which makes a split-on-pipe report a different cell count than the row really has. That defect —
 *     a pipe inside a cell producing a "wrong" cell count — is recorded in this file's own tooling
 *     notes, and a cell-count rule here would flag correct rows.
 *   - THE HEADER IS LOCATED, NEVER CONSUMED. The first version of this reader treated the first line
 *     after the header as the header itself, so it silently consumed the first DATA row and reported
 *     `project-foundation` as missing from the ledger when the ledger names it. One row lost to an
 *     off-by-one is the same failure class as the checker above: a detector that discards the first
 *     instance of the thing it is counting.
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

/** The archived-change directory names the table names, plus anything wrong with the table's shape. */
function rowsNamingArchivedChanges(): { listed: string[]; malformed: string[] } {
  const lines = readFileSync(ROADMAP, "utf8").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => line.trim() === TABLE_HEADER);
  if (headerIndex < 0) return { listed: [], malformed: [] };

  const listed: string[] = [];
  const malformed: string[] = [];

  // The header is already located, so the loop starts BELOW it: every line examined here is a
  // candidate row, and nothing in this loop can consume the header.
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    const trimmed = line.trim();
    if (trimmed === "") break;

    if (!trimmed.startsWith("|")) {
      malformed.push(
        `line ${i + 1} continues the archived-changes table without opening a row: ${trimmed.slice(0, 80)}`,
      );
      continue;
    }

    const named = ARCHIVE_PATH.exec(line);
    if (named?.[1]) {
      listed.push(named[1]);
      continue;
    }

    // Not a row, not a separator, and it names no change: report it. Dropping it silently would report
    // the ledger as correct when it has lost a row.
    if (!/^\|[\s|:-]+\|?$/.test(trimmed)) {
      malformed.push(
        `line ${i + 1} sits inside the archived-changes table but names no archive path: ${trimmed.slice(0, 80)}`,
      );
    }
  }

  return { listed, malformed };
}

describe("the ledger describes the archive directory", () => {
  it("reads a NON-EMPTY archive directory, so a match over nothing cannot pass", () => {
    // The emptiness guard. Without it, an empty archive would "agree" with an empty table.
    expect(existsSync(ROADMAP), "docs/ROADMAP.md must exist").toBe(true);
    expect(archivedDirectories().length, "the archive directory must not be empty").toBeGreaterThan(
      0,
    );
  });

  it("reads a NON-EMPTY enumeration, so a table that failed to parse cannot pass", () => {
    const { listed, malformed } = rowsNamingArchivedChanges();
    expect(malformed.join("\n")).toBe("");
    expect(
      listed.length,
      "the ledger's archived-changes table must name something",
    ).toBeGreaterThan(0);
  });

  it("reports NO malformed row in the archived-changes table", () => {
    // Reported, never skipped — and skipping is what blinded eight rows in an earlier checker.
    const { malformed } = rowsNamingArchivedChanges();
    expect(malformed, `malformed rows:\n${malformed.join("\n")}`).toEqual([]);
  });

  it("names EVERY archived change, and no change that does not exist", () => {
    const onDisk = archivedDirectories();
    const { listed } = rowsNamingArchivedChanges();
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
    // A duplicate row would let one missing change hide behind a repeated one.
    const { listed } = rowsNamingArchivedChanges();
    const duplicates = listed.filter((name, index) => listed.indexOf(name) !== index);
    expect(duplicates, `listed more than once: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("reports an archived count equal to the directory's contents", () => {
    const onDisk = archivedDirectories();
    const { listed } = rowsNamingArchivedChanges();

    // The count is READ from the ledger's own sentence, then compared with the directory — so this
    // fails on a stale figure rather than restating whatever the ledger happens to say.
    //
    // The pattern does NOT require bold markers before the number. A first version did
    // (`/\*\*(\w+) changes are archived/`), and it reported "must state an archived count: null"
    // against a ledger that stated the count correctly — because an earlier scripted edit had
    // stripped the bold from that sentence's opening. A guard that reads the SENTENCE rather than
    // its formatting is one fewer thing that has to be kept in step by hand, which is the entire
    // subject of this file.
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
