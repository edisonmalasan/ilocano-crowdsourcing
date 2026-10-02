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
 *   V4 answers E3 (cannot_evaluate)
 *
 *   E1: 2 rows, 2 qualifying, 2 distinct validators, complete at target 2, no review
 *   E2: 3 rows, 3 qualifying, 3 distinct validators, complete at target 2, NO review
 *       (three qualifying responses, evaluations  incorrect/incorrect/natural DO disagree —
 *        so this entry IS flagged; see the assertion, which is the point of picking this fixture)
 *   E3: 1 row, 0 qualifying, 1 distinct, NOT complete, no review (an abstention is not disagreement)
 *   E4: 0 rows, 0 qualifying, 0 distinct, not complete, no review
 *
 *   Totals: 6 stored rows, 5 qualifying, 4 distinct validators in the corpus (V1..V4), 2 complete,
 *   1 flagged. Note the two different "distinct validators" figures and that both are correct:
 *   `generated_from.distinct_validators` counts every validator that responded (4, including V4),
 *   while coverage counts distinct validators among QUALIFYING responses only.
 *
 *   THE TRAP, and the reason V1 answers two entries: `countQualifyingValidations` over ALL SIX rows
 *   returns 3 — the number of DISTINCT QUALIFYING validators — not 5. The summary must sum per entry
 *   instead. This fixture was written predicting 4 and MEASURED 3, because the predicate skips
 *   non-qualifying responses before counting and V4 abstained; the trap is unaffected in kind (3 is
 *   not 5), and the correction is recorded rather than smoothed over.
 */
const entries = [entry("E1"), entry("E2"), entry("E3"), entry("E4"), entry("short_greeting")];

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
    expect(records).toHaveLength(6);
    expect(records.map((record) => record.validation_id)).toEqual([
      "r01",
      "r02",
      "r03",
      "r04",
      "r05",
      "r06",
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
    expect(abstention?.qualifies_toward_coverage).toBe("false");
  });

  it("carries the self-reported proficiency as stored, including an unrecorded one", () => {
    expect(records.map((record) => record.self_reported_proficiency)).toEqual([
      "fluent",
      "native",
      "fluent",
      "native",
      "conversational",
      null,
    ]);
  });

  it("carries the entry's category on every record", () => {
    for (const record of records) {
      expect(record.category).toBe("origin_destination");
      expect(record.dataset_entry_id).toMatch(/^E\d$/);
    }
  });
});

describe("buildExportSummary", () => {
  const summary = buildExportSummary(entries, sources, 2);

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
      coverage_target: 2,
    });
    expect(byId.get("E3")).toMatchObject({
      qualifying_validations: 0,
      non_qualifying_validations: 1,
      stored_responses: 1,
      coverage_complete: false,
      // An abstention is not an opinion, so it cannot disagree with anything.
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
      buildExportSummary(entries, varied, 2).by_entry.map((row) => [row.dataset_entry_id, row]),
    );
    expect(byId.get("E1")?.requires_researcher_review).toBe(false);
  });

  it("sums the qualifying total PER ENTRY rather than counting globally", () => {
    // The trap, pinned. Counted globally over all six rows, `countQualifyingValidations` returns 3 —
    // the number of DISTINCT QUALIFYING validators — because it dedupes by validator across its
    // whole input. The correct total is 5, from summing per entry.
    const globalCount = countQualifyingForTest(sources.map((item) => item.response));
    expect(globalCount).toBe(3);

    expect(summary.totals.qualifying_validations).toBe(5);
    // And the two distinct-validator figures are deliberately different numbers, both correct.
    expect(summary.generated_from.distinct_validators).toBe(4);
  });

  it("reports totals that the exported records reproduce", () => {
    const records = buildExportRecords(sources);
    const qualifyingInRecords = records.filter(
      (record) => record.qualifies_toward_coverage === "true",
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
        non_qualifying_validations: 1,
        stored_responses: 6,
      },
    ]);
    // Per-category figures must sum to the totals, or the grouping is decorative.
    expect(summary.by_category.reduce((sum, row) => sum + row.qualifying_validations, 0)).toBe(
      summary.totals.qualifying_validations,
    );
  });

  it("reports an entry with no responses without inventing one", () => {
    const rows = summary.by_entry;
    expect(rows).toHaveLength(entries.length);
    expect(rows.find((row) => row.dataset_entry_id === "E4")).toMatchObject({
      stored_responses: 0,
    });
  });

  it("carries the coverage target into the artifact", () => {
    // At target 3, E2 (3 qualifying) is complete and E1 (2 qualifying) is not — the flag follows the
    // target rather than a number written into the serializer.
    const atThree = buildExportSummary(entries, sources, 3);
    const byId = new Map(atThree.by_entry.map((row) => [row.dataset_entry_id, row]));

    expect(byId.get("E1")?.coverage_complete).toBe(false);
    expect(byId.get("E2")?.coverage_complete).toBe(true);
    expect(atThree.generated_from.coverage_target).toBe(3);
    expect(byId.get("E2")?.coverage_target).toBe(3);
  });
});

describe("the two artifacts describe the same records", () => {
  it("produces one CSV row per JSON record", () => {
    const records = buildExportRecords(sources);
    const csv = buildCsv(records);

    expect(csv.trimEnd().split("\n")).toHaveLength(records.length + 1);
    expect(csv.split("\n")[0]).toBe(EXPORT_RECORD_KEYS.join(","));
  });
});

/** The shared predicate, called directly so the trap assertion reads as a comparison. */
function countQualifyingForTest(rows: readonly ValidationResponse[]): number {
  return countQualifyingValidations(rows);
}
