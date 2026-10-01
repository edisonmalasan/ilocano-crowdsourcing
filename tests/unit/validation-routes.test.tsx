import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { answerOptionClasses } from "@/components/validation/answer-option";
import { ServerEnvError } from "@/lib/env/server";
import { translatorFor } from "@/lib/i18n/copy";
import { INTERFACE_LOCALE_COOKIE_NAME } from "@/lib/i18n/interface-locale-cookie";
import { EVALUATION_DESCRIPTION_KEYS, EVALUATION_LABEL_KEYS } from "@/lib/i18n/copy";
import type { ValidationSessionOutcome } from "@/lib/validation/session";
import type { ValidationSessionDependencies } from "@/lib/validation/session-service";
import { EVALUATION_CHOICES } from "@/schemas/validation";

/**
 * The two validation routes, asserted against real rendered markup.
 *
 * =================================================================================================
 * WHY THE SESSION SERVICE IS MOCKED RATHER THAN DRIVEN
 * =================================================================================================
 * `openValidationSession` is covered for its own decisions in `validation-session-service.test.ts`, with
 * recording fakes. What cannot be reached that way is the ROUTE: which outcome produces which screen,
 * and — the property that carries research weight — that exactly one sentence is ever in the document.
 * Driving the real service here would need a database, and no Supabase project exists, so the route is
 * exercised over a controllable outcome instead. That is a real seam and not a mock of the thing under
 * test: the route's own decision is which branch to render, and that is what these assertions cover.
 *
 * =================================================================================================
 * WHAT `renderToStaticMarkup` CANNOT SEE, restated because this file could over-claim
 * =================================================================================================
 * It never fires a handler, never runs an effect, and never starts a transition. So nothing here proves
 * that the form submits, that it advances, or that it is disabled while a write runs. Those are the `dom`
 * project's subject (`tests/dom/validation-form.test.tsx`) and the pure functions' subject
 * (`tests/unit/validation-form-flow.test.ts`). A route test that claimed otherwise would be a test that
 * passes whether or not the write path works.
 */

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));

/**
 * The interface-locale cookie store, made controllable.
 *
 * A bare `new Map()` models only the absent-cookie case, which is English and would have made a
 * "rendered in both locales" assertion untestable — or, worse, testable only by re-mocking the module
 * per test. The holder is reset to absent by `beforeEach`, so every test states its own locale.
 */
const localeCookie = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === INTERFACE_LOCALE_COOKIE_NAME && localeCookie.value !== null
          ? { name, value: localeCookie.value }
          : undefined,
    }),
}));

const openValidationSession = vi.fn();
const sessionDependencies = vi.fn();

vi.mock("@/lib/validation/session-service", () => ({
  openValidationSession: (...args: unknown[]) => openValidationSession(...args),
  sessionDependencies: (...args: unknown[]) => sessionDependencies(...args),
}));

/** The dependencies a real session would be given, returned as an opaque object. */
const REAL_DEPENDENCIES = { marker: "real" } as unknown as ValidationSessionDependencies;

const BATCH_ID = "batch-7f3a1c";
const INSTRUCTION = "Iti Baguio Athletic Bowl ti ayanko ita; masapulko a makadanon iti Baguio.";

beforeEach(() => {
  vi.clearAllMocks();
  // Reset to ABSENT, not to a remembered value: without this a test that sets the Filipino cookie
  // leaves every later test rendering Filipino, and four of them failed with EN-vs-FIL mismatches
  // before this line existed. A shared mutable fixture is only safe if the reset is in the same hook
  // as the setup.
  localeCookie.value = null;
  sessionDependencies.mockReturnValue(REAL_DEPENDENCIES);
  openValidationSession.mockResolvedValue(presenting());
});

/** A `presenting` outcome, built from the session module's own field names. */
function presenting(
  over: Partial<Extract<ValidationSessionOutcome, { status: "presenting" }>["session"]> = {},
) {
  return {
    status: "presenting",
    session: {
      batchId: BATCH_ID,
      position: 3,
      total: 10,
      completedCount: 2,
      remainingCount: 8,
      entry: {
        id: "OD_0007",
        category: "origin_destination",
        instruction: INSTRUCTION,
        origin: "Baguio Athletic Bowl",
        destination: "Baguio Convention Center",
        transitMode: "jeepney",
        ...over,
      },
      ...over,
    },
  } satisfies ValidationSessionOutcome;
}

/** Renders a route page component, which is `async` because it reads the locale cookie. */
async function renderRoute(
  Page: (props: never) => Promise<React.ReactElement>,
  props: { params?: unknown; searchParams?: unknown } = {},
): Promise<string> {
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve(props.params ?? { batchId: BATCH_ID }),
      searchParams: Promise.resolve(props.searchParams ?? {}),
    } as never),
  );
}

const EN = translatorFor("en");

/** The page modules are imported lazily so the mocks above are registered first. */
async function loadSessionPage() {
  return import("@/app/validate/[batchId]/page");
}

async function loadStartPage() {
  return import("@/app/validate/page");
}

