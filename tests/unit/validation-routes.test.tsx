import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { answerOptionClasses } from "@/components/validation/answer-option";
import { defaultBatchId } from "@/lib/allocation/allocate-batch";
import { ServerEnvError } from "@/lib/env/server";
import { translatorFor } from "@/lib/i18n/copy";
import { INTERFACE_LOCALE_COOKIE_NAME } from "@/lib/i18n/interface-locale-cookie";
import { EVALUATION_DESCRIPTION_KEYS, EVALUATION_LABEL_KEYS } from "@/lib/i18n/copy";
import type { ValidationSessionOutcome } from "@/lib/validation/session";
import type { ValidationSessionDependencies } from "@/lib/validation/session-service";
import { batchRoutePath } from "@/lib/validation/batch-route";
import { EVALUATION_CHOICES } from "@/schemas/validation";
import { ANONYMOUS_VALIDATOR_ID_PATTERN, ILOCANO_PROFICIENCY_CHOICES } from "@/schemas/validator";

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

/**
 * The identifier pattern as a SUBSTRING search rather than a whole-string match.
 *
 * `ANONYMOUS_VALIDATOR_ID_PATTERN` is anchored — `^VAL_…$` — because it validates a whole id. Used
 * unmodified to SEARCH rendered markup it can never match anything: without the `m` flag `^` means
 * the start of the document and `$` the end, so the first draft of the control below found zero
 * identifiers in a fixture that contains one. The anchors are stripped here rather than the pattern
 * being retyped, and the derivation is asserted so a pattern that ever stopped being anchored cannot
 * quietly make this a second no-op that looks like a search.
 *
 * (`onboarding-routes.test.tsx` hardcodes `/VAL_[0-9a-f]{8}/` instead, which works and is a guess
 * about the format. Deriving it keeps this file from carrying a second copy of the schema.)
 */
const IDENTIFIER_IN_TEXT = new RegExp(
  ANONYMOUS_VALIDATOR_ID_PATTERN.source.replace(/^\^/, "").replace(/\$$/, ""),
  "g",
);

/** How many stored identifiers a chunk of markup carries, by the schema's own definition. */
function identifiersIn(html: string): string[] {
  return html.match(IDENTIFIER_IN_TEXT) ?? [];
}

/**
 * The batch id, minted by the REAL function that mints production ids.
 *
 * It was the literal `"batch-7f3a1c"` until this change, and that was a defect in the fixture rather
 * than in the product: `defaultBatchId` produces `${validatorId}-${now.toISOString()}`, so every real
 * batch id **embeds the validator's own identifier**. A fixture shaped like `batch-7f3a1c` therefore
 * cannot leak an identifier even if a route rendered one, which would have made the finished screen's
 * "shows no stored identifier" guard pass vacuously — the failure mode `tasks.md` 4.1 warns about by
 * name, and the reason it says to use "the identifiers the fixtures actually contain".
 *
 * Deriving it from the real minter rather than writing the string out means the fixture cannot drift
 * away from production's shape if the format ever changes.
 */
const BATCH_ID = defaultBatchId("VAL_a81d92c1", new Date("2026-09-30T20:14:03.117Z"));
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

/**
 * A `finished` outcome, built from the session module's own field names.
 *
 * `satisfies` rather than a bare annotation, so a change to the variant's key set breaks this file
 * instead of silently producing an outcome the route cannot render. The lifetime figure is DELIBERATELY
 * different from `completedCount` — 27 against 10 — because a fixture where the two agreed would
 * satisfy every "two distinct figures" assertion below while proving nothing about distinguishability.
 */
function finished(over: Partial<Extract<ValidationSessionOutcome, { status: "finished" }>> = {}) {
  return {
    status: "finished",
    batchId: BATCH_ID,
    completedCount: 10,
    total: 10,
    lifetimeAnsweredCount: 27,
    ...over,
  } satisfies ValidationSessionOutcome;
}

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

/**
 * Renders the FINISHED screen — the route, driven with the `finished` fixture.
 *
 * At module scope rather than inside one `describe`, because two blocks reach for it: the figures
 * block that first needed it, and the two-controls block this change added. A second local copy would
 * have been two ways to render one screen, and the two would have drifted the moment either gained an
 * argument.
 */
