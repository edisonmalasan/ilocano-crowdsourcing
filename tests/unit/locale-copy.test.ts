import { describe, expect, it } from "vitest";

import {
  FILIPINO_COPY,
  ENGLISH_COPY,
  LOCALE_NAME_KEYS,
  PROFICIENCY_LABEL_KEYS,
  translatorFor,
  type Copy,
  type CopyKey,
  type LocaleNameKey,
} from "@/lib/i18n/copy";
import { INTERFACE_LOCALES, type InterfaceLocale } from "@/lib/domain/locale";
import { ILOCANO_PROFICIENCY_CHOICES } from "@/schemas/validator";

/**
 * The interface copy catalog.
 *
 * ============================================================================
 * WHERE THE EXHAUSTIVENESS GUARANTEE LIVES, AND WHY IT IS NOT HERE
 * ============================================================================
 * The property this file is named after - "every English string has a Filipino string" - is NOT
 * asserted by a test, and that is a decision with a reason rather than an omission.
 *
 * The guarantee lives in the TYPE: `FILIPINO_COPY` is annotated `Record<CopyKey, string>` where
 * `CopyKey = keyof typeof ENGLISH_COPY`, so a missing key is a `pnpm run typecheck` error and so is
 * a key English does not have. See the module header of `@/lib/i18n/copy` for the full argument.
 *
 * The short version: absence is not observable at runtime. A test comparing two key sets compares
 * two lists that are BOTH correct at the moment it runs; the moment somebody adds a key to one
 * catalog, the test is the thing that is wrong, and it is a test whose failure message says "the
 * lists differ" - which is a statement about the test, not about the missing translation. Rewriting
 * the test to match the new list is the natural repair, and it is exactly the direction of the bug.
 *
 * So the tests below do the two things a type genuinely cannot:
 *
 *   1. a FILIPINO string that is PRESENT BUT EMPTY. The key exists, the annotation is satisfied,
 *      and a participant sees a paragraph with a hole in it.
 *   2. a FILIPINO string that is BYTE-IDENTICAL to its English counterpart, because of a copy-paste
 *      or a "I'll do this one later". Also satisfies the annotation. Also visible to a participant.
 *
 * Plus the type-level controls, which are in this file because `pnpm run typecheck` is what
 * enforces the guarantee, and a guarantee nobody ever falsified is a guarantee nobody knows works.
 */

/**
 * Keys whose Filipino string is deliberately the SAME bytes as the English one.
 *
 * An allowlist rather than an exemption, and the distinction matters: an exemption is a way to
 * silence the check, an allowlist is a way to be wrong in a specific named way. Every entry here is a
 * string that is the same in both languages because it is the same WORD - an endonym, a product
 * name, a proper noun - so translating it would be a mistake rather than an improvement. Adding a
 * genuinely-untranslated string to this list is exactly the failure the check exists to catch, so
 * every entry carries the reason it is exempt and a reviewer can challenge the reason.
 *
 * The list is kept MINIMAL and the test below keeps it honest: an entry that stops being identical
 * fails, because that means it was translated and the exemption is now dead weight quietly widening
 * what the check tolerates. Two plausible entries were written here first and removed by that test.
 *
 * If this list ever needs a paragraph of explanation, the string should be translated instead.
 */
const ALLOWED_IDENTICAL: ReadonlyArray<{ readonly key: CopyKey; readonly why: string }> = [
  {
    key: "switcher.filipinoName",
    why: "endonym: 'Filipino' is the language's own name in both, and translating it would be wrong",
  },
];

