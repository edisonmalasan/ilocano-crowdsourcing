import { describe, expect, it } from "vitest";

import {
  formatTransitModeValue,
  isTransitMode,
  isTransitModePair,
  isTransitModeValue,
  parseTransitModeCsvCell,
  serializeTransitModeCsvCell,
  TRANSIT_MODES,
  transitModePairSchema,
  transitModeValueSchema,
} from "@/lib/domain/transit-mode";

describe("the transit-mode vocabulary", () => {
  it("holds exactly the four approved modes", () => {
    expect([...TRANSIT_MODES]).toEqual(["walking", "jeepney", "taxi", "private_vehicle"]);
  });

  it("accepts each approved mode and refuses anything else", () => {
    for (const mode of ["walking", "jeepney", "taxi", "private_vehicle"]) {
      expect(isTransitMode(mode)).toBe(true);
    }
    for (const bad of ["bus", "car", "Walking", "", null, undefined, 42, ["walking"]]) {
      expect(isTransitMode(bad)).toBe(false);
    }
  });
});

describe("isTransitModePair", () => {
  it("accepts an ordered pair of two distinct approved modes", () => {
    expect(isTransitModePair(["jeepney", "walking"])).toBe(true);
    expect(isTransitModePair(["walking", "jeepney"])).toBe(true);
    expect(isTransitModePair(["taxi", "private_vehicle"])).toBe(true);
  });

  it("rejects a one-mode array", () => {
    expect(isTransitModePair(["walking"])).toBe(false);
  });

  it("rejects a three-mode array", () => {
    expect(isTransitModePair(["walking", "jeepney", "taxi"])).toBe(false);
  });

  it("rejects a duplicated pair", () => {
    expect(isTransitModePair(["walking", "walking"])).toBe(false);
  });

  it("rejects invalid vocabulary", () => {
    expect(isTransitModePair(["bus", "taxi"])).toBe(false);
    expect(isTransitModePair(["walking", "car"])).toBe(false);
  });

  it("rejects non-arrays", () => {
    expect(isTransitModePair("walking")).toBe(false);
    expect(isTransitModePair(null)).toBe(false);
    expect(isTransitModePair(undefined)).toBe(false);
  });
});

describe("isTransitModeValue", () => {
  it("accepts null, a scalar, and a pair", () => {
    expect(isTransitModeValue(null)).toBe(true);
    expect(isTransitModeValue("jeepney")).toBe(true);
    expect(isTransitModeValue(["jeepney", "walking"])).toBe(true);
  });

  it("rejects malformed values", () => {
    expect(isTransitModeValue(["walking"])).toBe(false);
    expect(isTransitModeValue(["walking", "walking"])).toBe(false);
    expect(isTransitModeValue("bus")).toBe(false);
    expect(isTransitModeValue(42)).toBe(false);
  });
});

describe("transitModeValueSchema", () => {
  it("parses null, scalars, and ordered pairs", () => {
    expect(transitModeValueSchema.parse(null)).toBe(null);
    expect(transitModeValueSchema.parse("taxi")).toBe("taxi");
    expect(transitModeValueSchema.parse(["jeepney", "walking"])).toEqual(["jeepney", "walking"]);
  });

  it("defaults an omitted key to null", () => {
    const parsed = transitModeValueSchema.parse(undefined);
    expect(parsed).toBe(null);
  });

  it("rejects one-mode, three-mode, duplicated, and out-of-vocabulary values", () => {
    for (const bad of [
      ["walking"],
      ["walking", "jeepney", "taxi"],
      ["walking", "walking"],
      ["bus", "taxi"],
      "bus",
    ]) {
      expect(transitModeValueSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it("rejects a duplicated pair at the pair schema", () => {
    expect(transitModePairSchema.safeParse(["taxi", "taxi"]).success).toBe(false);
  });
});

describe("formatTransitModeValue", () => {
  it("renders a scalar as itself and a pair as both modes", () => {
    expect(formatTransitModeValue("jeepney")).toBe("jeepney");
    expect(formatTransitModeValue(["jeepney", "walking"])).toBe("jeepney + walking");
    expect(formatTransitModeValue(null)).toBe(null);
  });
});

describe("the CSV pair cell", () => {
  it("serializes a pair as compact JSON and parses it back in order", () => {
    expect(serializeTransitModeCsvCell(["jeepney", "walking"])).toBe('["jeepney","walking"]');
    expect(parseTransitModeCsvCell('["jeepney","walking"]')).toEqual(["jeepney", "walking"]);
    // Order preserved, not sorted: reversed source stays reversed.
    expect(serializeTransitModeCsvCell(["walking", "jeepney"])).toBe('["walking","jeepney"]');
    expect(parseTransitModeCsvCell('["walking","jeepney"]')).toEqual(["walking", "jeepney"]);
  });

  it("round-trips scalars and nulls", () => {
    expect(serializeTransitModeCsvCell("taxi")).toBe("taxi");
    expect(parseTransitModeCsvCell("taxi")).toBe("taxi");
    expect(serializeTransitModeCsvCell(null)).toBe(null);
    expect(parseTransitModeCsvCell(null)).toBe(null);
    expect(parseTransitModeCsvCell("")).toBe(null);
  });

  it("never produces an ambiguous joined cell", () => {
    const cell = serializeTransitModeCsvCell(["jeepney", "walking"]);
    expect(cell).not.toContain("jeepney, walking");
    expect(cell).not.toContain("jeepney / walking");
  });

  it("refuses a malformed cell as absence rather than guessing", () => {
    expect(parseTransitModeCsvCell("jeepney, walking")).toBe(null);
    expect(parseTransitModeCsvCell('["walking"]')).toBe(null);
    expect(parseTransitModeCsvCell('["bus","taxi"]')).toBe(null);
  });
});
