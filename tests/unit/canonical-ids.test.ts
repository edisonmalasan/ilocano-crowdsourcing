import { describe, expect, it } from "vitest";

import {
  CANONICAL_SUFFIX_MAX,
  CANONICAL_SUFFIX_MIN,
  categoryRowForName,
  categoryRowForSlug,
  compareCanonicalEntryIds,
  DATASET_CATEGORY_TABLE,
  parseCanonicalEntryId,
} from "@/lib/domain/categories";

describe("the canonical category table", () => {
  it("holds exactly the five approved categories in file order", () => {
    // Hardcoded, not derived: deriving the expectation from the table would pass with any five
    // rows, including five wrong ones.
    expect(DATASET_CATEGORY_TABLE.map((row) => row.prefix)).toEqual([
      "D",
      "DT",
      "OD",
      "ODT",
      "CPE",
    ]);
    expect(DATASET_CATEGORY_TABLE.map((row) => row.categoryId)).toEqual([1, 2, 3, 4, 5]);
    expect(DATASET_CATEGORY_TABLE.map((row) => row.slug)).toEqual([
      "destination_only",
      "destination_transit_mode",
      "origin_destination",
      "origin_destination_transit_mode",
      "complex_preference_expressions",
    ]);
    expect(DATASET_CATEGORY_TABLE.map((row) => row.name)).toEqual([
      "Destination Only",
      "Destination + Transit Mode",
      "Origin + Destination",
      "Origin + Destination + Transit Mode",
      "Complex/Preference Expressions",
    ]);
  });

  it("spans suffixes 1..800", () => {
    expect(CANONICAL_SUFFIX_MIN).toBe(1);
    expect(CANONICAL_SUFFIX_MAX).toBe(800);
  });

  it("resolves slugs and names, and refuses unknown ones", () => {
    expect(categoryRowForSlug("origin_destination")?.prefix).toBe("OD");
    expect(categoryRowForName("Destination Only")?.prefix).toBe("D");
    expect(categoryRowForSlug("harbor_ferry")).toBeUndefined();
    expect(categoryRowForName("Harbor + Ferry")).toBeUndefined();
  });
});

describe("parseCanonicalEntryId", () => {
  it("accepts every valid family at its boundaries", () => {
    const cases: Array<[string, string, number]> = [
      ["D_1", "D", 1],
      ["D_800", "D", 800],
      ["DT_1", "DT", 1],
      ["DT_800", "DT", 800],
      ["OD_1", "OD", 1],
      ["OD_800", "OD", 800],
      ["ODT_1", "ODT", 1],
      ["ODT_800", "ODT", 800],
      ["CPE_1", "CPE", 1],
      ["CPE_800", "CPE", 800],
      ["OD_124", "OD", 124],
      ["ODT_63", "ODT", 63],
    ];
    for (const [id, prefix, suffix] of cases) {
      const parsed = parseCanonicalEntryId(id);
      expect(parsed, `${id} should parse`).not.toBeNull();
      expect(parsed?.prefix).toBe(prefix);
      expect(parsed?.suffix).toBe(suffix);
      expect(parsed?.category.prefix).toBe(prefix);
    }
  });

  it("rejects zero-padded suffixes, so D_1 has exactly one spelling", () => {
    for (const bad of ["D_01", "D_001", "D_0001", "OD_0042"]) {
      expect(parseCanonicalEntryId(bad), `${bad} should not parse`).toBeNull();
    }
  });

  it("rejects out-of-range suffixes", () => {
    for (const bad of ["D_0", "D_801", "DT_900", "ODT_9999", "CPE_-1"]) {
      expect(parseCanonicalEntryId(bad), `${bad} should not parse`).toBeNull();
    }
  });

  it("rejects unknown prefixes and the previous revision's DO_ prefix", () => {
    for (const bad of ["DO_0001", "DO_1", "XYZ_12", "XX_42"]) {
      expect(parseCanonicalEntryId(bad), `${bad} should not parse`).toBeNull();
    }
  });

  it("rejects non-ids", () => {
    for (const bad of ["", "42", "D", "D_", "_42", "d_1", "OD-1", 42, null, undefined, {}]) {
      expect(parseCanonicalEntryId(bad), `${JSON.stringify(bad)} should not parse`).toBeNull();
    }
  });
});

describe("compareCanonicalEntryIds", () => {
  it("orders numerically within a category, not lexically", () => {
    // The regression this exists for: lexical order puts D_10 before D_2.
    const shuffled = ["D_800", "D_10", "D_2", "D_1", "D_100"];
    expect([...shuffled].sort(compareCanonicalEntryIds)).toEqual([
      "D_1",
      "D_2",
      "D_10",
      "D_100",
      "D_800",
    ]);
  });

  it("orders categories by file order before suffixes", () => {
    const shuffled = ["ODT_1", "CPE_800", "D_800", "DT_1", "OD_1"];
    expect([...shuffled].sort(compareCanonicalEntryIds)).toEqual([
      "D_800",
      "DT_1",
      "OD_1",
      "ODT_1",
      "CPE_800",
    ]);
  });

  it("sorts unknown ids after known ones rather than failing a read", () => {
    expect(compareCanonicalEntryIds("ZZZ", "D_1")).toBeGreaterThan(0);
    expect(compareCanonicalEntryIds("D_1", "ZZZ")).toBeLessThan(0);
    expect(compareCanonicalEntryIds("D_1", "D_1")).toBe(0);
  });
});
