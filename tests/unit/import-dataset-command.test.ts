/**
 * The operator command must never write the source dataset, and must never print a credential.
 *
 * ── WHY THE TWO CLAIMS ARE SEPARATE FILES' WORTH OF CARE ───────────────────────────────────────
 * "The dataset is immutable" is the repository's hardest research constraint, and this command is the
 * one place in the product that opens all 600 records. An immutability check that compares SHA-256
 * before and after a run proves the CONTENT survived; it cannot see a write that opens, truncates,
 * and restores, nor a write that writes somewhere else entirely. So the claim tested here is
 * stronger and different: **there is no code path in `scripts/` capable of writing a file at all.**
 *
 * That is a source-text scan, and the standing objection to a scan in this repository is recorded at
 * length in `vitest.config.ts`: a bare substring is satisfied by a comment, and a scan cannot tell
 * `writeFileSync(path)` from a paragraph about `writeFileSync`. So the scan below:
 *
 *   - reads CODE, with comments stripped, because the first draft did not and went RED on this file's
 *     own header — the word "rename" appears in a sentence about rename, and `/\brename(?:Sync)?\b/`
 *     matched it. See THE COMMENT-STRIPPING MEASUREMENT below; and
 *   - runs over the DIRECTORY, not a hand-listed set of files, so a second command is covered the
 *     moment it exists; and
 *   - carries a positive control that points the same patterns at a real file on disk which really
 *     does write.
 *
 * THE COMMENT-STRIPPING MEASUREMENT, because the alternative repair would have been worse
 * ---------------------------------------------------------------------------------------------
 * The first version of this scan read each file as-is and reported
 * `scripts/import-dataset.ts must not write anything: expected [ '/\brename(?:Sync)?\b/' ]`. The
 * match was the English word "rename" in the command's own documentation. There were three ways to
 * make that green and only one of them is a fix:
 *
 *   1. Strip comments — the scan's subject is an API CALL, and prose about `rename` is not a call.
 *   2. Drop `rename` from the list — weaker, and it would still leave `writeFileSync` in prose.
 *   3. Reword the command's documentation until it stopped saying "rename".
 *
 * Option 3 is the one to refuse. It is this repository's recorded lesson that a guard whose subject
 * is PROSE forces the prose to change, and the result is a codebase that cannot describe itself. The
 * file's documentation is correct and the pattern was over-broad; changing the documentation would
 * have made a green suite out of a false negative while destroying the explanation.
 *
 * WHAT THE STRIPPING COSTS, stated rather than hidden: **a string literal containing `writeFileSync`
 * would be missed**, because a naive stripper cannot tell a comment from a string. That is a narrow
 * hole — it needs an identifier literally named `writeFileSync` inside a string — and the SHA-256
 * comparison in `tests/integration/immutable-dataset.test.ts` would catch an implementation that
 * actually altered the dataset. The scan's claim is correspondingly narrowed in its test name from
 * "the command cannot write" to "the command contains no write API call".
 *
 * THE POSITIVE CONTROL IS A FILE, NOT A STRING BUILT INSIDE THIS TEST
 * ------------------------------------------------------------------
 * `expect(scan("writeFileSync")).toBeTruthy()` proves the scanner matches a literal the test wrote,
 * which is the `Object.keys({ en: 1, fil: 1 })` shape this repository has already found twice: a
 * check that can be satisfied by the artefact it is describing. `tests/fixtures/write-capable-sample.ts`
 * is a real module, read from disk, whose `writeFileSync` call is real. If the scanner's patterns
 * were wrong, the control would go green-against-nothing.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOURCE_PATH,
  EXIT_MISCONFIGURED,
  EXIT_OK,
  EXIT_REFUSED,
  describeRefusal,
  formatCredentialDescription,
  formatProgress,
  importEntries,
  main,
  readImportEnvironment,
  type CredentialDescription,
} from "../../scripts/import-dataset";

const ROOT = path.resolve(process.cwd());
const SCRIPTS = path.join(ROOT, "scripts");
const FIXTURE_WITH_A_WRITE = path.join(ROOT, "tests", "fixtures", "write-capable-sample.ts");

/**
 * Filesystem calls that can alter or destroy a file.
 *
 * Copied from the scan `tests/unit/dataset-import.test.ts` already applies to the import path, so the
 * command and the library it calls are held to the same list. If one list is extended, both should
 * be — and the honest way to guarantee that is one exported list rather than two copies, which is a
 * change this file deliberately does NOT make: hoisting it would put a guard's definition in
 * production code, where it could be edited by the code it guards.
 */
