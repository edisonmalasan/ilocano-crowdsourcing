import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import ReadyPage, { generateMetadata as readyGenerateMetadata } from "@/app/ready/page";
import StartPage, { generateMetadata as startGenerateMetadata } from "@/app/start/page";
import { AnswerGroup, answerOptionClasses } from "@/components/validation/answer-option";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { translatorFor } from "@/lib/i18n/copy";
import { submitControlState } from "@/lib/validators/onboarding-flow";
import {
  ILOCANO_PROFICIENCY_CHOICES,
  ILOCANO_PROFICIENCY_QUESTION,
  ILOCANO_PROFICIENCY_SUPPORTING_COPY,
  toIlocanoProficiency,
} from "@/schemas/validator";

/**
 * The three public onboarding routes, asserted against real rendered markup.
 *
 * `react-dom/server` is used for the same reason `accessibility.test.tsx` uses it: these
 * assertions need the produced HTML, not a live DOM, so the unit project stays free of a
 * browser-like runtime while still proving what a participant would actually see.
 *
 * `next/navigation` is stubbed because the client islands call `useRouter`. The stub
 * records the destination rather than navigating.
 *
 * ============================================================================
 * A NOTE ON WHAT THESE TESTS CANNOT SEE, because the previous version of this file
 * over-claimed on exactly this point
 * ============================================================================
 * `renderToStaticMarkup` never runs an effect, never fires a click handler, and never
 * starts a transition. It can therefore only ever render `isPending === false` and
 * `error === null`. Anything about the PENDING or ERROR states of the screening form
 * had to be tested somewhere else, and "assert the initial markup" is not somewhere
 * else - a form that never disabled its controls and never rendered an error passed
 * every markup test in the earlier revision of this file.
 *
 * So the three concerns are separated deliberately:
 *   - what the INITIAL screen looks like      -> here, by rendered markup
 *   - what the controls do while a write runs -> `submitControlState`, a pure function
 *   - what the control renders in those states -> `AnswerGroup`, rendered with the
 *     props passed in, which is the real component doing the real rendering
 *
 * ============================================================================
 * WHY THESE PAGES ARE RENDERED THROUGH `renderRoute`, AND WHAT THE STUB PROVES
 * ============================================================================
 * The page components are `async`: each one awaits `getInterfaceLocale()`, because `cookies()` is
 * asynchronous. `renderToStaticMarkup` cannot await a component, so `renderRoute` awaits the
 * component and renders the element it resolves to. That is a mechanical adapter, and it is the
 * honest way to keep these assertions about real markup.
 *
 * The `next/headers` stub holds NO locale, which is exactly the state a first-time participant is
 * in, so the copy these tests assert is the English that `resolveInterfaceLocale` falls back to -
 * not a value the test chose. That is the point: the fallback path is the one a participant with no
 * cookie is served, and it is the one a stubbed cookie could easily have faked. The Filipino
 * renderings are asserted in `locale-routes.test.tsx` against a stub that DOES hold `"fil"`, so
 * neither file can be right by accident.
 *
 * `generateMetadata` is `async` for the same reason, so the metadata assertions await it.
 */

/** The English translator, for the pure-function assertions in this file. */
const EN = translatorFor("en");

/**
 * `server-only` throws when a client component's import graph reaches it. The screening
 * form imports the Server Action module, whose import chain legitimately reaches
 * server-only modules — that is the boundary working, not a violation. The stub lets the
 * markup render; the boundary itself is asserted by `tests/unit/supabase-clients.test.ts`,
 * which deliberately does not stub it.
 */
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
 * `next/headers` is mocked because both routes now resolve their document title from the locale
 * cookie, and `cookies()` throws outside a request scope.
 *
 * The stub holds NO locale, which is exactly the state a first-time participant is in, so the
 * metadata these tests assert is the English default produced by `resolveInterfaceLocale` rather
 * than a value the test chose. That is the point: the fallback path is the one that matters when a
 * participant has no cookie, and it is the one a stubbed cookie could easily have faked.
 */
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(new Map()),
}));