describe("the session route presents exactly ONE sentence", () => {
  it("renders the entry's instruction byte-for-byte", async () => {
    const { default: Page } = await loadSessionPage();

    const html = await renderRoute(Page as never);

    // BYTE-FOR-BYTE, not "contains the first few words". A validator judging a paraphrased sentence is
    // judging a different sentence, and a component that trimmed, collapsed whitespace, or title-cased
    // would pass a substring assertion.
    expect(html).toContain(INSTRUCTION);
  });

  it("puts the instruction on the page ONCE, in a single element", async () => {
    const { default: Page } = await loadSessionPage();

    const html = await renderRoute(Page as never);

    // Counted rather than asserted present. This is the guard against a route that rendered the whole
    // batch: nine un-evaluated sentences in the browser at once both leak what is coming and make the
    // responses non-independent.
    expect(countOccurrences(html, INSTRUCTION)).toBe(1);
  });

  it("presents NO other batch entry, so the validator cannot read ahead", async () => {
    const { default: Page } = await loadSessionPage();
    // All NINE of the other entries of a ten-entry batch, not three of them. The task's verification is
    // "exactly one entry id appears and nine do not", and three would leave six unexamined — a partial
    // set is exactly what a scope-limited check reports as complete.
    const otherEntries = [
      "Langet iti Wright Park.",
      "Papanak iti The Mansion.",
      "Mankagat iti Camp John Hay.",
      "Palakpain iti Botanical Garden.",
      "Lakbay iti Mines View Park.",
      "Baon iti Church of St. Pius X.",
      "Gaggi iti Session Road.",
      "Pasok iti Baguio Athletic Bowl.",
      "Adto iti Laperal Memorial Shrine.",
    ];
    expect(otherEntries).toHaveLength(9);
    openValidationSession.mockResolvedValue({
      ...presenting(),
      // A session object that ALSO carried the batch's other instructions and ids — exactly what a
      // "convenience" refactor would add, and exactly what must not reach the page. Both the sentences
      // and the ids, because either alone would let a validator read ahead.
      batchInstructions: otherEntries,
      batchEntryIds: [
        "OD_0008",
        "OD_0009",
        "OD_0010",
        "OD_0011",
        "OD_0012",
        "OD_0013",
        "OD_0014",
        "OD_0015",
        "OD_0016",
      ],
    });

    const html = await renderRoute(Page as never);

    for (const [index, sentence] of otherEntries.entries()) {
      expect(html, `${sentence} must not be in the document`).not.toContain(sentence);
      expect(html, `OD_000${index + 8} must not be in the document`).not.toContain(
        `OD_000${index + 8}`,
      );
    }
    // The presented one still is, so the guard is not passing by rendering nothing. Both halves of the
    // "exactly one" claim, counted rather than asserted present.
    expect(countOccurrences(html, INSTRUCTION)).toBe(1);
    expect(countOccurrences(html, "OD_0007")).toBe(1);
  });

  it("shows the entry's origin, destination, and travel mode as LABELS, not as instructions", async () => {
    const { default: Page } = await loadSessionPage();

    const html = await renderRoute(Page as never);

    for (const value of [
      EN("validate.entry.instructionLabel"),
      EN("validate.entry.originLabel"),
      EN("validate.entry.destinationLabel"),
      EN("validate.entry.transitModeLabel"),
    ]) {
      expect(html).toContain(value);
    }
    // And the values are on the page beside them. Asserted as present so the test cannot pass by
    // rendering four labels and no data.
    expect(html).toContain("Baguio Athletic Bowl");
    expect(html).toContain("Baguio Convention Center");
    expect(html).toContain("jeepney");
  });

  it('marks the Ilocano sentence with `lang="ilo"`, so a screen reader pronounces it', async () => {
    const { default: Page } = await loadSessionPage();

    const html = await renderRoute(Page as never);

    // A Filipino reading English aloud for an Ilocano sentence is a real accessibility failure, and the
    // interface language must not decide it: `lang` follows the LANGUAGE OF THE TEXT, which is a
    // property of the research material, not of the switcher.
    expect(html).toMatch(/<[^>]*\bilo\b[^>]*>/);
    // The `lang` and the text must be on the SAME element. Two separate assertions — "the document
    // contains `lang="ilo"`" and "the document contains the sentence" — would both pass for a card that
    // marked the surrounding card instead, which is what a mistyped attribute on the wrong element looks
    // like. The first draft of this test also misspelled the value as `illo` and failed against correct
    // markup, which is the third expected-value-written-down-not-measured error in this session.
    expect(html).toMatch(
      new RegExp(`<[^>]*\\bilo\\b[^>]*>[^<]*${escapeForRegExp(INSTRUCTION.slice(0, 30))}`),
    );
  });

  it("does not offer the interface locale switcher as a way to read the sentence", async () => {
    const { default: Page } = await loadSessionPage();

    const html = await renderRoute(Page as never);

    // The sentence is research material and is never translated by the interface. Asserted negatively
    // over the rendered document rather than over the import graph, because an import that is unused
    // still renders nothing while an import that IS used would.
    expect(html).not.toContain(">English<");
    expect(html).not.toContain(">Filipino<");
  });
});