async function renderFinished(over: Parameters<typeof finished>[0] = {}): Promise<string> {
  const { default: Page } = await loadSessionPage();
  openValidationSession.mockResolvedValue(finished(over));
  return renderRoute(Page as never);
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
    // And the presented entry's own identifier is NOT rendered either: identifiers are
    // researchers-only, so no entry is distinguishable by id on this screen — by
    // the presented sentence, which the count above already pins to exactly one.
    expect(countOccurrences(html, "OD_0007")).toBe(0);
  });

  it("shows the sentence with its instruction label, and no endpoint block", async () => {
    const { default: Page } = await loadSessionPage();

    const html = await renderRoute(Page as never);

    expect(html).toContain(EN("validate.entry.instructionLabel"));
    // Neither the labels nor the values. The keys are gone from the catalog
    // entirely, so the labels are asserted as literals — a reworded label
    // would pass, which is exactly why the endpoint VALUES below are asserted
    // too: a block that relabelled itself would still show its data.
    for (const value of ["Intended origin", "Intended destination", "Intended travel mode"]) {
      expect(html).not.toContain(value);
    }
    // ("Baguio Athletic Bowl" is deliberately NOT asserted absent — it occurs
    // inside the instruction itself, so that assertion would fail on a correct
    // page.)
    expect(html).not.toContain("Baguio Convention Center");
    expect(html).not.toContain("jeepney");
    // And the per-entry saving note is gone with the block: the persistence
    // behavior is unchanged, only the repeated sentence. ("saved" alone would
    // match the progress count, so the assertion names the sentence's clause.)
    expect(html).not.toContain("saved as soon as");
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
      outcome: finished(),
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

  it("keeps every page's landmarks and heading structure, with the finished screen headerless", async () => {
    const { default: Page } = await loadSessionPage();

    for (const outcome of CASES.map((entry) => entry.outcome)) {
      vi.clearAllMocks();
      sessionDependencies.mockReturnValue(REAL_DEPENDENCIES);
      openValidationSession.mockResolvedValue(outcome);
      const html = await renderRoute(Page as never);

      // Every state keeps the route header — except `finished`, which drops it by owner
      // decision ("This batch is finished" already says where the participant is). Asserted
      // per outcome rather than as a blanket count, so a future state that drops or keeps
      // the header fails here by name instead of shifting a shared total.
      const expectedH1 = outcome.status === "finished" ? 0 : 1;
      expect(countOccurrences(html, "<h1"), outcome.status).toBe(expectedH1);
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

describe("no routine progress is presented", () => {
  it("renders the entry and its form with no progress sentence, saved count, bar, or percentage", async () => {
    // Owner decision (five-entry-concurrent-persistence): steady answering needs no running
    // commentary on background work. The runner renders the entry plus failure-only status;
    // the completed count and placement still travel server-side and are simply not presented.
    const { default: Page } = await loadSessionPage();
    openValidationSession.mockResolvedValue(
      presenting({ position: 2, completedCount: 4, total: 5 }),
    );

    const html = await renderRoute(Page as never);

    expect(html).toContain(INSTRUCTION);
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain("aria-valuenow");
    expect(html).not.toContain("%");
  });

  it("renders the SERVER's entry, never the URL's requested position", async () => {
    // The progress line that used to witness this is gone by owner decision, so the entry
    // itself is the witness: the service resolved position 1 forward to the entry at
    // placement 4, and the route renders exactly that entry.
    const { default: Page } = await loadSessionPage();
    const RESOLVED_INSTRUCTION =
      "Iti Balligi terminal ti ayanko ita; masapulko a makadanon iti Centro.";
    const resolved = presenting({ position: 4, total: 5 });
    resolved.session.entry = {
      ...resolved.session.entry,
      id: "OD_0009",
      instruction: RESOLVED_INSTRUCTION,
      origin: "Balligi terminal",
      destination: "Centro",
    };
    openValidationSession.mockResolvedValue(resolved);

    const html = await renderRoute(Page as never, { searchParams: { position: "1" } });

    expect(html).toContain(RESOLVED_INSTRUCTION);
    // The service WAS asked for the URL's position — so the test is not passing because the route
    // ignored the query string altogether and defaulted to the first placement.
    expect(openValidationSession.mock.calls[0]?.[0]).toMatchObject({ position: 1 });
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
    // EVERY control must be labellable, because a control the enumerator cannot read a label from is
    // invisible to `SKIP_AFFORDANCE` below — it would be reported as a control with no text rather
    // than as a control to be judged.
    //
    // This assertion became REACHABLE when the void-element repair landed: before it, the enumerator
    // could not see an `<input>` at all, so a labelless one was never in `controls` to fail here. The
    // first draft of this line had no message, and a re-verification probe that added a bare
    // `<input type="checkbox" />` produced `expected false to be true` with nothing naming the control
    // or the cause — the next reader would have been looking at a skip-affordance guard while the
    // actual problem was a missing `aria-label`. The offending controls are named instead.
    const unlabelled = controls.filter((control) => control.text === null);
    expect(
      unlabelled,
      `every control must carry a label a participant would read, since an unlabelled one cannot be ` +
        `judged by the pattern below: ${unlabelled.map((c) => `<${c.tag}> "${c.label}"`).join(" | ")}`,
    ).toEqual([]);

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

  it("CAN FIRE: a VOID control rendered as real markup is ENUMERATED, not just classified", () => {
    // The control the first draft of this guard did not have, and its absence is why the guard was
    // blind. The control above runs the CLASSIFIER over a hand-written literal array, so it proves the
    // predicate matches and says nothing about whether the EXTRACTION finds anything — and the
    // extraction was matching zero inputs, in all three spellings React emits, while the comment above
    // it named `input` as covered.
    //
    // So this one goes through `renderToStaticMarkup` and then through the real enumerator. Two
    // separate things are proved: the enumerator FINDS a void control, and the classifier FLAGS it.
    const realMarkup = renderToStaticMarkup(
      <div>
        <input type="checkbox" aria-label="Skip translation for now" readOnly />
        <input type="checkbox" aria-label="I already answered this one" readOnly />
        <button type="button">Submit answer</button>
      </div>,
    );

    const enumerated = interactiveControls(realMarkup);

    // EXTRACTION: both void inputs and the button are found, by tag, with no closing tag present.
    expect(enumerated.filter((control) => control.tag === "input")).toHaveLength(2);
    expect(enumerated.filter((control) => control.tag === "button")).toHaveLength(1);
    // The attributes reached the label — an input found but unlabelled would be invisible to the
    // classifier, which is a subtler version of the same defect.
    expect(enumerated.map((control) => control.label)).toContain("Skip translation for now");
    expect(enumerated.map((control) => control.label)).toContain("I already answered this one");
    // CLASSIFICATION: exactly the skip-flavoured one is flagged.
    const offenders = enumerated.filter((control) => SKIP_AFFORDANCE.test(control.label));
    expect(offenders.map((control) => control.label)).toEqual(["Skip translation for now"]);
  });

  it("enumerates ZERO inputs on the real screen, which is a measurement and not a broken pattern", async () => {
    // The companion to the control above, and the reason its absence was survivable for a while: the
    // live screen really does contain no `<input>` at all, so the blind spot had nothing to hide. That
    // is a fact about TODAY's markup, not a property of the enumerator, and it is stated here so a
    // reader can tell which of the two it is. The `aria-checked` count of **4** above is the same kind
    // of fact: the options are `<button role="radio">`, so the text fields are the only form controls
    // and they are `<textarea>`.
    const { default: Page } = await loadSessionPage();

    const html = await renderRoute(Page as never);
    const controls = interactiveControls(html);

    expect(controls.filter((control) => control.tag === "input")).toHaveLength(0);
    // And the tags that ARE present, so the enumeration is not simply returning nothing.
    //
    // `button` ALONE, and that is a measurement rather than a placeholder: this screen has no
    // evaluation chosen yet, and per D5 the conditional inputs are HIDDEN rather than rendered
    // disabled, so there is no `<textarea>` either. The first draft of this assertion expected
    // `{button, textarea}` and failed — an expected value written down instead of measured, which is
    // the sixth time this session that one produced a failure against correct code.
    expect(new Set(controls.map((control) => control.tag))).toEqual(new Set(["button"]));
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

describe("the finished screen reports no numeric figures", () => {
  /**
   * WHY THIS BLOCK EXISTS AFTER THE FIGURES WERE REMOVED.
   *
   * The finished screen used to report two labelled counts, and this file owned the harness
   * that could reach it: the `openValidationSession` mock, the controllable locale cookie,
   * the `renderRoute` helper, and the `finished()` fixture. The figures are gone by owner
   * decision, but the harness and the route-enumeration machinery remain the right tools for
   * the replacement claim — that NO screen shows them — so the block was rewritten rather
   * than deleted. A deleted block would leave the removal itself unasserted.
   */

  it("renders no labelled figures on the finished screen, in either language", async () => {
    // Owner decision: the heading plus the saved-as-you-go sentence already say the batch is
    // finished, and the two buttons already name the choice. Asserted per locale, and as the
    // absence of the figure LIST (`<dl>`) rather than of any one label — a screen that kept
    // the list with different labels would satisfy a label check while violating the
    // requirement. The removed labels are also named outright below, so a re-add under the
    // same keys fails by content even before the list check runs.
    for (const locale of ["en", "fil"] as const) {
      localeCookie.value = locale === "en" ? null : locale;
      const html = await renderFinished();

      expect(html, `${locale} finished screen renders a figure list`).not.toContain("<dl");
      expect(html, `${locale} finished screen renders a figure term`).not.toContain("<dt");
      expect(html, `${locale} finished screen renders a figure value`).not.toContain("<dd");
    }
    localeCookie.value = null;
  });

  it("shows no figure list and no removed figure label on ANY screen", async () => {
    // The CROSS-SCREEN half of `tasks.md` 1.5, which its verification explicitly says must not be
    // claimed from one file: "naming one file is not that". So every route in the application is
    // rendered and enumerated here, and the claim is made over the whole set.
    //
    // Routes, read from the directory rather than listed, and the count is asserted so a new
    // route cannot be added without this enumeration noticing. A hard-coded list would go stale
    // quietly and the test would keep passing while covering less than it claims.
    const { readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const routeFiles = readdirSync(join(process.cwd(), "src", "app"), { recursive: true })
      .map(String)
      .filter(
        (name) =>
          name.endsWith("page.tsx") || name.endsWith("page.ts") || name.endsWith("route.ts"),
      );

    // The five routes, as they stood when this was written, named here so a reader can see what the
    // directory walk is expected to find. Asserted against the walk, not substituted for it.
    //
    // `recursive: true` returns platform-separated paths on Windows, so the separator is normalised
    // BEFORE anything is compared — the first draft compared the raw `validate\[batchId]\page.tsx`
    // against the route path, matched nothing, and fell through to calling a route component that
    // requires `params` with no arguments. A comparison that cannot match is a comparison that has
    // already failed, and it failed loudly here rather than quietly.
    const routes = routeFiles
      .map((name) =>
        name
          .replace(/\\/g, "/")
          .replace(/(^|\/)(page\.tsx?|route\.ts)$/, "$1")
          .replace(/\/$/, ""),
      )
      .sort();

    expect(routes).toEqual([
      "",
      "api/validation-responses",
      "ready",
      "researcher/(protected)",
      "researcher/(protected)/entries/[id]",
      "researcher/(protected)/export",
      "researcher/sign-in",
      "start",
      "validate",
      "validate/[batchId]",
    ]);

    // =============================================================================================
    // WHY FOUR ROUTES ARE ENUMERATED BUT NOT RENDERED, AND WHY THAT IS NOT A SILENT SKIP
    // =============================================================================================
    // The four `researcher/**` routes are behind an authenticated boundary, they are not part of the
    // PUBLIC validator experience, and this file's mocks do not stand in for them — rendering them
    // here would mean either mocking a cookie and a privileged client into a validation-route test,
    // or letting the render fail on a missing request scope. Neither belongs in this file.
    //
    // The important property is that they are still ENUMERATED, and that the partition below is
    // asserted to account for every route found. Without that, "skip the researcher routes" would be
    // a loophole that any future route could be routed through by containing the substring
    // `researcher`, and the claim would quietly cover less than it says. So:
    //
    //   - the full list above is asserted exactly, so a tenth route fails here by name;
    //   - every route is assigned to exactly one of the two groups below; and
    //   - the researcher group is asserted to be covered by a test file that DOES render it.
    // Four authenticated routes since the export download joined the dashboard change: the new
    // route sits beneath the same `(protected)` layout, so it belongs in this group for the same
    // reason — behind the boundary, not part of the public validator experience.
    //
    // Each entry names the FILE that renders that route's markup, and the handover check below
    // asserts every one of those files exists. The earlier version of this list was a bare
    // `string[]` checked by asserting ONE file existed, which meant adding a fourth skipped route
    // would have been covered by no assertion at all: the file could be deleted and the handover
    // would still pass on the strength of a different route's test. Naming the witness per route
    // is what makes the exclusion per-route rather than per-file-existence.
    const AUTHENTICATED_ROUTES = [
      { route: "researcher/(protected)", witness: "tests/unit/admin-routes.test.tsx" },
      {
        route: "researcher/(protected)/entries/[id]",
        witness: "tests/unit/entry-review-page.test.tsx",
      },
      {
        route: "researcher/(protected)/export",
        witness: "tests/unit/export-route.test.ts",
      },
      { route: "researcher/sign-in", witness: "tests/unit/admin-routes.test.tsx" },
    ];
    const AUTHENTICATED_ROUTE_NAMES = AUTHENTICATED_ROUTES.map((entry) => entry.route);
    // The background-write transport is a POST-only Route Handler: it has no page component
    // and renders no markup, so it belongs in neither rendered group. Named outright rather
    // than filtered by prefix, so a second API route fails the partition below by name.
    const API_ROUTES = ["api/validation-responses"];
    const validatorRoutes = routes.filter(
      (route) => !AUTHENTICATED_ROUTE_NAMES.includes(route) && !API_ROUTES.includes(route),
    );
    const skippedRoutes = routes.filter((route) => AUTHENTICATED_ROUTE_NAMES.includes(route));
    const apiRoutes = routes.filter((route) => API_ROUTES.includes(route));

    // The partition is total and disjoint, which is what makes the exclusion an assertion rather than
    // a filter. If a route were in neither list it would simply not be rendered or counted.
    expect([...validatorRoutes, ...skippedRoutes, ...apiRoutes].sort()).toEqual(routes);
    expect(validatorRoutes).toEqual(["", "ready", "start", "validate", "validate/[batchId]"]);
    expect(skippedRoutes).toEqual(AUTHENTICATED_ROUTE_NAMES);
    expect(apiRoutes).toEqual(API_ROUTES);

    // And the handover is real rather than asserted in prose: for every skipped route, the file
    // named as its witness must exist. A missing witness makes that route's exclusion unmonitored,
    // which is the only thing this handover is for.
    const { existsSync } = await import("node:fs");
    for (const { route, witness } of AUTHENTICATED_ROUTES) {
      expect(
        existsSync(join(process.cwd(), witness)),
        `${route} is excluded from this enumeration, so ${witness} must render it`,
      ).toBe(true);
    }

    // The removed figure labels, quoted so a re-add under any key fails by content. The
    // catalog keys are gone, so these literals are the only witness left that the strings
    // ever existed — and the only thing that would catch their return.
    const removedLabels = [
      "Entries answered in this batch",
      "Entries answered in total",
      "Mga entry na sinagot sa batch na ito",
      "Mga entry na sinagot sa kabuuan",
    ];
    const screensWithFigures: string[] = [];

    for (const route of validatorRoutes) {
      const specifier = `@/app/${route === "" ? "page" : `${route}/page`}`;
      // Named `routeModule`, not `module`: the next lint rule in this project treats a binding
      // called `module` as the CommonJS module object and refuses the assignment outright
      // (`@next/next/no-assign-module-variable`), which is correct about what it can see and beside
      // the point for a dynamic import result.
      const routeModule = (await import(/* @vite-ignore */ specifier)) as {
        default?: (props?: never) => Promise<React.ReactElement>;
      };
      if (routeModule.default === undefined) continue;

      openValidationSession.mockResolvedValue(finished());
      // The one route with DYNAMIC parameters is driven through `renderRoute`, which supplies them;
      // the other four take none. Getting this backwards throws a destructuring `TypeError` rather
      // than failing an assertion, which is at least a loud failure.
      const html =
        route === "validate/[batchId]"
          ? await renderRoute(routeModule.default as never)
          : renderToStaticMarkup(
              await (routeModule.default as () => Promise<React.ReactElement>)(),
            );

      if (removedLabels.some((label) => html.includes(label))) {
        screensWithFigures.push(route || "/");
      }
      if (html.includes("<dl")) screensWithFigures.push(`${route || "/"}#dl`);
    }

    // EXACTLY NONE — so a screen that grows a figure list or re-adds the removed labels fails
    // here by name. Kept as a measurement over the known route set (rather than a bare
    // absence assertion on one screen) so the enumeration still notices a new route.
    expect(screensWithFigures).toEqual([]);
  });

  it("reveals NO stored identifier and NO proficiency answer", async () => {
    // `tasks.md` 4.1. Asserted over real rendered markup, against patterns taken from the SCHEMA
    // rather than written by hand: `ANONYMOUS_VALIDATOR_ID_PATTERN` is the identifier's own
    // definition, and the proficiency values are the approved ones. A hand-typed `VAL_[0-9a-f]{8}`
    // would be a guess about the format that this repository has recorded going wrong before.
    const html = await renderFinished();

    // The identifier, by the pattern the schema itself declares. COUNTED, so a screen that rendered
    // it twice is caught as readily as one that rendered it once — and a regex match rather than a
    // literal `countOccurrences`, because the identifier is not a fixed string.
    const identifiers = identifiersIn(html);
    expect(
      identifiers,
      `the finished screen must show no stored identifier; found ${identifiers.join(" | ")}`,
    ).toEqual([]);
    // The machine-readable proficiency VALUES, in both catalogs' vocabulary. The approved values are
    // the domain's, not the catalog's, so a value can never be localised away into a false pass.
    for (const value of ILOCANO_PROFICIENCY_CHOICES.map((choice) => choice.value)) {
      expect(html, `the proficiency value "${value}" must not appear`).not.toContain(value);
    }
    // And the batch id itself, which embeds the validator id in production and is the most likely
    // single place an identifier could leak from.
    expect(html).not.toContain(finished().batchId);
  });

  it("CAN FIRE: the identifier and proficiency checks find both when the fixture carries them", () => {
    // `tasks.md` 4.2, and the mandatory negative control. Without it, 4.1 reports coverage it has not
    // provided — which is the vacuous-guard failure this repository has found six times, every one
    // of them a scan over rendered output.
    //
    // The probe uses a fixture that DOES carry the values, rendered through the SAME reader the
    // assertion above uses, and it is built from a real batch id: the batch id in this file is minted
    // by `defaultBatchId`, so it embeds a real `VAL_` identifier exactly as production ids do, which
    // is why the assertion above can honestly say the format is known rather than guessed.
    //
    // ALL FIVE approved values are rendered, not two of them, because the assertion above loops over
    // all five and a control that exercised two would leave the other three untested. The first draft
    // rendered `choices[0]` and `choices[4]` and then asserted all five were present, and failed on
    // `"fluent"` — the control asserting more than it built.
    const values = ILOCANO_PROFICIENCY_CHOICES.map((choice) => choice.value);
    // MEASURED, not assumed: the loop in the assertion above is only meaningful over a set of
    // distinct, non-empty values, and an empty or single-element set would make it look thorough
    // while checking one string.
    expect(values).toHaveLength(5);
    expect(new Set(values).size).toBe(5);
    for (const value of values) expect(value.length).toBeGreaterThan(0);

    const leaky = renderToStaticMarkup(
      <section>
        <p>{BATCH_ID}</p>
        {values.map((value) => (
          <p key={value}>{value}</p>
        ))}
      </section>,
    );

    // The fixture really does carry what the assertion looks for, measured rather than assumed.
    const identifierHits = identifiersIn(leaky);
    expect(identifierHits, "the control fixture must contain a real identifier").toHaveLength(1);
    for (const value of values) {
      expect(leaky, `the control fixture must contain the value "${value}"`).toContain(value);
    }
    // And the identifier's format comes from the schema, so the control cannot drift from it: if the
    // approved format ever changes, this control follows and 4.1 still means something.
    expect(identifierHits[0]).toMatch(ANONYMOUS_VALIDATOR_ID_PATTERN);
    // Which also means the substring form really is the schema's own: the whole matched identifier
    // validates, and the anchored pattern does NOT match a document containing more than an id. That
    // second half is what proves the anchor-stripping above was necessary rather than decorative.
    expect(identifierHits[0]).toMatch(ANONYMOUS_VALIDATOR_ID_PATTERN);
    expect(leaky).not.toMatch(ANONYMOUS_VALIDATOR_ID_PATTERN);
  });

  it("renders neither figure label in the FILIPINO catalog either", async () => {
    // The mirror of the English absence above: a removal that left the Filipino labels
    // rendering would be the half-localized page this project forbids. The keys are gone
    // from the catalog, so this asserts the render rather than the key set.
    localeCookie.value = "fil";

    const html = await renderFinished();

    expect(html).not.toContain("<dl");
    expect(html).not.toContain("Mga entry na sinagot sa batch na ito");
    expect(html).not.toContain("Mga entry na sinagot sa kabuuan");
    localeCookie.value = null;
  });
});

describe("the finished screen's two controls", () => {
  /**
   * ==============================================================================================
   * WHY THE COUNTS ARE ASSERTED HERE AND WHY THEY ARE COUNTS
   * ==============================================================================================
   * `tasks.md` 2.2 requires "exactly one" continue control and "exactly one" finish control, asserted
   * **by counting occurrences rather than by asserting a second is absent**, and its verification
   * requires that the counts be able to fail: "a count of `1` that was never observed at `2` is an
   * assertion that cannot fail."
   *
   * That is why the last test in this block renders the controls TWICE through the real component and
   * asserts the same counter then reports 2. It is the negative control the requirement asks for, and
   * it is run through the identical code path — the same `countOccurrences`, the same component, the
   * same markup shape — so a counter that cannot reach 2 fails there rather than silently making the
   * three real assertions decorative.
   *
   * WHY THE REAL ROUTE AND NOT JUST THE COMPONENT for the three counting assertions: the requirement is
   * about what the finished PRESENTATION offers, and the presentation is the route's branch. A screen
   * that rendered the controls twice — once from the component and once as route markup, say — would
   * satisfy a component-only count and violate the requirement, so the count has to be over the whole
   * rendered document. The can-fire control renders the component twice for exactly the same reason.
   */

  it("offers EXACTLY ONE control that can request another batch, and EXACTLY ONE that stops", async () => {
    const html = await renderFinished();

    // Both labels, counted. Not `toContain`, because `toContain` is satisfied by one, two, and five.
    expect(countOccurrences(html, EN("validate.finished.continue")), "continue control").toBe(1);
    expect(countOccurrences(html, EN("validate.finished.finish")), "finish control").toBe(1);
    // And counted as ELEMENTS, which is the structural half. **TWO buttons and no links**, where this
    // used to read "one button and one link": finishing is a `<button>` now, because it discards the
    // attempt token before it leaves and a link cannot do anything before it navigates
    // (`design.md` D3). The requirement this block enforces — two separate controls, pressing one
    // never triggers the other — is unchanged by that, and the counts are what would catch a screen
    // that quietly merged them back into one. If the labels were rendered in a paragraph as well as on
    // a control, the label count would be 1 each and a participant would still have nothing to press.
    expect(countOccurrences(html, "<button"), "buttons on the finished screen").toBe(2);
    expect((html.match(/<a\b/g) ?? []).length, "links on the finished screen").toBe(0);
    // And NO form, which is the load-bearing half of `tasks.md` 3.1's verification: "assert the absence
    // of a write by asserting the control is not a form". A `<form>` anywhere on this screen would
    // make a press a submission, and there is nothing here to submit. It is now the ONLY thing that
    // rules out a submission for the finish control, which is why it stayed a counted assertion
    // rather than becoming a comment.
    expect(countOccurrences(html, "<form"), "forms on the finished screen").toBe(0);
    // No `<dd>` anywhere on this screen: the figures are gone, and adding the controls
    // added none. Counted as `<dd>` because a figure list reintroduced here would arrive as
    // exactly that element, and a label-only check would miss it.
    expect(countOccurrences(html, "<dd"), "labelled figures on the finished screen").toBe(0);
  });

  it("CAN FIRE: rendering the same control TWICE makes both counts reach 2", async () => {
    // The control, and it is built from the REAL component rather than a hand-written fragment — the
    // same reasoning the `disabled`-count control in this file uses. A literal `<button>` in the test
    // would prove `countOccurrences` can return 2; it would not prove that this component's markup,
    // with its own class strings and its `data-` attributes, is what the counter sees.
    const { FinishedBatch } = await import("@/app/validate/[batchId]/finished-batch");

    const once = renderToStaticMarkup(<FinishedBatch locale="en" />);
    const twice = renderToStaticMarkup(
      <div>
        <FinishedBatch locale="en" />
        <FinishedBatch locale="en" />
      </div>,
    );

    // THE CONTROL, GREEN FIRST. One render must give exactly the counts the real assertion above
    // makes, or the whole comparison is against a number that never held. Both controls are buttons,
    // so the button count is 2 per render and the anchor count is 0 — asserted here rather than
    // assumed, because a control block that pins numbers it has never observed is the defect this
    // whole block exists to catch in the other direction.
    expect(countOccurrences(once, EN("validate.finished.continue"))).toBe(1);
    expect(countOccurrences(once, EN("validate.finished.finish"))).toBe(1);
    expect(countOccurrences(once, "<button")).toBe(2);
    expect((once.match(/<a\b/g) ?? []).length).toBe(0);

    // AND THEN RED: two renders must give 4 buttons, which is the value the real assertion forbids. If
    // any of these stayed at its single-render figure, the counter is not reading what the screen
    // renders and the assertions in this block are reporting coverage they do not have.
    expect(countOccurrences(twice, EN("validate.finished.continue"))).toBe(2);
    expect(countOccurrences(twice, EN("validate.finished.finish"))).toBe(2);
    expect(countOccurrences(twice, "<button")).toBe(4);
    expect((twice.match(/<a\b/g) ?? []).length).toBe(0);
    // And the exact shape the real route test forbids for the form element: two renders, still zero,
    // because this component has no form in it at all. That is the difference between "there is no
    // form" and "a form was counted and found to be one".
    expect(countOccurrences(twice, "<form")).toBe(0);
  });

  it("sends the finish control to the landing page, and nothing on this screen leaves the study", async () => {
    // `tasks.md` 3.1, amended by D3. The destination is still asserted against the component's own
    // exported constant rather than a literal repeated here, so a change to where finishing goes
    // cannot leave this test agreeing with a stale copy of it.
    //
    // WHAT MOVED, and it is the honest limit of this file: finish used to be an `<a href="/">`, so
    // `renderToStaticMarkup` could read the destination out of the rendered markup. It is a `<button>`
    // now — it discards the attempt token before it navigates, and a link cannot do anything before it
    // navigates — so **the destination is no longer in the markup and this file cannot see it.** The
    // requirement it serves is asserted where a handler can actually be pressed, in
    // `tests/dom/finished-batch.test.tsx`, which presses finish and asserts the router was asked for
    // exactly this value. What remains here, and remains meaningful, is that the screen renders no
    // link off this origin and that the finish label sits on a control rather than in a paragraph.
    const { FINISH_HREF } = await import("@/app/validate/[batchId]/finished-batch");
    const html = await renderFinished();

    expect(FINISH_HREF).toBe("/");
    // INTERNAL, and only internal: an absolute URL or a protocol-relative one would take a participant
    // off this deployment, which is a destination this project cannot vouch for. Checked over every
    // href in the document — and there are none left on this screen, so the loop below is empty and the
    // count assertion is what makes that vacuity visible rather than hidden.
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] ?? "");
    expect(hrefs, "the finished screen renders no link at all").toEqual([]);
    for (const href of hrefs) {
      expect(href, "every link on the finished screen must stay inside this study").toMatch(/^\//);
      expect(href).not.toMatch(/^[a-z][a-z0-9+.-]*:/i);
      expect(href).not.toMatch(/^\/\//);
    }
    // And the finish label is on a `<button>`, pinned to the element that carries it — the same
    // guarantee the anchor version gave, so a refactor that moved the label into prose still fails here.
    expect(html).toMatch(
      new RegExp(`<button[^>]*>\\s*${escapeForRegExp(EN("validate.finished.finish"))}`),
    );
  });

  it("renders the finished screen without the route header and without the finish note", async () => {
    // Owner decision: on the finished screen the heading already says where the participant
    // is, and the two buttons already name the choice — so the route header (h1 + lead) and
    // the explanatory note are gone here while every other state keeps the header. Asserted
    // per locale, because a header rendered only in one language would be the half-localized
    // page this project forbids.
    for (const locale of ["en", "fil"] as const) {
      localeCookie.value = locale === "en" ? null : locale;
      const t = translatorFor(locale);
      const html = await renderFinished();

      expect(html, `${locale} finished screen renders a page heading`).not.toContain("<h1");
      expect(html, `${locale} finished screen renders the route lead`).not.toContain(
        t("validate.meta.description"),
      );
      // The removed note's sentences, quoted so a re-add under any key fails by content.
      expect(html).not.toContain("Stopping here changes nothing");
      expect(html).not.toContain("Walang binabago sa ipinasa mo");
    }
    localeCookie.value = null;
  });

  it("labels both controls in the FILIPINO catalog too, and neither falls back to English", async () => {
    // `tasks.md` 5.1's scenario "both controls are present in both language catalogs", at the level of
    // the RENDERED screen. Every other test in this file renders with no locale cookie, which resolves
    // to English, so a missing Filipino label would be invisible to all of them — the half a
    // catalog-level key-set test cannot see, because a key can exist and never be rendered.
    localeCookie.value = "fil";
    const fil = translatorFor("fil");
    const html = await renderFinished();

    // Counted for the same reason as in English: a presence check cannot see a second copy. Both
    // controls are buttons on this screen (D3), so 2 and 0 — the same numbers the English block
    // asserts, which is the point of counting in both.
    expect(countOccurrences(html, fil("validate.finished.continue"))).toBe(1);
    expect(countOccurrences(html, fil("validate.finished.finish"))).toBe(1);
    expect(countOccurrences(html, "<button")).toBe(2);
    expect((html.match(/<a\b/g) ?? []).length).toBe(0);
    // The two Filipino labels are genuinely different strings from each other AND from the English
    // ones. The second check is the one that matters: a component that read the translator from a
    // module-level default would render English here and pass a `toContain(fil(...))` never.
    for (const key of ["validate.finished.continue", "validate.finished.finish"] as const) {
      expect(fil(key), `${key} fell back to English`).not.toBe(EN(key));
    }
    expect(fil("validate.finished.continue")).not.toBe(fil("validate.finished.finish"));
    // And the English labels really are absent from the Filipino document, which is the unambiguous
    // form of "did not fall back".
    expect(html).not.toContain(EN("validate.finished.continue"));
    expect(html).not.toContain(EN("validate.finished.finish"));
  });

  it("offers no control on the finished screen that can SKIP, defer, or postpone research data", async () => {
    // The finished screen's own enumeration, and the reason it is separate from the presenting
    // screen's block above. The finished screen is where a "skip" affordance would be least excusable:
    // everything the participant has to do is already done, so nothing on this screen could mean
    // "come back to this later".
    //
    // Both patterns are run, because the two catalogs share no root — `mamaya` and `ipaliban` have
    // nothing in common with `later` and `defer`.
    const english = interactiveControls(await renderFinished());

    expect(english.length, "the enumeration must find controls, not run over an empty set").toBe(2);
    expect(
      english.every((control) => control.text !== null),
      "every control must be labellable",
    ).toBe(true);
    const offendersEn = english.filter((control) => SKIP_AFFORDANCE.test(control.label));
    expect(
      offendersEn,
      `a control that could skip required research data: ${offendersEn.map((c) => c.label).join(" | ")}`,
    ).toEqual([]);

    localeCookie.value = "fil";
    const fil = translatorFor("fil");
    const filipino = interactiveControls(await renderFinished());

    expect(filipino.length).toBe(2);
    const offendersFil = filipino.filter((control) => SKIP_AFFORDANCE_FIL.test(control.label));
    expect(
      offendersFil,
      `a control that could skip required research data: ${offendersFil.map((c) => c.label).join(" | ")}`,
    ).toEqual([]);

    // AND THE TWO LABELS ARE NAMED, so a future reader can see what was judged rather than inferring
    // it from a count of zero. The continue label asks for MORE work, which is the opposite of a skip
    // affordance, and the finish label's reassurance sentence is not on a control at all — it is a
    // paragraph, and a paragraph cannot be pressed.
    expect(english.map((control) => control.label).sort()).toEqual(
      [EN("validate.finished.continue"), EN("validate.finished.finish")].sort(),
    );
    expect(filipino.map((control) => control.label).sort()).toEqual(
      [fil("validate.finished.continue"), fil("validate.finished.finish")].sort(),
    );
    // And the skip pattern still fires, so the absence above is a measurement. The control string is
    // the one this file's own classifier has always used.
    expect(SKIP_AFFORDANCE.test("Skip translation for now")).toBe(true);
    expect(SKIP_AFFORDANCE_FIL.test("I-skip ang pagsasalin")).toBe(true);
  });

  it("shows the finished screen's own identifier guard still holds after the controls were added", async () => {
    // Not a new requirement — the two figures block asserts this over the same screen — and it is
    // restated here for one reason: the finish control is the FIRST thing this change put on the
    // screen that could plausibly carry an identifier, because a link is somewhere an id could be put.
    // `FINISH_HREF` is `/` and the component receives no id, so nothing should now be there. It still
    // holds as written now that finish is a `<button>`: a button that navigates is exactly as capable
    // of putting an id in a URL as a link was, so the guard did not become unnecessary when the
    // element changed.
    const html = await renderFinished();

    expect(identifiersIn(html)).toEqual([]);
    expect(html).not.toContain(finished().batchId);
    expect(html).not.toMatch(/href="[^"]*VAL_/);
  });
});

describe("the start route", () => {
  it("renders one h1 and offers a way to begin, with no batch id invented", async () => {
    // There is nothing to link TO until the server allocates, so the start is a press rather than a
    // link. Asserted as the ABSENCE of any href under `/validate/`.
    //
    // ============================================================================================
    // THIS ASSERTION WAS VACUOUS, AND IT WAS VACUOUS BEFORE THE RECOVERY FEATURE EXISTED
    // ============================================================================================
    // It read `expect(html).not.toMatch(/href="\/validate\/batch/)`, on the reasoning that a batch id
    // begins `batch`. It does not. `defaultBatchId` mints
    // `VAL_a81d92c1-2026-09-30T20:14:03.117Z` — the validator's identifier first — so a real batch href
    // is `href="/validate/VAL_…"`, and the pattern could not match one in a thousand years of minting.
    //
    // The regex is now `href="\/validate\/`, which is the property the test was always about, and it
    // can fire. `tasks.md` 6.4 asked for exactly this check, and it is worth being precise about why it
    // mattered: the resume affordance this change adds is a `next/link` to `/validate/<batchId>`, so
    // for the first time in this repository a batch href on the start screen would have been LEGIMATE.
    // The old assertion would have passed unchanged, and it would have been saying nothing about the
    // thing it named.
    //
    // What the new assertion does NOT claim: that the client-rendered screen has no batch href. It
    // does, legitimately, once the lookup answers — `tests/dom/start-batch.test.tsx` covers that, and
    // this is the SERVER-rendered markup, where the offer cannot yet exist because the lookup is an
    // effect. That split is the reason a server-rendered guard stays meaningful after this change
    // rather than having to be weakened to accommodate it.
    const { default: Page } = await loadStartPage();

    const html = renderToStaticMarkup(await Page());

    expect(countOccurrences(html, "<h1")).toBe(1);
    expect(html).toContain("<main");
    expect(html).not.toMatch(/href="\/validate\//);
    // REWRITTEN by `batch-route-round-trip`, because the regex above is the assertion that carries
    // this claim and the one below had become permanently satisfied.
    //
    // This used to read
    //   expect(html).not.toContain(`/validate/${encodeURIComponent("VAL_a81d92c1-…")}`)
    // asserting the ready screen does not link to the ENCODED spelling of a batch. After this change
    // no producer may emit that spelling — it is precisely the address the defect produced — so the
    // string became unreachable by construction and the assertion could never fail again. It was
    // reporting coverage it was not providing, which is worse than reporting nothing.
    //
    // Replaced rather than deleted because the underlying claim is still worth making, and it is now
    // made about the spelling that actually exists. The prefix is derived from the contract module
    // rather than typed here, so a change to the route prefix cannot leave this assertion quietly
    // checking a string nothing produces — the defect the old line had.
    expect(batchRoutePath("VAL_a81d92c1-2026-09-30T20:14:03.117Z")).toBe(
      "/validate/VAL_a81d92c1-2026-09-30T20:14:03.117Z",
    );
  });

  it("resolves its document title from the interface locale", async () => {
    const { generateMetadata } = await loadStartPage();

    const metadata = await generateMetadata();

    // The `validateStart.*` namespace, not `validate.*`. The first draft of this test asked for
    // `validate.start.meta.title` and compared against `undefined`, which is the shape a wrong key
    // produces and nothing else — `expect(undefined).toBe(undefined)` passes.
    expect(metadata.title).toBe(EN("validateStart.meta.title"));
    expect(metadata.title).toBeDefined();
    expect(String(metadata.description ?? "")).toBe(EN("validateStart.lead"));
  });

  it("issues no manual control in server markup — orchestration starts on mount", async () => {
    // The start is an effect, not a press: the server markup carries the heading
    // and the working state, and zero controls that could request a batch. A
    // second mount-time request would come from an effect, not from markup, so
    // what this guards is that no pressable path to allocation exists here at
    // all — counted rather than asserted absent.
    const { default: Page } = await loadStartPage();

    const html = renderToStaticMarkup(await Page());
    const startButtons = countOccurrences(html, "<button");

    expect(startButtons).toBe(0);

    // And no control is a link either, because a batch does not exist to link to yet.
    //
    // SCOPED TO CONTROLS. A page-wide "no batch href" assertion used to live here and
    // was removed for two reasons: the `href="\/validate\/` pattern above already
    // carries the no-invented-address claim, and a resume offer once legitimately
    // carried a batch href here — a guard in that position contradicted the product
    // while being too weak to notice. What is asserted instead is a property OF THE
    // CONTROLS: there are none to carry anything.
    const buttonTags = html.match(/<button[^>]*>/g) ?? [];
    const linkTags = html.match(/<a[^>]*>/g) ?? [];

    // Both counts are the claim: zero buttons that could request a batch, zero
    // links that could name one. Either count above zero names the control that
    // reintroduced a manual path.
    expect(linkTags.length, "a link was found on the orchestration screen").toBe(0);
    expect(
      buttonTags.filter((tag) => tag.includes("href")),
      "a button carries an href",
    ).toEqual([]);
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
 * because a checkbox is a perfectly good way to skip something — and it is enumerated by a SEPARATE
 * pattern, because `input` is a void element and the general pattern demands a closing tag.
 */
function interactiveControls(html: string): InteractiveControl[] {
  const controls: InteractiveControl[] = [];
  for (const tag of INTERACTIVE_TAGS) {
    // A VOID element has no closing tag, so a pattern that demands `</input>` can never match one —
    // and the first draft of this helper used exactly that pattern for `input` while its own comment
    // claimed "`input` is included because a checkbox is a perfectly good way to skip something".
    // It enumerated ZERO inputs, in all three void spellings React emits. A guard that names a
    // control kind it cannot see is the failure this repository has now paid for twice, so the two
    // shapes are now separated explicitly rather than by one pattern that half-works.
    const pattern = VOID_TAGS.has(tag)
      ? new RegExp(`<${tag}\\b([^>]*)>`, "g")
      : new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`, "g");
    let match = pattern.exec(html);
    while (match !== null) {
      // React writes a void element as `<input ... />`, so the attribute group ends in a slash that is
      // markup rather than content and must not reach the label.
      const attributes = (match[1] ?? "").replace(/\/$/, "");
      const inner = stripTags(match[2] ?? "");
      // A void element has no inner text, so its "text" is its `aria-label`, `title`, `value`, or
      // `placeholder` — whatever a participant would actually be told. `text` is nullable so a control
      // with none of those is visible as such rather than silently reported as an empty label.
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

/**
 * The tags a participant can operate, enumerated by TAG rather than by a list of `role` values, so a
 * control that is focusable and operable but carries an unfamiliar role is still found.
 */
const INTERACTIVE_TAGS = ["button", "a", "input", "textarea", "select"] as const;

/** HTML void elements: no closing tag, no children, and a label only through attributes. */
const VOID_TAGS: ReadonlySet<string> = new Set(["input"]);

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
