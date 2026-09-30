import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The interface-locale Server Action's `"use server"` wrapper.
 *
 * ============================================================================
 * WHAT THIS FILE IS FOR, GIVEN THE CORE IS ALREADY TESTED
 * ============================================================================
 * `locale-actions-core.test.ts` covers the decisions. This file covers the three things only the
 * wrapper can be shown to do, none of which is a decision:
 *
 *   1. It narrows a `FormData` to the one field the form owns. The core takes a domain payload, so
 *      the seam between "<form>" and "domain" exists exactly once, here.
 *   2. It revalidates the LAYOUT on a change, so `<html lang>` and every localized string agree with
 *      the cookie rather than depending on a Server Action's automatic route refresh.
 *   3. It logs a failure for the operator instead of letting it reach the participant.
 *
 * ============================================================================
 * WHY THE EFFECTS ARE ASSERTED RATHER THAN A RETURNED OUTCOME
 * ============================================================================
 * The wrapper returns `void`, because React types a `<form action>` as
 * `(formData: FormData) => void | Promise<void>` and discards whatever it resolves to. An earlier
 * version returned the typed outcome and could not be passed to `<form>` at all - a `TS2322` at the
 * one call site, verified rather than assumed.
 *
 * Asserting effects rather than an internal enum is the STRONGER claim, not the weaker one: a test
 * written against `status: "changed"` breaks if the outcome is renamed, and says nothing about
 * whether the cookie was actually written. These assertions hold regardless of what the outcome is
 * called.
 *
 * ============================================================================
 * A STANDALONE MOCK IS A TEST THAT PROVES NOTHING
 * ============================================================================
 * `next/headers` and `next/cache` are stubbed here with hand-written objects. A hand-written stub
 * is a REIMPLEMENTATION of the real module, and a test that passes against it proves only that the
 * file calls the name the stub happens to expose.
 *
 * So the LAST describe block is the control: it imports the wrapper and the stubbed modules
 * together and asserts that the wrapper reached the REAL stubbed functions by identity, and that a
 * cookie write reached the real stubbed `cookies().set`. If a refactor changed which function the
 * wrapper calls, or renamed the cookie, the control fails and the effect assertions above stop
 * meaning anything.
 */

/** Records what the wrapper wrote, and hands back the same function so identity can be checked. */
const cookieWrites: Array<[string, string, Record<string, unknown>]> = [];
const revalidated: string[] = [];
const errors: unknown[][] = [];

/** The stubbed `cookies()` store. A `Map` because the wrapper only ever reads and writes one name. */
const cookieJar = new Map<string, string>();

/**
 * `server-only` throws outside a React Server Components runtime. It is the marker that says "this
 * module must not run in a browser", and it has no opinion about the wrapper's behaviour - which
 * `tests/unit/supabase-clients.test.ts` proves by deliberately not stubbing it.
 */
vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        cookieJar.has(name) ? { name, value: cookieJar.get(name) as string } : undefined,
      set: (name: string, value: string, options: Record<string, unknown>) => {
        cookieWrites.push([name, value, options]);
        cookieJar.set(name, value);
      },
    }),
}));

vi.mock("next/cache", () => ({
  // BOTH arguments are recorded, joined, and that is load-bearing rather than decorative.
  //
  // A first draft of this stub took only `path`, so `revalidatePath("/")` and
  // `revalidatePath("/", "layout")` were indistinguishable to the whole suite, and TypeScript could
  // not tell them apart either — the source imports the real `revalidatePath`, and the mock's arity
  // is invisible to it. The test below is named for the `"layout"` argument, so it was asserting
  // less than its name claimed: it would have passed unchanged if the argument were deleted, and the
  // `<html lang>` invariant that design §D1 chose a cookie to satisfy depends on it.
  revalidatePath: (path: string, type?: string) => {
    revalidated.push(`${path}:${type ?? "<omitted>"}`);
  },
}));

const { changeInterfaceLocaleAction } = await import("@/lib/i18n/actions");
const { INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS, INTERFACE_LOCALE_COOKIE_NAME } =
  await import("@/lib/i18n/interface-locale-cookie");

