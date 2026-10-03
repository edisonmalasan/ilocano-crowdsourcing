/**
 * The export's record shape and its summary arithmetic, over a hand-counted fixture.
 *
 * Every number asserted here is derived BY HAND from the fixture below and written out in the
 * fixture comment, so a reader can check the expectations against the data rather than trusting the
 * test. A summary test that recomputes the expected value with the same helper the implementation
 * uses proves nothing at all — it is the same code twice.
 */
import { describe, expect, it } from "vitest";

import { countQualifyingValidations } from "@/lib/domain/validation-response";

import type { DatasetEntry } from "@/schemas/dataset";
import type { ValidationResponse } from "@/schemas/validation";
import type { AnonymousValidatorId, ValidatorProfile } from "@/schemas/validator";

import {
  EXPORT_RECORD_KEYS,
  buildExportRecords,
  buildExportSummary,
  isQualifyingValidation,
  type ExportSourceWithQualifying,
} from "@/lib/export/records";
import { buildCsv } from "@/lib/export/csv";

const AT = (day: string): string => `2026-09-${day}T12:00:00.000Z`;

const entry = (id: string, category = "origin_destination"): DatasetEntry => ({
  id,
  category,
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

/**
 * FIXTURE, and the hand-counted expectations:
 *
 *   V1 answers E1 (natural) and E2 (incorrect, correction A)
 *   V2 answers E1 (natural) and E2 (incorrect, correction A)
 *   V3 answers E2 (natural, NO correction)
 *   V4 answers E3 (cannot_evaluate)                          — abstention
 *   V5 answers E3 (natural, ENGLISH ONLY, no Filipino)        — partial
 *   V6 answers E3 (unnatural, correction, NO translations)   — partial
 *   V7 answers X1 (natural)                                   — second category
 *
 *   E1: 2 rows, 2 qualifying, 2 distinct validators, COMPLETE, no review
 *   E2: 3 rows, 3 qualifying, 3 distinct validators, COMPLETE, FLAGGED
 *       (two `incorrect` with the same correction and one `correct_natural` — the qualifying
 *        evaluations disagree, which is the review rule's first clause)
 *   E3: 3 rows, 0 qualifying, 3 distinct, INCOMPLETE, no review. All three are NON-QUALIFYING:
 *       an abstention and two partials. None can disagree, so this entry is not flagged.
 *   E4, short_greeting: 0 rows each, INCOMPLETE
 *   X1: 1 row, 1 qualifying, 1 distinct, SECOND CATEGORY (landmark_guidance), COMPLETE — one
 *       validating package is the whole of completion, so a single response completes it
 *
 *   Totals: 9 stored rows, 6 qualifying, 3 non-qualifying, 7 distinct validators in the corpus
 *   (V1..V7), 3 entries complete, 1 flagged.
 *
 *   TWO DIFFERENT "distinct validators" FIGURES, both correct: `generated_from.distinct_validators`
 *   counts every validator that responded (7, including the three whose responses do not qualify),
 *   while coverage counts distinct validators among QUALIFYING responses only.
 *
 *   THE TRAP, and the reason V1 answers two entries: `countQualifyingValidations` over ALL NINE rows
 *   returns 4 — the number of DISTINCT QUALIFYING validators (V1, V2, V3, V7) — not 6. The summary
 *   must sum per entry instead.
 *
 *   WHY THE PARTIAL ROWS ARE HERE: the requirement names three non-qualifying cases, and before they
 *   existed only ONE of the three was represented in this fixture, so a second rule written as
 *   `evaluation !== "cannot_evaluate"` produced byte-identical output on every row. V5 and V6 each
 *   defeat that restatement on their own. */
const entries = [
  entry("E1"),
  entry("E2"),
  entry("E3"),
  entry("E4"),
  entry("short_greeting"),
  // A SECOND CATEGORY, so the per-category merge arithmetic runs rather than being asserted as
  // `5 === 5`. The verification pass measured that every previous fixture entry used the default
  // category, which left the scenario "WHEN entries from more than one category are exported"
  // without a fixture at all.
  entry("X1", "landmark_guidance"),
];

const sources: ExportSourceWithQualifying[] = [
  source(
    response("r01", "VAL_00000001", "E1", "correct_natural", bilingual),
    "fluent",
    entries[0]!,
  ),
  source(
    response("r02", "VAL_00000002", "E1", "correct_natural", bilingual),
    "native",
    entries[0]!,
  ),
  source(
    response("r03", "VAL_00000001", "E2", "incorrect", {
      correctedInstruction: "balikas a",
      ...bilingual,
    }),
    "fluent",
    entries[1]!,
  ),
  source(
    response("r04", "VAL_00000002", "E2", "incorrect", {
      correctedInstruction: "balikas a",
      ...bilingual,
    }),
    "native",
    entries[1]!,
  ),
  source(
    response("r05", "VAL_00000003", "E2", "correct_natural", bilingual),
    "conversational",
    entries[1]!,
  ),
  source(response("r06", "VAL_00000004", "E3", "cannot_evaluate"), null, entries[2]!),
  // W1: an EVALUABLE response carrying English but no Filipino. It is non-qualifying, and a rule
  // written as "not cannot_evaluate" would call it qualifying — so this row alone is what stops the
  // fixture from being satisfied by a naive restatement of the shared rule.
  source(
    response("r07", "VAL_00000005", "E3", "correct_natural", {
      englishTranslation: "English present, Filipino deliberately absent.",
    }),
    null,
    entries[2]!,
  ),
  // W1: an evaluable response with NEITHER translation, and with a correction supplied — the shape
  // a partial submit produces.
  source(
    response("r08", "VAL_00000006", "E3", "correct_unnatural", {
      correctedInstruction: "balikas c",
    }),
    null,
    entries[2]!,
  ),
  // W5: one qualifying response in the second category.
  source(
    response("r09", "VAL_00000007", "X1", "correct_natural", bilingual),
    "native",
    entries[5]!,
  ),
];

function source(
  stored: ValidationResponse,
  proficiency: ValidatorProfile["ilocanoProficiency"],
  forEntry: DatasetEntry,
): ExportSourceWithQualifying {
  return {
    entry: forEntry,
    response: stored,
    proficiency,
    qualifies: isQualifyingValidation(stored),
  };
}

describe("buildExportRecords", () => {
  const records = buildExportRecords(sources);

  it("emits one record per stored response, in order, and drops none", () => {
    expect(records).toHaveLength(9);
    expect(records.map((record) => record.validation_id)).toEqual([
      "r01",
      "r02",
      "r03",
      "r04",
      "r05",
      "r06",
      "r07",
      "r08",
      "r09",
    ]);
  });

  it("uses exactly the declared key set — no extra key, none missing", () => {
    // A closed key set, asserted per record: an added field would be a new column in the CSV and a
    // new key in the JSON, and a consumer reading positionally would be affected without any test
    // failing otherwise.
    for (const record of records) {
      expect(Object.keys(record).sort()).toEqual([...EXPORT_RECORD_KEYS].sort());
    }
  });

  it("keeps each validator's own translations in that validator's record", () => {
    const [first, second] = records;
    expect(first?.english_translation).toBe("Go north past the market.");
    expect(first?.validator_id).toBe("VAL_00000001");
    expect(second?.validator_id).toBe("VAL_00000002");
  });

  it("records a missing correction and missing translations as null, not empty string", () => {
    const abstention = records[5];
    expect(abstention?.corrected_instruction).toBeNull();
    expect(abstention?.english_translation).toBeNull();
    expect(abstention?.filipino_translation).toBeNull();
    expect(abstention?.qualifies_toward_completion).toBe("false");
  });

  it("carries the self-reported proficiency as stored, including an unrecorded one", () => {
    expect(records.map((record) => record.self_reported_proficiency)).toEqual([
      "fluent",
      "native",
      "fluent",
      "native",
      "conversational",
      null,
      null,
      null,
      "native",
    ]);
  });

  it("carries the entry's category on every record, including a second category", () => {
    // Per record rather than one expected value for all of them: a single-category assertion over a
    // now-two-category fixture would pass while every record silently carried the default.
    const byCategory = new Map(records.map((record) => [record.dataset_entry_id, record.category]));

    expect(byCategory.get("E1")).toBe("origin_destination");
    expect(byCategory.get("E3")).toBe("origin_destination");
    expect(byCategory.get("X1")).toBe("landmark_guidance");
    expect(new Set(records.map((record) => record.category)).size).toBe(2);
  });
});

describe("buildExportSummary", () => {
  const summary = buildExportSummary(entries, sources);

  it("reports each entry's counts from the stored rows", () => {
    const byId = new Map(summary.by_entry.map((row) => [row.dataset_entry_id, row]));

    expect(byId.get("E1")).toEqual({
      dataset_entry_id: "E1",
      category: "origin_destination",
      qualifying_validations: 2,
      non_qualifying_validations: 0,
      stored_responses: 2,
      distinct_validators: 2,
      coverage_complete: true,
      requires_researcher_review: false,
    });
    expect(byId.get("E3")).toMatchObject({
      qualifying_validations: 0,
      non_qualifying_validations: 3,
      stored_responses: 3,
      distinct_validators: 3,
      coverage_complete: false,
      // None of the three qualifies, so none can disagree: an abstention is not an opinion, and a
      // partial response is not a weaker opinion.
      requires_researcher_review: false,
    });
    expect(byId.get("E4")).toMatchObject({
      qualifying_validations: 0,
      stored_responses: 0,
      distinct_validators: 0,
      coverage_complete: false,
    });
  });

  it("flags an entry whose qualifying evaluations disagree, and leaves an agreeing one alone", () => {
    const byId = new Map(summary.by_entry.map((row) => [row.dataset_entry_id, row]));
    // E2: two `incorrect` with the same correction, one `correct_natural` with none.
    expect(byId.get("E2")?.requires_researcher_review).toBe(true);
    expect(byId.get("E2")?.qualifying_validations).toBe(3);
    expect(byId.get("E2")?.coverage_complete).toBe(true);
    expect(byId.get("E1")?.requires_researcher_review).toBe(false);
  });

  it("does not flag translation wording differences", () => {
    const varied = sources.map((item) =>
      item.response.id === "r02"
        ? {
            ...item,
            response: {
              ...item.response,
              englishTranslation: "Head north beyond the marketplace.",
              filipinoTranslation: "Pumunta ka sa hilaga.",
            },
          }
        : item,
    );

    const byId = new Map(
      buildExportSummary(entries, varied).by_entry.map((row) => [row.dataset_entry_id, row]),
    );
    expect(byId.get("E1")?.requires_researcher_review).toBe(false);
  });

  it("sums the qualifying total PER ENTRY rather than counting globally", () => {
    // The trap, pinned. Counted globally over all nine rows, `countQualifyingValidations` returns 4 —
    // the number of DISTINCT QUALIFYING validators (V1, V2, V3, V7) — because it dedupes by validator
    // across its whole input. The correct total is 6, from summing per entry.
    const globalCount = countQualifyingForTest(sources.map((item) => item.response));
    expect(globalCount).toBe(4);

    expect(summary.totals.qualifying_validations).toBe(6);
    // And the two distinct-validator figures are deliberately different numbers, both correct.
    expect(summary.generated_from.distinct_validators).toBe(7);
  });

  it("reports totals that the exported records reproduce", () => {
    const records = buildExportRecords(sources);
    const qualifyingInRecords = records.filter(
      (record) => record.qualifies_toward_completion === "true",
    ).length;

    expect(summary.totals.qualifying_validations).toBe(qualifyingInRecords);
    expect(summary.totals.stored_responses).toBe(records.length);
    expect(summary.totals.non_qualifying_validations).toBe(records.length - qualifyingInRecords);
    expect(summary.totals.stored_responses).toBe(
      summary.totals.qualifying_validations + summary.totals.non_qualifying_validations,
    );
  });

  it("groups by category, so a consumer can select one without inferring it", () => {
    expect(summary.by_category).toEqual([
      {
        category: "origin_destination",
        entries: 5,
        qualifying_validations: 5,
        non_qualifying_validations: 3,
        stored_responses: 8,
      },
      {
        category: "landmark_guidance",
        entries: 1,
        qualifying_validations: 1,
        non_qualifying_validations: 0,
        stored_responses: 1,
      },
    ]);
    // Per-category figures must sum to the totals, or the grouping is decorative. With TWO
    // categories this is now an assertion that can fail: before the second category existed it
    // reduced to `5 === 5`, an identity no implementation could break.
    for (const field of [
      "qualifying_validations",
      "non_qualifying_validations",
      "stored_responses",
      "entries",
    ] as const) {
      expect(summary.by_category.reduce((sum, row) => sum + row[field], 0)).toBe(
        field === "entries" ? summary.by_entry.length : summary.totals[field],
      );
    }
  });

  it("reports an entry with no responses without inventing one", () => {
    const rows = summary.by_entry;
    expect(rows).toHaveLength(entries.length);
    expect(rows).toHaveLength(6);
    expect(rows.find((row) => row.dataset_entry_id === "E4")).toMatchObject({
      stored_responses: 0,
    });
  });

  it("marks completion from the shared predicate, and carries no target", () => {
    // E1 holds two qualifying responses and X1 holds one: under the superseded target of 3 both
    // read as incomplete, and under the corrected rule both are complete. One validating package
    // is the whole of completion, so the count behind a complete entry is a diagnostic, not the
    // decision.
    const byId = new Map(summary.by_entry.map((row) => [row.dataset_entry_id, row]));

    expect(byId.get("E1")?.coverage_complete).toBe(true);
    expect(byId.get("E2")?.coverage_complete).toBe(true);
    expect(byId.get("E3")?.coverage_complete).toBe(false);
    expect(byId.get("E4")?.coverage_complete).toBe(false);
    expect(byId.get("X1")?.coverage_complete).toBe(true);
    // The removal is asserted, not merely unasserted: a `coverage_target` anywhere in the summary
    // would invite a consumer to check records against a constant.
    expect(JSON.stringify(summary)).not.toContain("coverage_target");
    expect("coverage_target" in (summary.generated_from as object)).toBe(false);
  });

  it("states how many entries the validated dataset omits, by count not by presence", () => {
    // E3, E4, and short_greeting hold no qualifying package between them: three incomplete
    // entries omitted. A field that merely existed would pass with any value — including a
    // hardcoded zero — so the hand-counted value is asserted, not the key.
    expect(summary.totals.omitted_from_validated).toBe(3);
    expect(summary.totals.omitted_from_validated).toBe(
      summary.by_entry.filter((row) => !row.coverage_complete).length,
    );
  });
});

describe("the two artifacts describe the same records", () => {
  it("produces one CSV row per JSON record", () => {
    const records = buildExportRecords(sources);
    const csv = buildCsv(records, EXPORT_RECORD_KEYS);

    expect(csv.trimEnd().split("\n")).toHaveLength(records.length + 1);
    expect(csv.trimEnd().split("\n")).toHaveLength(10);
    expect(csv.split("\n")[0]).toBe(EXPORT_RECORD_KEYS.join(","));
  });
});

/** The shared predicate, called directly so the trap assertion reads as a comparison. */
function countQualifyingForTest(rows: readonly ValidationResponse[]): number {
  return countQualifyingValidations(rows);
}
