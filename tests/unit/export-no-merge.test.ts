/**
 * The no-merge invariant, asserted over the SERIALIZED ARTIFACT rather than the input rows.
 *
 * The requirement is that no field anywhere in the export combines two validators' text. Checking the
 * input rows proves nothing about the artifact: the merge, if it happened, would happen inside the
 * serializer. So this test serializes first and then walks the output.
 *
 * Three distinct ways a merge could appear, each checked:
 *
 *   1. a string field containing one validator's text AND another's — the obvious "consensus
 *      translation" column;
 *   2. a field whose NAME implies a merge (`consensus_*`, `merged_*`, `final_*`, `majority_*`) — a
 *      merge under a different name, or one added later as a convenience;
 *   3. an ARRAY or object anywhere in the output, which is how a merge hides if it is not a string.
 *
 * The check is over the JSON documents the command actually writes, not over an intermediate object,
 * so the artifact a researcher opens is the artifact that was inspected.
 */
import { describe, expect, it } from "vitest";

import { buildCsv } from "@/lib/export/csv";
import {
  EXPORT_RECORD_KEYS,
  buildExportRecords,
  buildExportSummary,
  isQualifyingValidation,
  type ExportSourceWithQualifying,
} from "@/lib/export/records";
import type { DatasetEntry } from "@/schemas/dataset";
import type { ValidationResponse } from "@/schemas/validation";

const entry = (id: string): DatasetEntry => ({
  id,
  category: "origin_destination",
  sourceEntryId: 1,
  categoryName: "Origin + Destination",
  instruction: `instruction for ${id}`,
  origin: null,
  destination: null,
  transitMode: null,
  createdAt: "2026-09-01T12:00:00.000Z",
  isActive: true,
});

const VALIDATOR_ONE_ENGLISH = "Validator one's own English rendering.";
const VALIDATOR_TWO_ENGLISH = "Validator two's entirely separate wording.";

const response = (id: string, validatorId: string, english: string): ValidationResponse => ({
  id,
  validatorId: validatorId as ValidationResponse["validatorId"],
  datasetEntryId: "E1",
  batchId: "batch_01",
  evaluation: "correct_natural",
  englishTranslation: english,
  filipinoTranslation: `Filipino para sa ${validatorId}.`,
  createdAt: "2026-09-02T12:00:00.000Z",
  updatedAt: "2026-09-02T12:00:00.000Z",
});

const SOURCES: ExportSourceWithQualifying[] = [
  response("r01", "VAL_00000001", VALIDATOR_ONE_ENGLISH),
  response("r02", "VAL_00000002", VALIDATOR_TWO_ENGLISH),
].map((stored) => {
  const item: ExportSourceWithQualifying = {
    entry: entry("E1"),
    response: stored,
    proficiency: "fluent",
    qualifies: isQualifyingValidation(stored),
  };
  return item;
});

const MERGE_SUSPICIOUS_NAME = /consensus|merged|merge|final|majority|aggregate|combined/i;