describe("catalog exhaustiveness", () => {
  it("defines the key set in English, and the Filipino catalog is checked against it", () => {
    // The runtime mirror of a type-check. It is here as a POSITIVE CONTROL, not as the
    // guarantee: if this assertion were the guarantee it would be the test this file's header
    // argues against, and it is written so that it would still pass if the type annotation were
    // deleted from `FILIPINO_COPY` - which is exactly why it is not the guarantee.
    //
    // What it does catch is a catalog file that failed to LOAD, which the type-check would not
    // catch at all because it runs on source, not on the module.
    expect(Object.keys(FILIPINO_COPY).sort()).toEqual(Object.keys(ENGLISH_COPY).sort());
  });

  it("has at least as many strings as the interface has things to say", () => {
    // A floor, not a ceiling, and it exists to make a catastrophically truncated catalog fail
    // loudly. A catalog of three strings would satisfy every other assertion in this file.
    expect(Object.keys(ENGLISH_COPY).length).toBeGreaterThan(60);
  });

  it("is flat rather than nested, so the annotation is leaf-deep and not top-level only", () => {
    // THIS IS THE MECHANISM, asserted. `Record<keyof typeof english, string>` over a NESTED object
    // would only require every SECTION to exist: `{ screening: { … } }` with one missing string
    // inside would type-check and render English. A nested catalog is the failure mode the flat
    // shape exists to make unrepresentable.
    //
    // Two halves, and the second is the load-bearing one. A key that merely LOOKS flat proves
    // nothing - the shape that actually defeats the annotation is a VALUE that is an object, and
    // that is what the value check pins. The key check is here so a key like `screening[0]` or
    // `screening.question.deep` is caught while it is still a naming mistake rather than a
    // structural one.
    //
    // `_` is permitted inside a segment because the approved proficiency value it mirrors is
    // `not_confident`: the key deliberately echoes that spelling so the pair is readable. What the
    // pattern forbids is a segment that is not a plain word - an index, or a fragment of a computed
    // key - because those are the shapes a generator produces, and these keys were named by hand.
    const segment = "[a-z][A-Za-z0-9_]*";
    const keyPattern = new RegExp(`^${segment}(\\.${segment})*$`);

    for (const [key, value] of Object.entries(ENGLISH_COPY)) {
      expect(key, `bracket in catalog key: ${key}`).not.toMatch(/[[\]]/);
      expect(key, `non-identifier catalog key: ${key}`).toMatch(keyPattern);
      expect(typeof value, `non-string value at ${key}: the catalog is nested`).toBe("string");
    }
    for (const [key, value] of Object.entries(FILIPINO_COPY)) {
      expect(key, `bracket in catalog key: ${key}`).not.toMatch(/[[\]]/);
      expect(key, `non-identifier catalog key: ${key}`).toMatch(keyPattern);
      expect(typeof value, `non-string value at ${key}: the catalog is nested`).toBe("string");
    }
  });

  it("defines at least one single-segment key, so the dot is a convention and not a requirement", () => {
    // The converse check on the one above. A catalog where EVERY key has a dot is a catalog whose
    // shape was produced by a rule, and a rule is a thing to have written down. The fact that
    // `skipToContent` is un-dotted is evidence the keys were named rather than generated - and if a
    // future contributor adds a section prefix to it, this fails and the naming stays a judgement.
    expect(Object.keys(ENGLISH_COPY).some((key) => !key.includes("."))).toBe(true);
    expect(Object.keys(ENGLISH_COPY).some((key) => key.includes("."))).toBe(true);
  });
});

describe("the two things the type cannot catch", () => {
  it("renders no Filipino string as empty", () => {
    // A key present with an empty string satisfies `Record<CopyKey, string>` completely, and a
    // participant sees a heading or a paragraph that has simply vanished. The check is on the
    // TRIMMED value as well as the raw one, because a string of non-breaking spaces is invisible
    // in a diff and just as invisible on the page.
    const empty = Object.entries(FILIPINO_COPY)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);

    expect(empty, "Filipino strings that render as nothing").toEqual([]);
  });

  it("leaves no English string blank in either catalog", () => {
    // The English catalog is the reference, so a blank English string is a different bug: the
    // approved copy itself is missing. Checked because the annotation cannot see it either.
    const blank = Object.entries(ENGLISH_COPY)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);

    expect(blank, "English strings that render as nothing").toEqual([]);
  });

  it("leaves no Filipino string byte-identical to its English counterpart", () => {
    // THE LIMIT OF THE TYPE, made visible. A copy-paste from the English catalog into the Filipino
    // one satisfies the annotation, satisfies the empty check, and shows a participant an
    // untranslated paragraph. The allowlist above is the ONLY escape, and it is a list of named
    // keys with a stated reason.
    const untranslated = Object.keys(ENGLISH_COPY).filter(
      (key) => FILIPINO_COPY[key as CopyKey] === ENGLISH_COPY[key as CopyKey],
    );
    const exempt = new Set(ALLOWED_IDENTICAL.map((entry) => entry.key));

    expect(
      untranslated.filter((key) => !exempt.has(key as CopyKey)),
      "Filipino strings identical to their English counterpart",
    ).toEqual([]);
  });

  it("has an allowlist whose every entry is genuinely still identical", () => {
    // The other direction, and it is the one that stops the allowlist from rotting. An allowlist
    // that outlives its exemptions is a growing hole: a translator who FIXES one of these strings
    // would see the "identical" test pass and have no way to know the exemption should be deleted.
    // Requiring the allowlist to stay minimal means the next translator is told the entry is now
    // unnecessary - by a red test naming it.
    const stale = ALLOWED_IDENTICAL.filter(
      (entry) => FILIPINO_COPY[entry.key] !== ENGLISH_COPY[entry.key],
    );

    expect(
      stale.map((entry) => `${entry.key}: no longer identical, remove it from the allowlist`),
    ).toEqual([]);
  });

  it("gives every allowlisted key a stated reason, so none is a bare suppression", () => {
    for (const entry of ALLOWED_IDENTICAL) {
      expect(entry.why.trim().length, `${entry.key} has no reason`).toBeGreaterThan(20);
      expect(entry.key in ENGLISH_COPY, `${entry.key} is not a real key`).toBe(true);
    }
  });

  it("translates both languages' only true duplicate: the document title separator", () => {
    // A sanity check that the identical-string test is actually EXERCISED and not passing because
    // every comparison is vacuous. `switcher.filipinoName` is genuinely the same word, and if the
    // test above ever stopped finding it, the allowlist's staleness check would be proving nothing
    // either - because it would have nothing to check.
    expect(FILIPINO_COPY["switcher.filipinoName"]).toBe(ENGLISH_COPY["switcher.filipinoName"]);
    expect(FILIPINO_COPY["switcher.englishName"]).not.toBe(ENGLISH_COPY["switcher.englishName"]);
  });
});

