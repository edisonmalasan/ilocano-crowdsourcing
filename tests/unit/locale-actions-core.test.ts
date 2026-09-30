import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import type { InterfaceLocale } from "@/lib/domain/locale";
import { INTERFACE_LOCALES } from "@/lib/domain/locale";
import {
  runChangeInterfaceLocale,
  type LocaleChangeDependencies,
  type LocaleChangeOutcome,
} from "@/lib/i18n/locale-actions-core";

/**
 * The interface-locale Server Action's core.
 *
 * ============================================================================
 * WHAT IS PROVEN HERE, AND WHAT IS PROVEN AT THE TYPE LAYER INSTEAD
 * ============================================================================
 * Two of this file's claims are behavioural and belong in a test: a rejected payload writes
 * nothing, and an accepted one writes exactly the approved value. Those are observable.
 *
 * One is not. "The locale is never written to the research database" is a claim about ABSENCE -
 * about a call that is not made - and a test that counts today's calls cannot establish it, because
 * the mutation that breaks the guarantee is precisely the one that ADDS a repository to
 * `LocaleChangeDependencies`, and at that moment every behavioural assertion written against the
 * current call graph is still green.
 *
 * So that claim is pinned by `KeySetIsExactly` below, at the layer that can see a member which does
 * not exist yet. This is the same mechanism as the `AllocationRequest` key-set pin in
 * `tests/unit/domain-types.test.ts`, and for the same reason: absence is not observable at runtime.
 *
 * The two are stated together here on purpose. A type pin with no behavioural test is a shape
 * assertion; a behavioural test with no type pin is a snapshot. Together, "the dependency surface
 * has exactly one member and it is the cookie writer" and "that writer is called with the validated
 * locale and never on a rejected payload" cover both halves of the requirement.
 *
 * ============================================================================
 * WHY THE CORE IS IMPORTABLE AT ALL
 * ============================================================================
 * It begins with `import "server-only"`, which throws under Vitest because there is no React Server
 * Components runtime to satisfy it. The stub below is the established pattern in this repository
 * (`tests/unit/onboarding-routes.test.tsx` does the same) and the boundary it is NOT proving is
 * proved by `tests/unit/supabase-clients.test.ts`, which deliberately leaves the marker unstubbed.
 */

/** `server-only` exists to make a client import fail; it has nothing to say about these decisions. */
vi.mock("server-only", () => ({}));

/**
 * A recording cookie writer, and the array of calls it saw.
 *
 * A real function rather than a bare `vi.fn()` so the recorded value is the ARGUMENT and not a
 * wrapper, and so a test that forgets to assert the calls still fails on the empty array below.
 */
function recordingWriter(): {
  calls: InterfaceLocale[];
  deps: LocaleChangeDependencies;
} {
  const calls: InterfaceLocale[] = [];
  return {
    calls,
    deps: {
      setInterfaceLocaleCookie: async (locale: InterfaceLocale) => {
        calls.push(locale);
      },
    },
  };
}

/** A payload shaped like what a `<form>` submission actually produces. */
function formPayload(locale: unknown): FormData {
  const formData = new FormData();
  if (locale !== undefined) {
    formData.set("locale", locale as string);
  }
  return formData;
}

describe("an accepted locale change", () => {
  it.each(INTERFACE_LOCALES)("writes the approved value %s and reports it back", async (locale) => {
    const { calls, deps } = recordingWriter();

    const outcome = await runChangeInterfaceLocale({ locale }, deps);

    expect(outcome).toEqual({ status: "changed", locale });
    expect(calls).toEqual([locale]);
  });

  it("reports the value the schema approved rather than the one the request claimed", async () => {
    // The distinction matters if the schema ever grows a transform - a `z.enum` with a trim, say.
    // The outcome is built from the PARSED intent, so a caller logging it or revalidating from it
    // gets what was validated.
    const { calls, deps } = recordingWriter();

    const outcome = await runChangeInterfaceLocale({ locale: "fil" }, deps);

    if (outcome.status !== "changed") throw new Error("expected a change");
    expect(outcome.locale).toBe("fil");
    expect(calls[0]).toBe(outcome.locale);
  });

  it("awaits the write rather than firing it and reporting success", async () => {
    // The dependency is `Promise<void>` precisely so the core can await it. An un-awaited write
    // would report `changed` for a cookie that had not been stored, and the participant would be
    // told their language is Filipino on a page whose cookie still says English.
    let released = false;
    const observed: boolean[] = [];

    await runChangeInterfaceLocale(
      { locale: "fil" },
      {
        setInterfaceLocaleCookie: async () => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          released = true;
        },
      },
    );
    observed.push(released);

    expect(observed).toEqual([true]);
  });
});