/**
 * The screening form, imported lazily so the mocks above are in place first.
 *
 * `locale` is passed explicitly because the form takes it as a required prop rather than reading
 * a context: a client island cannot read the server's context, and a prop is what keeps the
 * server-rendered HTML and the hydrated tree agreeing on the language.
 */
async function renderScreeningForm(locale: InterfaceLocale = "en"): Promise<string> {
  const { ScreeningForm } = await import("@/app/start/screening-form");
  return renderToStaticMarkup(<ScreeningForm locale={locale} />);
}

/**
 * Renders a route page component, which is `async` because it reads the locale cookie.
 *
 * `renderToStaticMarkup` takes an element and cannot await a component, so the await happens here.
 * Doing it in one place rather than at each call site means the four render sites below cannot drift
 * into handling a Promise differently from one another.
 */
async function renderRoute(Page: () => Promise<React.ReactElement>): Promise<string> {
  return renderToStaticMarkup(await Page());
}

/**
 * Pulls the `class` attribute off every `<button role="radio">` in rendered markup.
 *
 * This is the whole point of the neutrality assertions below. Comparing a constant to
 * itself proves nothing; the guarantee is about what a participant can SEE, so it has
 * to be read out of the markup the participant receives.
 */
function radioOptionClasses(html: string): string[] {
  return [...html.matchAll(/<button[^>]*role="radio"[^>]*class="([^"]*)"/g)].map(
    (match) => match[1],
  );
}

/**
 * The internal routes this app actually serves, read from the App Router directory rather
 * than listed by hand.
 *
 * A hand-written list of routes is a second place to update when a route is added, and it
 * drifts silently: the list keeps asserting that a deleted route exists long after the
 * directory no longer has it. `readdirSync` makes the filesystem the authority, so this
 * cannot go stale, and a link to a route that does not exist fails here rather than
 * producing a 404 for a participant.
 */
const KNOWN_ROUTES = readdirSync(join(process.cwd(), "src", "app"), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => `/${entry.name}`);

describe("the internal route inventory this suite relies on", () => {
  it("found the routes it expects, so a wrong directory fails loudly instead of vacuously", () => {
    // Without this, a `readdirSync` pointed at the wrong path yields an empty array, and
    // every `expect(hrefs.every(...))` over it passes. An empty inventory is exactly the
    // condition this file's route tests exist to detect, so it must never pass silently.
    // `/validate` is named explicitly as well as being picked up by the directory scan, because it is
    // the destination `/ready` now hands every participant to. The scan would catch a missing
    // directory through the href loop; naming it here fails at the INVENTORY, naming the route that
    // went missing, which is the more useful failure when three routes change at once.
    expect(KNOWN_ROUTES).toEqual(expect.arrayContaining(["/start", "/ready", "/validate"]));
  });
});

describe("the screening answer cannot be fabricated at the answer control", () => {
  // Round six's W1, the most severe finding of six rounds, and the reason this is a
  // *function* with tests rather than another source-text assertion.
  //
  // The call site was `onChange={(value) => setSelection(value as IlocanoProficiency)}`.
  // Because `AnswerGroup.onChange` is `(value: string) => void`, that cast was unchecked, and
  //
  //     onChange={() => setSelection(ILOCANO_PROFICIENCY_CHOICES[1].value)}
  //
  // enrolled every participant as "Fluent" regardless of what they chose. Verified to pass
  // lint, format, typecheck, all 510 unit tests, and the production build.
  //
  // The literal-level guards from rounds three and four cannot see it: "fluent" never appears
  // in the file. That is round four's C1c shape arriving through a different door, and it is
  // why this is fixed by removing the cast rather than by a seventh regex.
  it("accepts each of the five approved proficiencies", () => {
    for (const choice of ILOCANO_PROFICIENCY_CHOICES) {
      expect(toIlocanoProficiency(choice.value), choice.value).toBe(choice.value);
    }
  });

  it("rejects anything that is not one of them, rather than narrowing it", () => {
    // The load-bearing case. A function that returned its input unchanged, or cast it, would
    // pass every other test in this file while re-opening the hole.
    for (const fabricated of [
      "Fluent", // wrong case - the stored values are lowercase
      " native", // untrimmed
      "native ", // untrimmed
      "spanish",
      "",
      "undefined",
      "null",
      "constructor",
      "__proto__",
      "toString",
    ]) {
      expect(toIlocanoProficiency(fabricated), JSON.stringify(fabricated)).toBeNull();
    }
  });

  it("is what the screening form actually calls, so the cast is gone from the file", () => {
    // One behavioural seam and one textual one. The textual half exists only to prove the
    // old call site is not still sitting there alongside the new one - a guard that a
    // reviewer can probe, and that fails loudly if someone reintroduces the cast.
    const source = readFileSync(
      join(process.cwd(), "src", "app", "start", "screening-form.tsx"),
      "utf8",
    );
    expect(source).toContain("toIlocanoProficiency(value)");
    expect(
      source,
      "an unchecked cast at the answer control reopens the fabrication route",
    ).not.toMatch(/setSelection\(value\s+as\s+IlocanoProficiency\)/);
  });
});