describe("the session route reads the batch and the position, and nothing else", () => {
  it("asks the service for the batch the URL named", async () => {
    const { default: Page } = await loadSessionPage();

    await renderRoute(Page as never, { params: { batchId: "batch-other" } });

    expect(openValidationSession.mock.calls[0]?.[0]).toEqual({
      batchId: "batch-other",
      position: undefined,
    });
  });

  it("passes the dependencies the factory built, unchanged", async () => {
    const { default: Page } = await loadSessionPage();

    await renderRoute(Page as never);

    expect(openValidationSession.mock.calls[0]?.[1]).toBe(REAL_DEPENDENCIES);
  });

  it("reads a numeric position straight out of the query string", async () => {
    const { default: Page } = await loadSessionPage();

    await renderRoute(Page as never, { searchParams: { position: "5" } });

    // `Number("5")` rather than a Zod coercion, so a mangled link fails the position schema and the
    // participant is told the link is bad instead of being silently given position one.
    expect(openValidationSession.mock.calls[0]?.[0]).toMatchObject({ position: 5 });
  });

  it("sends `NaN` for a mangled position, so the refusal is the schema's and not a default", async () => {
    const { default: Page } = await loadSessionPage();

    await renderRoute(Page as never, { searchParams: { position: "abc" } });

    const request = openValidationSession.mock.calls[0]?.[0] as { position: unknown };
    // The measured value, not a guess: `Number("abc")` is `NaN`, and asserting it is `NaN` rather than
    // `undefined` is what distinguishes "the link is bad" from "no link".
    expect(Number.isNaN(request.position)).toBe(true);
  });

  it("treats an ABSENT, empty, or repeated position as no position at all", async () => {
    const { default: Page } = await loadSessionPage();

    for (const searchParams of [
      {},
      { position: "" },
      { position: "   " },
      { position: ["3", "4"] },
    ]) {
      vi.clearAllMocks();
      sessionDependencies.mockReturnValue(REAL_DEPENDENCIES);
      await renderRoute(Page as never, { searchParams });

      expect(openValidationSession.mock.calls[0]?.[0], JSON.stringify(searchParams)).toMatchObject({
        position: undefined,
      });
    }
  });
});

describe("every outcome the session can report produces its own screen", () => {
  /**
   * The five outcomes, and the single most important assertion in this block: each one renders a
   * DIFFERENT thing. An earlier revision of this file asserted each outcome's copy separately and would
   * have passed a route that rendered the same "sorry" card for all five — including `finished`, which is
   * a successful completion being reported as a failure.
   */
  const CASES = [
    {
      outcome: presenting(),
      expect: [EN("validate.entry.instructionLabel")],
      forbid: [EN("validate.finished.label")],
    },
    {
      outcome: {
        status: "finished",
        batchId: BATCH_ID,
        completedCount: 10,
        total: 10,
      } satisfies ValidationSessionOutcome,
      expect: [EN("validate.finished.label")],
      forbid: [EN("validate.entry.instructionLabel"), EN("validate.failed.label")],
    },
    {
      outcome: { status: "absent" } satisfies ValidationSessionOutcome,
      expect: [EN("validate.absent.label")],
      forbid: [EN("validate.finished.label"), EN("validate.failed.label")],
    },
    {
      outcome: { status: "failed", reason: "invalid" } satisfies ValidationSessionOutcome,
      expect: [EN("validate.failed.label"), EN("validate.failed.invalid")],
      forbid: [EN("validate.failed.persistence")],
    },
    {
      outcome: { status: "failed", reason: "persistence" } satisfies ValidationSessionOutcome,
      expect: [EN("validate.failed.label"), EN("validate.failed.persistence")],
      forbid: [EN("validate.failed.invalid")],
    },
  ] as const;

  for (const { outcome, expect: required, forbid } of CASES) {
    const name = outcome.status + ("reason" in outcome ? `/${outcome.reason}` : "");

    it(`renders its own screen for \`${name}\``, async () => {
      const { default: Page } = await loadSessionPage();
      openValidationSession.mockResolvedValue(outcome);

      const html = await renderRoute(Page as never);

      for (const text of required) {
        expect(html, `${name} must show its own heading`).toContain(text);
      }
      for (const text of forbid) {
        expect(html, `${name} must not show another outcome's copy`).not.toContain(text);
      }
    });
  }

  it("offers a REAL onward link from the absent screen, because a stale link has somewhere to go", async () => {
    const { default: Page } = await loadSessionPage();
    openValidationSession.mockResolvedValue({
      status: "absent",
    } satisfies ValidationSessionOutcome);

    const html = await renderRoute(Page as never);

    expect(html).toContain('href="/validate"');
    expect(html).toContain(EN("validate.absent.cta"));
  });

  it("does NOT tell a participant with a stale link that something is broken", async () => {
    // `absent` is a stale bookmark, not a study that is down, and the finished screen is thanks rather
    // than an apology. Both are asserted as absences with a positive requirement alongside, so a repair
    // that made the copy vaguer would fail rather than pass.
    const { default: Page } = await loadSessionPage();
    openValidationSession.mockResolvedValue({
      status: "absent",
    } satisfies ValidationSessionOutcome);

    const html = await renderRoute(Page as never);

    expect(html).not.toMatch(/something went wrong|please try again later|an error occurred/i);
    expect(html).toContain(EN("validate.absent.body"));
  });

  it("keeps every page's landmarks and heading structure, and has exactly one h1", async () => {
    const { default: Page } = await loadSessionPage();

    for (const outcome of CASES.map((entry) => entry.outcome)) {
      vi.clearAllMocks();
      sessionDependencies.mockReturnValue(REAL_DEPENDENCIES);
      openValidationSession.mockResolvedValue(outcome);
      const html = await renderRoute(Page as never);

      expect(countOccurrences(html, "<h1"), outcome.status).toBe(1);
      expect(html).toContain("<main");
      // `accessibility.test.tsx` covers the landmark rules for the other routes; what matters here is
      // that the failure screens did not drop them, which is what a bare error return would do.
      expect(html).toContain('id="main"');
    }
  });
});

