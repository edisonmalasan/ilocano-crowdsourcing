/**
 * The dashboard views as rendered markup, over hand-built service output.
 *
 * `renderToStaticMarkup` is the right instrument here for the reason stated in
 * `onboarding-routes.test.tsx`: these assertions need the produced HTML, not a live DOM. And
 * these screens need NOTHING else — no effects, no handlers, no transitions, no client
 * component at all — so unlike the screening form there is no pending state this instrument
 * cannot see. What you read in these assertions is everything the researcher sees.
 *
 * The data below is the same hand-counted shape as the service fixture (E5/E6 flagged, E3
 * abstention, V4 unrecorded), duplicated rather than imported: importing the service fixture
 * would couple the view tests to the service tests, so a fixture edit made for the service
 * would move the views' expectations without touching a view.
 */
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { OverviewView } from "@/app/researcher/(protected)/overview";
import { EntryReviewView } from "@/app/researcher/(protected)/entries/[id]/entry-review";
import type { DashboardOverview, EntryReview } from "@/lib/admin/dashboard";

const OVERVIEW: DashboardOverview = {
  totalEntries: 6,
  totalQualifyingValidations: 12,
  attemptsWithResponses: 5,
  enrolledAttempts: 8,
  zeroResponseAttempts: 3,
  totalResponses: 13,
  cannotEvaluateCount: 1,
  buckets: { incomplete: 3, complete: 3 },
  coveragePercentage: 50,
  extraPackageEntries: ["E1", "E2"],
  lateArrivalCount: 2,
  lateArrivalEntryIds: ["E2"],
  evaluationDistribution: {
    correct_natural: 8,
    correct_unnatural: 0,
    incorrect: 4,
    cannot_evaluate: 1,
  },
  proficiencyBreakdown: {
    native: 1,
    fluent: 1,
    conversational: 1,
    basic: 1,
    not_confident: 0,
    unrecorded: 1,
  },
  reviewEntryIds: ["E5", "E6"],
};

/**
 * Every figure card's label and value, read as ADJACENT pairs.
 *
 * Scoped to the coverage-totals section so the evaluation-distribution and proficiency `<dt>`
 * rows — which also render label-then-value — cannot satisfy a totals assertion. The section is
 * located by its own `aria-label`, and the run of cards is bounded by the section's `</section>`, so
 * a figure added to a LATER section is not counted here by accident.
 */
function figurePairs(html: string): string[][] {
  const section =
    html.split('aria-label="Coverage totals"')[1]?.split("</section>")[0] ?? /* not found */ "";
  return [...section.matchAll(/>([^<>]+)<\/p><p[^>]*>([^<>]+)<\/p>/g)].map((match) => [
    match[1] ?? "",
    match[2] ?? "",
  ]);
}

const REVIEW: EntryReview = {
  entry: {
    id: "E5",
    category: "origin_destination",
    sourceEntryId: 5,
    categoryName: "Origin + Destination",
    instruction: "instruction for E5",
    origin: "origin of E5",
    destination: "destination of E5",
    transitMode: "walking",
    createdAt: "2026-09-01T12:00:00.000Z",
    isActive: true,
  },
  qualifyingCount: 3,
  isComplete: true,
  needsReview: true,
  responses: [
    {
      response: {
        id: "r08",
        validatorId: "VAL_00000001",
        datasetEntryId: "E5",
        batchId: "batch_01",
        evaluation: "correct_natural",
        englishTranslation: "Validator one's English.",
        filipinoTranslation: "Filipino ni validator one.",
        createdAt: "2026-09-02T12:00:00.000Z",
        updatedAt: "2026-09-02T12:00:00.000Z",
      },
      proficiency: "fluent",
      qualifies: true,
      disqualifyReason: null,
    },
    {
      response: {
        id: "r10",
        validatorId: "VAL_00000003",
        datasetEntryId: "E5",
        batchId: "batch_01",
        evaluation: "incorrect",
        correctedInstruction: "naurnos a balikas",
        englishTranslation: "Validator three's English.",
        filipinoTranslation: "Filipino ni validator three.",
        createdAt: "2026-09-03T12:00:00.000Z",
        updatedAt: "2026-09-03T12:00:00.000Z",
      },
      proficiency: null,
      qualifies: true,
      disqualifyReason: null,
    },
  ],
};

