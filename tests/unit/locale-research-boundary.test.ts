import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The research-material path, and the copy catalog it must never touch.
 *
 * ============================================================================
 * WHAT THIS FILE PROVES, AND WHY IT IS A SCAN RATHER THAN A RENDER
 * ============================================================================
 * `tasks.md` 6.4: "The Ilocano dataset instruction is rendered from storage with NO catalog lookup
 * on its path, asserted by a test rather than by review."
 *
 * There is nothing to render yet. No route in this project displays a dataset entry - the
 * validation experience is a later OpenSpec change - so a rendered-markup assertion here would be
 * asserting the absence of a page rather than the property of one, and it would keep passing after
 * someone built the page wrong.
 *
 * So the guard is STRUCTURAL and FORWARD-LOOKING: no module in `src/` that touches a dataset
 * instruction may import the copy catalog. When the validation route is written, this file starts
 * failing the moment someone routes an instruction through a `t(...)` call, which is exactly the
 * moment a review would otherwise have to catch it by eye.
 *
 * ============================================================================
 * WHAT A SCAN CANNOT DO, STATED BEFORE THE SCAN RATHER THAN AFTER
 * ============================================================================
 *   - It matches imports and identifiers, not data flow. A file could import the catalog for an
 *     unrelated string on the same page as a dataset instruction and be reported. That is a false
 *     ALARM, which is the safe direction: a reviewer looks, decides, and widens the allowlist.
 *   - It cannot see a lookup performed through a variable. `catalog[someString]` typed as `CopyKey`
 *     would be caught by the type-check instead, because the key type is derived from the catalog.
 *   - It says nothing about a dataset instruction held in a file that never mentions the word
 *     "instruction". No such file exists, and the sentence above is why that is checkable at all:
 *     every route to a stored instruction in this repository goes through `DatasetEntry`, whose
 *     `instruction` field is named here.
 */
const SOURCE_ROOT = join(process.cwd(), "src");

/**
 * Comment removal, applied to every file this suite reads.
 *
 * See the note on `read` at the bottom of this file for why: the first draft read `copy.ts` raw and
 * reported the two specifiers its own header names in order to say it imports neither.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\/\/.*$/gm, " ");
}

/** Every `.ts` / `.tsx` file under `src/`, as paths relative to `src/`. */
function sourceFiles(directory: string = SOURCE_ROOT): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      return sourceFiles(full);
    }
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [relative(SOURCE_ROOT, full)] : [];
  });
}

/** The identifiers that mean "this module touches a dataset instruction". */
const INSTRUCTION_MARKERS = [/\binstruction\b/] as const;

/** The import that would mean an instruction could be looked up by key. */
const CATALOG_IMPORT = /from "@\/lib\/i18n\/copy"/;

describe("the dataset instruction has no path to the copy catalog", () => {
  it("scanned a real tree, rather than an empty one that passes every check", () => {
    // A `readdirSync` pointed at a renamed directory yields `[]`, and every "nothing found"
    // assertion over it passes. An empty scan is exactly the condition this file exists to detect,
    // so the size is asserted - and so is the LIVE part: the instruction marker must actually match
    // files today, or the guard below is guarding nothing.
    const files = sourceFiles();

    expect(files.length).toBeGreaterThan(40);

    const touchingInstruction = files.filter((file) =>
      INSTRUCTION_MARKERS.some((marker) => marker.test(read(file))),
    );
    expect(
      touchingInstruction.length,
      "no file references a dataset instruction, so the guard below is guarding nothing",
    ).toBeGreaterThan(0);
  });

  it("finds no module that touches an instruction and imports the catalog", () => {
    const offenders = sourceFiles()
      .map((file) => ({ file, contents: read(file) }))
      .filter(
        ({ contents }) =>
          INSTRUCTION_MARKERS.some((marker) => marker.test(contents)) &&
          CATALOG_IMPORT.test(contents),
      )
      .map(({ file }) => file);

    expect(
      offenders,
      "a module renders a dataset instruction and could look it up in the copy catalog; " +
        "the instruction is research data and must be rendered exactly as stored",
    ).toEqual([]);
  });

  it("would notice a module that did both, which is the control for the scan above", () => {
    // Without this, the scan is unfalsifiable - a pattern that matched nothing would pass
    // identically. The synthetic source below contains both halves on purpose.
    const synthetic = [
      'import { translatorFor } from "@/lib/i18n/copy";',
      "export function render(entry: DatasetEntry) {",
      "  return translatorFor('en')(`dataset.${entry.instruction}`);",
      "}",
    ].join("\n");

    expect(INSTRUCTION_MARKERS.some((marker) => marker.test(synthetic))).toBe(true);
    expect(CATALOG_IMPORT.test(synthetic)).toBe(true);
  });

  it("holds the catalog on the other side of the boundary from the dataset", () => {
    // The same rule stated from the catalog's direction, because a one-sided guard is half a guard.
    // `@/lib/i18n/copy` may import the proficiency SCHEMA - that is approved English COPY being
    // shared, which is not research data - and may import the locale domain. It may not import the
    // dataset schema, the dataset repository, or anything that reads a stored entry.
    const contents = read(join("lib", "i18n", "copy.ts"));

    expect(contents).not.toMatch(/@\/schemas\/dataset/);
    expect(contents).not.toMatch(/@\/lib\/repositories/);
    expect(contents).not.toMatch(/dataset_entries/);
    expect(contents).not.toMatch(/DatasetEntry/);
    // And the import it DOES make is the copy-sharing one, asserted so the file is not simply
    // importing nothing and passing by accident.
    expect(contents).toMatch(/@\/schemas\/validator/);
  });
});

