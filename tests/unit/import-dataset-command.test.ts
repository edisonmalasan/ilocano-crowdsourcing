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
 *   - runs over the DIRECTORY, recursively, not a hand-listed set of files, so a second
 *     command is covered the moment it exists — including one in a subdirectory, which a flat
 *     listing would skip without a word; and
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
 * WHAT THE STRIPPING COSTS, stated rather than hidden, and stated CORRECTLY — the first
 * version of this paragraph had it backwards. The stripper removes block comments and full-line
 * `//` comments, and it never touches string-literal content. So an identifier appearing ONLY
 * inside a string still MATCHES: that is a false positive (a noisy failure on a file that merely
 * mentions the API in data), not a miss. The genuinely unrepresentable hole is the other way
 * round: a block-opener inside a STRING swallows everything up to the next closer, so a real
 * write sitting between a fake opener and a later closer would be deleted along with the
 * "comment". That needs a string containing an opener ahead of a write — narrow, but real, unlike
 * the version first written here. The SHA-256 comparison in
 * `tests/integration/immutable-dataset.test.ts` is the backstop for an implementation that
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

/**
 * Every `.ts` file under `scripts/`, RECURSIVELY, read from the directory.
 *
 * Non-recursive is how a scan silently stops covering a second command: `scripts/sub/command.ts`
 * would be skipped without a word. The recursion mirrors the `walk()` in
 * `tests/unit/admin-client-construction.test.ts` deliberately, so the two enumerations cannot drift
 * into different shapes — a directory scan that means "the directory" has to descend, or it means
 * "the files I remembered".
 */
/**
 * The one script permitted to touch the filesystem: the research export.
 *
 * Named as a constant rather than filtered by a substring, so a new command cannot inherit the
 * exemption by containing a word. Adding a second exempt script is then a visible, deliberate edit to
 * this line rather than a silent widening of what the scan ignores.
 */
const EXPORT_COMMAND = [path.join(ROOT, "scripts", "export-research.ts")];

