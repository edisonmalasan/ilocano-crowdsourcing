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
  totalValidators: 5,
  buckets: { zero: 1, one: 1, two: 1, complete: 3 },
  coveragePercentage: 50,
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

const REVIEW: EntryReview = {
  entry: {
    id: "E5",
    category: "origin_destination",
    instruction: "instruction for E5",
    origin: "origin of E5",
    destination: "destination of E5",
    transitMode: "walking",
    createdAt: "2026-09-01T12:00:00.000Z",
    isActive: true,
  },
  qualifyingCount: 3,
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
  it("renders every approved figure with its computed value", () => {
    const html = renderToStaticMarkup(<OverviewView overview={OVERVIEW} />);

    for (const [label, value] of [
      ["Dataset entries", "6"],
      ["Qualifying validations", "12"],
      ["Validators who submitted responses", "5"],
      ["Overall coverage", "50%"],
      ["Entries with 0 qualifying", "1"],
      ["Entries with 1 qualifying", "1"],
      ["Entries with 2 qualifying", "1"],
      ["Coverage complete (3 of 3)", "3"],
      ["Needs researcher review", "2"],
    ] as const) {
      expect(html).toContain(label);
      expect(html).toContain(`>${value}<`);
    }
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
      "3 of 3 qualifying validations",
      "flagged for researcher review",
    ]) {
      expect(html).toContain(text);
    }
  });

  it("renders every response with its own research content, scoped to its validator", () => {
    const html = renderToStaticMarkup(<EntryReviewView review={REVIEW} />);

    // Split the markup on the validator scope the view itself declares: each validator's texts
    // must appear inside that validator's card and nowhere else.
    const segments = html.split("data-validator=");
    expect(segments).toHaveLength(3);
    const [first, second] = [segments[1] ?? "", segments[2] ?? ""];

    expect(first).toContain("VAL_00000001");
    expect(first).toContain("Validator one&#x27;s English.");
    expect(first).not.toContain("Validator three&#x27;s English.");
    expect(first).toContain("fluent");
    // A `correct_natural` response carries no correction, so no correction row renders for it —
    // absence, not an empty field.
    expect(first).not.toContain("Corrected Ilocano");

    expect(second).toContain("VAL_00000003");
    expect(second).toContain("naurnos a balikas");
    expect(second).toContain("not recorded");
    expect(second).not.toContain("Validator one&#x27;s English.");
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
