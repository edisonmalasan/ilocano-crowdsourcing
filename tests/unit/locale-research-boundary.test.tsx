import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EntryCard } from "@/components/validation/entry-card";
import { parseSyntheticDataset } from "@/lib/dataset/synthetic-source";
import { ENGLISH_COPY, FILIPINO_COPY, translatorFor } from "@/lib/i18n/copy";

/**
 * The chrome `EntryCard` is HANDED, so the rendered assertion is about the sentence and not about
 * which strings a caller chose to pass in. Every field is present so the assertion cannot pass by a
 * prop being omitted and the corresponding markup disappearing.
 */
const CHROME = {
  instructionLabel: ENGLISH_COPY["validate.entry.instructionLabel"],
} as const;

/** One REAL allocated entry, read from the immutable source rather than written out by hand. */
function readFirstInstruction(): ReturnType<typeof parseSyntheticDataset>["entries"][number] {
  const { entries } = parseSyntheticDataset(
    JSON.parse(readFileSync(join(process.cwd(), "data", "ilocano-synthetic-data.json"), "utf8")),
  );
  expect(entries.length, "this helper read a real dataset, not an empty one").toBe(600);
  return entries[0];
}

/**
 * The research-material path, and the copy catalog it must never touch.
 *
 * ============================================================================
 * WHAT THIS FILE PROVES, AND WHY IT IS A SCAN RATHER THAN A RENDER
 * ============================================================================
 * `tasks.md` 6.4: "The Ilocano dataset instruction is rendered from storage with NO catalog lookup
 * on its path, asserted by a test rather than by review."
 *
 * THERE IS NOW SOMETHING TO RENDER, and this file's earlier statement that there was not is
 * corrected by `validation-experience`: `/validate/[batchId]` displays a dataset entry, and the
 * sentence here used to read "no route in this project displays a dataset entry - the validation
 * experience is a later OpenSpec change". That was true when written and false when the route
 * landed, which is exactly the failure a header asserting a temporary state invites: it keeps
 * asserting after the state has moved on, and the rendered assertion it declined to write is the
 * one that would have caught it. The rendered assertion now EXISTS, in the describe block
 * `the instruction is on the page` below, and it is the load-bearing half of this file. The scan is
 * still here because a scan fires earlier than a render - at the moment someone routes an
 * instruction through a `t(...)` call, rather than once a test happens to render the route.
 *
 * ============================================================================
 * WHY THE SCAN IS NOT THE ONLY GUARD, AND WHY A SCAN ALONE WOULD BE WEAK
 * ============================================================================
 * The scan is a CO-PRESENCE rule: "a file that mentions `instruction` may not import the catalog".
 * That is deliberately broader than the harm, because a route that renders a sentence and also needs
 * a localized heading is doing something legitimate. Broad enough to be wrong is why the render
 * assertion and the type-level pin below both exist, and why the scan is worded as a review prompt
 * rather than as the guarantee.
 *
 * The three guards are non-overlapping in what each can catch:
 *   - the SCAN fires at authoring time, on a file that has not been rendered yet;
 *   - the TYPE PIN makes `t(entry.instruction)` a compile error, so a lookup indexed by research
 *     data cannot be written at all - this is the only one of the three that can see a key which
 *     does not exist yet;
 *   - the RENDER proves the stored sentence reached the page, byte-for-byte, with the chrome around
 *     it in the participant's chosen language.
 *
 * ============================================================================
 * WHAT A SCAN STILL CANNOT DO, STATED RATHER THAN DISCOVERED LATER
 * ============================================================================
 *   - It matches imports and identifiers, not data flow. A file could import the catalog for an
 *     unrelated string on the same page as a dataset instruction and be reported. That is a false
 *     ALARM, which is the safe direction: a reviewer looks, decides, and widens the allowlist.
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
    // The validation schema, for the SAME reason and by the same precedent, added by
    // `validation-experience`: the four approved evaluation labels and the two translation field
    // labels are ASSIGNED from `EVALUATION_CHOICES` and `TRANSLATION_FIELD_LABELS` rather than
    // retyped, exactly as the screening labels are assigned from `ILOCANO_PROFICIENCY_CHOICES`.
    //
    // What this does NOT permit is the research data that module can also describe. The module
    // exports schemas and label tables, never a stored response, and the two negative assertions in
    // the test below are what hold that line - `@/schemas/validation` is allowed, `@/schemas/dataset`
    // is not, and only adding one to this list could cross it.
    /from "@\/schemas\/validation"/,
    // The locale domain, for the `Record<InterfaceLocale, Copy>` map. No React, no Next, no I/O.
    /from "@\/lib\/domain\/locale"/,
  ];

  /** The same predicate the assertion below uses, extracted so the control cannot drift from it. */
  const isAllowed = (specifier: string): boolean =>
    ALLOWED_IMPORTS.some((allowed) => allowed.test(`from "${specifier}"`));

  it("imports only modules that carry no research data", () => {
    const contents = read(join("lib", "i18n", "copy.ts"));
    const specifiers = [...contents.matchAll(/from "([^"\s]+)"/g)].map((match) => match[1]);

    // A floor, so a broken extraction cannot make the check vacuous.
    expect(specifiers.length).toBeGreaterThanOrEqual(3);
    for (const specifier of specifiers) {
      expect(isAllowed(specifier), `copy.ts imports ${specifier}`).toBe(true);
    }
  });

  it("CAN fail: the allowlist rejects the imports that would cross the boundary", () => {
    // The assertion above only ever proves that everything currently in the file is permitted, so on
    // its own it is satisfied by an allowlist containing a pattern that matches ANYTHING. That is
    // the "a test that APPEARS to be a guard while not being one" defect, and it is closed here by
    // running the same predicate over the imports that must be REFUSED.
    //
    // `@/schemas/dataset` is the one that matters most: it is a sibling of `@/schemas/validation`,
    // one path segment away, and it is where a stored instruction is typed. If a future edit widens
    // the pattern to a prefix or drops the closing quote, this fails and says which entry slipped in.
    for (const forbidden of [
      "@/schemas/dataset",
      "@/lib/repositories",
      "@/lib/repositories/supabase",
      "@/schemas/validation/instructions",
      "next/headers",
    ]) {
      expect(isAllowed(forbidden), `the allowlist must not permit ${forbidden}`).toBe(false);
    }

    // And the prefix trap specifically: the sibling that shares a path prefix with an allowed entry
    // is the case a sloppy pattern loses.
    expect(isAllowed("@/schemas/validation")).toBe(true);
    expect(isAllowed("@/schemas/validators")).toBe(false);
  });

  it("proves the specifier extraction reads imports and not string content", () => {
    // The first draft of the assertion above used `from "([^"]+)"` and reported a specifier of
    // `" +"`, taken from a Filipino string in the catalog that ENDS with the English words
    // "derived from". The pattern was matching prose - the same class of defect as matching a
    // comment, and fixed the same way - so the extraction now requires a specifier with no
    // whitespace in it, which a real module path never has and an English sentence always does.
    //
    // The control asserts the extracted list is EXACTLY the real imports, so a pattern that started
    // matching nothing at all would fail here rather than pass on an empty loop. It is an exact
    // list rather than a count: adding an import is a decision that should fail a test, and the
    // failure message then names the new specifier.
    const contents = read(join("lib", "i18n", "copy.ts"));
    const specifiers = [...contents.matchAll(/from "([^"\s]+)"/g)].map((match) => match[1]);

    expect(specifiers).toEqual([
      "@/schemas/validator",
      "@/schemas/validation",
      "@/lib/domain/locale",
    ]);
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

  it("the type layer forbids a lookup indexed by research data", () => {
    // The only guard here that can see a key which does not exist yet.
    //
    // A behavioural test cannot pin this. `translatorFor` returns `Translate = (key: CopyKey) =>
    // string`, and `CopyKey` is derived from the catalog, so the only way to look up an instruction
    // is to pass it where a `CopyKey` is expected - which is a TYPE error, not a runtime one. Enumerating
    // plausible offending expressions cannot close that gap, because a new one may be written in a
    // shape nobody listed. So the property is asserted where it lives, and `@ts-expect-error` fails
    // the type-check if the expression ever becomes legal.
    //
    // Each directive is paired with a POSITIVE assertion immediately after it. That pairing is the
    // part that makes this a guard rather than a comment: an unused `@ts-expect-error` is itself an
    // error, so if the type ever widened, the directive would stop suppressing anything and
    // `pnpm run typecheck` would name the line. The positive case is here so a reader can see the
    // legal spelling too.
    const t = translatorFor("en");

    // Legal: a real catalog key, and the positive control for the pair below.
    expect(t("validate.entry.label")).toBe(ENGLISH_COPY["validate.entry.label"]);

    // The entry is built from the real dataset rather than written out, for the reason this
    // repository has recorded repeatedly: a hand-written sample tests the sample.
    const entry = readFirstInstruction();
    expect(entry.instruction.length).toBeGreaterThan(0);

    // Illegal: research data used as a lookup key, written the way it would actually be written.
    //
    // The `@ts-expect-error` is the guard. It is not decorative in either direction: an unused
    // directive is itself a type error, so if `CopyKey` ever widened to `string` the directive would
    // stop suppressing anything and `pnpm run typecheck` would fail on this line.
    // @ts-expect-error `entry.instruction` is `string`, which is not assignable to `CopyKey`
    const viaInstruction: string = t(entry.instruction);

    // The runtime half, and it is the part a reader can check without the type-checker. The catalog
    // is keyed by a closed set of literals, so an instruction — or a dataset identifier, or anything
    // else derived from a record — resolves to NOTHING. There is no entry to render in place of the
    // sentence, in either language, which is why a lookup of this shape could only ever have produced
    // `undefined` and a blank screen rather than a plausible wrong string.
    expect(viaInstruction).toBeUndefined();
    // @ts-expect-error the same rule in the other language: a locale choice cannot make an
    // instruction a key. Written twice deliberately - one directive would cover one call site, and a
    // second file could take the other language without anything noticing.
    expect(translatorFor("fil")(entry.instruction)).toBeUndefined();
  });
});