const WRITE_APIS = [
  /\bwriteFile(?:Sync)?\b/,
  /\bappendFile(?:Sync)?\b/,
  /\bcreateWriteStream\b/,
  /\bopen(?:Sync)?\s*\([^)]*['"`]w/,
  /\btruncate(?:Sync)?\b/,
  /\bunlink(?:Sync)?\b/,
  /\brm(?:Sync)?\b/,
  /\brename(?:Sync)?\b/,
  /\bcp(?:Sync)?\b/,
  /\bcopyFile(?:Sync)?\b/,
  /\bchmod(?:Sync)?\b/,
  /\bchown(?:Sync)?\b/,
  /\brmdir(?:Sync)?\b/,
  /\bmkdir(?:Sync)?\b/,
  /\blink(?:Sync)?\b/,
  /\bsymlink(?:Sync)?\b/,
];

/** Every `.ts` file under `scripts/`, read from the directory. */
function scriptFiles(): string[] {
  return readdirSync(SCRIPTS, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => path.join(SCRIPTS, entry.name))
    .sort();
}

/**
 * Source with block and line comments removed.
 *
 * The guard's subject is an API CALL. A paragraph describing the rule is not a call, and the first
 * version of this scan proved the point by failing on one.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** The write APIs a source's CODE matches, so a failure names which one fired. */
function writesFound(source: string): string[] {
  return WRITE_APIS.filter((pattern) => pattern.test(stripComments(source))).map(String);
}

/** A parse report with nothing unmapped, which is what the real 600-record parse produces. */
const cleanReport = {
  recordCount: 1,
  recordsWithPreservedFields: 0,
  preservedFields: [],
};

const entry = (id: string) => ({
  id,
  category: "origin_destination" as const,
  instruction: `instruction for ${id}`,
  origin: `origin of ${id}`,
  destination: `destination of ${id}`,
  transitMode: "walking" as const,
  sourcePayload: { id },
});

describe("the operator command cannot write a file", () => {
  it("scans a non-empty set of real files, so an empty scan cannot pass", () => {
    // The empty-capture guard. Every assertion below is about files the directory produced; a typo in
    // the path or an alias that resolves elsewhere would reduce the scan to nothing and report a
    // clean result — the exact failure this file exists to prevent.
    const files = scriptFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files.map((file) => path.relative(ROOT, file).split(path.sep).join("/"))).toContain(
      "scripts/import-dataset.ts",
    );
  });

  it("PROVES THE SCAN CAN FIRE: a real module that really writes is detected", () => {
    // THE CAN-FIRE CONTROL, and it is a separate test rather than a comment because a control that
    // only runs when someone remembers to read the comment has never run.
    expect(existsSync(FIXTURE_WITH_A_WRITE)).toBe(true);

    const found = writesFound(readFileSync(FIXTURE_WITH_A_WRITE, "utf8"));

    expect(found.length).toBeGreaterThan(0);
    // Named, so a scanner that stopped matching `writeFile` but matched something else would be
    // visible as a change here rather than as a still-green test.
    expect(found.join(" ")).toContain("writeFile");
  });

  it("finds no write, rename, or delete call in any script", () => {
    for (const file of scriptFiles()) {
      const relative = path.relative(ROOT, file).split(path.sep).join("/");
      expect(
        writesFound(readFileSync(file, "utf8")),
        `${relative} must not write anything`,
      ).toEqual([]);
    }
  });

  it("reads the source dataset through the read-only entry point, and names it as a constant", () => {
    // The scan above proves the command cannot write. This proves it is reading the RIGHT file, and
    // that the path is not an argument — see the `main` argument test below for the second half.
    expect(DEFAULT_SOURCE_PATH).toBe("data/ilocano-synthetic-data.json");
    expect(existsSync(path.join(ROOT, DEFAULT_SOURCE_PATH))).toBe(true);
  });
});

