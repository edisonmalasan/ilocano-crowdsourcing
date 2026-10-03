/**
 * Do the dashboard and the export report the SAME coverage for the SAME corpus?
 *
 * Every module in this repository that reports coverage re-asserts in a comment that the qualifying
 * rule has one definition, and none of them checks the consequence. Two consumers can share a
 * predicate and still disagree: about which responses to include, about which bucket an entry lands
 * in, or about how per-entry figures total. This file runs both over one corpus and compares their
 * OUTPUTS.
 *
 * It deliberately does NOT assert that both call `countQualifyingValidations`. That is a statement
 * about implementation, it breaks on a harmless refactor, and — more to the point — it would still
 * pass if a consumer pre-filtered its inputs wrongly before calling the shared function. Only
 * comparing what the two consumers REPORT can see that.
 *
 * The two consumers were written months apart for different audiences. The dashboard is built from
 * repository reads and buckets as it goes; the export is built from pre-joined sources and reports
 * per-entry rows. They are structurally different code paths, which is exactly what makes them worth
 * comparing.
 */
import { describe, expect, it } from "vitest";

import { loadDashboardOverview } from "@/lib/admin/dashboard";
import { buildExportSummary, isQualifyingValidation } from "@/lib/export/records";
import type { ExportSourceWithQualifying } from "@/lib/export/records";
import type { DatasetEntry } from "@/schemas/dataset";
import type { ValidationResponse } from "@/schemas/validation";
import type { AnonymousValidatorId, ValidatorProfile } from "@/schemas/validator";

const AT = (day: string): string => `2026-09-${day}T12:00:00.000Z`;

