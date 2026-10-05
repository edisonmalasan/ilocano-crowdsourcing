import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ENGLISH_COPY, FILIPINO_COPY } from "@/lib/i18n/copy";
import { EntryReviewView } from "@/app/researcher/(protected)/entries/[id]/entry-review";
import { OverviewView } from "@/app/researcher/(protected)/overview";
import type { EntryReview } from "@/lib/admin/dashboard";

const EM_DASH = "—";

const SITE_TITLE_KEYS = ["meta.siteTitle"] as const;

/** The two intentional site titles, byte-identical in both languages. */
const EXPECTED_ENGLISH_TITLE = "Sadino — validate Ilocano navigation data";
const EXPECTED_FILIPINO_TITLE = "Sadino — suriin ang datos ng nabigasyon sa Ilocano";

describe("product copy carries no em dash except the site title", () => {
  it("keeps both site titles byte-identical with their intentional em dash", () => {
    expect(ENGLISH_COPY["meta.siteTitle"]).toBe(EXPECTED_ENGLISH_TITLE);
    expect(FILIPINO_COPY["meta.siteTitle"]).toBe(EXPECTED_FILIPINO_TITLE);
  });

  it("holds no em dash in any other English catalog value", () => {
    const violations = Object.entries(ENGLISH_COPY)
      .filter(([key]) => !SITE_TITLE_KEYS.includes(key as "meta.siteTitle"))
      .filter(([, value]) => value.includes(EM_DASH))
      .map(([key]) => key);
    expect(violations, `English catalog keys holding U+2014: ${violations.join(", ")}`).toEqual([]);
  });

  it("holds no em dash in any other Filipino catalog value", () => {
    const violations = Object.entries(FILIPINO_COPY)
      .filter(([key]) => !SITE_TITLE_KEYS.includes(key as "meta.siteTitle"))
      .filter(([, value]) => value.includes(EM_DASH))
      .map(([key]) => key);
    expect(violations, `Filipino catalog keys holding U+2014: ${violations.join(", ")}`).toEqual(
      [],
    );
  });

  it("renders an absent entry field as None, never as an em dash", () => {
    const review: EntryReview = {
      entry: {
        id: "D_1",
        category: "destination_only",
        sourceEntryId: 1,
        categoryName: "Destination Only",
        instruction: "Mapan idiay Abanao Square.",
        origin: null,
        destination: null,
        transitMode: null,
        createdAt: "2026-09-01T12:00:00.000Z",
        isActive: true,
      },
      qualifyingCount: 0,
      isComplete: false,
      needsReview: false,
      responses: [
        {
          response: {
            id: "r01",
            validatorId: "VAL_00000001",
            datasetEntryId: "D_1",
            batchId: "batch_01",
            evaluation: "cannot_evaluate",
            createdAt: "2026-09-02T12:00:00.000Z",
            updatedAt: "2026-09-02T12:00:00.000Z",
          },
          proficiency: null,
          qualifies: false,
          disqualifyReason: "unevaluable",
        },
      ],
    };
    const html = renderToStaticMarkup(<EntryReviewView review={review} />);

    // All three absent fields render the placeholder: origin, destination, and transit mode.
    expect(html.match(/>None</g)).toHaveLength(3);
    expect(html).toContain("Marked cannot confidently evaluate. Abstentions never count");
    expect(html).not.toContain(EM_DASH);
  });

  it("renders the researcher overview sentences without an em dash", () => {
    const html = renderToStaticMarkup(
      <OverviewView
        overview={{
          totalEntries: 0,
          totalQualifyingValidations: 0,
          totalValidators: 0,
          totalResponses: 0,
          cannotEvaluateCount: 0,
          buckets: { incomplete: 0, complete: 0 },
          coveragePercentage: 0,
          evaluationDistribution: {
            correct_natural: 0,
            correct_unnatural: 0,
            incorrect: 0,
            cannot_evaluate: 0,
          },
          proficiencyBreakdown: {
            native: 0,
            fluent: 0,
            conversational: 0,
            basic: 0,
            not_confident: 0,
            unrecorded: 0,
          },
          reviewEntryIds: [],
          extraPackageEntries: [],
          lateArrivalCount: 0,
          lateArrivalEntryIds: [],
        }}
      />,
    );

    expect(html).toContain("Every stored row counts here, including ones");
    expect(html).not.toContain(EM_DASH);
  });
});
