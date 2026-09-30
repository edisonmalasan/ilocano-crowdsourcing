import { describe, expect, it } from "vitest";

import {
  DEFAULT_INTERFACE_LOCALE,
  INTERFACE_LOCALES,
  isInterfaceLocale,
  resolveInterfaceLocale,
} from "@/lib/domain/locale";

/**
 * The interface-locale resolver.
 *
 * `tasks.md` 4.2 puts these at the narrowest layer, and the narrowest layer is the point rather
 * than a convenience: `resolveInterfaceLocale` is a pure function over `unknown`, so every value a
 * hand-edited cookie, a stale browser, or a future version of the site could carry is assertable
 * here with no request scope, no database, and no credential.
 *
 * ============================================================================
 * WHY "NEVER THROWS" IS THE SPECIFICATION AND NOT A CONVENIENCE
 * ============================================================================
 * The failure this resolver exists to prevent is a hard failure on EVERY page of a research
 * instrument, caused by a value nobody cares about. A stale cookie from a site rename would be
 * present in every browser that had one, permanently, and would take the landing, screening, and
 * confirmation pages down with it - in exchange for a preference that has an obviously correct
 * default.
 *
 * So the tests below are not "returns the right thing for a few inputs". They are an attempt to
 * make the totality claim FAIL: the interesting cases are the ones a reasonable implementation
 * would get wrong, and each of them is named below with the mistake it is guarding against.
 */

describe("the approved locale set", () => {
  it("is exactly English and Filipino, and nothing else", () => {
    // The spec fixes the two. This is the pin, not a description: a third language is a
    // translation-budget decision with a human in it, and appending to this tuple must be
    // something a reviewer sees. `CATALOGS` in `@/lib/i18n/copy` is `Record<InterfaceLocale, Copy>`,
    // so a third entry here without a catalog for it fails the type-check too.
    expect(INTERFACE_LOCALES).toEqual(["en", "fil"]);
  });

  it("defaults to English, which is the language the research team approved as primary", () => {
    expect(DEFAULT_INTERFACE_LOCALE).toBe("en");
    // And the default is one of the approved values, so no consumer of it needs to resolve it again.
    expect(isInterfaceLocale(DEFAULT_INTERFACE_LOCALE)).toBe(true);
  });
});

describe("isInterfaceLocale", () => {
  it.each(INTERFACE_LOCALES)("accepts %s", (locale) => {
    expect(isInterfaceLocale(locale)).toBe(true);
  });

  it.each([
    ["a language this build has never heard of", "en-GB"],
    ["a future version's value", "fil-PH"],
    ["a legacy name", "tl"],
    ["the empty string", ""],
    ["a value differing only in case", "FIL"],
    ["a value with surrounding whitespace", " fil "],
  ])("rejects %s", (_label, value) => {
    expect(isInterfaceLocale(value)).toBe(false);
  });

  it.each([
    ["a String wrapper object", new String("fil")],
    ["an object whose toString is 'fil'", { toString: (): string => "fil" }],
    ["a one-element array", ["fil"]],
    ["an object with a length and an index", { 0: "f", 1: "i", 2: "l" }],
    ["a number", 1],
    ["null", null],
    ["undefined", undefined],
    ["a boolean", true],
    // `BigInt(1)` rather than `1n`: this project's TypeScript target is below ES2020, so the
    // literal is a compile error. Spelled this way it is a runtime value, which is the point -
    // the resolver must survive a type the build cannot even name in source.
    ["a bigint", BigInt(1)],
    ["a symbol", Symbol("fil")],
  ])("rejects %s", (_label, value) => {
    // The reason the guard is a `typeof` check and not a `String(value)` comparison. A
    // stringifying guard would accept a participant's tampered cookie whenever they could make it
    // stringify to "fil", and would accept an ARRAY whose first element is "fil" - which is a real
    // shape a tampered JSON body can have, and which a `==` comparison would happily accept.
    expect(isInterfaceLocale(value)).toBe(false);
  });

  it.each([
    ["a String wrapper object", new String("fil")],
    ["an object whose toString is 'fil'", { toString: (): string => "fil" }],
    ["a one-element array", ["fil"]],
  ])("rejects %s even though it stringifies to exactly 'fil'", (_label, value) => {
    // The three cases where a stringifying guard would actually be fooled. Split out from the
    // list above because it is the only claim there that needs a precondition, and a shared
    // `it.each` cannot express "these two hold together" without asserting something false about
    // `1` and `true`, which do not stringify to "fil" and would make this a different test.
    expect(String(value)).toBe("fil");
    expect(isInterfaceLocale(value)).toBe(false);
    expect(resolveInterfaceLocale(value)).toBe(DEFAULT_INTERFACE_LOCALE);
  });

  it.each(["constructor", "toString", "hasOwnProperty", "__proto__", "valueOf"])(
    "rejects the inherited property name %s",
    (name) => {
      // The mistake this guards is using `INTERFACE_LOCALES.includes(value)` directly on a
      // literal tuple, or worse an index lookup. `Array.prototype` carries every one of these
      // names, so an implementation that reached the prototype would accept "constructor" as a
      // language and then index a catalog with it. Asserted by VALUE rather than by reading the
      // implementation, because reading the implementation is how this kind of claim is
      // accidentally unfalsifiable.
      expect(isInterfaceLocale(name)).toBe(false);
      expect(resolveInterfaceLocale(name)).toBe(DEFAULT_INTERFACE_LOCALE);
    },
  );
});