const entry = (id: string, category = "origin_destination"): DatasetEntry => ({
  id,
  category,
  instruction: `instruction for ${id}`,
  origin: null,
  destination: null,
  transitMode: null,
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
  filipinoTranslation: "Dumiretso ka sa hilaga.",
};

/**
 * ONE CORPUS, with every clause of the agreement claim given a row that exercises it.
 *
 *   C1  two `correct_natural` (V1, V2)                     -> 2 qualifying, COMPLETE
 *   C2  three `incorrect`, corrections A / A / B            -> 3 qualifying, COMPLETE, and the two
 *                                                              distinct corrections flag it
 *   C3  one `correct_natural` (V4) + one `cannot_evaluate`  -> 1 qualifying, COMPLETE, and the
 *                                                              abstention must NOT be read as disagreement
 *   C4  `correct_natural` with English but NO Filipino (V6)  -> NOT qualifying, INCOMPLETE
 *   C5  `correct_unnatural` + correction, NO translations   -> NOT qualifying, INCOMPLETE
 *   C6  no responses at all                                  -> INCOMPLETE
 *   X1  SECOND CATEGORY, one `correct_natural` (V8)          -> 1 qualifying, COMPLETE
 *   C7, E9, E10, E11: no responses at all                    -> INCOMPLETE
 *
 *   TOTALS: 10 stored rows; qualifying = C1(2) + C2(3) + C3(1) + X1(1) = 7.
 *   PARTITION over 11 entries: complete = 4 (C1, C2, C3, X1); incomplete = 7 (C4, C5, C6, C7,
 *   E9, E10, E11). 4 + 7 = 11. One validating package is the whole of completion, so C1 with two
 *   and C2 with three are exactly as complete as C3 and X1 with one each.
 *   FLAGGED: C2 only — its corrections differ. C3 is NOT flagged despite differing evaluations,
 *   because the `cannot_evaluate` does not qualify and an abstention is not an opinion.
 *
 *   These figures were HAND-COUNTED WRONG on the first pass — the draft comment claimed 13 rows,
 *   zero = 4, and complete = 2, and the suite failed on the bucket literal. The measurement was right
 *   and the arithmetic was wrong, which is the ordinary case and the reason the counts are written
 *   out rather than left implicit. Note the failure was on MY literal and not on the agreement: the
 *   two consumers had already matched each other, and the export-side comparison was never reached.
 */
const ENTRIES = [
  entry("C1"),
  entry("C2"),
  entry("C3"),
  entry("C4"),
  entry("C5"),
  entry("C6"),
  entry("C7"),
  entry("X1", "landmark_guidance"),
  entry("E9"),
  entry("E10"),
  entry("E11"),
];

const RESPONSES: ValidationResponse[] = [
  response("r01", "VAL_00000001", "C1", "correct_natural", bilingual),
  response("r02", "VAL_00000002", "C1", "correct_natural", bilingual),
  response("r03", "VAL_00000001", "C2", "incorrect", {
    correctedInstruction: "balikas a",
    ...bilingual,
  }),
  response("r04", "VAL_00000002", "C2", "incorrect", {
    correctedInstruction: "balikas a",
    ...bilingual,
  }),
  response("r05", "VAL_00000003", "C2", "incorrect", {
    correctedInstruction: "balikas b",
    ...bilingual,
  }),
  response("r06", "VAL_00000004", "C3", "correct_natural", bilingual),
  response("r07", "VAL_00000005", "C3", "cannot_evaluate"),
  response("r08", "VAL_00000006", "C4", "correct_natural", {
    englishTranslation: "English only.",
  }),
  response("r09", "VAL_00000007", "C5", "correct_unnatural", {
    correctedInstruction: "balikas c",
  }),
  response("r10", "VAL_00000008", "X1", "correct_natural", bilingual),
];

const PROFICIENCIES = new Map<string, ValidatorProfile["ilocanoProficiency"]>([
  ["VAL_00000001", "fluent"],
  ["VAL_00000002", "native"],
  ["VAL_00000003", "conversational"],
  ["VAL_00000004", "basic"],
  ["VAL_00000005", null],
  ["VAL_00000006", "fluent"],
  ["VAL_00000007", "not_confident"],
  ["VAL_00000008", "native"],
]);

/** The dashboard's own input shape: repository reads, fed by fakes. */
function dashboardRepositories() {
  return {
    entries: {
      listActive: async () => ENTRIES,
      findById: async (id: string) => ENTRIES.find((e) => e.id === id) ?? null,
    },
    validations: {
      listForEntries: async (ids: readonly string[]) =>
        RESPONSES.filter((r) => ids.includes(r.datasetEntryId)),
    },
    validators: {
      listByIds: async (ids: readonly string[]) =>
        ids.flatMap((id) => {
          const proficiency = PROFICIENCIES.get(id);
          if (proficiency === undefined) return [];
          return [
            {
              id: id as AnonymousValidatorId,
              ilocanoProficiency: proficiency,
              createdAt: AT("01"),
              lastActiveAt: AT("02"),
              totalValidations: 1,
            },
          ];
        }),
    },
  };
}

/** The export's own input shape: pre-joined sources, one per stored response. */
function exportSources(): ExportSourceWithQualifying[] {
  const byId = new Map(ENTRIES.map((e) => [e.id, e]));
  return RESPONSES.flatMap((stored) => {
    const forEntry = byId.get(stored.datasetEntryId);
    if (forEntry === undefined) return [];
    return [
      {
        entry: forEntry,
        response: stored,
        proficiency: PROFICIENCIES.get(stored.validatorId) ?? null,
        qualifies: isQualifyingValidation(stored),
      },
    ];
  });
}

/** Both consumers, run over the SAME corpus. There is no target to hold equal. */
async function bothConsumers() {
  const overview = await loadDashboardOverview(dashboardRepositories());
  const summary = buildExportSummary(ENTRIES, exportSources());
  return { overview, summary };
}

/**
 * The export's per-entry flags, folded into the dashboard's partition shape.
 *
 * A genuine second implementation, not an echo: it reads the export's `coverage_complete` flag —
 * the artifact's own answer — while the dashboard computes its partition from its own repository
 * reads. If either consumer filtered its inputs differently, the two partitions disagree here even
 * when both totals happen to agree.
 */
function exportBuckets(summary: ReturnType<typeof buildExportSummary>) {
  const buckets = { incomplete: 0, complete: 0 };
  for (const row of summary.by_entry) {
    if (row.coverage_complete) buckets.complete += 1;
    else buckets.incomplete += 1;
  }
  return buckets;
}

describe("the dashboard and the export agree on one corpus", () => {
  it("compares TWO consumers over a corpus it actually examined", async () => {
    // The emptiness guard — but only the parts of it that can FAIL. A first version asserted
    // `expect([loadDashboardOverview, buildExportSummary]).toHaveLength(2)`, which is a statement
    // about a two-element array literal and cannot fail whatever either consumer does, and
    // `ENTRIES.filter(isActive)`, which is true by construction because the `entry()` helper
    // hardcodes `isActive: true`. Both reported coverage they did not provide. What is asserted
    // instead are the corpus's own shape, and then the two consumers are RUN, so this test witnesses
    // that both were invoked over that corpus rather than merely declared.
    expect(RESPONSES.length, "the corpus must hold stored responses").toBeGreaterThan(5);
    expect(ENTRIES.length, "the corpus must hold entries").toBeGreaterThan(5);
    expect(
      new Set(RESPONSES.map((r) => r.datasetEntryId)).size,
      "more than one entry is answered",
    ).toBeGreaterThan(1);
    expect(
      ENTRIES.some((e) => RESPONSES.every((r) => r.datasetEntryId !== e.id)),
      "some entries are unanswered",
    ).toBe(true);

    // Both consumers, actually run. This is two ONE-SIDED shape checks — the agreement between them
    // is asserted in the tests that follow, which is where a two-sided comparison belongs. Its job
    // here is narrower and stated as such: to make it impossible for this suite to be green because
    // a consumer was never called, or was called over nothing. Measured: breaking the dashboard's
    // qualifying accumulation turns this file red at `4 failed | 4 passed`, naming this test.
    const { overview, summary } = await bothConsumers();
    expect(overview.totalQualifyingValidations).toBeGreaterThan(0);
    expect(summary.by_entry.length).toBe(ENTRIES.length);
  });

  it("agrees on the total qualifying validations", async () => {
    const { overview, summary } = await bothConsumers();

    expect(overview.totalQualifyingValidations).toBe(7);
    expect(overview.totalQualifyingValidations).toBe(summary.totals.qualifying_validations);
  });

  it("agrees on the complete/incomplete partition", async () => {
    const { overview, summary } = await bothConsumers();

    expect(overview.buckets).toEqual({ incomplete: 7, complete: 4 });
    // The second assertion is the one that matters: it is the export's OWN per-entry flags folded
    // into the dashboard's partition shape, so a divergence between the two consumers fails here
    // even when both totals happen to agree.
    expect(overview.buckets).toEqual(exportBuckets(summary));
  });

  it("agrees on how many entries have coverage complete", async () => {
    const { overview, summary } = await bothConsumers();

    expect(overview.buckets.complete).toBe(summary.totals.entries_with_coverage_complete);
  });

  it("agrees on WHICH entries need review, as a set", async () => {
    const { overview, summary } = await bothConsumers();

    const flaggedByExport = summary.by_entry
      .filter((row) => row.requires_researcher_review)
      .map((row) => row.dataset_entry_id)
      .sort();

    // Only C2: three qualifying responses whose corrections differ. C3 is deliberately NOT flagged
    // even though its evaluations differ, because the differing one does not qualify — an abstention
    // is not an opinion, and a consumer that flagged it would disagree with the other here.
    expect(overview.reviewEntryIds).toEqual(["C2"]);
    expect(flaggedByExport).toEqual(["C2"]);
  });

  it("agrees on the corpus totals both derive", async () => {
    const { overview, summary } = await bothConsumers();

    // The first line of this test was `expect(summary.generated_from.entries).toBe(overview.totalEntries)`,
    // which cannot fail: both sides are `entries.length` over the same array handed to both consumers.
    // It is removed rather than kept, because a comparison with itself is the shape a reader mistakes
    // for evidence. What IS comparable here is the stored-response count against the corpus the
    // consumers were actually given.
    expect(summary.totals.stored_responses).toBe(RESPONSES.length);
    expect(summary.totals.non_qualifying_validations).toBe(
      RESPONSES.length - overview.totalQualifyingValidations,
    );
  });

  it("agrees when the corpus holds NO responses at all", async () => {
    // An empty corpus is a real state on the hosted project today. A consistency check that skipped
    // the empty case would leave the one state this project is actually in unverified.
    const overview = await loadDashboardOverview({
      entries: { listActive: async () => [], findById: async () => null },
      validations: { listForEntries: async () => [] },
      validators: { listByIds: async () => [] },
    });
    const summary = buildExportSummary([], []);

    expect(overview.totalQualifyingValidations).toBe(summary.totals.qualifying_validations);
    expect(overview.totalQualifyingValidations).toBe(0);
    expect(overview.buckets).toEqual(exportBuckets(summary));
    expect(overview.reviewEntryIds).toEqual([]);
    expect(summary.by_entry).toEqual([]);
  });

  it("still agrees across BOTH categories", async () => {
    // The second category must not move either consumer's figures. If either bucketed by category
    // rather than over the whole corpus, its totals would differ here.
    const { overview, summary } = await bothConsumers();

    expect(summary.by_category.map((row) => row.category).sort()).toEqual([
      "landmark_guidance",
      "origin_destination",
    ]);
    expect(summary.by_category.reduce((sum, row) => sum + row.qualifying_validations, 0)).toBe(
      overview.totalQualifyingValidations,
    );
  });
});