describe("OverviewView", () => {
  it("renders every approved figure with its OWN value, paired to its own label", () => {
    const html = renderToStaticMarkup(<OverviewView overview={OVERVIEW} />);

    // PAIRED, not two independent assertions over the whole document.
    //
    // An earlier draft asserted `html.toContain(label)` and `html.toContain(">" + value + "<")`
    // separately for each figure. That form is PERMUTATION-INVARIANT: the asserted value multiset
    // is {6, 12, 5, "50%", 1, 1, 1, 3, 2}, so swapping any two figures' values — rendering
    // `buckets.complete` under "Dataset entries" and `totalEntries` under "Coverage complete" —
    // leaves the suite fully green while the screen reports two materially wrong research
    // figures. The fix is to read each figure's card and require the label and value to be
    // ADJACENT inside it, which is the only arrangement that can distinguish the two orderings.
    //
    // The regex is anchored on the rendered structure measured from this view: a label `<p>`
    // immediately followed by the value `<p>`. It is asserted against a known fixture FIRST, so a
    // structure change that breaks the regex fails here loudly rather than silently matching
    // nothing — a pairing assertion that finds zero pairs is a vacuous assertion.
    const pairs = figurePairs(html);

    expect(pairs.length, "the pairing regex must find every figure").toBeGreaterThan(0);
    expect(pairs).toEqual([
      ["Dataset entries", "6"],
      ["Qualifying validations", "12"],
      ["Attempts with responses", "5"],
      ["Overall completion", "50%"],
      ["Complete entries", "3"],
      ["Incomplete entries", "3"],
      ["Stored responses", "13"],
      ["Cannot-evaluate responses", "1"],
      ["Entries with extra packages", "2"],
      ["Late-arrival responses", "2"],
      ["Needs researcher review", "2"],
    ]);
  });

  it("renders the participation attempt figures with attempt terminology and no person claims", () => {
    const html = renderToStaticMarkup(<OverviewView overview={OVERVIEW} />);

    const section =
      html.split('aria-label="Participation attempts"')[1]?.split("</section>")[0] ?? "";
    expect(section.length, "the participation section must render").toBeGreaterThan(0);
    for (const text of [
      "Enrolled attempts",
      "Attempts with responses",
      "Zero-response attempts",
      ">8<",
      ">5<",
      ">3<",
      "Attempts are anonymous study sessions, not unique people.",
    ]) {
      expect(section).toContain(text);
    }
    // Never a headcount of humans, and never an error state for the silent bucket.
    // (The pinned note itself says "not unique people", so the bans below name longer
    // person-count claims rather than the word "people" alone.)
    for (const banned of [
      "Unique validators",
      "unique humans",
      "distinct humans",
      "Enrolled people",
      "Participants",
      "how many people",
    ]) {
      expect(section).not.toContain(banned);
    }
    expect(section).not.toContain("error");
  });

  it("offers the research export download from the protected overview", () => {
    // The export action lives inside the authenticated view, not on any public screen: its
    // presence here is the UI half of the authorization story (the route's own guard is the
    // other half, proven in `export-route.test.ts`). Asserted as a real anchor to the export
    // route, so a button-shaped span with no destination fails.
    const html = renderToStaticMarkup(<OverviewView overview={OVERVIEW} />);

    expect(html).toContain('href="/researcher/export"');
    expect(html).toContain("Export data");
  });

  it("names the entries behind the overlap and late-arrival figures", () => {
    // The diagnostics identify entries; a count without the ids behind it is a figure a
    // researcher cannot act on.
    const html = renderToStaticMarkup(<OverviewView overview={OVERVIEW} />);

    expect(html).toContain("Entries: E1, E2");
    expect(html).toContain("Entries: E2");
  });

  it("names an empty diagnostic state instead of hiding the figure", () => {
    const html = renderToStaticMarkup(
      <OverviewView
        overview={{
          ...OVERVIEW,
          extraPackageEntries: [],
          lateArrivalCount: 0,
          lateArrivalEntryIds: [],
        }}
      />,
    );

    expect(html).toContain("No overlapping entries");
    expect(html).toContain("No late arrivals");
  });

  it("never presents an attempt count as persons", () => {
    // The methodology forbids presenting attempt identifiers — and therefore counts of them —
    // as evidence of distinct humans. Scoped to the totals section, where the headcount lives;
    // the proficiency section carries its own metadata-not-a-score disclaimer, asserted
    // elsewhere.
    const html = renderToStaticMarkup(<OverviewView overview={OVERVIEW} />);
    const section = html.split('aria-label="Coverage totals"')[1]?.split("</section>")[0] ?? "";

    expect(section).not.toMatch(/persons?|people|humans?|participants?/i);
  });

  it("renders no target anywhere, because there is no target to label", () => {
    // The corrected methodology holds no number of validators that completes an entry, so a view
    // that still rendered one — "3 of 3", "with 3 qualifying", or any "(N of N)" — would invite a
    // researcher to check records against a constant. Scoped to the totals section the same way
    // the pairing assertion is, so the evaluation-distribution copy cannot satisfy it by accident.
    const html = renderToStaticMarkup(<OverviewView overview={OVERVIEW} />);
    const section = html.split('aria-label="Coverage totals"')[1]?.split("</section>")[0] ?? "";

    expect(section).not.toMatch(/\(\d+ of \d+\)/);
    expect(section).not.toMatch(/with \d+ qualifying/);
    expect(section).not.toContain("coverage target");
  });

  it("labels the coverage denominator next to the percentage", () => {
    // A percentage without a stated denominator invites the wrong one. The definition lives next
    // to the figure, not just in a design document.
    const html = renderToStaticMarkup(<OverviewView overview={OVERVIEW} />);

    expect(html).toContain("out of 6 entries");
  });

  it("links each flagged entry to its exact review route, and nothing else links anywhere", () => {
    const html = renderToStaticMarkup(<OverviewView overview={OVERVIEW} />);

    expect(html).toContain('href="/researcher/entries/E5"');
    expect(html).toContain('href="/researcher/entries/E6"');
    // Exact link targets: one anchor per flagged entry, so a route rename fails here rather than
    // 404ing for a researcher.
    expect(html.match(/href="\/researcher\/entries\//g)).toHaveLength(2);
  });

  it("renders an explicit empty state instead of an empty list", () => {
    const html = renderToStaticMarkup(
      <OverviewView overview={{ ...OVERVIEW, reviewEntryIds: [] }} />,
    );

    expect(html).not.toContain("/researcher/entries/E5");
    expect(html).toContain("No entries currently meet the review rule");
  });

  it("shows proficiency as stored values with an unrecorded bucket, never as scores", () => {
    const html = renderToStaticMarkup(<OverviewView overview={OVERVIEW} />);

    // Scoped to the breakdown's own labels: the explanatory sentence beside them deliberately
    // contains the words "score" and "ranks" while disclaiming them, so a whole-markup negative
    // regex would fail on the disclaimer itself. What must be free of scoring language is the
    // set of labels a researcher reads as values.
    const section = html.split('aria-label="Proficiency breakdown"')[1] ?? "";
    const labels = [...section.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>/g)].map(
      (match) => match[1] ?? "",
    );
    expect(labels).toHaveLength(6);
    expect(labels.join(" ")).not.toMatch(/score|rank|weight/i);
    expect(html).toContain("Not recorded");
  });
});

describe("EntryReviewView", () => {
  it("renders the source entry fields exactly as stored", () => {
    const html = renderToStaticMarkup(<EntryReviewView review={REVIEW} />);

    for (const text of [
      "E5",
      "instruction for E5",
      "origin of E5",
      "destination of E5",
      "walking",
      "Complete",
      "3 qualifying validations",
      "flagged for researcher review",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("renders a Double Transit Mode pair as both modes, discarding neither", () => {
    const html = renderToStaticMarkup(
      <EntryReviewView
        review={{
          ...REVIEW,
          entry: {
            ...REVIEW.entry,
            id: "DTM_1",
            category: "double_transit_mode",
            sourceEntryId: 1,
            categoryName: "Double Transit Mode",
            origin: null,
            destination: "Abanao Square",
            transitMode: ["jeepney", "walking"],
          },
        }}
      />,
    );

    expect(html).toContain("jeepney + walking");
    expect(html).not.toContain("[object Object]");
  });

  it("states Incomplete rather than a fraction when the entry holds no validating package", () => {
    const html = renderToStaticMarkup(
      <EntryReviewView review={{ ...REVIEW, isComplete: false, qualifyingCount: 0 }} />,
    );

    expect(html).toContain("Incomplete");
    expect(html).not.toContain("Complete ·");
  });

  it("renders every response with its own research content, scoped to its validator", () => {
    const html = renderToStaticMarkup(<EntryReviewView review={REVIEW} />);

    // Split the markup on the validator scope the view itself declares: each validator's texts
    // must appear inside that validator's card and nowhere else.
    //
    // `segments[0]` IS asserted, and that is the correction to an earlier draft of this test. The
    // comment claimed the scoping held "and nowhere else", but only segments 1 and 2 were
    // examined — segment 0 is everything before the first response card, which is the source-entry
    // region. A regression that rendered every validator's translations up there, merged, would
    // have satisfied both `not.toContain` assertions in the response segments while violating the
    // requirement outright. Asserting segment 0 carries none of the research text closes that.
    const segments = html.split("data-validator=");
    expect(segments).toHaveLength(3);
    const [before, first, second] = [segments[0] ?? "", segments[1] ?? "", segments[2] ?? ""];

    // No validator's research text anywhere outside a per-validator card.
    for (const leaked of [
      "Validator one&#x27;s English.",
      "Validator three&#x27;s English.",
      "Filipino ni validator one.",
      "Filipino ni validator three.",
      "naurnos a balikas",
    ]) {
      expect(before, `source region must not contain ${leaked}`).not.toContain(leaked);
    }

    // The validator id must be DISPLAYED, not merely present as the attribute that opened this
    // segment — `expect(first).toContain("VAL_00000001")` was satisfied by `data-validator="VAL_…"`
    // itself, so it proved the attribute existed rather than that a researcher could read whose
    // response this was.
    expect(first).toContain("<code>VAL_00000001</code>");
    expect(first).toContain("<code>fluent</code>");
    expect(first).toContain("Validator one&#x27;s English.");
    expect(first).not.toContain("Validator three&#x27;s English.");
    // A `correct_natural` response carries no correction, so no correction row renders for it —
    // absence, not an empty field.
    expect(first).not.toContain("Corrected Ilocano");

    expect(second).toContain("<code>VAL_00000003</code>");
    expect(second).toContain("naurnos a balikas");
    expect(second).toContain("not recorded");
    expect(second).not.toContain("Validator one&#x27;s English.");
  });

  it("renders each of the four disqualify reasons, not only the abstention", () => {
    // Every reason string in the view, driven by the fixture that produces it. The earlier version
    // of this test covered `unevaluable` alone, which left three of the four copy strings in
    // `entry-review.tsx` asserted nowhere — a researcher reading "The English translation is
    // missing or blank" had no test behind that sentence at all.
    const cases = [
      { reason: "unevaluable", expected: "Abstentions never count toward coverage" },
      { reason: "missing-correction", expected: "A correction was required" },
      { reason: "missing-english", expected: "English translation is missing or blank" },
      { reason: "missing-filipino", expected: "Filipino translation is missing or blank" },
    ] as const;

    for (const { reason, expected } of cases) {
      const review: EntryReview = {
        ...REVIEW,
        responses: [
          {
            response: { ...REVIEW.responses[0]!.response, id: `r-${reason}` },
            proficiency: "fluent",
            qualifies: false,
            disqualifyReason: reason,
          },
        ],
      };

      const html = renderToStaticMarkup(<EntryReviewView review={review} />);

      expect(html, `reason ${reason} must be rendered`).toContain(expected);
      expect(html).toContain("Does not count");
      expect(html).not.toContain("Counts toward coverage");
    }
  });

  it("states the qualifying verdict with its reason on each response", () => {
    const no: EntryReview = {
      ...REVIEW,
      responses: [
        {
          response: {
            ...REVIEW.responses[0]!.response,
            id: "r07",
            evaluation: "cannot_evaluate",
            englishTranslation: undefined,
            filipinoTranslation: undefined,
          },
          proficiency: null,
          qualifies: false,
          disqualifyReason: "unevaluable",
        },
      ],
    };
    const html = renderToStaticMarkup(<EntryReviewView review={no} />);

    expect(html).toContain("Does not count");
    expect(html).toContain("cannot confidently evaluate");
  });

  it("links back to the dashboard and nowhere else", () => {
    const html = renderToStaticMarkup(<EntryReviewView review={REVIEW} />);

    expect(html).toContain('href="/researcher"');
  });
});
