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
  //
  // A MEASURED LIMIT OF THAT CLAIM, recorded because the comment above would otherwise overstate
  // it. Shifting the start by exactly ONE line (`+1` to `+2`) survives the whole file — every
  // fixture, synthetic and real, carries a `| --- |` separator at `+1`, so a one-line shift skips
  // only the separator. A shift of TWO (`+3`) is caught immediately, red at `5 failed | 5 passed`,
  // because it drops a data row. So the reader cannot consume the header by construction, but it
  // also cannot notice losing the separator row, and that is a property of the fixtures rather than
  // a property of the reader. The generalisation, which has cost this project three separate
  // checkers: **a header consumed as data, a separator consumed as data, and a row consumed as a
  // header are the same defect, and only the third of them is caught here.**
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    const trimmed = line.trim();
    // The end of the table. A row appended below it is not counted, and its change therefore reads as
    // missing — which is the loud failure, and is proved on the REAL ledger by the test named in
    // `stops at the table's end`, because that is the only place both inputs are real.
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
    // because a reader that kept going would be reading past the end of its subject.
    expect(malformed, "a row outside the table is out of scope, not damaged").toEqual([]);

    // WHERE THE SAFETY PROPERTY IS ACTUALLY PROVED, because a first draft of this test asserted it
    // here and the assertion was vacuous. It compared `listed` — which holds the SYNTHETIC name
    // "2026-01-01-a" — against the REAL archive directory, whose sixteen directories are none of
    // them that, so "some directory is missing" was true by construction and insensitive to every
    // property of the reader, including the one this test is named for. It could only fail if the
    // archive emptied, which a different test already covers.
    //
    // The property is real and it is proved where its inputs are real: on the actual ledger, an
    // archive row moved BELOW the table's end leaves that change out of `listed`, so it appears in
    // `missing` and `names EVERY archived change, and no change that does not exist` fails naming
    // it. Measured on the real file: red, naming that test. A synthetic test may not stand in for
    // it, because the property is about the real directory and a fixture cannot contain it.
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
    //
    // ============================ READ EVERY MATCH, NOT THE FIRST ============================
    // A first version used a NON-GLOBAL regex and read occurrence 1 only. The ledger carried TWO
    // sentences in this exact phrasing, and the verification pass measured that a stale figure in
    // the SECOND one passed the guard unchanged (`10 passed (10)`), while the same edit to the
    // first turned it red — the control that distinguishes "the guard missed it" from "the guard
    // cannot see it".
    //
    // That is not hypothetical here. `tasks.md` 3.3 claimed this guard had FOUND a stale "Fifteen"
    // sentence, and the stale word was in occurrence 2 — so the guard provably could not have found
    // it, and the claim attributed discovery to a mechanism that could not perform it. Both the
    // claim and the guard were corrected; the claim is in the change's `tasks.md`, this is the
    // guard.
    //
    // THE RULE THIS ENFORCES, stated because it is a rule and not an accident: **every sentence in
    // this phrasing is a LIVE claim and must state the current count.** A historical figure must be
    // worded differently — which is what the ledger's own parenthetical now does
    // ("(That slice ended with **fifteen** archived changes…)"). That is not a stylistic
    // preference: one phrasing cannot be both a live claim and a historical one, so the phrasing is
    // reserved for the live claim and history is marked as history.
    const roadmap = readFileSync(ROADMAP, "utf8");
    // `[\w-]+`, not `\w+`: twenty-one is hyphenated in English, and the old class captured only
    // the "one" in "Twenty-one changes are archived" — reporting the ledger stale when the prose
    // was right and the reader was wrong. Measured on the twenty-first archive, which no
    // single-word phrasing can state: "Twenty one" splits and "21" is not the word the table
    // requires. Widening the class is what keeps the guard reading the claim rather than its own
    // assumption about orthography.
    const claims = [...roadmap.matchAll(/([\w-]+) changes are archived and readable/g)].map(
      (match) => match[1] ?? "",
    );
    expect(
      claims.length,
      "the Project Status block must state an archived count in the live phrasing",
    ).toBeGreaterThan(0);

    // COUPLING, stated rather than left to be discovered, and **PAID ON THE VERY NEXT ARCHIVE** rather
    // than in a probe. This enumeration stopped at sixteen and reported `null` for a seventeenth
    // directory — which was recorded as a known limit when it was written, and then arrived for real:
    // archiving `consistency-guards` took the directory to seventeen and this guard failed with
    // "the archived-count sentence must be updated: the directory holds 17", naming itself. That is
    // the intended behaviour — failing loudly rather than accepting a count it has no word for — but
    // it means every seventeenth change must edit this test, and the edit is the point.
    //
    // What is recorded here is the SHAPE of the payment, because it is the generalisation: **a guard
    // that hard-codes a fact about the world fails the first time the world moves, and that is not a
    // defect in the guard, it is the guard being correct.** The alternative — deriving the word
    // arithmetically, so the guard accepts whatever the ledger says — would make it agree with the
    // ledger by construction and stop being a check of it. The cost is one edited line per archive,
    // and the benefit is that this test can never be satisfied by a sentence that merely looks right.
    const WORDS: Record<number, string> = {
      13: "Thirteen",
      14: "Fourteen",
      15: "Fifteen",
      16: "Sixteen",
      17: "Seventeen",
      // Added for `batch-route-round-trip`, the EIGHTEENTH archived change, so this coupling has now
      // been paid twice — once for `consistency-guards` (17) and once here (18).
      //
      // A correction to the note above, because that note states the coupling wrongly and the second
      // payment is what made it visible: it reads "every seventeenth change must edit this test", and
      // **there is no seventeenth change that has to do anything** — the edit is owed by every change
      // from the seventeenth ONWARD, and each one owes it again. The right generalisation is the one
      // this file's own reason for existing already states: **a guard that hard-codes a fact about the
      // world fails each time the world moves, and that is the guard being correct rather than stale.**
      // The alternative — deriving the word from `onDisk.length` — would make the assertion agree with
      // the ledger by construction, which is the failure mode this whole file exists to prevent. The
      // cost is one edited line per archive; the benefit is that no sentence merely *looking* right can
      // satisfy it.
      18: "Eighteen",
      // Added for `session-attempt-identity`, the NINETEENTH archived change, so this coupling has now
      // been paid THREE times — `consistency-guards` (17), `batch-route-round-trip` (18), and this.
      //
      // A third payment is worth one more sentence, because the pattern is now unmistakable and the
      // temptation it creates is specific: **the third time is the point at which a guard that has
      // fired three times looks like a tax rather than a check.** The correct response is still to edit
      // the table, and the reason is the one recorded above and now bears out again — deriving the word
      // from `onDisk.length` would make this assertion agree with the ledger by construction, which is
      // the failure mode this whole file exists to prevent. Three payments is not a coincidence worth
      // generalising from; it is the same one-line edit three times, which is the cheapest possible
      // price for being unable to accept a sentence that merely looks right.
      19: "Nineteen",
      // Added for `single-validation-package`, the TWENTIETH archived change, so this coupling has now
      // been paid FOUR times — `consistency-guards` (17), `batch-route-round-trip` (18),
      // `session-attempt-identity` (19), and here (20). Same one-line edit, same reason.
      20: "Twenty",
      // Added for `completion-metrics-and-export`, the TWENTY-FIRST archived change, so this coupling has now
      // been paid FIVE times. Same one-line edit, same reason.
      21: "Twenty-one",
      // Added for `attempt-scoped-allocation`, the TWENTY-SECOND archived change, so this coupling has now
      // been paid SIX times. Same one-line edit, same reason.
      22: "Twenty-two",
      // Added for `entry-reservation-leases`, the TWENTY-THIRD archived change, so this coupling has now
      // been paid SEVEN times. Same one-line edit, same reason.
      23: "Twenty-three",
      // Added for `rpc-execute-hardening`, the TWENTY-FOURTH archived change, so this coupling has now
      // been paid EIGHT times. Same one-line edit, same reason.
      24: "Twenty-four",
      // Added for `short-batch-presentation`, the TWENTY-FIFTH archived change, so this coupling has now
      // been paid NINE times. Same one-line edit, same reason.
      25: "Twenty-five",
      // Added for `onboarding-simplification`, the TWENTY-SIXTH archived change, so this coupling has now
      // been paid TEN times. Same one-line edit, same reason.
      26: "Twenty-six",
      // Added for `screening-gate`, the TWENTY-SEVENTH archived change, so this coupling has now
      // been paid ELEVEN times. Same one-line edit, same reason.
      27: "Twenty-seven",
      // Added for `sentence-only-presentation`, the TWENTY-EIGHTH archived change, so this coupling has now
      // been paid TWELVE times. Same one-line edit, same reason.
      28: "Twenty-eight",
      // Added for `optional-research-translations`, the TWENTY-NINTH archived change, so this coupling has now
      // been paid THIRTEEN times. Same one-line edit, same reason.
      29: "Twenty-nine",
      // Added for `researcher-export-download`, the THIRTIETH archived change, so this coupling has now
      // been paid FOURTEEN times. Same one-line edit, same reason.
      30: "Thirty",
      // Added for `signin-refusal-diagnostics`, the THIRTY-FIRST archived change, so this coupling has now
      // been paid FIFTEEN times. Same one-line edit, same reason.
      31: "Thirty-one",
      // Added for `signin-success-result`, the THIRTY-SECOND archived change, so this coupling has now
      // been paid SIXTEEN times. Same one-line edit, same reason.
      32: "Thirty-two",
    };
    const expected = WORDS[onDisk.length] ?? null;

    expect(
      expected,
      `the archived-count sentence must be updated: the directory holds ${onDisk.length}`,
    ).not.toBeNull();
    // Every claim, each naming its position, so a failure says WHICH sentence is stale rather than
    // only that one of them is.
    for (const [index, word] of claims.entries()) {
      expect(word, `archived-count claim ${index + 1} of ${claims.length} is stale`).toBe(expected);
    }
    expect(new Set(listed).size).toBe(onDisk.length);
  });
});
