import { describe, expect, it } from "vitest";

import {
  buildValidatedDataset,
  validatedCsvRow,
  validatedIlocanoFor,
  VALIDATED_RECORD_KEYS,
  type ValidatedRecord,
} from "@/lib/export/validated";
import { buildCsv } from "@/lib/export/csv";
import { buildExportRecords } from "@/lib/export/records";
import type { ExportSourceWithQualifying } from "@/lib/export/records";
import type { DatasetEntry } from "@/schemas/dataset";
import type { ValidationResponse } from "@/schemas/validation";
import type { AnonymousValidatorId } from "@/schemas/validator";

/**
 * The validated derivation over a corpus built to discriminate every clause.
 *
 * Each clause of the derivation rule has a row that exercises it, and no two clauses share one:
 *
 *   E1  two agreeing full packages at AT("02")/AT("03") — earliest supplies, no flag, overlap
 *   E2  incorrect+correction at AT("02"), then correct_natural at AT("03") — earliest supplies
 *       the CORRECTION path, disagreement flags, later package does not displace
 *   E3  two correct_natural at the SAME instant AT("02") — tie only: evaluations agree and no
 *       correction exists, so NOTHING but the tie can force the flag
 *   E4  one cannot_evaluate — incomplete, omitted rather than zero-filled
 *   E5  one correct_natural — trivially earliest, validated sentence IS the instruction
 *   E6  POOLED coverage: a judgment with no translations at AT("02"), English-only at AT("03"),
 *       Filipino-only at AT("04") from three attempts — no single response vouches for the
 *       record, so the multi-source flag fires while the per-field earliest rule still supplies
 *       each field deterministically
 */
const AT = (day: string, ms = "00:00:00.000Z"): string => `2026-09-${day}T${ms}`;

const entry = (id: string): DatasetEntry => ({
  id,
  category: "origin_destination",
  instruction: `instruction for ${id}`,
  origin: `origin of ${id}`,
  destination: `destination of ${id}`,
  transitMode: null,
  createdAt: AT("01"),
  isActive: true,
});

const ENTRIES = ["E1", "E2", "E3", "E4", "E5", "E6"].map(entry);
const BY_ID = new Map(ENTRIES.map((e) => [e.id, e]));

function response(
  id: string,
  validatorId: string,
  entryId: string,
  evaluation: ValidationResponse["evaluation"],
  at: string,
  extra: Partial<ValidationResponse> = {},
): ValidationResponse {
  return {
    id,
    validatorId: validatorId as AnonymousValidatorId,
    datasetEntryId: entryId,
    batchId: "batch_01",
    evaluation,
    createdAt: at,
    updatedAt: at,
    ...extra,
  } as ValidationResponse;
}

const bilingual = {
  englishTranslation: "Go north past the market.",
  filipinoTranslation: "Dumiretso ka sa hilaga lagpas ng palengke.",
};

const SOURCES: ExportSourceWithQualifying[] = [
  {
    entry: BY_ID.get("E1")!,
    response: response("rv01", "VAL_00000001", "E1", "correct_natural", AT("02"), bilingual),
    proficiency: "fluent",
    qualifies: true,
  },
  {
    entry: BY_ID.get("E1")!,
    response: response("rv02", "VAL_00000002", "E1", "correct_natural", AT("03"), {
      englishTranslation: "Head north beyond the marketplace.",
      filipinoTranslation: "Pumunta ka sa hilaga.",
    }),
    proficiency: "native",
    qualifies: true,
  },
  {
    entry: BY_ID.get("E2")!,
    response: response("rv03", "VAL_00000001", "E2", "incorrect", AT("02"), {
      correctedInstruction: "naurnos a balikas",
      ...bilingual,
    }),
    proficiency: "fluent",
    qualifies: true,
  },
  {
    entry: BY_ID.get("E2")!,
    response: response("rv04", "VAL_00000002", "E2", "correct_natural", AT("03"), bilingual),
    proficiency: "native",
    qualifies: true,
  },
  {
    entry: BY_ID.get("E3")!,
    response: response("rv05", "VAL_00000001", "E3", "correct_natural", AT("02"), bilingual),
    proficiency: "fluent",
    qualifies: true,
  },
  {
    entry: BY_ID.get("E3")!,
    response: response("rv06", "VAL_00000002", "E3", "correct_natural", AT("02"), {
      englishTranslation: "A second rendering.",
      filipinoTranslation: "Ikalawang salin.",
    }),
    proficiency: "native",
    qualifies: true,
  },
  {
    entry: BY_ID.get("E4")!,
    response: response("rv07", "VAL_00000003", "E4", "cannot_evaluate", AT("02")),
    proficiency: null,
    qualifies: false,
  },
  {
    entry: BY_ID.get("E5")!,
    response: response("rv08", "VAL_00000001", "E5", "correct_natural", AT("02"), bilingual),
    proficiency: "fluent",
    qualifies: true,
  },
  // Pooled coverage: no single response holds the package, so each field comes from its own
  // earliest supplier. All three are valid judgments (evaluations agree, no correction needed),
  // so the review rule alone would NOT flag — only the multi-source clause does.
  {
    entry: BY_ID.get("E6")!,
    response: response("rv09", "VAL_00000004", "E6", "correct_natural", AT("02")),
    proficiency: "conversational",
    qualifies: true,
  },
  {
    entry: BY_ID.get("E6")!,
    response: response("rv10", "VAL_00000005", "E6", "correct_natural", AT("03"), {
      englishTranslation: "Pooled English rendering.",
    }),
    proficiency: null,
    qualifies: true,
  },
  {
    entry: BY_ID.get("E6")!,
    response: response("rv11", "VAL_00000006", "E6", "correct_natural", AT("04"), {
      filipinoTranslation: "Pinagsama-samang salin.",
    }),
    proficiency: null,
    qualifies: true,
  },
];