describe("the instruction is on the page", () => {
  // ===============================================================================================
  // THE RENDERED ASSERTION THIS FILE PREVIOUSLY DECLINED TO WRITE, WRITTEN NOW THAT THERE IS A PAGE
  // ===============================================================================================
  // The file's header used to say there was nothing to render and that a rendered assertion "would be
  // asserting the absence of a page rather than the property of one, and it would keep passing after
  // someone built the page wrong". Both halves were true and the conclusion was still wrong: a page
  // was built, and the declined assertion is the one that would have described it.
  //
  // It renders `EntryCard` rather than the route, and that is a deliberate choice rather than a
  // smaller one. `EntryCard` is the single module that holds a stored instruction, it imports NO copy
  // catalog, and rendering it needs no server-only stub, no repository, and no credential — so this
  // assertion is about the research material and nothing else. The route's own rendered assertions
  // (one entry present, nine absent, chrome localized) live in `tests/unit/validation-routes.test.tsx`,
  // which is their right home; putting them here would have given this file a second subject and a
  // second set of stubs to keep working.
  it("renders the stored sentence byte-for-byte, in a shell it was handed", () => {
    const entry = readFirstInstruction();
    const markup = renderToStaticMarkup(
      <EntryCard entry={entry} {...CHROME} label={ENGLISH_COPY["validate.entry.label"]} />,
    );

    // THE CLAIM: the sentence as stored is present, exactly, and the interface's language cannot
    // have touched it. The sentence is a long, specific string, so containment of it is not
    // coincidence — which is the property a marker-based check could never have had.
    expect(markup).toContain(entry.instruction);
    expect(markup).toContain(ENGLISH_COPY["validate.entry.label"]);

    // THE NARRATIVE CONTROL, and it is the one that would catch a real regression: a participant on
    // the Filipino interface must see the same sentence and different chrome. If the entry card
    // resolved any part of itself through the catalog, THIS assertion fails while the English one
    // still passes — which is precisely the blindness a single-locale render would leave in place.
    const filMarkup = renderToStaticMarkup(
      <EntryCard entry={entry} {...CHROME} label={FILIPINO_COPY["validate.entry.label"]} />,
    );
    expect(filMarkup).toContain(entry.instruction);
    expect(filMarkup).toContain(FILIPINO_COPY["validate.entry.label"]);
    expect(filMarkup).not.toBe(markup);

    // And the mechanism the control relies on, asserted so a reader knows the difference is real:
    // the two catalogs genuinely differ for this key. If they ever stopped differing this test would
    // fail on `not.toBe`, which is the intended direction — the narrative control would be
    // meaningless if the chrome were identical.
    expect(FILIPINO_COPY["validate.entry.label"]).not.toBe(ENGLISH_COPY["validate.entry.label"]);
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