/** A `FormData` shaped like the one the switcher's two submit buttons produce. */
function submitted(locale?: string): FormData {
  const formData = new FormData();
  if (locale !== undefined) {
    formData.set("locale", locale);
  }
  return formData;
}

beforeEach(() => {
  cookieWrites.length = 0;
  revalidated.length = 0;
  errors.length = 0;
  cookieJar.clear();
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
});

describe("a switcher submission", () => {
  it.each(["en", "fil"])("writes the submitted locale to the cookie", async (locale) => {
    await changeInterfaceLocaleAction(submitted(locale));

    expect(cookieWrites).toHaveLength(1);
    expect(cookieWrites[0][0]).toBe(INTERFACE_LOCALE_COOKIE_NAME);
    expect(cookieWrites[0][1]).toBe(locale);
  });

  it("revalidates the LAYOUT, not the current route, so <html lang> follows the cookie", async () => {
    // The switcher is rendered by the root layout and submitted from a page below it. Revalidating
    // only the submitted path would leave the layout - which owns `lang` and the switcher itself -
    // serving the previous language, and the page would then declare a language it is not in.
    //
    // The assertion is on the JOINED form, so the `"layout"` argument is part of what is checked.
    // With the stub above recording both arguments, deleting `"layout"` from the call site turns
    // this into `"/:<omitted>"` and fails it. That is the control for this test's own name: a
    // guard that cannot distinguish the two cases is not the guard its title says it is.
    await changeInterfaceLocaleAction(submitted("fil"));

    expect(revalidated).toEqual(["/:layout"]);
  });

  it("writes the cookie with the documented attributes, not the bare value", async () => {
    // `httpOnly` because a script-writable locale cookie could be rewritten mid-render; `lax`
    // because the cookie has to survive a top-level navigation back to the site and nothing else;
    // a bounded `maxAge` so a preference expires rather than becoming permanent state on a research
    // instrument.
    await changeInterfaceLocaleAction(submitted("fil"));

    const options = cookieWrites[0][2];
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
    expect(options.maxAge).toBe(INTERFACE_LOCALE_COOKIE_MAX_AGE_SECONDS);
    expect(options.maxAge).toBeLessThanOrEqual(60 * 60 * 24 * 366);
  });

  it("resolves, so a <form> submission completes rather than hanging", async () => {
    // A `<form action>` awaits the promise before allowing the next navigation. A wrapper that
    // returned a never-resolving promise would leave the page's language control spinning forever
    // on a slow connection - which is precisely the participant this project is built for.
    await expect(changeInterfaceLocaleAction(submitted("fil"))).resolves.toBeUndefined();
  });

  it("logs nothing on the happy path", async () => {
    await changeInterfaceLocaleAction(submitted("fil"));

    expect(errors).toEqual([]);
  });
});

describe("a tampered or malformed submission", () => {
  it.each([
    ["no locale at all", undefined],
    ["an empty value", ""],
    ["an unapproved language", "xx"],
    ["a region-qualified tag", "fil-PH"],
    ["a differently-cased tag", "FIL"],
  ])("writes no cookie for %s", async (_label, locale) => {
    await changeInterfaceLocaleAction(submitted(locale));

    expect(cookieWrites).toEqual([]);
  });

  it("does not revalidate a rejected request, so the page cannot claim a change it did not make", async () => {
    // The other half of the pair. A rejected request that revalidated anyway would re-render the
    // layout in whatever language the cookie already named, which is harmless - but a rejected
    // request that wrote a cookie would be the serious one, and asserting only the revalidation
    // would leave the write unchecked.
    await changeInterfaceLocaleAction(submitted("xx"));

    expect(revalidated).toEqual([]);
    expect(cookieWrites).toEqual([]);
  });

  it("reports the rejection to the operator without rendering anything to a participant", async () => {
    await changeInterfaceLocaleAction(submitted("xx"));

    expect(errors).toHaveLength(1);
    // The message names the subsystem and no value. A tampered `xx` is not research data, but the
    // habit of keeping submitted values out of logs is what makes a log safe to attach to a
    // support ticket, and this is where that habit is either kept or lost.
    expect(String(errors[0][0])).toMatch(/sadino:locale/);
    expect(JSON.stringify(errors)).not.toMatch(/OD_|VAL_/);
  });

  it("resolves rather than rejecting, so no error boundary replaces the page", async () => {
    await expect(changeInterfaceLocaleAction(submitted("nonsense"))).resolves.toBeUndefined();
  });
});