describe("a rejected locale change", () => {
  it.each([
    ["a missing locale", {}],
    ["an absent locale field", { locale: undefined }],
    ["an empty value", { locale: "" }],
    ["an unapproved language", { locale: "xx" }],
    ["a region-qualified tag", { locale: "fil-PH" }],
    ["a differently-cased tag", { locale: "FIL" }],
    ["a value with surrounding whitespace", { locale: " fil " }],
    ["a legacy tag", { locale: "tl" }],
    ["a number", { locale: 1 }],
    ["null", { locale: null }],
    ["an array", { locale: ["fil"] }],
    ["an object", { locale: { value: "fil" } }],
    ["a prototype key", { locale: "constructor" }],
  ])("writes nothing at all for %s", async (_label, raw) => {
    const { calls, deps } = recordingWriter();

    const outcome = await runChangeInterfaceLocale(raw, deps);

    expect(outcome, "must not report a change").toEqual({ status: "failed", reason: "invalid" });
    // The load-bearing half. An outcome of `failed` with a call recorded would mean the page
    // re-rendered in the previous language while the cookie had already been overwritten.
    expect(calls).toEqual([]);
  });

  it("refuses a payload carrying a second field rather than stripping it", async () => {
    // `strictObject`, not a bare field check. A silently stripped field is indistinguishable from
    // outside the request from a successful one whose extra values happened not to matter, and the
    // value that would be stripped is a research datum some future form might send.
    const { calls, deps } = recordingWriter();

    const outcome = await runChangeInterfaceLocale(
      { locale: "fil", ilocanoProficiency: "fluent" },
      deps,
    );

    expect(outcome).toEqual({ status: "failed", reason: "invalid" });
    expect(calls).toEqual([]);
  });

  it("refuses a payload that smuggles in a validator identifier", async () => {
    // The same guard, aimed at the specific abuse the spec forbids. If a future change widened the
    // schema, this is the payload that would be accepted, and accepting it would be the beginning
    // of a locale write that also touches research data.
    const { calls, deps } = recordingWriter();

    await runChangeInterfaceLocale(
      { locale: "fil", validatorId: "VAL_0000abcd", datasetEntryId: "OD_0001" },
      deps,
    );

    expect(calls).toEqual([]);
  });

  it("names no value in a failed outcome, so nothing can be left behind", async () => {
    const outcome: LocaleChangeOutcome = await runChangeInterfaceLocale(
      { locale: "xx" },
      recordingWriter().deps,
    );

    expect(Object.keys(outcome).sort()).toEqual(["reason", "status"]);
    expect(JSON.stringify(outcome)).not.toMatch(/xx|fil|en/);
  });

  it("accepts a FormData the wrapper builds, after the wrapper has narrowed it", async () => {
    // The core takes a domain payload; the `<form>` produces a `FormData`. The wrapper lifts the
    // one field out, and the core re-validates it. This assertion covers the half of that seam a
    // unit test of the core alone cannot: that the field name the form actually emits is the one
    // the wrapper reads. The wrapper's half is in `locale-actions-wrapper.test.ts`.
    const { calls, deps } = recordingWriter();

    const lifted = { locale: formPayload("fil").get("locale") };
    await runChangeInterfaceLocale(lifted, deps);

    expect(calls).toEqual(["fil"]);
  });
});

describe("the write-intake boundary is real, not decorative", () => {
  it("reports a schema rejection as `invalid` rather than throwing at the participant", async () => {
    // A Server Action that threw on a malformed payload would surface a Next.js error boundary in
    // place of the page. The refusal has to be a value.
    const { calls, deps } = recordingWriter();

    await expect(runChangeInterfaceLocale({ locale: [] }, deps)).resolves.toMatchObject({
      status: "failed",
    });
    expect(calls).toEqual([]);
  });

  it("propagates a writer's own failure instead of calling it a rejected request", async () => {
    // The distinction the core's header makes: a throw that is not a `WriteIntentError` is a BUG -
    // in the schema, or in the cookie API - and reporting it as `invalid` would tell an operator
    // the participant sent something wrong. The wrapper catches it and logs; the core lets it out.
    const deps: LocaleChangeDependencies = {
      setInterfaceLocaleCookie: async () => {
        throw new Error("cookies() called outside a request scope");
      },
    };

    await expect(runChangeInterfaceLocale({ locale: "fil" }, deps)).rejects.toThrow(
      /outside a request scope/,
    );
  });
});

