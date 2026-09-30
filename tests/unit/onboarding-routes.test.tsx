import { readdirSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import ReadyPage, { metadata as readyMetadata } from "@/app/ready/page";
import StartPage, { metadata as startMetadata } from "@/app/start/page";
import { AnswerGroup, answerOptionClasses } from "@/components/validation/answer-option";
import { submitControlState } from "@/lib/validators/onboarding-flow";
import {
  ILOCANO_PROFICIENCY_CHOICES,
  ILOCANO_PROFICIENCY_QUESTION,
  ILOCANO_PROFICIENCY_SUPPORTING_COPY,
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
 */

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

/** The screening form, imported lazily so the mocks above are in place first. */
async function renderScreeningForm(): Promise<string> {
  const { ScreeningForm } = await import("@/app/start/screening-form");
  return renderToStaticMarkup(<ScreeningForm />);
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
    expect(KNOWN_ROUTES).toEqual(expect.arrayContaining(["/start", "/ready"]));
  });
});

describe("landing route", () => {
  const html = renderToStaticMarkup(<HomePage />);

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
  const html = renderToStaticMarkup(<StartPage />);

  it("has exactly one h1 and a distinct page title", () => {
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
  });

  it("declares real route metadata rather than a placeholder", () => {
    // Low severity, but it was untested and the failure is silent: replacing a required
    // page title with "Nowhere" passes every behavioural assertion in this file, because
    // `renderToStaticMarkup` does not emit the metadata object at all. Asserted against
    // the imported metadata rather than the HTML, since that is the only place it exists.
    expect(startMetadata.title).toBe("Screening");
    expect(startMetadata.title).not.toMatch(/todo|placeholder|nowhere|untitled/i);
    expect(startMetadata.description).toBeTypeOf("string");
    expect((startMetadata.description ?? "").trim().length).toBeGreaterThan(30);
    expect(startMetadata.description).not.toMatch(/todo|placeholder|nowhere|lorem/i);
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
    expect(submitControlState(true)).toEqual({
      disabled: true,
      ariaBusy: true,
      label: "Saving…",
    });
  });

  it("leaves the control enabled and ready when idle", () => {
    expect(submitControlState(false)).toEqual({
      disabled: false,
      ariaBusy: undefined,
      label: "Continue",
    });
  });

  it("never reports the control as idle while a write is in flight", () => {
    // The property, stated directly: a control that is clickable mid-write is how one
    // participant ends up with two identities.
    expect(submitControlState(true).disabled).toBe(true);
  });

  it("omits aria-busy entirely when idle, rather than setting it false", () => {
    const html = renderToStaticMarkup(<div aria-busy={submitControlState(false).ariaBusy} />);
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
  const html = renderToStaticMarkup(<ReadyPage />);

  it("has exactly one h1", () => {
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
  });

  it("declares real route metadata rather than a placeholder", () => {
    // Untested until third-round review: replacing this title with a placeholder passed
    // every behavioural assertion here, because `renderToStaticMarkup` never emits the
    // metadata object. Asserted against the import, which is the only place it exists.
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

  it("says plainly that receiving sentences is not switched on yet", () => {
    // A participant who expects sentences and gets none will assume the platform is
    // broken. Saying so is part of the deliverable, not an apology for it.
    expect(html).toMatch(/not switched on yet/i);
    expect(html).toMatch(/next part of the study/i);
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
    expect(html).toMatch(/If you have already answered the Ilocano\s+question in this browser/);
    expect(html).not.toMatch(/Closing this tab is a complete and legitimate way to finish\./);
  });

  it("does not display a validator identifier or a proficiency value", () => {
    expect(html).not.toMatch(/VAL_[0-9a-f]{8}/);
    expect(html).not.toMatch(/not_confident|conversational/i);
  });
});
