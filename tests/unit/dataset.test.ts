import { describe, expect, it } from "vitest";

import {
  ORIGIN_DESTINATION_CATEGORY,
  datasetEntryIdSchema,
  datasetEntryInputSchema,
  datasetEntrySchema,
  type DatasetEntry,
} from "@/schemas/dataset";

const OD_RECORD = {
  id: "OD_0001",
  category: ORIGIN_DESTINATION_CATEGORY,
  sourceEntryId: 1,
  categoryName: "Origin + Destination",
  instruction: "Gemahen nga agpangide ti Bangko Sentral ti Baguio tije mangimed ti jeep.",
  origin: "Baguio",
  destination: "Bangko Sentral ng Pilipinas",
  transitMode: null,
} as const;

describe("dataset entry ID", () => {
  it("accepts the real source IDs used by the immutable synthetic dataset", () => {
    expect(datasetEntryIdSchema.parse("OD_0001")).toBe("OD_0001");
    expect(datasetEntryIdSchema.parse("OD_0600")).toBe("OD_0600");
  });

  it("accepts every merged category prefix", () => {
    // One per block of the merged source, read from the mapping rather than retyped, so a
    // prefix added to the table without updating this list still fails loudly below.
    for (const [prefix, local] of [
      ["DO", 1],
      ["DT", 600],
      ["OD", 124],
      ["ODT", 42],
      ["CPE", 600],
    ] as const) {
      const id = `${prefix}_${String(local).padStart(4, "0")}`;
      expect(datasetEntryIdSchema.parse(id)).toBe(id);
    }
  });

  it("rejects an ID that is not a source-shaped ID", () => {
    for (const badId of ["od_0001", "OD-0001", "OD_1", "OD_0001a", " OD_0001", ""]) {
      expect(
        datasetEntryIdSchema.safeParse(badId).success,
        `expected ${badId} to be rejected`,
      ).toBe(false);
    }
  });
});