describe("landing route", () => {
  let html = "";
  beforeAll(async () => {
    html = await renderRoute(HomePage);
  });

  it("hands off to the screening route with a real link", () => {
    expect(html).toContain('href="/start"');
  });

  it("no longer says the study is not open", () => {
    expect(html).not.toMatch(/not open yet/i);
    expect(html).not.toMatch(/Opens once screening ships/i);
  });

  it("has exactly one h1", () => {
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
  });

  it("offers a resume path for a returning participant", () => {
    expect(html).toMatch(/Continue as that validator/);
  });

  it("keeps the introduction copy from the shell phase", () => {
    expect(html).toContain("Check the Ilocano.");
    expect(html).toMatch(/Taking part is voluntary/);
  });
});

describe("screening route", () => {
  let html = "";
  beforeAll(async () => {
    html = await renderRoute(StartPage);
  });

  it("has exactly one h1 and a distinct page title", () => {
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
  });

  it("declares real route metadata rather than a placeholder", async () => {
    // Low severity, but it was untested and the failure is silent: replacing a required
    // page title with "Nowhere" passes every behavioural assertion in this file, because
    // `renderToStaticMarkup` does not emit the metadata object at all. Asserted against
    // the imported metadata rather than the HTML, since that is the only place it exists.
    //
    // `generateMetadata` rather than a static `metadata` export, because the title is interface
    // copy: a static export is English for every participant forever, which is the failure this
    // change exists to remove. It is therefore a function, and the assertion awaits it - which
    // also proves it does not throw when no cookie is present.
    const startMetadata = await startGenerateMetadata();

    expect(startMetadata.title).toBe("Screening");
    expect(startMetadata.title).not.toMatch(/todo|placeholder|nowhere|untitled/i);
    expect(startMetadata.description).toBeTypeOf("string");
    expect((startMetadata.description ?? "").trim().length).toBeGreaterThan(30);
    expect(startMetadata.description).not.toMatch(/todo|placeholder|nowhere|lorem/i);
  });

  it("does not promise sentences that /ready says are not switched on yet", async () => {
    // ROUND SIX W3. Two routes in one flow contradicted each other on a fact a participant
    // can act on. `/start`'s metadata said "then you can start checking sentences"; `/ready`
    // said "Receiving sentences is the next part of the study and is not switched on yet".
    //
    // The inconsistency is in the *metadata description*, which is the tab title and the
    // search snippet, so it is copy a participant reads before arriving anywhere. It is new
    // copy from this change: `/start` did not exist before it.
    //
    // Asserted here as a cross-route invariant rather than as two independent string checks,
    // because the defect was never that either sentence was individually odd - it was that
    // the pair disagreed. A test on each route alone would have passed.
    const ready = await renderRoute(ReadyPage);
    const startMetadata = await startGenerateMetadata();

    expect(ready).toMatch(/href="\/validate"/);
    expect(
      startMetadata.description,
      "/start metadata promises sentences that /ready says are not switched on",
    ).not.toMatch(/start checking sentences|check sentences|start validating/i);

    // And the honest version is present: what this route is actually for.
    expect(startMetadata.description).toMatch(/nothing about you is collected/i);
  });

  it("asks the approved question verbatim", () => {
    expect(html).toContain(ILOCANO_PROFICIENCY_QUESTION);
  });

  it("shows the approved supporting copy", () => {
    expect(html).toContain(ILOCANO_PROFICIENCY_SUPPORTING_COPY);
  });

  it("states the voluntary-participation notice on the same screen as the question", () => {
    // A notice only reachable from another page is a notice a participant can skip.
    expect(html).toMatch(/Taking part is voluntary/);
    expect(html).toMatch(/stop at any point/);
  });

  it("states that no identifying information is collected", () => {
    expect(html).toMatch(
      /do not ask for your name, your email, your student number, or your phone/i,
    );
  });

  it("does not claim the code exists only in the browser, because it does not", () => {
    // The code is ALSO in the study database, as /ready states outright. The two routes
    // used to contradict each other inside one flow, and a test asserted the inaccurate
    // string verbatim — protecting the error from review rather than catching it.
    expect(html).not.toMatch(/random code held only in this browser/i);

    expect(html).toMatch(/kept in this browser/i);
    expect(html).toMatch(/stored in the study database/i);
  });

  it("places every notice statement ABOVE the first submit control", () => {
    // Position is the guarantee. An earlier revision rendered the form first and a
    // comment claimed the notice was "impossible to submit without having seen", which
    // was false: the Continue button was above it, so the question could be answered
    // and submitted having read nothing at all.
    const noticeAt = html.indexOf("Before you answer");
    const submitAt = html.indexOf('type="submit"');

    expect(noticeAt).toBeGreaterThan(-1);
    expect(submitAt).toBeGreaterThan(-1);
    expect(noticeAt).toBeLessThan(submitAt);

    // And each individual statement, not just the card heading.
    for (const statement of [
      /Taking part is voluntary/,
      /do not ask for your name/,
      /Your identity is a random code/,
    ]) {
      const at = html.search(statement);
      expect(at).toBeGreaterThan(-1);
      expect(at).toBeLessThan(submitAt);
    }
  });
});