/**
 * THE GUARANTEE: the locale is never written to the research database.
 *
 * Three independent mechanisms, because the requirement is a `must` in a specification about
 * research data and one mechanism is a habit:
 *
 *   1. The dependency interface has exactly one member, and it writes a cookie. There is no
 *      repository to reach. Below as a type assertion.
 *   2. No module under `src/lib/i18n/` imports a repository, the Supabase client, or the server
 *      environment. Below as a source scan, because that is the only way to see the WRAPPER too -
 *      the core's interface could stay clean while the wrapper constructed a client and passed it
 *      in.
 *   3. The behaviour above: an accepted change produces exactly one call, on a cookie writer.
 */
/**
 * Comment removal, as a STRING transformation, so it can be controlled directly below.
 *
 * PRESENT BECAUSE OF A REAL FAILURE, and the failure is the interesting part: the first version of
 * the import scan ran on the raw file and failed on `actions.ts` for containing the string
 * `getServerEnv` - which it did, inside the header comment explaining why that function is
 * deliberately NOT called. The guard was reporting a prose sentence.
 *
 * That is the same class of defect as the inverse case already recorded in this repository, where a
 * guard was SATISFIED by a comment: both are a substring anchor reading prose instead of code, and
 * both make the check worse than useless, because a check that cries wolf over a comment is a check
 * somebody will delete. So the scan reads code only.
 *
 * KNOWN LIMIT, stated because a silent one is worse: this is a textual strip, so a `//` inside a
 * string literal would be treated as a comment and truncate the rest of that line. None of the
 * files in this directory contain a URL or a path in a string, and the control assertion below
 * proves the strip removes comment text rather than quietly removing nothing.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\/\/.*$/gm, " ");
}

/** The comment-stripped source of a file. */
function code(file: string): string {
  return stripComments(readFileSync(file, "utf8"));
}

/**
 * Everything that could reach the research database, with a specifier that would trigger each.
 *
 * The specifier is carried alongside the pattern for one reason: the control assertion below needs
 * a synthetic source that MATCHES each pattern, and inventing one per pattern at the call site would
 * be five chances to write a control that proves the wrong thing. Pairs make the two inseparable.
 *
 * `supabase` as a bare word is included because a client can be constructed through a factory
 * whose name does not contain it, and a renamed import would otherwise slip past.
 */
const FORBIDDEN_IMPORTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/from "@\/lib\/repositories/, "@/lib/repositories/factory"],
  [/from "@supabase\//, "@supabase/supabase-js"],
  [/from "@\/lib\/env\/server"/, "@/lib/env/server"],
  [/\bgetServerEnv\b/, "getServerEnv"],
  [/\bcreateAdminClient\b/, "createAdminClient"],
  [/\bsupabase\b/, "supabase"],
];