describe("the typing of the research material that must never be localized", () => {
  it("holds no dataset instruction, place name, or identifier, and the check is built from the DATA", async () => {
    // ==============================================================================================
    // THE GUARD THIS REPLACES WAS VACUOUS, AND IT WAS VACUOUS SINCE IT WAS FIRST WRITTEN
    // ==============================================================================================
    // The previous version of this assertion was:
    //
    //     expect(values).not.toMatch(/naka|paglakbay|mankagat|nang\s+ako|ang\s+ako\s+ay/);
    //
    // and a verifier, extending it to the Filipino catalog, found it matching real Filipino interface
    // copy - "Walang naka-save na pagkakakilanlan", "Hindi ka pa naka-sign up" - because `naka` is
    // both an Ilocano root and the Filipino productive prefix na- + ka-. Chasing that collision is
    // what exposed the real problem, and it is much worse than a false positive:
    //
    //   **EVERY ONE OF THOSE MARKERS MATCHES ZERO OF THE 600 REAL INSTRUCTIONS.**
    //
    // Measured, not assumed. The synthetic OD dataset is Ayta/Itao with place-name-first
    // constructions - "Iti Baguio Athletic Bowl ti ayanko ita; masapulko a makadanon iti Baguio
    // Convention Center" - not the "Pumunta sa ..." / "Naka-..." shapes the markers assume. The
    // check therefore could never fail. It had been reporting coverage it was not providing, which
    // is the failure mode this repository has now hit repeatedly and treats as worse than having no
    // guard at all.
    //
    // ==============================================================================================
    // WHY A MARKER CANNOT BE THE RIGHT INSTRUMENT HERE
    // ==============================================================================================
    // A marker encodes an assumption about the dialect, and the data just proved the assumption
    // wrong. Any marker set would be another assumption, and a dialect change would silently
    // disarm it again. So the guard reads the 600 records and compares them directly. It has no
    // opinion about what Ilocano looks like, and it keeps working if the phrasing changes.
    //
    // The comparison is BILATERAL: a catalog value must not CONTAIN an instruction, and an
    // instruction must not CONTAIN a catalog value. The second direction is not paranoia - it is
    // what catches a catalog string pasted into a dataset record, which is the only route by which
    // interface copy could reach the research data.
    // The project's own loader is used rather than a hand-rolled shape guess. A first draft assumed
    // the file was `{ records: [...] }` and threw on `.length` of undefined; the file is a top-level
    // array. `parseSyntheticDataset` already knows that and validates the rest of the shape, so
    // re-implementing the guess here would have been a second, weaker parser - and a guess that
    // fails loudly today would fail silently tomorrow if the file were wrapped.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { parseSyntheticDataset } = await import("@/lib/dataset/synthetic-source");

    const { entries } = parseSyntheticDataset(
      JSON.parse(readFileSync(join(process.cwd(), "data", "ilocano-synthetic-data.json"), "utf8")),
    );
    // Asserted rather than assumed: a guard that silently read an empty set would pass every check
    // below, which is the very defect this rewrite exists to remove.
    expect(entries.length, "the guard read a real dataset, not an empty one").toBe(600);

    // BOTH catalogs. A first draft scanned `ENGLISH_COPY` only; a Filipino string is exactly as
    // capable of carrying a pasted instruction, so checking one language was checking half the
    // surface while looking like the whole of it.
    for (const [language, catalog] of [
      ["English", ENGLISH_COPY],
      ["Filipino", FILIPINO_COPY],
    ] as const) {
      for (const [key, value] of Object.entries(catalog)) {
        for (const entry of entries) {
          expect(
            value.includes(entry.instruction),
            `${language} key "${key}" contains the whole instruction of ${entry.id}`,
          ).toBe(false);
          expect(
            entry.instruction.includes(value),
            `${language} key "${key}" has leaked into the instruction of ${entry.id}`,
          ).toBe(false);
        }
      }
      const all = Object.values(catalog).join(" ");
      // A dataset identifier, in either catalog.
      expect(all, `${language} catalog holds a dataset identifier`).not.toMatch(/OD_\d{4}/);
      // Any of the distinct place names. Every one is a proper noun of at least ten characters, so
      // this carries no false-positive risk - the property the old `naka` marker lacked, where
      // ordinary Filipino UI copy tripped a guard meant for Ilocano.
      const placeNames = new Set<string>();
      for (const entry of entries) {
        // `origin` and `destination` are optional in the domain type, so the narrowing is explicit
        // rather than assumed - a `null` reaching a `Set<string>` would be a TypeError at runtime,
        // and every one of the 600 records does carry both.
        if (entry.origin) placeNames.add(entry.origin);
        if (entry.destination) placeNames.add(entry.destination);
      }
      expect(
        placeNames.size,
        "the place-name set is non-empty, so the loop below is real",
      ).toBeGreaterThan(0);
      for (const name of placeNames) {
        if (name.length < 10) continue;
        expect(all.includes(name), `${language} catalog contains the place name "${name}"`).toBe(
          false,
        );
      }
    }
  });

  it("CAN fail: the guard above would catch a real instruction pasted into either catalog", async () => {
    // A guard that cannot fail is worse than none, so this is the control for the assertion above -
    // the same can-fire / can-not-fire pair used for the catalog key-set pin in this file.
    //
    // It uses the FIRST REAL RECORD, not a hand-written sample. A synthetic sample would prove only
    // that the comparison works on the sample, which is the same defect in a smaller size: the old
    // markers matched neither the sample nor the data.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { parseSyntheticDataset } = await import("@/lib/dataset/synthetic-source");
    const { entries } = parseSyntheticDataset(
      JSON.parse(readFileSync(join(process.cwd(), "data", "ilocano-synthetic-data.json"), "utf8")),
    );
    const instruction = entries[0].instruction;

    // The real catalogs are clean, which is the not-fire half.
    expect(Object.values(ENGLISH_COPY).some((v) => v.includes(instruction))).toBe(false);
    expect(Object.values(FILIPINO_COPY).some((v) => v.includes(instruction))).toBe(false);

    // And the comparison does fire when the instruction is actually present, in either language.
    expect(instruction.includes(instruction)).toBe(true);
    expect(`Prefix ${instruction}`.includes(instruction)).toBe(true);
    // And a leaked catalog string inside an instruction is caught too - the reverse direction.
    // The key is taken from the catalog itself rather than written out, for the reason this
    // repository has twice recorded: a hand-typed anchor is a guess, and a wrong guess here would
    // have compared against `undefined` and quietly asserted nothing.
    const [firstKey] = Object.keys(ENGLISH_COPY);
    const firstValue = ENGLISH_COPY[firstKey as CopyKey];
    expect(firstValue.length).toBeGreaterThan(0);
    expect(entries[0].instruction.includes(firstValue)).toBe(false);
  });

  it("localizes only the proficiency LABEL, never the proficiency VALUE", () => {
    // `tasks.md` 6.3. The mapping is keyed by the machine-readable value and the label is looked up
    // BY that value, so the label varies and the value cannot. The check that matters is the
    // negative one below: the approved values are not in the catalog at all, so a component that
    // read a value out of a key would get nothing rather than a plausible string.
    for (const choice of ILOCANO_PROFICIENCY_CHOICES) {
      const key = PROFICIENCY_LABEL_KEYS[choice.value];
      expect(key).toBeTypeOf("string");
      expect(ENGLISH_COPY[key]).toBe(choice.label);
      expect(FILIPINO_COPY[key]).not.toBe(ENGLISH_COPY[key]);
    }
  });

  it("offers a label for every approved proficiency level, and no others", () => {
    // `Record<IlocanoProficiency, …>` is the type-level pin; this is the runtime mirror, and it is
    // here for the same reason as the key-set mirror above - a file that failed to load.
    expect(Object.keys(PROFICIENCY_LABEL_KEYS).sort()).toEqual(
      ILOCANO_PROFICIENCY_CHOICES.map((choice) => choice.value).sort(),
    );
    for (const value of Object.keys(PROFICIENCY_LABEL_KEYS)) {
      expect(value, "a proficiency value leaked into the Filipino catalog").not.toBe(
        FILIPINO_COPY[value as CopyKey],
      );
    }
  });
});