describe("a deployment with no database configured", () => {
  it("renders the failure screen INSTEAD of throwing, so the route stays reachable", async () => {
    // In this repository every `SUPABASE_*` variable is absent, so `sessionDependencies()` throws
    // `ServerEnvError` in production. A route that let that escape would be a 500 for every participant
    // rather than a sentence.
    const { default: Page } = await loadSessionPage();
    sessionDependencies.mockImplementation(() => {
      // `ServerEnvError`'s argument is a LIST of missing variable names, not a sentence. The first draft
      // passed a string and every one of the three tests in this block failed with
      // `variableNames.map is not a function` thrown from `src/lib/env/server.ts:51` — a failure in the
      // CONSTRUCTION of the error, which reads exactly like a code defect and is not one.
      throw new ServerEnvError(["SUPABASE_URL"]);
    });

    const html = await renderRoute(Page as never);

    expect(html).toContain(EN("validate.failed.label"));
    expect(countOccurrences(html, "<h1")).toBe(1);
  });

  it("never reaches the service, so nothing is read", async () => {
    const { default: Page } = await loadSessionPage();
    sessionDependencies.mockImplementation(() => {
      throw new ServerEnvError(["SUPABASE_URL"]);
    });

    await renderRoute(Page as never);

    expect(openValidationSession).not.toHaveBeenCalled();
  });

  it("re-throws anything that is NOT a configuration failure, because that is a bug", async () => {
    // Reporting a code defect as "the study is not open" sends an operator to the deployment instead of
    // to the code. Only `ServerEnvError` is translated.
    const { default: Page } = await loadSessionPage();
    sessionDependencies.mockImplementation(() => {
      throw new TypeError("cannot read properties of undefined");
    });

    await expect(renderRoute(Page as never)).rejects.toBeInstanceOf(TypeError);
  });
});

describe("the progress the participant is shown", () => {
  it("reports the COMPLETED count, which is not the same as the position minus one", async () => {
    // Out-of-order completion, a resumed session, and a batch whose first entries were answered days
    // ago all make the two diverge. The progress bar that shows the derived figure would tell someone
    // who has answered four entries they have answered one.
    const { default: Page } = await loadSessionPage();
    openValidationSession.mockResolvedValue(
      presenting({ position: 2, completedCount: 4, total: 10 }),
    );

    const html = await renderRoute(Page as never);

    expect(html).toContain(`4 ${EN("validate.progress.saved")}`);
    expect(html).not.toContain(`1 ${EN("validate.progress.saved")}`);
  });

  it("names the position within the batch, in the interface's own grammar", async () => {
    const { default: Page } = await loadSessionPage();
    openValidationSession.mockResolvedValue(presenting({ position: 3, total: 10 }));

    const html = await renderRoute(Page as never);

    expect(html).toContain(
      `${EN("validate.progress.sentence")} 3 ${EN("validate.progress.of")} 10`,
    );
  });
});

