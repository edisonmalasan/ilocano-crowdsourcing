/**
 * The dashboard service over fakes, with a hand-counted dataset.
 *
 * Every figure below is derived by hand from the fixture and asserted exactly — not because the
 * arithmetic is hard, but because a dashboard test that asserts "a number came back" proves the
 * service runs, while one that asserts THE number proves it counts. The fixture is built to put
 * one entry in each bucket, one disagreement, one correction divergence, one abstention, one
 * unrecorded proficiency, and one empty entry, so every clause of the approved rule has a row
 * that exercises it and no clause shares a row with another.
 *
 * Fixture map (qualifying counts in brackets; complete/incomplete beside it; timestamps
 * after the id where they differ from the AT("02") default):
 *
 *   E1 [3]  three `correct_natural`, agree — complete, no flag, overlap, no late arrival
 *   E2 [2]  two qualifying, second at AT("03") — complete, no flag, overlap, one late arrival
 *   E3 [1]  one qualifying plus one `cannot_evaluate` — complete, no flag, no overlap
 *   E4 [0]  no responses — incomplete
 *   E5 [3]  evaluations disagree, third at AT("04") — complete AND flagged, overlap, one late
 *   E6 [3]  two distinct corrections, third at AT("05") — complete AND flagged, overlap, one late
 *
 * Five of six entries hold a validating package, so the partition is five complete and one
 * incomplete. Overlap entries are E1, E2, E5, E6; late arrivals are r05, r10, r13 — one per
 * overlapped entry except E1, whose three packages share one instant. Validators V1..V5 carry
 * fluent / native / conversational / null / basic; V5's null is the unrecorded bucket. Thirteen
 * stored responses, twelve qualifying, one abstention, five responding validators.
 */
import { describe, expect, it } from "vitest";

import type { DatasetEntry } from "@/schemas/dataset";
import type { ValidationResponse } from "@/schemas/validation";
import type { AnonymousValidatorId, ValidatorProfile } from "@/schemas/validator";

import {
  loadDashboardOverview,
  loadEntryReview,
  type DashboardRepositories,
} from "@/lib/admin/dashboard";

const AT = (day: string): string => `2026-09-${day}T12:00:00.000Z`;

const entry = (id: string): DatasetEntry => ({
  id,
  category: "origin_destination",
  instruction: `instruction for ${id}`,
  origin: `origin of ${id}`,
  destination: `destination of ${id}`,
  transitMode: "walking",
  createdAt: AT("01"),
  isActive: true,
});

const response = (
  id: string,
  validatorId: string,
  entryId: string,
  evaluation: ValidationResponse["evaluation"],
  extra: Partial<ValidationResponse> = {},
): ValidationResponse => ({
  id,
  validatorId: validatorId as AnonymousValidatorId,
  datasetEntryId: entryId,
  batchId: "batch_01",
  evaluation,
  createdAt: AT("02"),
  updatedAt: AT("02"),
  ...extra,
});

const bilingual = {
  englishTranslation: "Go north past the market.",
  filipinoTranslation: "Dumiretso ka sa hilaga lagpas ng palengke.",
};

const ENTRIES = ["E1", "E2", "E3", "E4", "E5", "E6"].map(entry);

const RESPONSES: ValidationResponse[] = [
  response("r01", "VAL_00000001", "E1", "correct_natural", bilingual),
  response("r02", "VAL_00000002", "E1", "correct_natural", bilingual),
  response("r03", "VAL_00000003", "E1", "correct_natural", bilingual),
  response("r04", "VAL_00000001", "E2", "correct_natural", bilingual),
  response("r05", "VAL_00000002", "E2", "correct_natural", {
    ...bilingual,
    createdAt: AT("03"),
    updatedAt: AT("03"),
  }),
  response("r06", "VAL_00000001", "E3", "correct_natural", bilingual),
  response("r07", "VAL_00000004", "E3", "cannot_evaluate"),
  response("r08", "VAL_00000001", "E5", "correct_natural", bilingual),
  response("r09", "VAL_00000002", "E5", "correct_natural", bilingual),
  response("r10", "VAL_00000003", "E5", "incorrect", {
    correctedInstruction: "naurnos a balikas",
    ...bilingual,
    createdAt: AT("04"),
    updatedAt: AT("04"),
  }),
  response("r11", "VAL_00000001", "E6", "incorrect", {
    correctedInstruction: "balikas a",
    ...bilingual,
  }),
  response("r12", "VAL_00000002", "E6", "incorrect", {
    correctedInstruction: "balikas b",
    ...bilingual,
  }),
  response("r13", "VAL_00000005", "E6", "incorrect", {
    correctedInstruction: "balikas a",
    ...bilingual,
    createdAt: AT("05"),
    updatedAt: AT("05"),
  }),
];

const PROFILES = new Map<string, ValidatorProfile>([
  ["VAL_00000001", profile("VAL_00000001", "fluent")],
  ["VAL_00000002", profile("VAL_00000002", "native")],
  ["VAL_00000003", profile("VAL_00000003", "conversational")],
  ["VAL_00000004", profile("VAL_00000004", null)],
  ["VAL_00000005", profile("VAL_00000005", "basic")],
]);

function profile(
  id: string,
  proficiency: ValidatorProfile["ilocanoProficiency"],
): ValidatorProfile {
  return {
    id: id as AnonymousValidatorId,
    ilocanoProficiency: proficiency,
    createdAt: AT("01"),
    lastActiveAt: AT("02"),
    totalValidations: 1,
  };
}

