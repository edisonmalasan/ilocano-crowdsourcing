import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import ReadyPage from "@/app/ready/page";
import StartPage from "@/app/start/page";
import { answerOptionClasses } from "@/components/validation/answer-option";
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
 * records the destination rather than navigating, so "which route does this hand off to"
 * is an assertion rather than an assumption.
 */

const pushed: string[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (destination: string) => {
      pushed.push(destination);
    },
    replace: (destination: string) => {
      pushed.push(destination);
    },
    refresh: () => {},
    back: () => {},
  }),
}));

/**
 * `server-only` throws when a client component's import graph reaches it. The screening
 * form imports the Server Action module, whose import chain legitimately reaches
 * server-only modules — that is the boundary working, not a violation. The stub lets the
 * markup render; the boundary itself is asserted by `tests/unit/supabase-clients.test.ts`,
 * which deliberately does not stub it.
 */
vi.mock("server-only", () => ({}));

/** The screening form, pulled in lazily so the router stub is in place first. */
async function renderScreeningForm(): Promise<string> {
  const { ScreeningForm } = await import("@/app/start/screening-form");
  return renderToStaticMarkup(<ScreeningForm />);
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

  it("explains that the identity is a random code held in the browser", () => {
    expect(html).toMatch(/random code held only in this browser/);
  });
});

describe("screening form", () => {
  it("renders exactly the five approved choices, in the approved order", async () => {
    const html = await renderScreeningForm();

    const positions = ILOCANO_PROFICIENCY_CHOICES.map((choice) => html.indexOf(choice.label));
    for (const position of positions) expect(position).toBeGreaterThan(-1);

    const ascending = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(ascending);
    expect((html.match(/role="radio"/g) ?? []).length).toBe(ILOCANO_PROFICIENCY_CHOICES.length);
  });

  it("adds no hint to any screening option", async () => {
    // A per-option hint is precisely how a screening question gets nudged. The option
    // markup is shared with validation answers, so this is a real risk to guard.
    const html = await renderScreeningForm();
    expect(html).not.toMatch(/Recommended|Ideal|Best answer|Required for/);
  });

  it("gives unselected screening options the same treatment as unselected validation options", () => {
    // The same frozen constant, compared directly rather than by eye. This is the
    // `design-system` delta's "screening options are no more weighted" scenario.
    const screening = answerOptionClasses({ selected: false });
    const validation = answerOptionClasses({ selected: false });

    expect(screening).toBe(validation);
    // And the unselected set carries no accent token at all.
    expect(screening).not.toMatch(/accent/);
  });

  it("offers an explicit way to continue without answering", async () => {
    const html = await renderScreeningForm();
    expect(html).toMatch(/Skip and continue without answering/);
  });

  it("does not disable the submit control before anything is pending", async () => {
    const html = await renderScreeningForm();
    expect(html).toMatch(/<button[^>]*type="submit"/);
    expect(html).not.toMatch(/aria-busy="true"/);
  });

  it("tells the participant an existing identity will be resumed, not duplicated", async () => {
    const html = await renderScreeningForm();
    expect(html).toMatch(/resume it instead of creating a second one/);
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

  it("links to no route that does not exist", () => {
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
    const internal = hrefs.filter((href) => href.startsWith("/"));

    // Only the root layout's `#main` skip target may appear, and it is a fragment.
    expect(internal).toEqual([]);
  });

  it("does not display a validator identifier or a proficiency value", () => {
    expect(html).not.toMatch(/VAL_[0-9a-f]{8}/);
    expect(html).not.toMatch(/not_confident|conversational/i);
  });
});