const byId = (records: readonly ValidatedRecord[]): Map<string, ValidatedRecord> =>
  new Map(records.map((record) => [record.id, record]));

describe("buildValidatedDataset", () => {
  it("derives one record per complete entry from the earliest covering suppliers", () => {
    const { records } = buildValidatedDataset(ENTRIES, SOURCES);

    expect(records.map((record) => record.id)).toEqual(["E1", "E2", "E3", "E5", "E6"]);
    const byEntry = byId(records);
    expect(byEntry.get("E1")?.source_validation_id).toBe("rv01");
    expect(byEntry.get("E2")?.source_validation_id).toBe("rv03");
    expect(byEntry.get("E5")?.source_validation_id).toBe("rv08");
    // The pooled entry's Ilocano supplier is the earliest valid judgment.
    expect(byEntry.get("E6")?.source_validation_id).toBe("rv09");
  });

  it("takes the correction where one was required and the instruction otherwise", () => {
    const byEntry = byId(buildValidatedDataset(ENTRIES, SOURCES).records);

    // E2's supplying response is incorrect with a correction: the validated sentence is the
    // correction, and its translations are that response's own translations of it.
    expect(byEntry.get("E2")?.validated_ilocano).toBe("naurnos a balikas");
    expect(byEntry.get("E2")?.english_translation).toBe("Go north past the market.");
    // E5's supplying response needs no correction: the validated sentence IS the instruction.
    expect(byEntry.get("E5")?.validated_ilocano).toBe("instruction for E5");
    expect(byEntry.get("E1")?.english_translation).toBe("Go north past the market.");
  });

  it("lets a later qualifying response neither displace nor dilute the earliest", () => {
    // E1's later package differs in wording; E2's later package differs in evaluation. Both stay
    // in the raw document and neither moves the validated record off the earliest package.
    const byEntry = byId(buildValidatedDataset(ENTRIES, SOURCES).records);

    expect(byEntry.get("E1")?.source_validation_id).toBe("rv01");
    expect(byEntry.get("E1")?.needs_review).toBe(false);
    expect(byEntry.get("E2")?.needs_review).toBe(true);
  });

  it("flags a timestamp tie with nothing else to blame and decides it in the open", () => {
    // E3's packages agree on evaluation and need no correction: the review rule alone would NOT
    // flag it. The shared instant is the only reason the flag is forced, and the smallest id
    // wins a tie the clock cannot break.
    const byEntry = byId(buildValidatedDataset(ENTRIES, SOURCES).records);

    expect(byEntry.get("E3")?.needs_review).toBe(true);
    expect(byEntry.get("E3")?.source_validation_id).toBe("rv05");
  });

  it("assembles a pooled record per field and flags that no single response vouches for it", () => {
    // E6's three suppliers each hold one pillar. The record takes the validated Ilocano from the
    // judgment, English from its earliest supplier, Filipino from its own — and flags, because
    // three attempts' work assembled into one record is exactly what a human must review.
    const byEntry = byId(buildValidatedDataset(ENTRIES, SOURCES).records);

    expect(byEntry.get("E6")?.validated_ilocano).toBe("instruction for E6");
    expect(byEntry.get("E6")?.english_translation).toBe("Pooled English rendering.");
    expect(byEntry.get("E6")?.filipino_translation).toBe("Pinagsama-samang salin.");
    expect(byEntry.get("E6")?.needs_review).toBe(true);
  });

  it("omits incomplete entries and states the omission count", () => {
    const dataset = buildValidatedDataset(ENTRIES, SOURCES);

    expect(byId(dataset.records).has("E4")).toBe(false);
    expect(dataset.derivation.omitted_incomplete_entries).toBe(1);
    expect(dataset.derivation.rule).toBe("pooled-earliest-per-field-by-server-created-at");
    expect(dataset.derivation.tie_break).toBe(
      "smallest-validation-id-arbitrary-carries-no-meaning",
    );
  });

  it("carries no validator or attempt identifier on any record", () => {
    const { records } = buildValidatedDataset(ENTRIES, SOURCES);
    const text = JSON.stringify(records);

    for (const id of [
      "VAL_00000001",
      "VAL_00000002",
      "VAL_00000003",
      "VAL_00000004",
      "VAL_00000005",
      "VAL_00000006",
    ]) {
      expect(text).not.toContain(id);
    }
    expect(Object.keys(records[0] ?? {}).sort()).toEqual(
      [
        "english_translation",
        "filipino_translation",
        "id",
        "needs_review",
        "output",
        "source_validation_id",
        "validated_ilocano",
      ].sort(),
    );
  });

  it("links every record back to a row of the raw document", () => {
    const { records } = buildValidatedDataset(ENTRIES, SOURCES);
    const rawIds = new Set(buildExportRecords(SOURCES).map((record) => record.validation_id));

    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
      expect(rawIds.has(record.source_validation_id)).toBe(true);
    }
  });

  it("flattens to CSV rows with the same leaf values", () => {
    const { records } = buildValidatedDataset(ENTRIES, SOURCES);

    for (const record of records) {
      const row = validatedCsvRow(record);
      expect(Object.keys(row).sort()).toEqual([...VALIDATED_RECORD_KEYS].sort());
      expect(row.id).toBe(record.id);
      expect(row.validated_ilocano).toBe(record.validated_ilocano);
      expect(row.origin).toBe(record.output.origin);
      expect(row.destination).toBe(record.output.destination);
      expect(row.transit_mode).toBe(record.output.transit_mode);
      expect(row.needs_review).toBe(record.needs_review ? "true" : "false");
    }
  });
});