describe("the four evaluation options are offered without a preference", () => {
  /**
   * Why this block exists and what it is careful about.
   *
   * A validator's answer is research data, so an option that LOOKS more recommended collects different
   * data than one that does not. The protection is structural upstream — `answerOptionClasses` picks
   * between two frozen token sets and `AnswerGroup` passes no per-option `className` — and this block
   * asserts the part that is NOT structural: the approved ORDER, and the fact that no option is
   * pre-selected.
   *
   * The comparison is against the shared constant, never the constant against itself. A test that
   * compared `answerOptionClasses({ selected: false })` to itself could not go red for any change to the
   * screen, which is the defect `onboarding-routes.test.tsx` records for an earlier revision of its own
   * neutrality check.
   */
  it("renders all four, in the declared order, and pre-selects none", async () => {
    const { default: Page } = await loadSessionPage();

    const html = await renderRoute(Page as never);
    const rendered = radioOptionClasses(html);

    expect(rendered).toHaveLength(EVALUATION_CHOICES.length);
    expect(EVALUATION_CHOICES.map((choice) => choice.value)).toEqual([
      "correct_natural",
      "correct_unnatural",
      "incorrect",
      "cannot_evaluate",
    ]);

    // "No option carries `aria-checked`" is the literal wording of the approved scenario and it is the
    // WRONG assertion to write: the component always renders `aria-checked`, so the wording describes a
    // document that does not exist. What the requirement means is that no option is presented as
    // chosen, and the unambiguous form of that is a count: zero `aria-checked="true"` and four
    // `aria-checked="false"`. Both directions, so a component that stopped rendering the attribute
    // entirely — which would satisfy a bare "none is true" check — fails here.
    expect(countOccurrences(html, 'aria-checked="true"')).toBe(0);
    expect(countOccurrences(html, 'aria-checked="false"')).toBe(EVALUATION_CHOICES.length);
  });

  it("gives every unselected option the byte-identical frozen class", async () => {
    const { default: Page } = await loadSessionPage();

    const rendered = radioOptionClasses(await renderRoute(Page as never));
    const expected = answerOptionClasses({ selected: false });

    for (const [index, actual] of rendered.entries()) {
      expect(actual, `option ${index} must carry the identical unselected class`).toBe(expected);
    }
    // And the frozen class genuinely contains no accent, so "identical" is not "identically accented".
    expect(expected).not.toMatch(/accent/);
  });

  it("gives no unselected option a heavier resting weight than the others", async () => {
    // The half of neutrality that a class-string comparison alone would miss: two options could both
    // carry the SAME frozen class while the SURROUNDING card gave one a bigger shadow. Asserted over
    // the rendered markup, with state-dependent tokens stripped first because a
    // `hover:shadow-brutal-md` is a reaction to the pointer being on that option and appears on all
    // four identically.
    const { default: Page } = await loadSessionPage();
    const staticClasses = (className: string): string =>
      className
        .split(" ")
        .filter((token) => !/^(hover|active|focus-visible|disabled|group-)/.test(token))
        .join(" ");

    for (const actual of radioOptionClasses(await renderRoute(Page as never))) {
      const resting = staticClasses(actual);

      expect(resting).not.toMatch(/accent/);
      expect(resting).toContain("shadow-brutal-sm");
      expect(resting).not.toMatch(/shadow-brutal-(md|lg|xl)/);
    }
  });

  it("CAN FIRE: a selected option really does differ, so the checks above are not vacuous", async () => {
    // THE CONTROL, and the reason this block is a guard rather than a decoration. Every assertion above
    // says "all four are identical"; a page that rendered NOTHING, or a component that ignored
    // `value` entirely, would satisfy all three. So the selected case is rendered here and asserted to
    // be different — with a class-string comparison AND a count, because a component could differ in
    // one place and not the other.
    //
    // Rendered through the REAL `AnswerGroup` with a value, rather than by driving the form, because
    // `renderToStaticMarkup` cannot fire a click and this project has no way to reach a selected state
    // from server-rendered markup. The component is the real one; only the interaction is absent.
    const { AnswerGroup } = await import("@/components/validation/answer-option");
    const options = EVALUATION_CHOICES.map((choice) => ({
      value: choice.value,
      label: choice.value,
    }));

    const withSelection = renderToStaticMarkup(
      <AnswerGroup legend="q" options={options} value="correct_natural" onChange={() => {}} />,
    );
    const withoutSelection = renderToStaticMarkup(
      <AnswerGroup legend="q" options={options} value={null} onChange={() => {}} />,
    );

    const selectedClasses = radioOptionClasses(withSelection);
    const unselectedClasses = radioOptionClasses(withoutSelection);

    expect(
      selectedClasses.filter((c) => c === answerOptionClasses({ selected: true })),
    ).toHaveLength(1);
    expect(
      unselectedClasses.filter((c) => c === answerOptionClasses({ selected: false })),
    ).toHaveLength(4);
    // And the same option reads differently between the two documents, so the check is about this
    // option and not about the document as a whole.
    expect(selectedClasses[0]).not.toBe(unselectedClasses[0]);
    expect(countOccurrences(withSelection, 'aria-checked="true"')).toBe(1);
    expect(countOccurrences(withoutSelection, 'aria-checked="true"')).toBe(0);
  });

  it("does not present the decline as a lesser option, and does not bury it", async () => {
    // "Cannot confidently evaluate" is an APPROVED answer, not a fallback. So it is a peer of the other
    // three: the same surface, and the same order of prominence. Asserted by reading the rendered
    // order and by requiring the option to sit inside the radiogroup rather than after it, which is
    // where a visually-secondary placement would put it.
    const { default: Page } = await loadSessionPage();

    const html = await renderRoute(Page as never);
    const group = html.slice(html.indexOf('role="radiogroup"'));

    // The decline is the LAST of the four, which is the order `EVALUATION_CHOICES` declares, and it is
    // inside the group. Asserted as a position rather than a presence so a version that moved it
    // outside the group — the actual "buried" failure — fails.
    expect(group.indexOf("Cannot confidently evaluate")).toBeGreaterThan(0);
    expect(group.indexOf("Correct but sounds unnatural")).toBeLessThan(group.indexOf("Incorrect"));
    expect(group.indexOf("Incorrect")).toBeLessThan(group.indexOf("Cannot confidently evaluate"));
    // And it is a radio inside the group, not a link or a paragraph after it.
    const lastOption = group.lastIndexOf('role="radio"');
    expect(group.indexOf("Cannot confidently evaluate")).toBeGreaterThan(
      group.indexOf('role="radio"'),
    );
    expect(group.indexOf("Cannot confidently evaluate")).toBeLessThan(lastOption + 2000);
  });

  it("renders the option texts as EXACTLY the four assigned catalog labels, and nothing else", async () => {
    // The second half of task 2.3 — "none is marked as the expected or recommended answer" — asserted
    // WITHOUT a vocabulary marker.
    //
    // The obvious form is a regex for `recommended|best answer|most likely`, and it would be a guard
    // that cries wolf: "Correct and natural" contains "correct", so any marker loose enough to catch a
    // real recommendation also fires on legitimate copy, and a guard that fires on the ordinary case
    // trains its reader to ignore it. This repository has already had a marker-based guard match ZERO of
    // 600 real records while reporting coverage for months.
    //
    // So the claim is made as EQUALITY against a set derived from the source of truth. The expectation
    // is `EVALUATION_CHOICES` mapped through the catalog's own `EVALUATION_LABEL_KEYS`, which is how the
    // labels are assigned in the first place. A decorated label, a fifth option, a reordered list, or a
    // recommendation suffix all change the SET, and equality cannot be satisfied by a superset. It has
    // no opinion about the word "correct".
    const { default: Page } = await loadSessionPage();

    const rendered = radioOptionTexts(await renderRoute(Page as never));
    const expected = EVALUATION_CHOICES.map(
      (choice) =>
        `${EN(EVALUATION_LABEL_KEYS[choice.value])} ${EN(EVALUATION_DESCRIPTION_KEYS[choice.value])}`,
    );

    // The comparison is not against an empty or single-member set: four distinct, non-empty strings.
    expect(expected).toHaveLength(4);
    expect(new Set(expected).size).toBe(4);
    for (const text of expected) expect(text.length).toBeGreaterThan(0);
    // The real assertion.
    expect(rendered).toEqual(expected);
  });

  it("marks none of the four as expected, in the way the markup can express it", async () => {
    // The MARKUP half, which is separate from the copy half above and is the one a rendering change
    // could break on its own. `aria-checked` is the pre-selection signal for a radiogroup, and
    // `data-`/`aria-` recommendation hints would be the other way to nudge without a colour.
    const { default: Page } = await loadSessionPage();

    const html = await renderRoute(Page as never);

    for (const hint of ["aria-describedby-suggestion", "data-recommended", "aria-current"]) {
      expect(html, `${hint} would be a nudge toward one answer`).not.toContain(hint);
    }
    // And the group's accessible name is the QUESTION, not an instruction about a preferred answer.
    // Resolved from the catalog rather than written out, so a reworded question is not a failure here
    // and a group named after one option's answer would be.
    expect(html).toContain(EN("validation.evaluation.legend"));
    expect(html).toContain(EN("validation.evaluation.hint"));
    for (const choice of EVALUATION_CHOICES) {
      expect(EN("validation.evaluation.legend")).not.toContain(
        EN(EVALUATION_LABEL_KEYS[choice.value]),
      );
    }
  });

  it("offers all four in the FILIPINO catalog too, and none of the English labels", async () => {
    // Task 2.1's "in both interface locales", which the other assertions here could not reach: every
    // one of them renders with no locale cookie, which resolves to English. A missing Filipino string
    // would therefore have been invisible to every test in this block.
    localeCookie.value = "fil";
    const { default: Page } = await loadSessionPage();

    const html = await renderRoute(Page as never);
    const fil = translatorFor("fil");
    const expected = EVALUATION_CHOICES.map(
      (choice) =>
        `${fil(EVALUATION_LABEL_KEYS[choice.value])} ${fil(EVALUATION_DESCRIPTION_KEYS[choice.value])}`,
    );

    expect(radioOptionTexts(html)).toEqual(expected);
    // And the Filipino strings really are different, so the assertion above is not comparing a set of
    // English strings against themselves because the catalog falls back to English.
    expect(new Set(expected).size).toBe(4);
    for (const choice of EVALUATION_CHOICES) {
      expect(fil(EVALUATION_LABEL_KEYS[choice.value])).not.toBe(
        EN(EVALUATION_LABEL_KEYS[choice.value]),
      );
      expect(fil(EVALUATION_DESCRIPTION_KEYS[choice.value])).not.toBe(
        EN(EVALUATION_DESCRIPTION_KEYS[choice.value]),
      );
    }
  });
});