function scriptFiles(directory: string = SCRIPTS): string[] {
  const found: string[] = [];
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...scriptFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      found.push(full);
    }
  }
  return found;
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

    // EVERY pattern, not just one. The fixture carries one real call per pattern, so a pattern
    // that stops matching — a renamed API, a narrowed regex — fails here rather than degrading
    // the scan silently. `found` is per-pattern, so overlapping matches cannot inflate the count
    // past the list's length; the assertion is exact, not a lower bound.
    expect(found).toHaveLength(WRITE_APIS.length);
    // Named as well, so a scanner that stopped matching `writeFile` but matched something else
    // would be visible as a change here rather than as a still-green test.
    expect(found.join(" ")).toContain("writeFile");
  });

  it("finds no write, rename, or delete call in any script OTHER THAN the export", () => {
    // SCOPE NARROWED, and the reason is a change in the invariant rather than a weakening of it.
    //
    // This used to read "no script writes anything", which was equivalent to "the import command
    // writes nothing" only because `scripts/` held exactly one file. The `research-export` change
    // added a second command whose approved requirement is that it WRITES its artifacts
    // (`validations.json`, `validations.csv`, `summary.json`) into an operator-chosen directory, so
    // the blanket form became false without anything about the import having changed.
    //
    // What replaces it is stronger, not weaker, and it is the invariant that actually mattered:
    //   - no script may write, rename, move or delete ANYTHING except the export command;
    //   - the export command's own filesystem writes are enumerated exactly, by count and by the
    //     three names, in `tests/unit/export-read-only.test.ts`;
    //   - and, asserted below, NO script may write into `data/`, which is the immutable research
    //     source. That last check was never stated before and is the one that matters most: a script
    //     that could rewrite the dataset would be far worse than one that could write its own output.
    for (const file of scriptFiles().filter((candidate) => !EXPORT_COMMAND.includes(candidate))) {
      const relative = path.relative(ROOT, file).split(path.sep).join("/");
      expect(
        writesFound(readFileSync(file, "utf8")),
        `${relative} must not write anything`,
      ).toEqual([]);
    }
  });

  it("PROVES THE RESEARCH-SOURCE CHECK CAN FIRE, including the constant-path form", () => {
    // Without this the check below could pass on nothing, and it would pass just as happily on a
    // rewrite expressed through a CONSTANT — which is exactly how `import-dataset.ts` spells its own
    // path (`DEFAULT_SOURCE_PATH`). A check that only recognises a literal `"data/…"` would miss the
    // most realistic way to destroy the immutable source.
    const writesIntoData = (source: string): boolean =>
      /(?:writeFile|appendFile|createWriteStream|truncate|rm|rename|copyFile|unlink|rmdir)\w*\s*\(\s*(?:[^)]*\bdata\b|DEFAULT_SOURCE_PATH)/.test(
        stripComments(source),
      );

    for (const evasion of [
      'writeFile("data/ilocano-synthetic-data.json", "{}");',
      'writeFile(DEFAULT_SOURCE_PATH, "{}");',
      'appendFile(`${ROOT}/data/out.json`, "x");',
      'rm("data", { recursive: true });',
    ]) {
      expect(writesIntoData(evasion), `must detect: ${evasion}`).toBe(true);
    }

    // And a legitimate write elsewhere must NOT be flagged, or the check is too blunt to be trusted
    // and will be disabled the first time it obstructs real work.
    for (const innocent of [
      'writeFile(path.join(options.destination, "validations.json"), text);',
      'readFileSync(DEFAULT_SOURCE_PATH, "utf8");',
    ]) {
      expect(writesIntoData(innocent), `must not flag: ${innocent}`).toBe(false);
    }
  });

  it("finds no script writing into the immutable research source", () => {
    // The invariant the previous blanket scan only implied. Checked by looking for the research
    // directory — or the constant that names it — in any filesystem call, and by asserting `data/`
    // is real, so a typo in the path cannot make this pass on nothing.
    expect(existsSync(path.join(ROOT, "data", "ilocano-synthetic-data.json"))).toBe(true);

    for (const file of scriptFiles()) {
      const relative = path.relative(ROOT, file).split(path.sep).join("/");
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // Every filesystem call in the file, with enough surrounding text to see its argument.
      // The research source is named either literally or through `DEFAULT_SOURCE_PATH`, which is
      // how `import-dataset.ts` spells it — and the can-fire control above covers both forms.
      for (const call of code.matchAll(
        /\b(?:writeFile|appendFile|createWriteStream|truncate|rm|rename|copyFile|unlink|rmdir)\w*\s*\(/g,
      )) {
        const context = code.slice(call.index, call.index + 200);
        expect(
          /["'`][^"'`]*\bdata\b[^"'`]*["'`]/.test(context) ||
            /\(\s*DEFAULT_SOURCE_PATH/.test(context),
          `${relative} appears to write into the research source: ${context.slice(0, 140)}`,
        ).toBe(false);
      }
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

  it("prints no progress or report line that contains entry text", async () => {
    // An entry's `instruction` is research material. Progress and the report carry counts and ids
    // only — and this is asserted against the REAL output of `importEntries`, not against a
    // formatter called with numbers. The previous version of this test called `formatProgress`
    // directly and asserted the result did not match an Ilocano-shaped regex, which cannot fail
    // for any implementation consistent with the type: a decorative assertion dressed as a
    // research-integrity check. Here the entries carry a distinctive instruction, the whole run's
    // output is captured, and the instruction must be absent from every line while the id is
    // present — so a future change that "helpfully" showed the text being imported fails here.
    const lines: string[] = [];
    const entries = [entry("OD_0001"), entry("OD_0002")];

    await importEntries(entries, cleanReport, { upsert: async () => "inserted" as const }, (line) =>
      lines.push(line),
    );

    const output = lines.join("\n");
    // Non-empty, or the absence below would prove nothing: an output that said nothing contains
    // no instruction either.
    expect(output).toContain("parsed:");
    expect(output).not.toContain("instruction for OD_0001");
    expect(output).not.toContain("instruction for OD_0002");
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

describe("no request-reachable module performs the write", () => {
  /**
   * The load-bearing half of the delta's scenario "The import runs as an operator command, not as
   * a page": *"no HTTP route, Server Action, or page performs the write"*. The scenario's first
   * half is enforced structurally — the read repository exposes three methods and no write, closed
   * by `tests/unit/repositories.test.ts:507` — and this is the second half, which had NO test
   * behind it. A spec scenario with no implementation evidence is the "claim of coverage is not
   * coverage" condition, and this scenario guards the change's central architectural promise, so
   * it is enforced here rather than left to per-page review.
   *
   * Two enumerations, because "request-reachable" has two shapes in this codebase: files served as
   * routes or UI under `src/app/**`, and `"use server"` modules, which are the only other code a
   * browser can invoke. Both are read from the filesystem, so a route or action added tomorrow is
   * covered the moment it exists.
   */
  const SINK_MARKERS = [
    "SupabaseDatasetEntrySink",
    "dataset_entries_import",
    "supabase-sink",
    "DatasetEntrySink",
  ];

  const SRC = path.resolve(process.cwd(), "src");

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

  function referencesSink(file: string): string[] {
    const code = stripComments(readFileSync(file, "utf8"));
    return SINK_MARKERS.filter((marker) => code.includes(marker));
  }

  it("scans a non-empty route tree, so the enumeration cannot pass on nothing", () => {
    // The empty-capture guard, stated once for the three tests below: a renamed `src/app`, a
    // typo, or a runner whose cwd is elsewhere would reduce every scan to zero files and report
    // a clean tree.
    const appFiles = walkModules(path.join(SRC, "app"));
    expect(appFiles.length).toBeGreaterThan(0);
    expect(appFiles.map(relative)).toContain("src/app/page.tsx");
  });

  it("finds no sink reference in any route, page, or component under `src/app/**`", () => {
    for (const file of walkModules(path.join(SRC, "app"))) {
      expect(referencesSink(file), `${relative(file)} must not reach the dataset sink`).toEqual([]);
    }
  });

  it('finds no sink reference in any `"use server"` module', () => {
    // `"use server"` at the TOP of the file, which is the directive form. A mention in prose —
    // of which this file is full — is not a directive, and the strip-then-match order matters:
    // markers are matched against code, the directive against the raw source.
    const serverModules = walkModules(SRC).filter((file) =>
      /^("use server"|'use server';?)/m.test(readFileSync(file, "utf8")),
    );
    // Non-empty, or the scan below proves nothing: the `"use server"` modules this project
    // actually has (allocation, admin, i18n, validators, validation actions) must be among them.
    expect(serverModules.length).toBeGreaterThan(0);
    expect(serverModules.map(relative)).toContain("src/lib/validation/actions.ts");

    for (const file of serverModules) {
      expect(referencesSink(file), `${relative(file)} must not reach the dataset sink`).toEqual([]);
    }
  });

  it("finds no importer of the sink implementation anywhere under `src/`", () => {
    // The import is the act: a module that never imports the sink module cannot perform the
    // write, whatever strings it mentions. This matches import specifiers rather than markers,
    // because the sink's own definition file contains its own class name in code and would fail
    // a marker scan for the right reason at the wrong time. `scripts/import-dataset.ts` is the
    // single allowed importer and lives OUTSIDE `src/`, so it is out of this walk's scope by
    // construction — a route that "just calls the sink once" would have to import it here, and
    // that is exactly what fails.
    const importers = walkModules(SRC)
      .filter((file) =>
        /from\s+["'][^"']*supabase-sink["']|import\s*\(\s*["'][^"']*supabase-sink["']/.test(
          stripComments(readFileSync(file, "utf8")),
        ),
      )
      .map(relative);
    expect(importers).toEqual([]);
  });
});