describe("screening form neutrality", () => {
  it("renders every unselected option with the exact frozen unselected class", async () => {
    // The real assertion. If `AnswerGroup` were bypassed, or handed a per-option
    // `className`, or if `answerOptionClasses` gained a parameter, this goes red -
    // whereas comparing the constant to itself, as the earlier revision did, could
    // not go red for any possible change to the screen.
    const html = await renderScreeningForm();
    const rendered = radioOptionClasses(html);
    const expected = answerOptionClasses({ selected: false });

    expect(rendered).toHaveLength(ILOCANO_PROFICIENCY_CHOICES.length);
    for (const actual of rendered) {
      expect(actual).toBe(expected);
    }
  });

  it("gives no unselected screening option an accent surface", async () => {
    const html = await renderScreeningForm();

    // State-dependent classes are stripped before the weight checks, because a
    // `hover:shadow-brutal-md` is a reaction to the pointer being on THAT option and
    // appears on all five identically. It is not static weight, and asserting against it
    // would be asserting against the shared design rather than at neutrality.
    const staticClasses = (className: string): string =>
      className
        .split(" ")
        .filter((token) => !/^(hover|active|focus-visible|disabled|group-)/.test(token))
        .join(" ");

    for (const actual of radioOptionClasses(html)) {
      const resting = staticClasses(actual);

      expect(resting).not.toMatch(/accent/);
      // The resting shadow must be the smallest one, not the elevated one the selected
      // state uses. This is the difference between "raised" and "not raised".
      expect(resting).toContain("shadow-brutal-sm");
      expect(resting).not.toMatch(/shadow-brutal-(md|lg|xl)/);
      expect(resting).toMatch(/border-answer-border/);
    }
  });

  it("raises the resting weight only after selection", async () => {
    // The positive half, so the check above cannot pass by the selected and unselected
    // sets being identical.
    const unselected = answerOptionClasses({ selected: false });
    const selected = answerOptionClasses({ selected: true });

    expect(unselected).not.toBe(selected);
    expect(selected).toMatch(/shadow-brutal-md/);
    expect(unselected).toMatch(/shadow-brutal-sm/);
  });

  it("renders exactly the five approved choices, in the approved order", async () => {
    const html = await renderScreeningForm();

    const positions = ILOCANO_PROFICIENCY_CHOICES.map((choice) => html.indexOf(choice.label));
    for (const position of positions) expect(position).toBeGreaterThan(-1);

    const ascending = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(ascending);
    expect((html.match(/role="radio"/g) ?? []).length).toBe(ILOCANO_PROFICIENCY_CHOICES.length);
  });

  it("adds no hint to any screening option", async () => {
    // A per-option hint is precisely how a screening question gets nudged, and the
    // option markup is shared with validation answers, so this is a real risk to guard.
    const html = await renderScreeningForm();
    expect(html).not.toMatch(/Recommended|Ideal|Best answer|Required for/);
  });

  it("labels the group with the approved question, for assistive technology", async () => {
    const html = await renderScreeningForm();
    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/aria-label="How comfortable are you with Ilocano\?"/);
  });

  it("offers an explicit way to continue without answering", async () => {
    const html = await renderScreeningForm();
    expect(html).toMatch(/Skip and continue without answering/);
  });

  it("tells the participant an existing identity will be resumed, not duplicated", async () => {
    const html = await renderScreeningForm();
    expect(html).toMatch(/resume it instead of creating a second one/);
    // And that their answer will not be silently overwritten, which is the failure an
    // independent review actually found in this flow.
    expect(html).toMatch(/will not be stored over the original/);
  });
});

