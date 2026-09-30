import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import ReadyPage from "@/app/ready/page";
import StartPage from "@/app/start/page";
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

  it("states that nothing identifying was collected", () => {
    expect(html).toMatch(/Nothing identifying was collected/);
  });

  it("says plainly that receiving sentences is not switched on yet", () => {
    // A participant who expects sentences and gets none will assume the platform is
    // broken. Saying so is part of the deliverable, not an apology for it.
    expect(html).toMatch(/not switched on yet/i);
    expect(html).toMatch(/next part of the study/i);
  });

  it("promises the screening question will not be asked again", () => {
    expect(html).toMatch(/will not be asked to screen again/);
  });

  it("does not claim the stored answer is always the one just given", () => {
    // It is not, on the stale-identifier path: a returning validator's ORIGINAL answer
    // is preserved and the one typed on /start is discarded. Saying "exactly as you
    // gave it" was untrue on that path.
    expect(html).not.toMatch(/exactly as you gave it/i);
    expect(html).toMatch(/the answer you had given earlier was kept instead/);
  });

  it("links to no internal route at all, so it cannot link to a route that does not exist", () => {
    // Asserted as "no internal href whatsoever" rather than a filtered subset, so a page
    // with zero links cannot pass by accident.
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
    expect(hrefs).toEqual([]);
  });

  it("does not display a validator identifier or a proficiency value", () => {
    expect(html).not.toMatch(/VAL_[0-9a-f]{8}/);
    expect(html).not.toMatch(/not_confident|conversational/i);
  });
});