describe("the locale never reaches the research database", () => {
  /**
   * Exact key set, not "contains". `keyof` alone would pass if a repository were ADDED, which is
   * the direction the guarantee fails in.
   */
  type KeySetIsExactly<Actual, Expected extends keyof Actual> = [keyof Actual] extends [Expected]
    ? [Expected] extends [keyof Actual]
      ? true
      : never
    : never;

  /** Adding ANY second member fails this line, whatever it is called. */
  const DEPENDENCY_SURFACE_IS_EXACTLY_THE_COOKIE_WRITER: KeySetIsExactly<
    LocaleChangeDependencies,
    "setInterfaceLocaleCookie"
  > = true;

  it("offers exactly one dependency, and it is the cookie writer", () => {
    // The runtime mirror of the assertion above, so the file is not only asserting a compiler
    // behaviour. A `true` here with an empty dependency object would satisfy the type check
    // vacuously if the type were ever declared as an index signature.
    expect(DEPENDENCY_SURFACE_IS_EXACTLY_THE_COOKIE_WRITER).toBe(true);
    expect(Object.keys(recordingWriter().deps)).toEqual(["setInterfaceLocaleCookie"]);
  });

  it("would fail type-check if a repository were added to the dependency interface", () => {
    // A CONTROL, in the only sense that matters for a type assertion: the shape that must fail.
    // `@ts-expect-error` reports `TS2578` ("unused directive") if the line stops being an error,
    // so this is a real falsification test - but only if the error it suppresses is the one we
    // mean. The next assertion is the positive control beside it.
    const widened: LocaleChangeDependencies = {
      setInterfaceLocaleCookie: async () => {},
      // @ts-expect-error - a second member fails the exact-key-set assertion in the module header.
      validatorRepository: { create: async () => ({}) },
    };

    expect(Object.keys(widened)).toHaveLength(2);
  });

  it("accepts a dependency carrying only the cookie writer, as the control for the one above", () => {
    // Without this, a `LocaleChangeDependencies` that rejected EVERY object would make the
    // `@ts-expect-error` above pass for the wrong reason - and a guard that can be satisfied by a
    // type that rejects everything is not a guard.
    const valid: LocaleChangeDependencies = { setInterfaceLocaleCookie: async () => {} };

    expect(Object.keys(valid)).toEqual(["setInterfaceLocaleCookie"]);
  });

  it("has no repository, client, or environment import anywhere in the i18n layer", () => {
    // The scan covers every file, not just the two the tests import, because the wrapper is the
    // place a client would be constructed: the core's interface can stay clean while the wrapper
    // reaches around it.
    //
    // `server-only` and `next/*` are ALLOWED. The first is the marker that says "this must not run
    // in a browser", and the second is the server's own request APIs - a cookie cannot be read
    // without one. What must not appear is anything that can reach a database.
    const directory = join(process.cwd(), "src", "lib", "i18n");
    const files = readdirSync(directory)
      .filter((name) => name.endsWith(".ts"))
      .sort();

    // The EXACT set, not a floor. A floor is the usual defence against a `readdirSync` pointed at a
    // renamed directory - which yields an empty array, over which every `toEqual([])` passes - and it
    // caught a real change here: deleting `locale-context.ts` dropped the count from 5 to 4 and took
    // the floor with it. Writing the filenames down instead means an addition is a deliberate edit to
    // this list and a deletion cannot pass unnoticed, which is the property the floor was standing in
    // for and could not provide.
    expect(files).toEqual([
      "actions.ts",
      "copy.ts",
      "interface-locale-cookie.ts",
      "locale-actions-core.ts",
    ]);

    for (const file of files) {
      const contents = code(join(directory, file));
      for (const [pattern] of FORBIDDEN_IMPORTS) {
        expect(contents, `${file} must not reference ${pattern.source}`).not.toMatch(pattern);
      }
    }
  });

  it("proves the import scan can actually catch an import", () => {
    // THE CONTROL for the scan above, and without it the scan is unfalsifiable: a pattern list
    // that matched nothing would pass identically. Each forbidden pattern is run against a
    // synthetic source that DOES contain it, so a pattern that stopped matching - because it was
    // written for the wrong module specifier, or because a refactor changed the import style -
    // fails here rather than quietly allowing the real thing.
    for (const [pattern, specifier] of FORBIDDEN_IMPORTS) {
      const synthetic = stripComments(`import { thing } from "${specifier}";\nvoid thing;`);

      expect(synthetic, `the scan cannot detect ${pattern.source}`).toMatch(pattern);
    }
  });

  it("proves the comment strip removes prose rather than removing nothing", () => {
    // The other control. `stripComments` is what makes the scan above meaningful, and a strip that
    // silently returned its input unchanged would turn the scan back into the version that failed
    // on a comment - with the failure now hidden rather than visible.
    const withProse = [
      "/**",
      " * We deliberately do not call getServerEnv here.",
      " */",
      'import { revalidatePath } from "next/cache";',
    ].join("\n");

    // The precondition is asserted first: if the prose were not there, stripping it would prove
    // nothing, and a test that passes on an absent input is a test that passes on anything.
    expect(withProse).toMatch(/getServerEnv/);
    expect(stripComments(withProse)).not.toMatch(/getServerEnv/);
    // And that the strip is not simply deleting the file.
    expect(stripComments(withProse)).toMatch(/revalidatePath/);
  });

  it("keeps the locale out of the write-intake payload, which is the only data that leaves the core", async () => {
    // Belt and braces on the payload itself: the request that produces a cookie write is exactly
    // `{ locale }`, so there is no field in it that could be a research datum even in principle.
    const { calls, deps } = recordingWriter();

    const outcome = await runChangeInterfaceLocale({ locale: "fil" }, deps);

    if (outcome.status !== "changed") throw new Error("expected a change");
    expect(Object.keys(outcome).sort()).toEqual(["locale", "status"]);
    expect(calls).toEqual(["fil"]);
    expect(JSON.stringify(calls)).not.toMatch(/OD_|VAL_|fluent/);
  });
});