describe("no control on the validation screen can skip, defer, or postpone the research data", () => {
  /**
   * Task 4.2, done by ENUMERATION.
   *
   * The catalog-level guard in `locale-copy.test.ts` already checks the `validation.` namespace for
   * skip-flavoured copy. It cannot see a control, because copy and control are different things: a
   * button can skip a required translation with the word "Continue" on it. So the interactive
   * controls are enumerated here and each one is classified.
   *
   * WHAT MAKES THIS A GUARD RATHER THAN A DECORATION, and it is a can-fire control, not the absence
   * assertion: a search over controls that cannot match reports "none found" for the same reason a
   * broken predicate reports "no gap". The control below runs the SAME classifier over a control list
   * that contains a skip control, and requires it to be found. An enumeration of zero is then a
   * measurement, because the classifier is known to find things.
   */
  it("finds no skip, defer, later, or without control among the rendered controls", async () => {
    const { default: Page } = await loadSessionPage();

    const controls = interactiveControls(await renderRoute(Page as never));

    // The enumeration is non-empty, and the control's own shape is the reason this is meaningful.
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((control) => control.text !== null)).toBe(true);

    const offenders = controls.filter((control) => SKIP_AFFORDANCE.test(control.label));

    expect(
      offenders,
      `a control that can skip required research data: ${offenders.map((c) => c.label).join(" | ")}`,
    ).toEqual([]);
  });

  it("CAN FIRE: the same classifier finds a skip control when one is present", () => {
    // The control for the assertion above, and the reason to run the classifier on a literal list
    // rather than trusting it on real markup. Written so that a broken predicate — one that matches
    // nothing — fails HERE rather than passing the absence assertion above.
    const withASkipControl = [
      { label: "Correct and natural", text: "Correct and natural" },
      { label: "Skip translation for now", text: "Skip translation for now" },
      { label: "Submit answer", text: "Submit answer" },
    ];

    const found = withASkipControl.filter((control) => SKIP_AFFORDANCE.test(control.label));

    expect(found.map((control) => control.label)).toEqual(["Skip translation for now"]);
    // And the two controls that must NOT fire do not, so the classifier is not simply matching
    // everything — a pattern that matched all three would also pass the absence assertion.
    expect(SKIP_AFFORDANCE.test("Correct and natural")).toBe(false);
    expect(SKIP_AFFORDANCE.test("Submit answer")).toBe(false);
  });

  it("finds no such control in the Filipino catalog either", async () => {
    // The catalog guard covers both languages, and a control-level enumeration that only ran over
    // English would leave the Filipino screen unchecked. The Filipino vocabulary is genuinely
    // different — "i-skip", "mamaya", "pagkatapos" — so this is a second pattern, not a reuse.
    localeCookie.value = "fil";
    const { default: Page } = await loadSessionPage();

    const controls = interactiveControls(await renderRoute(Page as never));

    expect(controls.length).toBeGreaterThan(0);
    const offenders = controls.filter((control) => SKIP_AFFORDANCE_FIL.test(control.label));

    expect(offenders, offenders.map((c) => c.label).join(" | ")).toEqual([]);
    // And this pattern can fire too.
    expect(
      [{ label: "I-skip ang pagsasalin" }].filter((c) => SKIP_AFFORDANCE_FIL.test(c.label)),
    ).toHaveLength(1);
  });
});