describe("the submit control while a Server Action is in flight", () => {
  it("disables and marks the control busy while pending", () => {
    // `renderToStaticMarkup` can only ever see the idle state, so the pending
    // behaviour is asserted where it is actually decided.
    expect(submitControlState(true, EN)).toEqual({
      disabled: true,
      ariaBusy: true,
      label: "Saving…",
    });
  });

  it("leaves the control enabled and ready when idle", () => {
    expect(submitControlState(false, EN)).toEqual({
      disabled: false,
      ariaBusy: undefined,
      label: "Continue",
    });
  });

  it("never reports the control as idle while a write is in flight", () => {
    // The property, stated directly: a control that is clickable mid-write is how one
    // participant ends up with two identities.
    expect(submitControlState(true, EN).disabled).toBe(true);
  });

  it("omits aria-busy entirely when idle, rather than setting it false", () => {
    const html = renderToStaticMarkup(<div aria-busy={submitControlState(false, EN).ariaBusy} />);
    expect(html).not.toMatch(/aria-busy/);
  });
});

describe("the answer control in a pending or errored state", () => {
  const OPTIONS = ILOCANO_PROFICIENCY_CHOICES.map((choice) => ({
    value: choice.value,
    label: choice.label,
  }));

  it("disables every option while pending, so the answer cannot change mid-write", () => {
    const html = renderToStaticMarkup(
      <AnswerGroup legend="Question" options={OPTIONS} value={null} onChange={() => {}} disabled />,
    );

    const buttons = [...html.matchAll(/<button[^>]*role="radio"[^>]*>/g)].map((m) => m[0]);
    expect(buttons).toHaveLength(OPTIONS.length);
    for (const button of buttons) {
      expect(button).toMatch(/\sdisabled/);
    }
  });

  it("keeps the unselected class while disabled, so a disabled option is not restyled", () => {
    // Disabling must not smuggle in a visual change that reads as emphasis.
    const html = renderToStaticMarkup(
      <AnswerGroup legend="Question" options={OPTIONS} value={null} onChange={() => {}} disabled />,
    );

    for (const actual of radioOptionClasses(html)) {
      expect(actual).toBe(answerOptionClasses({ selected: false }));
    }
  });

  it("announces an error assertively, marks the group invalid, and wires the description", () => {
    const html = renderToStaticMarkup(
      <AnswerGroup
        legend="Question"
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        error="We could not accept that answer."
      />,
    );

    expect(html).toMatch(/role="alert"/);
    expect(html).toContain("We could not accept that answer.");
    expect(html).toMatch(/aria-invalid="true"/);

    // The group must point at the error node, or a screen reader announces the failure
    // with no context.
    const describedBy = /aria-describedby="([^"]*)"/.exec(html)?.[1] ?? "";
    const errorId = /id="([^"]*)"[^>]*role="alert"/.exec(html)?.[1] ?? "";
    expect(errorId).not.toBe("");
    expect(describedBy.split(" ")).toContain(errorId);
  });

  it("renders no alert at all when there is no error", () => {
    const html = renderToStaticMarkup(
      <AnswerGroup legend="Question" options={OPTIONS} value={null} onChange={() => {}} />,
    );

    expect(html).not.toMatch(/role="alert"/);
    expect(html).not.toMatch(/aria-invalid/);
  });

  it("marks exactly the selected option, and no other", () => {
    const html = renderToStaticMarkup(
      <AnswerGroup
        legend="Question"
        options={OPTIONS}
        value={ILOCANO_PROFICIENCY_CHOICES[1].value}
        onChange={() => {}}
      />,
    );

    const classes = radioOptionClasses(html);
    expect(classes).toHaveLength(OPTIONS.length);
    expect(classes.filter((c) => c === answerOptionClasses({ selected: true }))).toHaveLength(1);
    expect(classes.filter((c) => c === answerOptionClasses({ selected: false }))).toHaveLength(
      OPTIONS.length - 1,
    );
  });
});