describe("dataset entry input", () => {
  it("accepts a complete Origin + Destination record and preserves the source ID exactly", () => {
    const parsed = datasetEntryInputSchema.parse(OD_RECORD);

    // The source ID is the join key back to data/merged-ilocano-synthetic-data.json, so it must survive
    // byte-for-byte: no case folding, no re-numbering, no prefix rewrite.
    expect(parsed.id).toBe("OD_0001");
    expect(parsed.category).toBe("origin_destination");
    expect(parsed.instruction).toBe(OD_RECORD.instruction);
    expect(parsed.origin).toBe("Baguio");
    expect(parsed.destination).toBe("Bangko Sentral ng Pilipinas");
  });

  it("requires the source-local id and category name, so provenance cannot be silently absent", () => {
    for (const field of ["sourceEntryId", "categoryName"] as const) {
      const partial: Record<string, unknown> = { ...OD_RECORD };
      delete partial[field];
      const result = datasetEntryInputSchema.safeParse(partial);
      expect(result.success, `expected a missing ${field} to be refused`).toBe(false);
      if (result.success) return;
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(field);
    }

    for (const sourceEntryId of [0, 601, -3, 1.5]) {
      const result = datasetEntryInputSchema.safeParse({ ...OD_RECORD, sourceEntryId });
      expect(result.success, `expected sourceEntryId ${sourceEntryId} to be refused`).toBe(false);
    }

    const blankName = datasetEntryInputSchema.safeParse({ ...OD_RECORD, categoryName: "   " });
    expect(blankName.success).toBe(false);
  });

  it("preserves the exact instruction content rather than normalizing its casing", () => {
    // Ilocano capitalization and punctuation are the object of study, so normalization here is
    // limited to whitespace. A capital "N" mid-sentence must reach the validator intact.
    const instruction = "Agpangide ti JEEP nga agpangide ti Baguio — ngayon ari daytoy la.";
    const parsed = datasetEntryInputSchema.parse({ ...OD_RECORD, instruction });

    expect(parsed.instruction).toBe(instruction);
  });

  it("rejects an empty instruction and identifies instruction as the invalid field", () => {
    const result = datasetEntryInputSchema.safeParse({ ...OD_RECORD, instruction: "" });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("instruction");
  });

  it("rejects a whitespace-only instruction and identifies instruction as the invalid field", () => {
    const result = datasetEntryInputSchema.safeParse({ ...OD_RECORD, instruction: "   \t\n  " });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("instruction");
  });

  it("rejects a record with no category and identifies category as required", () => {
    const withoutCategory: Record<string, unknown> = { ...OD_RECORD };
    delete withoutCategory.category;

    const result = datasetEntryInputSchema.safeParse(withoutCategory);

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("category");
  });

  it("accepts a category the platform has never seen, so a new import needs no code change", () => {
    const result = datasetEntryInputSchema.safeParse({
      ...OD_RECORD,
      id: "TR_0001",
      category: "time_reference",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.category).toBe("time_reference");
  });

  it("accepts an explicit null transitMode rather than rejecting the record", () => {
    const result = datasetEntryInputSchema.safeParse({ ...OD_RECORD, transitMode: null });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.transitMode).toBeNull();
  });

  it("accepts an explicit null origin and destination for a category that has neither", () => {
    const result = datasetEntryInputSchema.safeParse({
      ...OD_RECORD,
      id: "GE_0001",
      category: "greetings",
      origin: null,
      destination: null,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.origin).toBeNull();
    expect(result.data.destination).toBeNull();
  });

  it("treats an omitted optional text field as null, the same as an explicit null", () => {
    const withoutTransitMode: Record<string, unknown> = { ...OD_RECORD };
    delete withoutTransitMode.transitMode;

    const omitted = datasetEntryInputSchema.parse(withoutTransitMode);
    const explicitNull = datasetEntryInputSchema.parse(OD_RECORD);

    expect(omitted.transitMode).toBeNull();
    expect(omitted).toEqual(explicitNull);
  });

  it("rejects a category that is not lowercase snake_case", () => {
    for (const badCategory of [
      "Origin_Destination",
      "origin destination",
      "origin-destination",
      "",
    ]) {
      expect(
        datasetEntryInputSchema.safeParse({ ...OD_RECORD, category: badCategory }).success,
        `expected ${badCategory} to be rejected`,
      ).toBe(false);
    }
  });
});

describe("dataset entry record", () => {
  it("defaults isActive to true so an imported entry is live without extra ceremony", () => {
    const parsed = datasetEntrySchema.parse({
      ...OD_RECORD,
      createdAt: "2026-09-30T00:00:00.000Z",
    });

    expect(parsed.isActive).toBe(true);
  });

  it("carries the source definition fields, so a stored entry can be read back on its own", () => {
    const parsed = datasetEntrySchema.parse({
      ...OD_RECORD,
      createdAt: "2026-09-30T00:00:00.000Z",
      isActive: false,
    });

    expect(parsed.id).toBe("OD_0001");
    expect(parsed.instruction).toBe(OD_RECORD.instruction);
    expect(parsed.isActive).toBe(false);
  });

  it("rejects a record whose createdAt is not a datetime", () => {
    const result = datasetEntrySchema.safeParse({
      ...OD_RECORD,
      createdAt: "not-a-date",
    });

    expect(result.success).toBe(false);
  });

  it("is structurally distinct from a validation response, so a response can never stand in for an entry", () => {
    // The immutability rule is only real if the two shapes cannot be confused. A response carries
    // no `instruction`, and an entry carries no `evaluation`, so neither is assignable to the
    // other. This is the runtime half of the type-level assertion in `domain-types.test.ts`.
    const entry: DatasetEntry = datasetEntrySchema.parse({
      ...OD_RECORD,
      createdAt: "2026-09-30T00:00:00.000Z",
    });

    const responseShapedAsEntry = {
      // A source-SHAPED id, deliberately. An earlier revision of this test used `id: "val-1"`,
      // which the id regex rejects, so the assertion passed for the wrong reason: it proved the
      // id format, not the structural disjointness the comment claims. With a well-formed id the
      // only thing left that can reject this payload is the missing entry fields.
      id: "OD_0001",
      validatorId: "VAL_a81d92c1",
      datasetEntryId: "OD_0001",
      batchId: "batch-1",
      evaluation: "correct_natural",
      createdAt: "2026-09-30T00:00:00.000Z",
      updatedAt: "2026-09-30T00:00:00.000Z",
    };

    const result = datasetEntrySchema.safeParse(responseShapedAsEntry);
    expect(result.success).toBe(false);

    // Assert the REASON, not just the outcome. `id` must not appear among the failing paths: if it
    // does, this test has gone back to proving the id format rather than the shape separation.
    const failingPaths = result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
    expect(failingPaths).not.toContain("id");
    expect(failingPaths).toContain("instruction");
    expect(failingPaths).toContain("category");

    expect("instruction" in entry).toBe(true);
    expect("evaluation" in entry).toBe(false);
  });
});