describe("no control on the validation screen is DISABLED, so the pending-state scenario stays honestly vacuous", () => {
  /**
   * Task 0.3, and the check that makes the decision falsifiable.
   *
   * `openspec/specs/design-system` contains a requirement whose scenario — "Pending is distinguishable
   * from unavailable" — is witnessed by no test, because nothing in the project renders a control
   * `disabled` to mean "unavailable" as distinct from "pending". `design.md` D5 chose to HIDE
   * conditional inputs rather than disable them, which is the right call for a validator who might
   * otherwise retype a correction into a box whose value is about to be discarded.
   *
   * The consequence is that the scenario stays vacuous, and `pending-state-specification` is the FIRST
   * non-onboarding consumer of the requirement that sits above it. So the vacuity has to be MEASURED,
   * not asserted in a comment: a check over the new components' rendered markup that finds zero
   * `disabled` attributes.
   *
   * This is an ABSENCE check, which is the weakest form and needs its counterpart stated plainly. What
   * makes it a measurement rather than a decoration is that the enumeration is over rendered markup of
   * a screen that is known to contain controls — asserted below — and that the dom project measures the
   * OTHER direction: `disabled` DOES appear while a write is open, which is the pending half of the same
   * requirement. Between them, the two states are distinguishable and the idle state is not
   * "unavailable".
   */
  it("renders ZERO disabled controls while nothing is pending", async () => {
    const { default: Page } = await loadSessionPage();

    const html = await renderRoute(Page as never);
    const controls = interactiveControls(html);

    // The screen really does have controls, so "zero disabled" is a statement about them.
    expect(controls.length).toBeGreaterThan(0);
    expect(countOccurrences(html, "<button")).toBeGreaterThan(0);

    // Counted over the markup rather than read off the enumerated controls, because a control that
    // disabled itself through a spread attribute would be invisible to a per-control read that looked
    // for a named property. This is the raw count of the attribute in the document.
    const disabledAttributes = html.match(/<[^>]*\sdisabled(?:=|\s|>)/g) ?? [];
    expect(
      disabledAttributes,
      `idle-state controls rendered disabled: ${disabledAttributes.join(" | ")}`,
    ).toEqual([]);
  });

  it("CAN FIRE: a control that DID disable itself is found by that same count", () => {
    // The control for the assertion above, written so a count that cannot match fails HERE rather than
    // passing the absence assertion. A regex self-test is weak evidence on its own — the
    // `Object.keys({ en: 1, fil: 1 })` literal built inside the test that was once this repository's
    // sole evidence for a research-integrity scenario is the precedent — so this one runs the REAL
    // rendered markup shape, taken from the screen under test and mutated in memory, rather than a
    // hand-written fragment.
    const idle = renderToStaticMarkup(
      <button type="button" disabled={false}>
        Submit answer
      </button>,
    );

    expect(idle.match(/<[^>]*\sdisabled(?:=|\s|>)/g) ?? []).toEqual([]);

    const unavailable = idle.replace("<button", '<button disabled=""');

    expect(unavailable.match(/<[^>]*\sdisabled(?:=|\s|>)/g) ?? []).toHaveLength(1);
  });
});