function repositories(): DashboardRepositories {
  return {
    entries: {
      listActive: async () => ENTRIES,
      findById: async (id) => ENTRIES.find((entry) => entry.id === id) ?? null,
    },
    validations: {
      listForEntries: async (ids) => RESPONSES.filter((r) => ids.includes(r.datasetEntryId)),
    },
    validators: {
      listByIds: async (ids) =>
        ids.flatMap((id) => {
          const found = PROFILES.get(id);
          return found ? [found] : [];
        }),
    },
  };
}

describe("loadDashboardOverview", () => {
  it("computes every approved figure from the fixture's hand-counted values", async () => {
    const overview = await loadDashboardOverview(repositories());

    expect(overview.totalEntries).toBe(6);
    expect(overview.totalQualifyingValidations).toBe(12);
    expect(overview.totalValidators).toBe(5);
    expect(overview.totalResponses).toBe(13);
    expect(overview.cannotEvaluateCount).toBe(1);
    expect(overview.buckets).toEqual({ incomplete: 1, complete: 5 });
    expect(overview.coveragePercentage).toBe(83.3);
    expect(overview.reviewEntryIds).toEqual(["E5", "E6"]);
  });

  it("reports overlap and late arrivals as diagnostics, never as demotions", async () => {
    // Four entries hold extra packages and three hold late arrivals, yet all five complete
    // entries stay complete: overlap is a collection diagnostic, and the partition does not
    // move because of it. E1 overlaps with no late arrival (one shared instant); E3 neither
    // overlaps nor arrives late (one package, one abstention at the same instant).
    const overview = await loadDashboardOverview(repositories());

    expect(overview.extraPackageEntries).toEqual(["E1", "E2", "E5", "E6"]);
    expect(overview.lateArrivalCount).toBe(3);
    expect(overview.lateArrivalEntryIds).toEqual(["E2", "E5", "E6"]);
    expect(overview.buckets).toEqual({ incomplete: 1, complete: 5 });
  });

  it("distributes evaluations over responses and proficiencies over validators", async () => {
    const overview = await loadDashboardOverview(repositories());

    // Eight correct_natural, four incorrect, one cannot_evaluate: thirteen stored rows.
    expect(overview.evaluationDistribution).toEqual({
      correct_natural: 8,
      correct_unnatural: 0,
      incorrect: 4,
      cannot_evaluate: 1,
    });
    // One validator per proficiency, V4 unrecorded: five responding validators.
    expect(overview.proficiencyBreakdown).toEqual({
      native: 1,
      fluent: 1,
      conversational: 1,
      basic: 1,
      not_confident: 0,
      unrecorded: 1,
    });
  });

  it("reports 0% — not NaN — over an empty dataset", async () => {
    const empty: DashboardRepositories = {
      entries: { listActive: async () => [], findById: async () => null },
      validations: { listForEntries: async () => [] },
      validators: { listByIds: async () => [] },
    };

    const overview = await loadDashboardOverview(empty);

    expect(overview.totalEntries).toBe(0);
    expect(overview.coveragePercentage).toBe(0);
    expect(Number.isNaN(overview.coveragePercentage)).toBe(false);
    expect(overview.reviewEntryIds).toEqual([]);
    expect(overview.totalResponses).toBe(0);
    expect(overview.cannotEvaluateCount).toBe(0);
    expect(overview.extraPackageEntries).toEqual([]);
    expect(overview.lateArrivalCount).toBe(0);
    expect(overview.lateArrivalEntryIds).toEqual([]);
  });
});

describe("loadEntryReview", () => {
  it("returns null for an unknown entry, which the page renders as not-found", async () => {
    expect(await loadEntryReview(repositories(), "E_missing")).toBeNull();
  });

  it("reports an entry complete on one qualifying response among non-qualifying ones", async () => {
    // E3 holds one qualifying response and one `cannot_evaluate`. One validating package is the
    // whole of completion, so the entry is complete — the abstention neither delays nor reduces
    // that, however many of them there are.
    const review = await loadEntryReview(repositories(), "E3");

    expect(review?.entry.id).toBe("E3");
    expect(review?.qualifyingCount).toBe(1);
    expect(review?.isComplete).toBe(true);
    expect(review?.needsReview).toBe(false);
  });

  it("returns the entry with every response annotated", async () => {
    const review = await loadEntryReview(repositories(), "E3");

    expect(review?.entry.id).toBe("E3");
    expect(review?.qualifyingCount).toBe(1);
    expect(review?.needsReview).toBe(false);
    expect(review?.responses.map((r) => r.response.id)).toEqual(["r06", "r07"]);

    const [good, abstention] = review?.responses ?? [];
    expect(good?.proficiency).toBe("fluent");
    expect(good?.qualifies).toBe(true);
    expect(good?.disqualifyReason).toBeNull();
    expect(abstention?.qualifies).toBe(false);
    expect(abstention?.disqualifyReason).toBe("unevaluable");
  });

  it("flags a disagreeing entry and orders responses oldest-first", async () => {
    const review = await loadEntryReview(repositories(), "E5");

    expect(review?.needsReview).toBe(true);
    expect(review?.isComplete).toBe(true);
    expect(review?.qualifyingCount).toBe(3);
    const createdAts = (review?.responses ?? []).map((r) => r.response.createdAt);
    expect([...createdAts].sort()).toEqual(createdAts);
  });
});