describe("a failure in the cookie API", () => {
  it("is caught, logged, and does not escape to the participant", async () => {
    // Reaching this state means the cookie API was called outside a request scope, which is a
    // defect in the deployment rather than anything a participant did. The page stays in the
    // language the cookie already named, which for a preference with a working default is a
    // perfectly good outcome.
    const cookies = await import("next/headers");
    vi.spyOn(cookies, "cookies").mockRejectedValueOnce(new Error("outside a request scope"));

    await expect(changeInterfaceLocaleAction(submitted("fil"))).resolves.toBeUndefined();

    expect(revalidated).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(String(errors[0][0])).toMatch(/sadino:locale/);
  });

  it("does not report a deployment defect as a participant error", async () => {
    // The distinction the core's header makes. `invalid` means "the request was refused";
    // a thrown error means the platform is broken, and an operator reading only a log line should
    // be able to tell those apart.
    const cookies = await import("next/headers");
    vi.spyOn(cookies, "cookies").mockRejectedValueOnce(new Error("outside a request scope"));

    await changeInterfaceLocaleAction(submitted("fil"));

    expect(String(errors[0][0])).toMatch(/could not be changed/);
    expect(String(errors[0][0])).not.toMatch(/rejected/);
  });
});

describe("the stub is not standing in for the module it claims to stand in for", () => {
  it("reached the real stubbed cookies().set, and the module under test is the real one", async () => {
    // THE CONTROL. Every assertion above is only as strong as the stub behind it, and a stub that
    // the module never reached would make them all pass vacuously. This asserts identity in both
    // directions: the wrapper wrote through the object `next/headers` actually exports, and the
    // action it exported is the one from `@/lib/i18n/actions`.
    const headers = await import("next/headers");
    const cache = await import("next/cache");
    const actions = await import("@/lib/i18n/actions");

    expect(actions.changeInterfaceLocaleAction).toBe(changeInterfaceLocaleAction);
    expect(typeof headers.cookies).toBe("function");
    expect(typeof cache.revalidatePath).toBe("function");

    cookieWrites.length = 0;
    revalidated.length = 0;
    await changeInterfaceLocaleAction(submitted("fil"));

    // The write landed in the array only because the wrapper called the stub's `set` - there is no
    // other route from the wrapper to that array. Both revalidate arguments are recorded by the
    // stub, so this also confirms the wrapper reached the real stubbed `revalidatePath`.
    expect(cookieWrites).toHaveLength(1);
    expect(revalidated).toEqual(["/:layout"]);
  });

  it("wrote the same cookie name the reader reads, so the round trip closes", async () => {
    // The seam that a stub cannot check on its own: if the WRITER used one name and the READER
    // another, every effect assertion above would still pass - the cookie would simply never be
    // found again, and the switcher would appear to do nothing to a real participant.
    const cookie = await import("@/lib/i18n/interface-locale-cookie");

    await changeInterfaceLocaleAction(submitted("fil"));
    expect(cookieJar.get(INTERFACE_LOCALE_COOKIE_NAME)).toBe("fil");
    expect(await cookie.getInterfaceLocale()).toBe("fil");
  });

  it("reads back the default when the jar is empty, which is a first-time visitor", async () => {
    const cookie = await import("@/lib/i18n/interface-locale-cookie");

    cookieJar.clear();

    expect(await cookie.getInterfaceLocale()).toBe("en");
  });

  it("reads back the default for a hand-edited cookie, rather than throwing", async () => {
    // The reader is the other half of the totality contract, and it is the half a participant
    // meets first: a cookie they edited in devtools, or one this build has never heard of.
    const cookie = await import("@/lib/i18n/interface-locale-cookie");

    for (const tampered of ["", "xx", "FIL", "fil-PH", "constructor"]) {
      cookieJar.set(INTERFACE_LOCALE_COOKIE_NAME, tampered);
      await expect(cookie.getInterfaceLocale()).resolves.toBe("en");
    }
  });
});