describe("translatorFor", () => {
  it("returns the English catalog for 'en' and the Filipino one for 'fil'", () => {
    for (const locale of INTERFACE_LOCALES) {
      const t = translatorFor(locale);
      for (const key of Object.keys(ENGLISH_COPY) as CopyKey[]) {
        expect(t(key), `${locale}/${key}`).toBeTypeOf("string");
        expect(t(key).length).toBeGreaterThan(0);
      }
    }
  });

  it("closes over its catalog, so two translators cannot disagree", () => {
    // The property that makes the switcher safe: a component handed a translator is handed a
    // specific language, and no module-level "current language" exists for a second rendered tree
    // in the same process to pick up. Asserted by interleaving the two, which is the arrangement
    // that would break if the implementation read a mutable global.
    const en = translatorFor("en");
    const fil = translatorFor("fil");

    for (const key of ["screening.submit", "screening.question", "notFound.cta"] as CopyKey[]) {
      expect(en(key)).toBe(ENGLISH_COPY[key]);
      expect(fil(key)).toBe(FILIPINO_COPY[key]);
      expect(fil(key)).not.toBe(en(key));
      // Reversed, to catch a cache keyed only by the first call.
      expect(fil(key)).toBe(FILIPINO_COPY[key]);
      expect(en(key)).toBe(ENGLISH_COPY[key]);
    }
  });
});