/** Every string leaf in a JSON value, with the key path that reached it. */
function stringLeaves(value: unknown, path = "$"): { path: string; value: string }[] {
  if (typeof value === "string") return [{ path, value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => stringLeaves(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => stringLeaves(child, `${path}.${key}`));
  }
  return [];
}

/** The documents the command writes, as the JSON text a consumer would read. */
function artifactDocuments(): Record<string, unknown> {
  const records = buildExportRecords(SOURCES);
  return {
    validations: JSON.parse(JSON.stringify(records)) as unknown,
    summary: JSON.parse(JSON.stringify(buildExportSummary([entry("E1")], SOURCES))) as unknown,
  };
}

describe("no exported field merges two validators' text", () => {
  it("finds no string field containing two validators' submissions", () => {
    const documents = artifactDocuments();
    let leaves = 0;

    for (const [name, document] of Object.entries(documents)) {
      for (const leaf of stringLeaves(document)) {
        leaves += 1;
        const holdsOne = leaf.value.includes(VALIDATOR_ONE_ENGLISH);
        const holdsTwo = leaf.value.includes(VALIDATOR_TWO_ENGLISH);
        expect(
          holdsOne && holdsTwo,
          `${name} ${leaf.path} contains BOTH validators' text — that is a merge`,
        ).toBe(false);
      }
    }

    // Non-vacuity: the walk must have actually read the artifact's strings. A walk that found
    // nothing would pass the assertion above without having inspected anything.
    expect(leaves).toBeGreaterThan(20);
  });

  it("uses no field name that implies a merge", () => {
    const documents = artifactDocuments();

    for (const [name, document] of Object.entries(documents)) {
      for (const key of Object.keys(document as Record<string, unknown>)) {
        expect(key, `${name} has a merge-suggesting field: ${key}`).not.toMatch(
          MERGE_SUSPICIOUS_NAME,
        );
      }
    }

    // The same check on each RECORD's own keys, not just on the declared key set.
    //
    // This assertion was added because a can-fire probe found the gap: adding
    // `consensus_english_translation` to a record's object literal left this test GREEN, because
    // the earlier version checked only `EXPORT_RECORD_KEYS` and the top-level document keys. A field
    // added to the literal without being added to the constant appears in NEITHER list — so the
    // name check and the merge-content check both walked straight past it. Typecheck would have
    // caught the excess property, but a test that depends on typecheck is not a test: `vitest` runs
    // without it, so the guard has to see the key set itself.
    for (const record of buildExportRecords(SOURCES)) {
      for (const key of Object.keys(record)) {
        expect(key, `a record has a merge-suggesting field: ${key}`).not.toMatch(
          MERGE_SUSPICIOUS_NAME,
        );
      }
    }

    for (const key of EXPORT_RECORD_KEYS) {
      expect(key).not.toMatch(MERGE_SUSPICIOUS_NAME);
    }
  });

  it("exports exactly the declared key set — a field cannot be added without being noticed", () => {
    // The closed key set, asserted over the SERIALIZED record rather than over the constant. This
    // is what closes the gap the probe found: a key added to the record literal but not to
    // `EXPORT_RECORD_KEYS` would still change the CSV column count and the JSON, so it must fail
    // here even though neither of the two lists above would mention it.
    const records = buildExportRecords(SOURCES);
    const declared = [...EXPORT_RECORD_KEYS].sort();

    for (const record of records) {
      expect(Object.keys(record).sort(), "a record's keys must equal the declared set").toEqual(
        declared,
      );
    }

    // And the same set must be what the CSV header carries, or the two forms describe different
    // records even though each is internally consistent.
    const header = (buildCsv(records, EXPORT_RECORD_KEYS).split("\n")[0] ?? "").split(",");
    expect(header.sort()).toEqual(declared);
  });

  it("contains no array or nested object in the records document", () => {
    // A merge can hide as a collection rather than a string — a per-validator array joined at read
    // time is fine, but one already joined into a nested structure is not. The record document is a
    // flat list of flat records, which makes "was anything merged?" answerable by inspection.
    const records = buildExportRecords(SOURCES);

    for (const record of records) {
      for (const [key, value] of Object.entries(record)) {
        expect(Array.isArray(value), `${key} must be a scalar`).toBe(false);
        // `typeof null` is "object", so the null case is excluded explicitly. An earlier draft of
        // this assertion read `typeof value !== "object"` and failed on every absent field — a guard
        // whose predicate was wrong about the language rather than about the code, which is the same
        // defect class as a checker reporting a problem its subject does not have.
        expect(value === null || typeof value !== "object", `${key} must be a scalar or null`).toBe(
          true,
        );
      }
    }
  });

  it("keeps the CSV free of any merged column too", () => {
    const csv = buildCsv(buildExportRecords(SOURCES), EXPORT_RECORD_KEYS);
    const header = csv.split("\n")[0] ?? "";

    expect(header).not.toMatch(MERGE_SUSPICIOUS_NAME);
    // And the CSV column count equals the key count, so no column was added to carry a merge.
    expect(header.split(",")).toHaveLength(EXPORT_RECORD_KEYS.length);
  });
});

describe("disagreement is exported, not resolved", () => {
  it("keeps both differing responses as separate records, choosing neither", () => {
    const records = buildExportRecords(SOURCES);

    expect(records).toHaveLength(2);
    // Both texts present, each in its own record, with no field preferring one.
    expect(records.map((record) => record.english_translation)).toEqual([
      VALIDATOR_ONE_ENGLISH,
      VALIDATOR_TWO_ENGLISH,
    ]);
    // The summary flags the entry rather than resolving it, and reports both validators.
    const summary = buildExportSummary([entry("E1")], SOURCES);
    expect(summary.by_entry[0]).toMatchObject({
      requires_researcher_review: false,
      stored_responses: 2,
      distinct_validators: 2,
    });
  });
});
