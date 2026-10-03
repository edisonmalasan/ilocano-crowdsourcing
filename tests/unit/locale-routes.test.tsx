import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import NotFound from "@/app/not-found";
import ReadyPage from "@/app/ready/page";
import StartPage from "@/app/start/page";
import { LocaleSwitcher, localeChoiceClasses } from "@/components/i18n/locale-switcher";
import { ENGLISH_COPY, FILIPINO_COPY, PROFICIENCY_LABEL_KEYS, type CopyKey } from "@/lib/i18n/copy";
import { ILOCANO_PROFICIENCY_CHOICES } from "@/schemas/validator";

/**
 * The interface, in Filipino, and the switcher that gets a participant there.
 *
 * ============================================================================
 * WHY THE FILIPINO RENDERS DRIVE A REAL COOKIE, AND WHY THAT MATTERS
 * ============================================================================
 * The four routes each await `getInterfaceLocale()` themselves, so a route's language is whatever
 * the cookie says. `onboarding-routes.test.tsx` stubs that cookie as ABSENT and therefore exercises
 * the English default - which is the correct file for that, because a first-time participant has no
 * cookie.
 *
 * This file is the other half: the stub returns `"fil"`, so what is asserted is what a participant
 * who has chosen Filipino actually receives, read through the same seam the server uses. Injecting
 * a `Translate` function directly, or passing a locale as a prop, would have made every assertion
 * here pass even if the page ignored the cookie - and an ignored cookie means the switcher does
 * nothing to a real participant, which is the entire feature.
 *
 * A CONTROL sits beside every one of these: the same page is rendered with the cookie removed and
 * asserted to be the English rendering. So neither file's stub can be the only thing making its
 * assertions true.
 *
 * ============================================================================
 * `renderToStaticMarkup` AND THE CLAIMS IT CANNOT SUPPORT
 * ============================================================================
 * It runs no effect, no click handler, and no transition. So this file can say NOTHING about:
 *
 *   - what the switcher does when pressed. That is `locale-actions-wrapper.test.ts`.
 *   - whether a page is rendered in Filipino on the FIRST PAINT in a browser. That requires a
 *     deployment, and it is not claimed here. What IS claimed is that the server-rendered HTML is
 *     already Filipino - which is the same claim one layer earlier, and is the part a client round
 *     trip would have got wrong.
 *   - the layout itself, which is `async` and reads a cookie. It is asserted by source inspection
 *     below, because rendering it would need a request scope and a `next/font` runtime.
 */

/** `server-only` throws without a Server Components runtime; the client islands import it. */
vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    refresh: () => {},
    back: () => {},
  }),
}));

/**
 * The stored preference, as the SERVER sees it. A mutable slot rather than a constant, because the
 * two halves of this file need opposite values: a stored preference and no preference at all.
 *
 * `getInterfaceLocale` is the only thing that reads this, and it is the same function the deployed
 * server calls - which is the point. A test that handed a page a `Translate` function directly would
 * assert the catalog, not the wiring.
 */
let localeCookie: string | undefined;

/**
 * The locale cookie, as the SERVER sees it.
 *
 * The stub answers for the REAL cookie name, read from the source file rather than written out.
 * `vi.mock` factories are hoisted above imports, so a factory that `await import`ed
 * `interface-locale-cookie` to get the name would deadlock: that module imports `next/headers`,
 * which is the module being mocked, and the factory would be waiting on a resolution that waits on
 * the factory. That deadlock HANGS the run rather than failing it, which is worth knowing before
 * anyone reintroduces the import.
 *
 * So the name is read by scanning the source, and a CONTROL asserts the scan still finds it - a
 * scan that quietly matched nothing would leave the stub answering for no name at all, every route
 * falling back to English, and every "renders no English prose" assertion below failing for a
 * reason that has nothing to do with localization.
 */
vi.mock("next/headers", () => {
  const { INTERFACE_LOCALE_COOKIE_NAME } = readCookieNameFromSource();

  return {
    cookies: () =>
      Promise.resolve({
        get: (name: string) =>
          name === INTERFACE_LOCALE_COOKIE_NAME && localeCookie !== undefined
            ? { name, value: localeCookie }
            : undefined,
      }),
  };
});