describe("confirmation route", () => {
  let html = "";
  beforeAll(async () => {
    html = await renderRoute(ReadyPage);
  });

  it("has exactly one h1", () => {
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
  });

  it("declares real route metadata rather than a placeholder", async () => {
    // Untested until third-round review: replacing this title with a placeholder passed
    // every behavioural assertion here, because `renderToStaticMarkup` never emits the
    // metadata object. Asserted against the import, which is the only place it exists.
    //
    // The title doubles as the `h1`, so it is one catalog key rather than two that could drift -
    // which is why this assertion and the `h1` assertion above are asserting the same approved
    // string from two directions.
    const readyMetadata = await readyGenerateMetadata();

    expect(readyMetadata.title).toBe("Before you begin");
    expect(readyMetadata.title).not.toMatch(/todo|placeholder|nowhere|untitled/i);
    expect(readyMetadata.description).toBeTypeOf("string");
    expect((readyMetadata.description ?? "").trim().length).toBeGreaterThan(30);
    expect(readyMetadata.description).not.toMatch(/todo|placeholder|nowhere|lorem/i);
  });

  it("attests to nothing that has not happened", () => {
    // THE DEFECT THIS EXISTS TO CATCH. Round five reached this route with a clean
    // session - no cookies, no storage, no enrollment - by typing the URL, and the page
    // told them "A random code was generated for you and saved to the database" and "A
    // copy of that code was kept in this browser only". Nothing had been generated and
    // nothing had been saved. They left believing they were enrolled; their screening
    // answer had never been collected.
    //
    // There is no `middleware.ts` in this project and this route has no session
    // dependency, so every one of those visitors is reachable. The fix was to make every
    // sentence on the page true unconditionally rather than to gate the route; this
    // assertion is what keeps it that way, because the failure mode is a page that is
    // *slightly* too confident and reads perfectly well.
    //
    // Past tense is the tell. Each of these was on the page and is now absent.
    expect(html).not.toMatch(/was generated for you/i);
    expect(html).not.toMatch(/was kept in this browser/i);
    expect(html).not.toMatch(/identity is saved/i);
    expect(html).not.toMatch(/Your answer to the Ilocano question is kept/i);
    expect(html).not.toMatch(/Validator ready/);
    expect(html).not.toMatch(/What just happened/);
    expect(html).not.toMatch(/You are set/);
    expect(html).not.toMatch(/Before you begin<\/h1>\s*<p[^>]*>[^<]*identity is saved/i);

    // ROUND SIX W6. The one sentence round five missed, on the same page, in the same
    // section. "When it is, this browser will be recognised as the same validator" is not true
    // for the visitor the new card directly below addresses: someone who has not started has
    // no validator to be recognised AS. A weaker defect than the ones round five found - a
    // forward promise rather than an attestation of a past event - but the page's own header
    // promises that every sentence below it is true whether or not an enrollment happened, and
    // this one broke that promise. Asserted as an absence, because the failure mode is a
    // sentence that reads perfectly well.
    expect(html).not.toMatch(/this browser will be recognised as the same validator/);
    // ROUND SEVEN. The sentence this asserted the presence of was removed with the rest of the
    // "not switched on yet" paragraph, because it explained a capability that did not exist. What
    // replaced it keeps the W6 PROPERTY — nothing on this page promises anything about an
    // enrollment that may not have happened — and states it in a form that is true for both
    // visitors: a browser returning here will not have its screening answer replaced. For someone
    // who never answered, there is nothing to replace, so the sentence is vacuously true rather
    // than falsely reassuring.
    //
    // Asserted as a presence, not merely as the absence above. An absence-only replacement would let
    // this page say nothing at all and pass, which is the shape this suite has twice had to undo.
    expect(html).toMatch(/will not replace your screening answer/i);

    // ...and the unconditionally-true forms are present instead.
    expect(html).toMatch(/is generated for you and saved to the database/i);
    expect(html).toMatch(/is kept in this browser only/i);
    expect(html).toMatch(/How this works/);

    // The ethics-relevant content survived the rewording. These are the parts of this
    // page that actually matter to a participant deciding whether to take part, and
    // softening the copy must not cost any of them.
    expect(html).toMatch(/not derived from anything about you/i);
    expect(html).toMatch(/Nothing identifying was collected/);
  });

  it("states that nothing identifying was collected", () => {
    expect(html).toMatch(/Nothing identifying was collected/);
  });

  it("no longer says the next part of the study is switched off, because it is not", () => {
    // ============================================================================
    // THIS ASSERTION WAS INVERTED BY `validation-experience`, AND THE INVERSION IS THE POINT
    // ============================================================================
    // It used to read:
    //
    //   it("says plainly that receiving sentences is not switched on yet", () => {
    //     expect(html).toMatch(/not switched on yet/i);
    //     expect(html).toMatch(/next part of the study/i);
    //   });
    //
    // which was a good test of a true statement. `/ready` told a participant that receiving
    // sentences was "not switched on yet" because at that moment it was, and telling someone the
    // truth about a capability that does not exist is better than letting them conclude the platform
    // is broken.
    //
    // The capability now exists. `/ready` links to `/validate`, which requests a batch. So the
    // statement became FALSE, and a test enforcing a participant-facing falsehood is worse than no
    // test: it makes the falsehood load-bearing, so removing it breaks the build and keeping it
    // ships a lie.
    //
    // The replacement is the SAME property with the direction reversed: the page must not tell a
    // participant that the next part of the study is unavailable, and it must not tell them that
    // closing the tab is a complete way to finish — that second claim was equally true once and
    // equally untrue now, and it is asserted separately below.
    expect(html).not.toMatch(/not switched on yet/i);
    expect(html).not.toMatch(/next part of the study/i);

    // And the affirmative half, so the test is not merely an absence that a blank page would also
    // satisfy: the onward path is offered, and it names the thing that can now actually be done.
    expect(html).toMatch(/href="\/validate"/);
    expect(html).toMatch(/Start validating/);
  });

  it("does not promise the screening question will not be asked again, because it can be", () => {
    // This assertion used to require the opposite, and that was wrong. The D2 amendment
    // removed "the screening question SHALL NOT be asked again" from the spec because a
    // participant who navigates straight to /start DOES see it again - but the copy kept
    // making the promise, and this test kept defending it. A test that enforces a
    // participant-facing falsehood is worse than no test, because it makes the falsehood
    // hard to remove: the next reader sees a passing guard and assumes the claim is load
    // bearing. So the guard now runs the other way.
    expect(html).not.toMatch(/not be asked to screen again/i);
    expect(html).not.toMatch(/will not screen you again/i);
  });

  it("promises the one thing that is actually guaranteed about a return visit", () => {
    // The real invariant, and it is genuinely true on every path to this page: the stored
    // screening answer survives, whether it was given now or during the original enrollment.
    expect(html).toMatch(/will not replace your screening answer/i);
  });

  it("describes the screening answer in a way that is true on every path here", () => {
    // This route is a static Server Component: it cannot know whether the participant just
    // enrolled, resumed, or had a stale identifier cleared. An earlier version made that
    // unstated and was wrong twice over:
    //
    //   - "was stored as background information, as you gave it" is FALSE on the decline
    //     path, where nothing was stored at all;
    //   - "if you continued from a browser that already held an identity, the answer you
    //     had given earlier was kept instead" has its antecedent true on the
    //     stale-identifier path while its consequent is false, because a stale identifier
    //     produces a BRAND NEW validator, and the answer just given is the one stored.
    //
    // So the copy now states the invariant rather than the outcome, and each clause is
    // separately asserted because each was separately wrong.
    expect(html).toMatch(/kept with your validator identity/i);
    expect(html).toMatch(/if you chose to skip it, nothing was recorded in its place/i);
    expect(html).toMatch(/the answer already stored with\s+it is the one that was kept/i);

    expect(html).not.toMatch(/was stored as background information/i);
    expect(html).not.toMatch(/exactly as you gave it/i);
  });

  it("links only to routes that exist, and offers a way in for someone who has not started", () => {
    // This test used to assert `expect(hrefs).toEqual([])` - "no internal href whatsoever,
    // so it cannot link to a route that does not exist". It served its stated purpose, but
    // only as a side effect of having no links at all, and that guarantee produced a dead
    // end: a participant who reached `/ready` without answering the screening question was
    // told they could close the tab and finish, and was never told they had not started.
    // Nothing a page does not link to can be a defect of that page, so the assertion could
    // not have caught this.
    //
    // It is now asserted against the set of routes that actually exist, which is what the
    // original comment claimed to be testing. `KNOWN_ROUTES` is the authority: a route is
    // either listed here or it does not exist, so this fails on a dangling link rather than
    // on any link.
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);

    for (const href of hrefs) {
      expect(
        KNOWN_ROUTES,
        `"/ready" links to "${href}", which is not a route in this app`,
      ).toContain(href);
    }

    // The specific route, asserted separately. The screen it belongs to is the Ilocano
    // question, and that question is what creates an identity - so a visitor who has not
    // started has exactly one correct destination, and this is it.
    expect(hrefs).toContain("/start");

    // ...and the page says so in words, because a link labelled with jargon is not a way
    // in for a participant. This also guards the reason the link exists: a bare link to
    // /start would be reachable but unexplained.
    expect(html).toMatch(/Reaching this page does not mean you answered the Ilocano question/);
    expect(html).toMatch(/Go to the Ilocano question/);

    // The "you can finish" line must not be unconditional. It presupposes a start, and
    // this route cannot know whether one happened - which is the whole reason the copy was
    // softened rather than this route gated.
    //
    // ROUND SEVEN. The sentence that carried this qualification — "If you have already answered the
    // Ilocano question in this browser, closing this tab is a complete and legitimate way to finish" —
    // is gone, because it is now FALSE for a participant who has answered: they are not finished,
    // there are sentences waiting, and the page links to them two sections below.
    //
    // So the absence assertion below is retained and STRENGTHENED, and the presence assertion is
    // replaced by the claim that is true for both visitors. Nothing on this page may still tell
    // anyone they can stop here.
    expect(html).not.toMatch(/If you have already answered the Ilocano\s+question in this browser/);
    expect(html).not.toMatch(/Closing this tab is a complete and legitimate way to finish\./);
    expect(html).not.toMatch(/complete and legitimate way to finish/i);
    // The true replacement: work done is banked, and there is more to do.
    expect(html).toMatch(/saved straight away/i);
  });

  it("does not display a validator identifier or a proficiency value", () => {
    expect(html).not.toMatch(/VAL_[0-9a-f]{8}/);
    expect(html).not.toMatch(/not_confident|conversational/i);
  });
});