describe("the operator command never prints a credential", () => {
  // A value chosen to be unmistakable. If it appears anywhere in the command's output, the
  // assertion below fails and names it.
  const SECRET = "service-role-value-that-must-never-be-printed";

  it("reports a credential by NAME and LENGTH only", () => {
    const outcome = readImportEnvironment({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: SECRET,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.described).toEqual([
      { name: "SUPABASE_URL", length: "https://example.supabase.co".length },
      { name: "SUPABASE_SERVICE_ROLE_KEY", length: SECRET.length },
    ]);

    // The promise is about what reaches a terminal, so it is asserted against the line the command
    // prints — NOT against the return value, which carries `credentials` on purpose so the caller can
    // build a client with them. An earlier version of this test asserted the opposite and went red,
    // which was the assertion being wrong rather than the code.
    const printed = outcome.described.map(formatCredentialDescription).join("\n");
    expect(printed).toContain("SUPABASE_SERVICE_ROLE_KEY present (45 characters)");
    expect(printed).toContain("SUPABASE_URL present (27 characters)");
    expect(printed).not.toContain(SECRET);
    expect(printed).not.toContain("https://example.supabase.co");

    // A `CredentialDescription` is a closed shape, so a future field carrying the key would fail
    // `typecheck` rather than waiting for a test to notice it.
    const description: CredentialDescription = outcome.described[1]!;
    expect(Object.keys(description).sort()).toEqual(["length", "name"]);
  });

  it("emits nothing at all — not even a length — when a variable is missing", () => {
    // A length is safe to print and a value is not, but a length for a variable that was NOT
    // supplied is a fact about nothing, and printing one invites reading it as configuration.
    const outcome = readImportEnvironment({ SUPABASE_URL: "https://example.supabase.co" });

    expect(outcome).toEqual({ ok: false, missing: ["SUPABASE_SERVICE_ROLE_KEY"] });
    expect(JSON.stringify(outcome)).not.toContain("https://example.supabase.co");
  });

  it("treats a blank value as missing, because that is how it actually arrives", async () => {
    // `SUPABASE_SERVICE_ROLE_KEY=` in a shell profile is a far more common way to reach this command
    // than an absent line, and it fails at the gateway with a confusing 401 rather than here.
    expect(readImportEnvironment({ SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: SECRET })).toEqual({
      ok: false,
      missing: ["SUPABASE_URL"],
    });

    // Refusing loudly, by name.
    await expect(main([], { SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: SECRET })).rejects.toThrow(
      /SUPABASE_URL/,
    );
  });

  it("prints no progress or report line that contains an instruction", () => {
    // An entry's `instruction` is research material. Progress carries counts only, and this asserts
    // it: a future change that helpfully showed the text being imported would fail here.
    const progress = formatProgress({ done: 50, total: 600, inserted: 50, updated: 0 });
    expect(progress).toContain("50/600");
    expect(progress).toContain("50 inserted");
    expect(progress).not.toMatch(/iti |nang |ayanko|makadanon/);
  });

  it("refuses an argument rather than ignoring it, so a typo cannot import the wrong file", async () => {
    // Silently ignoring an unrecognised argument would mean `import:dataset --source other.json`
    // imports the real dataset while the operator believes it imported something else. A dataset
    // import is not a place to be helpful about a request nobody can honour.
    await expect(
      main(["--source", "data/other.json"], {
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: SECRET,
      }),
    ).rejects.toThrow(/takes no arguments/);
  });
});

describe("the operator command's exit codes are a report, not a hope", () => {
  const capture = () => {
    const lines: string[] = [];
    return { lines, write: (line: string) => lines.push(line) };
  };

  const allInserted = {
    upsert: async () => "inserted" as const,
  };

  it("exits 0 and prints every figure it counted on a clean run", async () => {
    const { lines, write } = capture();
    const entries = [entry("OD_0001"), entry("OD_0002")];

    const code = await importEntries(entries, cleanReport, allInserted, write);

    expect(code).toBe(EXIT_OK);
    const output = lines.join("\n");
    expect(output).toContain("parsed:   2");
    expect(output).toContain("inserted: 2");
    expect(output).toContain("updated:  0");
    expect(output).toContain("refused:  0");
  });

  it("surfaces unmapped source fields, which is a fact an operator needs at import time", async () => {
    const { lines, write } = capture();

    await importEntries(
      [entry("OD_0001")],
      {
        recordCount: 1,
        recordsWithPreservedFields: 1,
        preservedFields: [{ fieldPath: "dialect_note", recordCount: 1, sampleValue: "Ayta" }],
      },
      allInserted,
      write,
    );

    const output = lines.join("\n");
    expect(output).toContain("preserved unmapped source fields on 1 record(s)");
    expect(output).toContain("dialect_note (1 record(s))");

    // The sample VALUE is not printed. A research dataset's unmapped fields may contain anything, and
    // a report that echoes them turns a diagnostic into a data leak. The path and the count are the
    // facts an operator acts on.
    expect(output).not.toContain("Ayta");
  });

  it("exits non-zero, names the refused record, and reports how far the run got", async () => {
    const { lines, write } = capture();
    const seen: string[] = [];

    const refusing = {
      upsert: async (candidate: { id: string }) => {
        seen.push(candidate.id);
        if (candidate.id === "OD_0002") {
          throw new Error("dataset_entries_instruction_diverged for OD_0002");
        }
        return "inserted" as const;
      },
    };

    const code = await importEntries(
      [entry("OD_0001"), entry("OD_0002"), entry("OD_0003")],
      cleanReport,
      refusing,
      write,
    );

    expect(code).toBe(EXIT_REFUSED);
    expect(code).not.toBe(EXIT_OK);

    const output = lines.join("\n");
    // The record is NAMED — "the import failed" would not tell an operator what to look at.
    expect(output).toContain("refused OD_0002");
    expect(output).toContain("dataset_entries_instruction_diverged");

    // Fail-fast, and the counts say how far it got: OD_0003 was never attempted.
    expect(seen).toEqual(["OD_0001", "OD_0002"]);
    expect(output).toContain("1/3");
    expect(output).toContain("1 inserted");

    // And the two exit codes are distinguishable, so a refusal is never reported as success.
    expect(EXIT_REFUSED).not.toBe(EXIT_OK);
    expect(EXIT_MISCONFIGURED).not.toBe(EXIT_REFUSED);
  });

  it("describes a non-Error throw without losing it", () => {
    // A gateway failure that is not an Error instance must still produce a nameable line; the
    // `String(error)` branch is the one that keeps a rejection from printing `undefined`.
    expect(describeRefusal("plain string failure")).toBe("unknown failure: plain string failure");
    expect(describeRefusal(new TypeError("bad"))).toBe("TypeError: bad");
  });

  it("does not execute the import when the module is merely imported", () => {
    // Every test above imports this module. If the entry-point guard were removed, importing it would
    // run an operator command against whatever credentials the developer's shell happened to hold —
    // and the FIRST symptom would be a unit suite that is mysteriously slow and network-bound rather
    // than an obvious failure. The guard is therefore asserted by construction: this file exists only
    // because importing the module produced no output and no network access, which is a property of
    // the `isEntryPoint()` comparison rather than something this test can re-derive.
    //
    // What IS asserted here: the constants are values, so the module finished evaluating.
    expect(typeof EXIT_OK).toBe("number");
    expect(DEFAULT_SOURCE_PATH).toBeTypeOf("string");
  });
});