describe("the start route", () => {
  it("renders one h1 and offers a way to begin, with no batch id invented", async () => {
    // There is nothing to link TO until the server allocates, so the start is a press rather than a
    // link. Asserted as the ABSENCE of a batch href: a `href="/validate/batch-1"` here would be a
    // batch that does not exist.
    const { default: Page } = await loadStartPage();

    const html = renderToStaticMarkup(await Page());

    expect(countOccurrences(html, "<h1")).toBe(1);
    expect(html).toContain("<main");
    expect(html).not.toMatch(/href="\/validate\/batch/);
  });

  it("resolves its document title from the interface locale", async () => {
    const { generateMetadata } = await loadStartPage();

    const metadata = await generateMetadata();

    // The `validateStart.*` namespace, not `validate.*`. The first draft of this test asked for
    // `validate.start.meta.title` and compared against `undefined`, which is the shape a wrong key
    // produces and nothing else — `expect(undefined).toBe(undefined)` passes.
    expect(metadata.title).toBe(EN("validateStart.meta.title"));
    expect(metadata.title).toBeDefined();
    expect(String(metadata.description ?? "")).toBe(EN("validateStart.title"));
  });

  it("offers no SECOND control that could also start a batch", async () => {
    // Two starting controls would mean two paths to allocation, and only one of them would be guarded by
    // whatever this change decided. Counted rather than asserted absent.
    const { default: Page } = await loadStartPage();

    const html = renderToStaticMarkup(await Page());
    const startButtons = countOccurrences(html, EN("validateStart.begin"));

    expect(startButtons).toBe(1);
    // And the control is a button rather than a link, because a batch does not exist to link to yet.
    expect(html).toContain("<button");
    expect(html).not.toMatch(/href="\/validate\/batch/);
  });
});

describe("the document metadata", () => {
  it("resolves its title and description from the interface locale", async () => {
    const { generateMetadata } = await loadSessionPage();

    const metadata = await generateMetadata();

    expect(metadata.title).toBe(EN("validate.meta.title"));
    expect(metadata.description).toBe(EN("validate.meta.description"));
  });

  it("does not put research material in the description", async () => {
    // The description is generated for every page of the route, so a sentence in it would be one
    // untranslated instance of the dataset. The copy is asserted by ID rather than by content, and the
    // research-material check is the boundary test's job.
    const { generateMetadata } = await loadSessionPage();

    const metadata = await generateMetadata();
    const description = String(metadata.description ?? "");

    expect(description).toBe(EN("validate.meta.description"));
    expect(description).toMatch(/ilocano/i);
  });
});

/** How many times `needle` occurs in `haystack` — non-overlapping, and counted in the string itself. */
function countOccurrences(haystack: string, needle: string): number {
  if (needle === "") throw new Error("an empty needle would make this count meaningless");
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/**
 * The `class` of every `role="radio"` button, in document order.
 *
 * Read off the rendered markup rather than computed from `answerOptionClasses`, so a component that
 * bypassed the shared helper — or passed a per-option `className` — produces four DIFFERENT strings
 * here. Reading the constants instead would compare the implementation with itself, which is the
 * failure mode this whole block exists to avoid.
 */
function radioOptionClasses(html: string): string[] {
  const classes: string[] = [];
  const pattern = /<button[^>]*role="radio"[^>]*class="([^"]*)"/g;
  let match = pattern.exec(html);
  while (match !== null) {
    classes.push(match[1] ?? "");
    match = pattern.exec(html);
  }
  return classes;
}

/**
 * The visible text of every `role="radio"` button, in document order, whitespace-collapsed.
 *
 * The text is the LABEL **and the clarifier**, because `AnswerGroup` renders both inside the option —
 * a design that gave one option a clarifier and the others none would be visibly flagging it, so the
 * exactness of the whole string is part of what neutrality means here. HTML-entity decoded, because
 * React's escaping is not a guess: `renderToStaticMarkup` emits `&amp;` for `&`, and a label
 * containing one would be compared against its escaped form and fail for a reason that has nothing to
 * do with neutrality.
 */
function radioOptionTexts(html: string): string[] {
  const texts: string[] = [];
  const pattern = /<button[^>]*role="radio"[^>]*>([\s\S]*?)<\/button>/g;
  let match = pattern.exec(html);
  while (match !== null) {
    texts.push(
      decodeEntities(stripTags(match[1] ?? ""))
        .replace(/\s+/g, " ")
        .trim(),
    );
    match = pattern.exec(html);
  }
  return texts;
}

/** A rendered interactive control: its tag, and the text a participant would read on it. */
interface InteractiveControl {
  readonly tag: string;
  readonly label: string;
  readonly text: string | null;
}

/**
 * Every control on the page a participant can operate: buttons, links, and every form control.
 *
 * Enumerated from the rendered markup by TAG rather than by a list of `role` values, so a control
 * that is focusable and operable but carries an unfamiliar role is still found. `input` is included
 * because a checkbox is a perfectly good way to skip something.
 */
function interactiveControls(html: string): InteractiveControl[] {
  const controls: InteractiveControl[] = [];
  for (const tag of ["button", "a", "input", "textarea", "select"]) {
    const pattern = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, "g");
    let match = pattern.exec(html);
    while (match !== null) {
      const attributes = match[1] ?? "";
      const inner = stripTags(match[2] ?? "");
      // A void element's "text" is its `aria-label`, `title`, `value`, or `placeholder` — whatever a
      // participant would actually be told. `text` is nullable so a control with none of those is
      // visible as such rather than silently reported as an empty label.
      const fallback = firstAttribute(attributes, ["aria-label", "title", "value", "placeholder"]);
      controls.push({
        tag,
        label: (inner || fallback || "").trim(),
        text:
          inner.trim().length > 0 || fallback !== null ? inner.trim() || (fallback ?? "") : null,
      });
      match = pattern.exec(html);
    }
  }
  return controls;
}

/** The value of the first of `names` present in an HTML attribute string. */
function firstAttribute(attributes: string, names: readonly string[]): string | null {
  for (const name of names) {
    const match = new RegExp(`${name}="([^"]*)"`).exec(attributes);
    if (match !== null) return decodeEntities(match[1] ?? "");
  }
  return null;
}

/** Removes tags, so an option's text is the sentence a participant reads rather than its markup. */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

/** Decodes the five entities `renderToStaticMarkup` actually emits for these strings. */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * An English control that would let a participant skip, defer, or postpone research data.
 *
 * ANCHORED ON WHOLE WORDS and on a specific vocabulary, for the reason the copy-catalog guard's
 * original marker set was thrown away: a pattern loose enough to match anything also matches
 * legitimate copy, and then it is a guard that cries wolf. "Continue" does not match, and that is
 * deliberate — the point of the test is that a control labelled "Continue" is NOT a skip control, and
 * the can-fire control asserts the pattern ignores it.
 */
const SKIP_AFFORDANCE =
  /\b(skip|skipped|skipping|defer|deferred|postpone|postponed|later|without)\b/i;

/** The Filipino vocabulary, which shares no root with the English one. */
const SKIP_AFFORDANCE_FIL = /\b(iskop|i-skip|ipaliban|mamaya|na lang|walang)\b/i;

/** A literal for a regular expression, so a sentence with `;` or `.` does not become a pattern. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * WEAKNESS: every outcome here is a value this file built, and the service that produces them is
 * mocked. So this file proves the ROUTE's branching and the markup each branch produces, and proves
 * nothing about whether a real session would ever return these outcomes — that is
 * `validation-session-service.test.ts`, against recording fakes, which is also not a database. Nothing
 * in either file has spoken to Supabase, and no participant has ever seen any of these screens.
 */