describe("what the catalog may and may not import", () => {
  const ALLOWED_IMPORTS: ReadonlyArray<RegExp> = [
    // Approved English screening COPY, shared so the question and the option labels have one
    // definition. This is the direction AGENTS.md's "keep boundaries explicit" would normally
    // forbid, and it is right here: what is imported is copy, not a runtime validator. See the
    // module header of `@/lib/i18n/copy` for the argument.
    /from "@\/schemas\/validator"/,
    // The locale domain, for the `Record<InterfaceLocale, Copy>` map. No React, no Next, no I/O.
    /from "@\/lib\/domain\/locale"/,
  ];

  it("imports only the two modules that carry no research data", () => {
    const contents = read(join("lib", "i18n", "copy.ts"));
    const specifiers = [...contents.matchAll(/from "([^"\s]+)"/g)].map((match) => match[1]);

    // A floor, so a broken extraction cannot make the check vacuous.
    expect(specifiers.length).toBeGreaterThanOrEqual(2);
    for (const specifier of specifiers) {
      expect(
        ALLOWED_IMPORTS.some((allowed) => allowed.test(`from "${specifier}"`)),
        `copy.ts imports ${specifier}`,
      ).toBe(true);
    }
  });

  it("proves the specifier extraction reads imports and not string content", () => {
    // The first draft of the assertion above used `from "([^"]+)"` and reported a specifier of
    // `" +"`, taken from a Filipino string in the catalog that ENDS with the English words
    // "derived from". The pattern was matching prose - the same class of defect as matching a
    // comment, and fixed the same way - so the extraction now requires a specifier with no
    // whitespace in it, which a real module path never has and an English sentence always does.
    //
    // The control asserts the extracted list is EXACTLY the two real imports, so a pattern that
    // started matching nothing at all would fail here rather than pass on an empty loop.
    const contents = read(join("lib", "i18n", "copy.ts"));
    const specifiers = [...contents.matchAll(/from "([^"\s]+)"/g)].map((match) => match[1]);

    expect(specifiers).toEqual(["@/schemas/validator", "@/lib/domain/locale"]);
  });

  it("imports nothing that can perform I/O, which is what makes it usable in a client island", () => {
    // The screening form is a `"use client"` module and imports the catalog directly. That is only
    // safe because the catalog is pure data: a catalog that reached `next/headers` would pull the
    // server into the client module graph and the boundary rule would be right to fire.
    const contents = read(join("lib", "i18n", "copy.ts"));

    expect(contents).not.toMatch(/^import "/m);
    expect(contents).not.toMatch(/from "next\//);
    expect(contents).not.toMatch(/require\(/);
  });
});

/**
 * A source file's CODE, with comments removed.
 *
 * Comments are removed because this file's very first draft read `copy.ts` raw and reported it as
 * importing `@/lib/repositories/supabase` and referencing `DatasetEntry` - both of which it does,
 * in the module header, in the sentences explaining that it does NEITHER. The guard was reporting
 * the documentation of its own subject.
 *
 * That is the defect already recorded in this repository from the other direction, where a guard was
 * SATISFIED by a comment instead. A substring anchor that reads prose is a guard that cries wolf,
 * and a guard that cries wolf gets deleted - which is how a real violation would get in later.
 *
 * KNOWN LIMIT, stated because a silent one is worse: a `//` inside a string literal would be read
 * as a comment and truncate that line. No file under `src/` contains a URL in a string, and the
 * catalog is asserted to be pure data below, so the risk here is a shortened line rather than a
 * missed one.
 */
function read(relativePath: string): string {
  return stripComments(readFileSync(join(SOURCE_ROOT, relativePath), "utf8"));
}