describe("validated CSV document", () => {
  it("carries the same records under the validated key set", () => {
    const { records } = buildValidatedDataset(ENTRIES, SOURCES);
    const csv = buildCsv(records.map(validatedCsvRow), VALIDATED_RECORD_KEYS);
    const lines = csv.trimEnd().split("\n");

    expect(lines[0]).toBe(VALIDATED_RECORD_KEYS.join(","));
    expect(lines).toHaveLength(records.length + 1);
  });

  it("quotes research text without changing it", () => {
    // The quoting rules are shared with the raw document; this pins that the validated text
    // flows through them rather than around them.
    const nasty: ValidatedRecord = {
      id: "E9",
      validated_ilocano: 'Iti, Baguio — " Athletic Bowl',
      english_translation: 'Go north, then say "here"',
      filipino_translation: "Pumunta, ka",
      output: { origin: null, destination: null, transit_mode: null },
      source_validation_id: "rv99",
      needs_review: true,
    };
    const [, row] = buildCsv([validatedCsvRow(nasty)], VALIDATED_RECORD_KEYS)
      .trimEnd()
      .split("\n");

    expect(row).toContain('"Iti, Baguio — "" Athletic Bowl"');
    expect(row).toContain('"Go north, then say ""here"""');
    expect(row?.endsWith(",rv99,true")).toBe(true);
  });
});

describe("validatedIlocanoFor", () => {
  it("refuses a qualifying-shaped response missing its required correction", () => {
    // Unreachable through the builder, which filters to qualifying responses first — and tested
    // anyway, because a silent fallback to the instruction here would emit the source sentence
    // as "validated" for a response that judged it incorrect.
    const broken = response("rv99", "VAL_00000001", "E9", "incorrect", AT("02"), bilingual);

    expect(() => validatedIlocanoFor(entry("E9"), broken)).toThrow(/does not carry/);
  });
});