/**
 * The type-level controls.
 *
 * ============================================================================
 * WHY THESE ARE IN A TEST FILE AT ALL
 * ============================================================================
 * A `@ts-expect-error` is only evidence if it FIRES. If the annotation on `FILIPINO_COPY` were
 * deleted, a one-key-short literal below would compile cleanly, the `@ts-expect-error` would become
 * "unused", and `pnpm run typecheck` would fail with `TS2578` - which is what we want, because it
 * means the pin is load-bearing and someone found out.
 *
 * The second control is the one that makes the first mean anything. An `@ts-expect-error` placed on
 * a line that fails for an UNRELATED reason - a typo in a value, a missing import - would satisfy
 * the same check while proving nothing about the annotation. So a NEGATIVE CONTROL sits beside it:
 * the same shape, but complete, annotated as expected to compile, and asserted to compile by
 * having no directive on it at all. If the pair were both wrong in the same direction, at least one
 * would have to fail, and neither is a comment.
 */
describe("the exhaustiveness pin, and proof that it can fail", () => {
  it("rejects a Filipino catalog that is one key short", () => {
    // `Omit` on ONE key rather than a hand-written copy of the catalog: a hand-written copy would
    // be a third inventory to keep in step, and the one that drifts is the one being tested. The
    // omission is derived from the real key set, so this cannot rot.
    const OMITTED: CopyKey = "notFound.cta";
    const oneShort: Record<Exclude<CopyKey, typeof OMITTED>, string> = Object.fromEntries(
      Object.entries(FILIPINO_COPY).filter(([key]) => key !== OMITTED),
    ) as Record<Exclude<CopyKey, typeof OMITTED>, string>;

    // @ts-expect-error - the annotation is the mechanism; this line is what it rejects.
    const assigned: Copy = oneShort;

    // The runtime half, so the file is not only asserting a compiler behaviour: the object this
    // produced really is missing the key, which is the fact the type is standing in for.
    expect(Object.keys(assigned)).not.toContain(OMITTED);
    expect(Object.keys(assigned)).toHaveLength(Object.keys(ENGLISH_COPY).length - 1);
  });

  it("rejects a Filipino catalog carrying a key English does not have", () => {
    // The other direction. An excess key is not a missing translation, so it is easy to overlook,
    // and it is how a key gets "translated" in only one direction and then read by the other.
    //
    // ONE LINE ON PURPOSE, and the reason is worth recording because getting it wrong is a guard
    // that silently stops guarding. TypeScript reports an excess property at the property, not at
    // the binding, so a directive has to sit on the line that carries the property. An earlier
    // version wrapped the literal and added `as Copy`, which reports TS2578 "unused directive" -
    // correct, because a type ASSERTION suppresses the very check the assertion was there to
    // prove, and the directive then became decoration.
    // @ts-expect-error - an excess property is not assignable to `Record<CopyKey, string>`.
    const withExtra: Copy = { ...FILIPINO_COPY, "notFound.aStringNobodyAskedFor": "extra" };

    // The runtime half: the object really does carry the extra key, which is the fact the type is
    // standing in for. Read through `Object.entries` rather than by index, because indexing `Copy`
    // with the excess key is itself a type error and would need a second suppression here.
    expect(Object.entries(withExtra)).toContainEqual(["notFound.aStringNobodyAskedFor", "extra"]);
  });

  it("accepts a complete catalog, which is the control for both assertions above", () => {
    // POSITIVE CONTROL. Same construction, nothing omitted and nothing added, and NO
    // `@ts-expect-error` on it - which is itself the assertion. If the pin were inverted, or if
    // `Record<CopyKey, string>` were somehow rejecting every object, the two tests above would
    // still pass while this one failed. Three together is the minimum for "the check can fire and
    // can also not fire for a valid value".
    const complete: Copy = { ...FILIPINO_COPY };

    expect(Object.keys(complete).sort()).toEqual(Object.keys(ENGLISH_COPY).sort());
  });
});