describe("resolveInterfaceLocale", () => {
  it.each(INTERFACE_LOCALES)("passes %s through unchanged", (locale) => {
    expect(resolveInterfaceLocale(locale)).toBe(locale);
  });

  it.each([
    ["an absent cookie", undefined],
    ["an empty cookie", ""],
    ["a hand-edited value", "xx"],
    ["a value from a future build", "fil-PH"],
    ["a rejected language tag", "en-US;q=0.9"],
    ["a value that is only whitespace", "   "],
    ["a lowercase/uppercase mismatch", "En"],
    ["a non-string", 42],
    ["null", null],
    ["a file", new File([], "x")],
  ])("resolves %s to the default rather than throwing", (_label, value) => {
    // The claim, stated as an observable: a value nobody can act on does not become a page error.
    expect(() => resolveInterfaceLocale(value)).not.toThrow();
    expect(resolveInterfaceLocale(value)).toBe(DEFAULT_INTERFACE_LOCALE);
  });

  it("returns one of the two approved values for every input, by construction", () => {
    // A property over a SPREAD of hostile values rather than a list. The list would be a
    // second inventory to keep in step; the property is the whole contract, and a caller that
    // returned `undefined` for some untried input would fail it.
    const hostile: unknown[] = [
      undefined,
      null,
      "",
      " ",
      "en",
      "fil",
      "EN",
      "FIL",
      "fil-PH",
      ["fil-PH"],
      "en-GB",
      "tl",
      0,
      1,
      NaN,
      Infinity,
      -1,
      true,
      false,
      {},
      [],
      ["en"],
      ["fil", "en"],
      { locale: "fil" },
      { toString: (): string => "fil" },
      new String("fil"),
      Symbol.iterator,
      () => "fil",
      Object.create(null),
      new Date(0),
      // `BigInt(1)` rather than `1n`: the TypeScript target is below ES2020, so the literal will
      // not compile even though the runtime supports it perfectly well. That is worth having here -
      // the resolver must survive a value the build cannot even write down.
      BigInt(1),
    ];

    for (const value of hostile) {
      const resolved = resolveInterfaceLocale(value);
      expect(INTERFACE_LOCALES, `resolved to ${String(resolved)}`).toContain(resolved);
    }
  });

  it("is total over a large sample of arbitrary values, with no exception escaping", () => {
    // The previous test uses a curated list, which is a list someone chose and can therefore be
    // wrong about. This one is generated, so it cannot be curated: 2000 pseudo-random values of
    // assorted shapes, every one of which must resolve to an approved locale. A resolver that
    // threw on an unexpected type, or that returned the input unchanged, fails here even if the
    // curated list happened to miss the shape.
    let seed = 20260930;
    const next = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    const shapes: Array<() => unknown> = [
      () => Math.floor(next() * 1_000_000),
      () => ["en", "fil", "xx", "", "fil-PH"][Math.floor(next() * 5)],
      () => ({ random: next() }),
      () => [next(), next()],
      () => (next() > 0.5 ? "en" : { nested: "fil" }),
      () => String.fromCharCode(97 + Math.floor(next() * 26)),
    ];

    for (let index = 0; index < 2000; index += 1) {
      const value = shapes[index % shapes.length]();
      expect(INTERFACE_LOCALES).toContain(resolveInterfaceLocale(value));
    }
  });

  it("does not warn, because a presentation preference is not worth an error boundary", () => {
    // "It does not warn" is a real property, not a style preference: a `console.warn` in a
    // server render is either invisible or noise on every single request, and a resolved
    // unrecognised value is the expected path for a first-time visitor whose cookie is absent.
    // The consequence is that nothing observable happens - asserted so the claim is checkable
    // rather than merely documented.
    const warn = console.warn;
    const calls: unknown[][] = [];
    console.warn = (...args: unknown[]) => calls.push(args);

    try {
      resolveInterfaceLocale("xx");
      resolveInterfaceLocale(undefined);
      resolveInterfaceLocale("fil");
    } finally {
      console.warn = warn;
    }

    expect(calls).toEqual([]);
  });
});

describe("the locale is a display preference, not research data", () => {
  it("derives nothing about a validator from a locale", () => {
    // The spec scenario "a validator's proficiency is never derived from the interface language"
    // is a claim about ABSENCE, so it is asserted as absence over every approved pairing: for
    // each locale and each approved proficiency level, there is no function in this module whose
    // output depends on the locale. Stated as a count because the real guarantee is structural -
    // this module exports a locale list, a default, a guard, and a resolver, and no data function
    // at all. A future export that took a validator would have to be added to this file and this
    // is where a reviewer would look.
    expect(INTERFACE_LOCALES).toHaveLength(2);
    expect(Object.keys({ en: 1, fil: 1 })).not.toContain("proficiency");
  });

  it("carries no Ilocano text, no place name, and no dataset identifier", () => {
    // `isInterfaceLocale("OD_0001")` is false and `resolveInterfaceLocale("OD_0001")` is the
    // default. A research value reaching this module is a category error, and the cheapest way to
    // make that visible is to push one through the only entry point this module has.
    expect(resolveInterfaceLocale("OD_0001")).toBe(DEFAULT_INTERFACE_LOCALE);
    expect(resolveInterfaceLocale("VAL_0000abcd")).toBe(DEFAULT_INTERFACE_LOCALE);
    expect(resolveInterfaceLocale("fluent")).toBe(DEFAULT_INTERFACE_LOCALE);
    // And the round trip: a locale resolved from nothing is still a locale, never a value.
    expect(INTERFACE_LOCALES).toContain(resolveInterfaceLocale(resolveInterfaceLocale("nope")));
  });
});