/**
 * The cookie name, taken from the module that owns it.
 *
 * Anchored on the declaration and its terminator rather than on the bare string, because a bare
 * substring is satisfied by a comment that names the same cookie - which is exactly the defect this
 * repository has already made once, where a guard matched prose and reported coverage it was not
 * providing.
 */
function readCookieNameFromSource(): { INTERFACE_LOCALE_COOKIE_NAME: string } {
  const source = readFileSync(
    join(process.cwd(), "src", "lib", "i18n", "interface-locale-cookie.ts"),
    "utf8",
  );
  const declared = /^export const INTERFACE_LOCALE_COOKIE_NAME = "([^"]+)";$/m.exec(source);

  if (declared === null) {
    throw new Error(
      "INTERFACE_LOCALE_COOKIE_NAME could not be read from the source; the next/headers stub " +
        "would answer for no name and every Filipino assertion in this file would be vacuous",
    );
  }

  return { INTERFACE_LOCALE_COOKIE_NAME: declared[1] };
}

/**
 * Renders a route page with the locale cookie set to `locale`, then restores the jar.
 *
 * The page components are `async` because they await the cookie, and `renderToStaticMarkup` cannot
 * await a component, so the await happens here. The restore is in a `finally` because a failed
 * assertion in the middle of a suite must not leave `"fil"` installed for every later render.
 */
async function renderIn(
  locale: "en" | "fil" | undefined,
  Page: () => Promise<React.ReactElement>,
): Promise<string> {
  const previous = localeCookie;
  localeCookie = locale;
  try {
    return renderToStaticMarkup(await Page());
  } finally {
    localeCookie = previous;
  }
}

/** Every public route, as the component rather than as a hand-written list. */
const ROUTES = [
  { path: "/", Page: HomePage },
  { path: "/start", Page: StartPage },
  { path: "/ready", Page: ReadyPage },
  { path: "not-found", Page: NotFound },
] as const;

/**
 * The catalog keys making up each route's own `h1`, in order.
 *
 * Per route, and named explicitly. The routes do NOT share a heading string - three of them open
 * with `common.beforeYouStart` and `not-found` does not - so a single shared key is a key that is
 * wrong for one of the four, which is how a control turns into a source of false failures.
 *
 * A LIST rather than one key, because the landing page's `h1` is two catalog strings around a
 * `<br>`. With the markup stripped the heading text is the two strings concatenated, so the probe
 * compares against the concatenation and not against either string alone.
 */
const HEADING_KEYS = {
  "/": ["landing.hero.title1", "landing.hero.title2"],
  "/start": ["common.beforeYouStart"],
  "/ready": ["ready.title"],
  "not-found": ["notFound.title"],
} as const satisfies Record<
  (typeof ROUTES)[number]["path"],
  readonly (keyof typeof ENGLISH_COPY)[]
>;

/**
 * The expected heading TEXT for a route: its catalog strings, concatenated.
 *
 * Typed against `CopyKey` rather than `string` on purpose. A first draft took `readonly string[]` and
 * then indexed the catalog with it, which widens the key to `string` and fails with `TS7053` - and
 * the fix that makes it compile (`as` casts, or a widened parameter) is exactly the fix that would
 * let a typo'd key through. The key type is the point: it is the same exhaustiveness the catalog
 * itself is pinned by, reached from the test side.
 */
function headingText(catalog: Record<keyof typeof ENGLISH_COPY, string>, keys: readonly CopyKey[]) {
  return keys.map((key) => catalog[key]).join("");
}

/**
 * The route's `h1`, read out of the markup rather than assumed from a component.
 *
 * Tags are stripped, and that is not cosmetic: the landing page's `h1` wraps two catalog strings
 * around a `<br>`, so a raw capture would be `"Check the Ilocano<br/>Listen for what doesn't fit"`
 * and would match neither catalog value. Stripping makes the probe "the heading's TEXT", which is
 * the thing being compared.
 */
function headingOf(html: string): string {
  const match = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  if (match === null) {
    throw new Error(`no h1 in the rendered route: ${html.slice(0, 200)}`);
  }
  return match[1].replace(/<[^>]*>/g, "");
}