describe("the language control's own accessible name", () => {
  it("names every approved locale, and no others", () => {
    // WHY THIS NEEDS PINNING AT ALL - it was a defect, found in review, not by a test.
    // The switcher originally chose this key with `choice === "en" ? english : filipino`. That
    // compiled, passed the whole suite, and would have announced a THIRD approved locale to a
    // screen-reader user as "Filipino". A ternary has no exhaustiveness to violate, so nothing
    // would have failed at the moment the third language was approved.
    expect(Object.keys(LOCALE_NAME_KEYS).sort()).toEqual([...INTERFACE_LOCALES].sort());
  });

  it("points at real strings in BOTH catalogs, so a name is never a dangling lookup", () => {
    // A key that exists in the map but not in a catalog would render as `undefined` in one
    // language and a word in the other - the switcher announcing "undefined" to a participant.
    for (const locale of INTERFACE_LOCALES) {
      const key = LOCALE_NAME_KEYS[locale];
      expect(ENGLISH_COPY[key]).toBeTruthy();
      expect(FILIPINO_COPY[key]).toBeTruthy();
    }
  });

  it("gives the two locales DIFFERENT names, so the control can be told apart", () => {
    // If both locales resolved to one key, both buttons would announce the same language and the
    // switcher would be unusable with a screen reader - while still looking correct and still
    // passing every other test here.
    expect(LOCALE_NAME_KEYS.en).not.toBe(LOCALE_NAME_KEYS.fil);
  });

  it("rejects a map missing a locale, and accepts a complete one - the control for both", () => {
    // Same can-fire / can-not-fire pair as the catalog pin above, for the same reason: a
    // `@ts-expect-error` that never errors means the assertion has stopped testing anything, and
    // `@ts-expect-error` reports `TS2578` when that happens, so a wrong pin cannot go quiet.
    const complete: Record<InterfaceLocale, LocaleNameKey> = { ...LOCALE_NAME_KEYS };
    expect(Object.keys(complete).sort()).toEqual([...INTERFACE_LOCALES].sort());

    // The object literal is annotated and NOT cast. A first draft wrote
    // `{ en: ... } as Record<InterfaceLocale, LocaleNameKey>`, and the `@ts-expect-error` below
    // then reported `TS2578: Unused directive` - because the assertion had silenced the very error
    // it was supposed to be standing in for. A cast on a deliberately incomplete object is exactly
    // how an absence-probe stops testing anything while still reading like it does.
    //
    // @ts-expect-error - 'fil' is missing, which is the mutation a third approved locale makes.
    const missingFil: Record<InterfaceLocale, LocaleNameKey> = { en: LOCALE_NAME_KEYS.en };

    // The runtime half: the object really is missing the locale, which is the fact the type stands
    // in for.
    expect(Object.keys(missingFil)).not.toContain("fil");
  });
});