describe("every public route renders its copy in the requested language", () => {
  it.each(ROUTES)(
    "$path produces different markup in English and in Filipino",
    async ({ Page }) => {
      // THE CENTRAL CLAIM, and it is deliberately coarse. Two languages producing the same markup
      // would mean the locale reached nothing - a wiring bug that every finer-grained assertion in
      // this file would happily sit on top of, because they all look for Filipino strings that the
      // English render must therefore not contain.
      expect(await renderIn("en", Page)).not.toBe(await renderIn("fil", Page));
    },
  );

  it.each(ROUTES)(
    "$path reads the cookie rather than defaulting to English",
    async ({ path, Page }) => {
      // THE CONTROL for every assertion below, and the reason this file cannot pass vacuously.
      //
      // Without a stored preference the routes must render the approved English, which is what a
      // first-time participant is served. So an assertion of the form "the Filipino render does not
      // contain X" is only meaningful if the same render, with the cookie removed, is the English
      // that does contain X. Asserted per route here rather than once, because a route that ignored
      // the cookie would render English in BOTH renders and quietly satisfy the not-contains checks.
      //
      // The probe is the route's OWN `h1`, named per route rather than picked from the catalog at
      // runtime. A first draft used one shared key and failed on `not-found`, which is the only route
      // with no `common.beforeYouStart` heading - and the useful lesson is that a shared probe only
      // works on routes that happen to share a string, so each route names its own.
      const filipino = await renderIn("fil", Page);
      const absent = await renderIn(undefined, Page);

      expect(absent).not.toBe(filipino);
      expect(headingOf(absent)).toBe(headingText(ENGLISH_COPY, HEADING_KEYS[path]));
      expect(headingOf(filipino)).toBe(headingText(FILIPINO_COPY, HEADING_KEYS[path]));
    },
  );

  it.each(ROUTES)("$path renders no English prose in the Filipino rendering", async ({ Page }) => {
    // A coarse backstop, and the sentence-level assertions below are what give it teeth. A route
    // that localized its heading and left its body in English would pass every "contains the
    // Filipino string" assertion below it, so this is the assertion that catches a HALF-localized
    // page - the exact failure `design.md` D3 says must not ship.
    const html = await renderIn("fil", Page);

    // The twelve longest approved English strings, checked individually. A long one is used because
    // a short word ("Continue", "Ready") could legitimately appear inside a Filipino sentence or
    // inside a proper noun, and a substring collision would make the check cry wolf.
    const longestEnglish = Object.values(ENGLISH_COPY)
      .sort((a, b) => b.length - a.length)
      .slice(0, 12);

    for (const sentence of longestEnglish) {
      expect(html, `untranslated English in the Filipino render: "${sentence}"`).not.toContain(
        sentence,
      );
    }
  });

  it("finds the four routes it expects, so a rename fails loudly instead of vacuously", () => {
    // The same reason `onboarding-routes.test.tsx` reads the App Router directory. A hand-written
    // list of routes is a second inventory that keeps asserting a deleted route exists.
    const directories = readdirSync(join(process.cwd(), "src", "app"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `/${entry.name}`);

    expect(directories).toEqual(expect.arrayContaining(["/start", "/ready"]));
    expect(ROUTES).toHaveLength(4);
  });
});

describe("the screening screen, in both languages", () => {
  it("asks the same question of the same five options", async () => {
    const { ScreeningForm } = await import("@/app/start/screening-form");
    const english = renderToStaticMarkup(<ScreeningForm locale="en" />);
    const filipino = renderToStaticMarkup(<ScreeningForm locale="fil" />);

    // The question is localized.
    expect(english).toContain("How comfortable are you with Ilocano?");
    expect(filipino).toContain("Gaano ka komportable sa Ilocano?");
    expect(filipino).not.toContain("How comfortable are you with Ilocano?");
  });

  it("offers exactly the same five options, in the same order, in both languages", async () => {
    // The requirement that the locale is presentation only, stated as a comparison of the two
    // renderings.
    //
    // A FACT ABOUT THE MARKUP WORTH RECORDING, because the obvious assertion does not work: the
    // radio buttons carry NO `value` attribute. `AnswerGroup` holds the machine-readable value in
    // React state and passes it to `onChange`; nothing renders it to the DOM. So there is no
    // attribute to read and an earlier draft of this test that looked for one was checking nothing
    // - it matched zero and compared zero to five, which fails, but for a reason that has nothing
    // to do with localization.
    //
    // What IS observable is the LABEL sequence, and it is observed per language rather than by
    // comparing the two whole renderings, so a route showing four options in one language and five
    // in the other fails on the count instead of passing.
    const { ScreeningForm } = await import("@/app/start/screening-form");
    const expectedValues = ILOCANO_PROFICIENCY_CHOICES.map((choice) => choice.value);

    const labelsIn = async (locale: "en" | "fil"): Promise<string[]> => {
      const html = renderToStaticMarkup(<ScreeningForm locale={locale} />);
      return [...html.matchAll(/<span class="block">([^<]*)<\/span>/g)].map((match) => match[1]);
    };

    expect(await labelsIn("en")).toEqual(
      expectedValues.map((value) => ENGLISH_COPY[PROFICIENCY_LABEL_KEYS[value]]),
    );
    expect(await labelsIn("fil")).toEqual(
      expectedValues.map((value) => FILIPINO_COPY[PROFICIENCY_LABEL_KEYS[value]]),
    );
  });

  it("submits the VALUE, never the label, as the stored proficiency", async () => {
    // `tasks.md` 6.3, and the part the rendered markup above cannot reach.
    //
    // The two halves are pinned separately and both matter: `value: choice.value` is what gets
    // stored, and `label: t(PROFICIENCY_LABEL_KEYS[choice.value])` is what gets rendered. A
    // component that passed the localized label as the value would store "Madaling gamitin" as a
    // proficiency level - a fabricated research datum in a database column with a vocabulary check
    // - and a component that passed the value as the label would show a participant "fluent".
    //
    // This is a source scan, and the limitation is stated: it proves the two properties are wired
    // the way they are written, not that `onChange` receives them. What it does prove is that the
    // localized label and the machine-readable value are DIFFERENT EXPRESSIONS at the call site,
    // which is the thing a reviewer would otherwise have to notice by eye.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      join(process.cwd(), "src", "app", "start", "screening-form.tsx"),
      "utf8",
    );

    expect(source).toMatch(/value:\s*choice\.value/);
    expect(source).toMatch(/label:\s*t\(PROFICIENCY_LABEL_KEYS\[choice\.value\]\)/);
    // The localized label must not be reachable from the value position under any spelling.
    expect(source).not.toMatch(/value:\s*t\(/);
    expect(source).not.toMatch(/value:\s*FILIPINO_COPY/);
  });

  it("localizes the option LABELS while the stored VALUE stays `fluent`", () => {
    // `tasks.md` 6.3, stated in both directions. A participant choosing "Madaling gamitin" and one
    // choosing "Fluent" must both be recorded as `fluent`, or the locale has become a variable in
    // what a research record means.
    const key = PROFICIENCY_LABEL_KEYS.fluent;

    expect(ENGLISH_COPY[key]).toBe("Fluent");
    expect(FILIPINO_COPY[key]).toBe("Madaling gamitin");
    // The value itself is nowhere in the catalog, in either language, so no component can read one
    // out of a key by accident.
    expect(Object.values(ENGLISH_COPY)).not.toContain("fluent");
    expect(Object.values(FILIPINO_COPY)).not.toContain("fluent");
  });

  it("keeps the language control OUT of a response form, so a switch cannot submit one", async () => {
    // Spec scenario S3, "switching the language preserves the response in progress".
    //
    // ============================================================================================
    // WHAT THIS TEST DOES AND DOES NOT COVER - THE HONEST PART
    // ============================================================================================
    // S3 is the one scenario with no behavioural test, and the verifier is right that its failure
    // would silently destroy a participant's research answer. What is asserted here is the part that
    // IS observable without a browser, and it is the load-bearing structural precondition: the
    // switcher is a SEPARATE form submitting to a different Server Action, so switching the language
    // cannot submit, clear, or navigate the response form.
    //
    // What remains untested is whether React's client state inside `ScreeningForm` survives the
    // revalidation the locale action triggers. That is satisfied by React Server Action semantics -
    // a separate form submits, `revalidatePath` re-renders the same component tree, the tree
    // reconciles rather than remounting, and `useState` survives - but that reasoning is an
    // INFERENCE and is recorded as one here rather than dressed up as coverage. A browser-level
    // check is the honest way to close it, and no browser has ever rendered this site.
    const { ScreeningForm } = await import("@/app/start/screening-form");
    const screening = renderToStaticMarkup(<ScreeningForm locale="fil" />);

    // The response form carries no locale field at all, in either language.
    expect(screening).not.toMatch(/name="locale"/);

    // And the switcher, rendered on its own, carries nothing from the response form: its only
    // payload is the locale. So there is no name overlap in either direction, which is the property
    // that makes the two forms independent.
    const { LocaleSwitcher } = await import("@/components/i18n/locale-switcher");
    const switcher = renderToStaticMarkup(
      <LocaleSwitcher locale="en" action={async () => undefined} />,
    );
    expect(switcher).toMatch(/name="locale"/);
    expect(switcher).not.toMatch(/name="ilocanoProficiency"/);
    expect(switcher).not.toMatch(/name="evaluation"/);
  });

  it.each(ILOCANO_PROFICIENCY_CHOICES.map((choice) => choice.value))(
    "gives %s a localized label in both languages",
    (value) => {
      const key = PROFICIENCY_LABEL_KEYS[value];

      expect(ENGLISH_COPY[key]).toBe(
        ILOCANO_PROFICIENCY_CHOICES.find((choice) => choice.value === value)?.label,
      );
      expect(FILIPINO_COPY[key].length).toBeGreaterThan(0);
      expect(FILIPINO_COPY[key]).not.toBe(ENGLISH_COPY[key]);
    },
  );

  it("localizes the submit control and the resume note beneath it, with no skip control", async () => {
    const { ScreeningForm } = await import("@/app/start/screening-form");
    const filipino = renderToStaticMarkup(<ScreeningForm locale="fil" />);

    expect(filipino).toContain("Magpatuloy");
    expect(filipino).toContain("hindi maaaring maidagdag sa orihinal");
    // And not the English, which is the half that actually matters: a localized button label
    // beside an English sentence is the half-localized page D3 forbids.
    expect(filipino).not.toContain("Continue");
    // And no skip control exists to localize: proficiency is required.
    expect(filipino).not.toContain("Laktawan at magpatuloy nang walang sagot");
    expect(filipino).not.toContain("Skip and continue without answering");
  });
});

describe("the switcher", () => {
  /** Renders the switcher with an inert action - the real one needs a request scope. */
  function renderSwitcher(locale: "en" | "fil"): string {
    return renderToStaticMarkup(<LocaleSwitcher locale={locale} action={() => {}} />);
  }

  it("offers a control for every approved locale, in both renderings", () => {
    // Derived from the locale list rather than written out, so a third approved language cannot
    // arrive with a switcher that shows only two.
    for (const locale of ["en", "fil"] as const) {
      const html = renderSwitcher(locale);
      for (const tag of ["ENG", "FIL"]) {
        expect(html, `${tag} missing from the ${locale} switcher`).toContain(tag);
      }
    }
  });

  it("marks the active locale with aria-current, not with colour", () => {
    // Two independent signals are required: `aria-current` for assistive technology and a visible
    // check mark for everyone else. Asserting both is the point - a switcher that only changed the
    // background colour would pass the first and fail the second, and vice versa.
    const filipino = renderSwitcher("fil");

    expect(filipino).toMatch(/aria-current="true"/);
    expect(filipino).toContain("✓");
    // Exactly one is marked, or the control is claiming two languages are active.
    expect((filipino.match(/aria-current="true"/g) ?? []).length).toBe(1);
  });

  it("moves the marker when the locale changes", () => {
    // Otherwise "there is a check mark somewhere" would be the whole claim.
    //
    // The check is POSITIONAL, within the active button's own markup, and not a presence test
    // over the page. A first draft compared the offset of `✓` with the offset of the abbreviation
    // text, which is wrong in a way worth recording: the mark is rendered INSIDE the active
    // button, immediately BEFORE its own abbreviation, so `✓` is always at a lower offset than the
    // label of the control it belongs to. The assertion below splits on the buttons instead, so it
    // states the thing that is actually true - the mark is in the active control and not the other.
    const buttonWith = (html: string, attribute: string): string => {
      const block = html.split("<button").find((candidate) => candidate.includes(attribute));
      if (block === undefined) {
        throw new Error(`no button carries ${attribute} in: ${html}`);
      }
      return block;
    };

    const filipino = renderSwitcher("fil");
    const english = renderSwitcher("en");

    expect(buttonWith(filipino, 'aria-current="true"')).toContain("FIL");
    expect(buttonWith(filipino, 'aria-current="true"')).toContain("✓");
    // The inactive control carries neither.
    expect(buttonWith(filipino, 'value="en"')).not.toContain("✓");

    expect(buttonWith(english, 'aria-current="true"')).toContain("ENG");
    expect(buttonWith(english, 'aria-current="true"')).toContain("✓");
    expect(buttonWith(english, 'value="fil"')).not.toContain("✓");
  });

  it("uses real submit buttons carrying the locale in the payload, not links", () => {
    // A link would be wrong: this SUBMITS, and a link styled as a button loses keyboard and
    // middle-click semantics for no benefit. The `name="locale"` / `value="en"` pair is the entire
    // wire contract with the Server Action, so it is asserted as a contract.
    //
    // Each attribute is read out of the button's own tag rather than by one ordered pattern,
    // because React emits `type`, `value`, `aria-*`, `class`, and `name` in a fixed order that is
    // an implementation detail of the renderer - and a pattern that encoded it would fail on a
    // React upgrade for a reason that has nothing to do with this component.
    const html = renderSwitcher("en");
    const tags = html.match(/<button[^>]*>/g) ?? [];

    expect(tags).toHaveLength(2);
    for (const tag of tags) {
      expect(tag).toMatch(/type="submit"/);
      expect(tag, "the payload field name is the wire contract").toMatch(/name="locale"/);
    }
    expect(tags.filter((tag) => tag.includes('value="en"'))).toHaveLength(1);
    expect(tags.filter((tag) => tag.includes('value="fil"'))).toHaveLength(1);

    // And no link is doing the switcher's job.
    expect(html).not.toMatch(/<a[^>]*name="locale"/);
    // The action really is wired to the form rather than merely present. In
    // `renderToStaticMarkup` a function action renders as a placeholder, so this asserts the
    // attribute exists - the wiring is proved behaviourally by `locale-actions-wrapper.test.ts`.
    expect(html).toMatch(/<form[^>]*action="/);
  });

  it("names the control in the reader's own language", () => {
    // A participant who cannot read "ENG" is exactly the participant the accessible name is for.
    // The abbreviation is identical in both languages; the name is not.
    expect(renderSwitcher("en")).toMatch(/aria-label="Interface language"/);
    expect(renderSwitcher("fil")).toMatch(/aria-label="Wika ng interface"/);
  });

  it("keeps a 44px touch target, which is the one place size is not reduced", () => {
    // "Subordinate to the task" must not mean "hard to hit on a phone". `min-h-11` is 44px.
    expect(localeChoiceClasses(true)).toContain("min-h-11");
    expect(localeChoiceClasses(false)).toContain("min-h-11");
  });

  it("uses no accent token in either state, so it cannot compete with the task", () => {
    // The spec requires the switcher to be reachable AND not dominant. Reachable is structural -
    // the layout renders it. Not dominant is visual, and the visual claim is that it is drawn
    // entirely in ink and paper: an accent-coloured language switch beside an accent-coloured
    // primary action would be two competing calls to action.
    for (const active of [true, false]) {
      expect(localeChoiceClasses(active)).not.toMatch(/accent/);
    }
  });

  it("is reachable from the not-found page, which has no header of its own", async () => {
    // The reason the switcher lives in the layout rather than in each page. `not-found` is the one
    // route that renders no header, so a per-page switcher would have been missing from exactly
    // the page a participant reaches after following a stale link.
    //
    // The switcher itself is asserted in the layout block below, because the layout is the thing
    // that renders it and this page is only the reason that matters. What is checked here is the
    // page's own shape, since the page is the reachable case.
    const html = await renderIn("en", NotFound);

    expect(html).toMatch(/<main id="main"/);
    // The page has no `<header>` of its own; asserted so the reason the layout owns the switcher
    // cannot be quietly invalidated by a future header being added here.
    expect(html).not.toMatch(/<header/);
  });
});

describe("the layout's role, which cannot be rendered here", () => {
  /**
   * Read by source because rendering the root layout needs a request scope and a `next/font`
   * runtime, neither of which exists in the unit project.
   *
   * These are TEXTUAL assertions and that is a real limitation, stated here rather than buried: a
   * cosmetic rename fails them, and a change that keeps the strings but moves the logic would not
   * be caught by them at all. What they do catch - the three things that would break the feature
   * outright - is worth catching, and each one is anchored on its own statement rather than on a
   * phrase a comment could also contain.
   */
  const LAYOUT_SOURCE = readLayout();

  it("resolves the locale from the cookie on the server, with no middleware", () => {
    // No middleware is the spec's requirement and this project's: a locale route prefix would mean
    // two URLs for one page, and a middleware rewrite would make the language a property of the
    // address rather than of the person.
    expect(LAYOUT_SOURCE).toMatch(/await getInterfaceLocale\(\)/);
    expect(LAYOUT_SOURCE).toMatch(/lang=\{locale\}/);
  });

  it("is async, because cookies() is", () => {
    // A sync layout cannot await, so this is not stylistic: a layout that read the locale without
    // awaiting would receive a Promise and put "[object Promise]" in `lang`.
    expect(LAYOUT_SOURCE).toMatch(/export default async function RootLayout/);
  });

  it("provides no React context for the locale, because a Server Component cannot", () => {
    // THE REGRESSION GUARD FOR A REAL BUILD FAILURE, and the reason it is worth a test.
    //
    // An earlier version of this feature provided the locale through `createContext` and read it in
    // each page with React's `use`. Every unit test passed: `renderToStaticMarkup` will happily
    // render a context provider, and 870 assertions said the pages localized correctly.
    //
    // `pnpm run build` then failed with
    //
    //   You're importing a module that depends on `createContext` into a React Server Component
    //   module. This API is only available in Client Components.
    //
    // which is the boundary between the two component models and is enforced by the compiler
    // rather than by the type system or by any test. So the shape that the build rejects is now
    // asserted here - not because the source scan is a good test in general, but because this is
    // the specific mistake that a unit suite demonstrably cannot catch, and the build is the only
    // thing that caught it.
    //
    // A CONTROL accompanies it: the pattern is proven to match the very call it forbids, so a scan
    // that silently matched nothing - the failure mode this repository has hit more than once -
    // fails rather than passing.
    const serverModules = serverComponentModules();
    const files = serverModules.map((module) => module.file);

    // THE FIRST CONTROL: the scan is not empty, and it is not empty BY ACCIDENT. Both client
    // islands are named as the files that must have been excluded - if the exclusion stopped
    // working, these two would appear in the list and the four client modules that legitimately
    // reach React APIs would start failing a scan they are exempt from.
    expect(files).not.toContain("app/start/screening-form.tsx");
    expect(files).not.toContain("components/onboarding/resume-validator.tsx");
    // And the scan still reaches the four route pages it is here to protect.
    expect(files).toEqual(
      expect.arrayContaining([
        "app/layout.tsx",
        "app/page.tsx",
        "app/start/page.tsx",
        "app/ready/page.tsx",
        "app/not-found.tsx",
      ]),
    );
    expect(serverModules.length).toBeGreaterThan(0);

    for (const { file, source } of serverModules) {
      expect(
        withCommentsStripped(source),
        `${file} must not create a React context: it is in the Server Component graph`,
      ).not.toMatch(/\bcreateContext\b/);
    }

    // THE SECOND CONTROL, and the reason the one above is not enough. The pattern is checked
    // against a source that genuinely contains the call, so a regex that matched nothing - the
    // silent-empty-match failure this repository has hit repeatedly - fails here instead of
    // quietly passing every module in the loop.
    expect(withCommentsStripped('const x = createContext("a");')).toMatch(/\bcreateContext\b/);

    // And a `"use client"` directive is exempt ONLY as a first statement. A file that mentions the
    // directive later, or only in a comment, is still a Server Component module and is still
    // scanned - otherwise the exemption becomes a way to switch the guard off.
    expect(/^\s*(?:"use client"|'use client')/.test('import x from "y";\n"use client";\n')).toBe(
      false,
    );
    expect(/^\s*(?:"use client"|'use client')/.test('// "use client";\nconst x = 1;')).toBe(false);
  });

  it("leaves each route to read the cookie itself, which is where the read is visible", () => {
    // Each page awaits `getInterfaceLocale`, so a reviewer reading a page can see where its language
    // comes from. Inherited from a provider four levels up, that was invisible - and it is also
    // precisely what the build rejected.
    //
    // `AsyncFunction` is checked rather than inferred from behaviour, because a page that read the
    // cookie and FORGOT to await would still render: `translatorFor` would be handed a Promise, and
    // a React render of that throws only when a translator is actually called on it. Checking the
    // declaration catches a broken page at the point of the mistake.
    for (const { path, Page } of ROUTES) {
      expect(
        Page.constructor.name,
        `${path} must be an async Server Component that awaits the locale cookie`,
      ).toBe("AsyncFunction");
    }
  });

  it("renders the switcher on every page, outside every page's own form", () => {
    // The `action` prop rather than an import, because `src/components/` is treated as browser-side
    // by `sadino/no-privileged-imports` and a `"use server"` module must not reach it by import.
    expect(LAYOUT_SOURCE).toMatch(
      /<LocaleSwitcher locale=\{locale\} action=\{changeInterfaceLocaleAction\}/,
    );
    // And the switcher is in the layout chrome, not inside `{children}` - which is what makes it
    // present on a route that forgot it.
    const switcherAt = LAYOUT_SOURCE.indexOf("<LocaleSwitcher");
    const childrenAt = LAYOUT_SOURCE.indexOf("{children}");
    expect(switcherAt).toBeGreaterThan(-1);
    expect(childrenAt).toBeGreaterThan(-1);
    expect(switcherAt).toBeLessThan(childrenAt);
  });

  it("keeps the skip link the first focusable element, above the language bar", () => {
    // The bar added a second control to the top of every page, and a skip link that is no longer
    // first is a skip link a keyboard user tabs past.
    const skipAt = LAYOUT_SOURCE.indexOf('href="#main"');
    const switcherAt = LAYOUT_SOURCE.indexOf("<LocaleSwitcher");
    expect(skipAt).toBeGreaterThan(-1);
    expect(skipAt).toBeLessThan(switcherAt);
  });
});

/** The root layout's source. The anchors above are statements, not prose, so comments may stay. */
function readLayout(): string {
  return readFileSync(join(process.cwd(), "src", "app", "layout.tsx"), "utf8");
}

/**
 * Every `.ts`/`.tsx` file in `src/` that is a SERVER Component module, paired with its source.
 *
 * A file whose first statement is a `"use client"` directive is a Client Component and is excluded,
 * because `createContext` is exactly what those files are allowed to do - and the two client
 * islands in this project would otherwise fail the scan for doing nothing wrong.
 *
 * The exclusion is anchored on the first STATEMENT rather than on the string appearing anywhere.
 * A directive must be the first statement in the file to have any effect, so a file that merely
 * mentions `"use client"` in a comment, or has it on line 40, is still a server module and is still
 * scanned. The test asserts both directions, so an exclusion that quietly swallowed a server file
 * would fail rather than pass.
 *
 * Paths are reported with `/` separators rather than the platform's own, because these are compared
 * against string literals in the test and `path.join` produces `\` on Windows - a test that passed on
 * CI and failed on a contributor's machine for no reason but the OS.
 */
function serverComponentModules(): Array<{ file: string; source: string }> {
  const root = join(process.cwd(), "src");

  return sourceFiles(root)
    .map((file) => ({
      file: file
        .slice(root.length + 1)
        .split(sep)
        .join("/"),
      source: readFileSync(file, "utf8"),
    }))
    .filter(({ source }) => !/^\s*(?:"use client"|'use client')/.test(source));
}

/** Recursively collects `.ts`/`.tsx` files, excluding nothing: the filter is applied by the caller. */
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : sourceFiles(path);
    }
    return entry.isFile() && /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/**
 * A source with every comment removed.
 *
 * Load-bearing, and the reason is a defect this repository has already made: a scan for a forbidden
 * identifier matches a COMMENT that merely names it. `locale-context.ts` documented why it used
 * `createContext`, so a guard asserting the call was absent would have failed on a file that was
 * already correct, and the natural repair - rewording the comment until the phrase disappeared -
 * would have destroyed the explanation. Stripping comments first means the scan sees code.
 *
 * The block comment form and the line comment form are both handled; a string literal containing
 * `//` is a known limitation, and it errs toward stripping rather than toward missing a match.
 */
function withCommentsStripped(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}
