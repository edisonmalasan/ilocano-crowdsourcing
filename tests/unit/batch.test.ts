import { describe, expect, it } from "vitest";

import {
  BATCH_SIZE_DEFAULT,
  BATCH_SIZE_HARD_MAX,
  allocationConfigSchema,
  batchRequestSchema,
  resolveBatchSize,
  type AllocationConfig,
} from "@/schemas/batch";

const VALIDATOR_ID = "VAL_a81d92c1";

function config(overrides: Partial<AllocationConfig> = {}): AllocationConfig {
  return allocationConfigSchema.parse(overrides);
}

describe("allocation configuration defaults", () => {
  it("defaults the batch size to 10 when nothing is configured", () => {
    expect(allocationConfigSchema.parse({})).toEqual({ batchSize: BATCH_SIZE_DEFAULT });
    expect(BATCH_SIZE_DEFAULT).toBe(10);
  });

  it("holds exactly one key, so a re-added target fails rather than going unnoticed", () => {
    // The corrected methodology has no independent-validation target for configuration to hold.
    // `strictObject` already rejects an unknown key at parse time; this asserts the key set
    // itself, so a target smuggled back into the schema breaks the assertion even where no
    // caller passes one.
    expect(Object.keys(allocationConfigSchema.parse({}))).toEqual(["batchSize"]);
  });

  it("holds the hard upper bound above the approved batch size, so the bound is not the default", () => {
    expect(BATCH_SIZE_HARD_MAX).toBeGreaterThan(BATCH_SIZE_DEFAULT);
  });
});

describe("allocation configuration validation", () => {
  it("rejects a batch size of zero", () => {
    const result = allocationConfigSchema.safeParse({ batchSize: 0 });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("batchSize");
  });

  it("rejects a negative batch size", () => {
    const result = allocationConfigSchema.safeParse({ batchSize: -1 });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("batchSize");
  });

  it("rejects a batch size above the hard upper bound and names the setting", () => {
    const result = allocationConfigSchema.safeParse({ batchSize: BATCH_SIZE_HARD_MAX + 1 });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("batchSize");
    expect(result.error.issues[0]?.message).toContain("hard maximum");
  });

  it("accepts a batch size exactly at the hard upper bound", () => {
    expect(allocationConfigSchema.parse({ batchSize: BATCH_SIZE_HARD_MAX }).batchSize).toBe(
      BATCH_SIZE_HARD_MAX,
    );
  });

  it("rejects a non-integer batch size", () => {
    expect(allocationConfigSchema.safeParse({ batchSize: 10.5 }).success).toBe(false);
  });

  it("rejects a misspelled setting rather than silently falling back to the default", () => {
    // A typo in a research parameter must not quietly mean "10 entries".
    const result = allocationConfigSchema.safeParse({ batchSizes: 5 });

    expect(result.success).toBe(false);
  });

  it("rejects a resurrected independent-validation target as an unrecognised key", () => {
    // There is no number of validators that completes an entry, so a setting by that name is a
    // mistake or a reverted methodology, not configuration. `strictObject` refuses it rather
    // than stripping it and defaulting around it.
    const result = allocationConfigSchema.safeParse({ independentValidationTarget: 3 });

    expect(result.success).toBe(false);
  });
});

describe("batch request", () => {
  it("accepts a request that names a validator and asks for no particular size", () => {
    const parsed = batchRequestSchema.parse({ validatorId: VALIDATOR_ID });

    expect(parsed.validatorId).toBe(VALIDATOR_ID);
    expect(parsed.requestedSize).toBeUndefined();
  });

  it("accepts a positive requested size", () => {
    expect(
      batchRequestSchema.parse({ validatorId: VALIDATOR_ID, requestedSize: 4 }).requestedSize,
    ).toBe(4);
  });

  it("rejects a non-positive requested size", () => {
    for (const requestedSize of [0, -1]) {
      const result = batchRequestSchema.safeParse({ validatorId: VALIDATOR_ID, requestedSize });

      expect(result.success, `expected requestedSize ${requestedSize} to be rejected`).toBe(false);
      if (result.success) continue;
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain("requestedSize");
    }
  });

  it("rejects a request naming a validator whose ID is not in the opaque format", () => {
    const result = batchRequestSchema.safeParse({ validatorId: "someone@example.test" });

    expect(result.success).toBe(false);
  });
});

describe("effective batch size", () => {
  it("uses the configured batch size when the request states no preference", () => {
    expect(resolveBatchSize(undefined, config())).toBe(10);
  });

  it("reduces an over-maximum request to the configured maximum instead of accepting it", () => {
    expect(resolveBatchSize(500, config())).toBe(10);
    expect(resolveBatchSize(11, config({ batchSize: 5 }))).toBe(5);
  });

  it("honours a smaller request, so a validator can take a shorter batch", () => {
    expect(resolveBatchSize(3, config())).toBe(3);
  });

  it("never returns more than the hard maximum even if a config object bypassed schema parsing", () => {
    // Defence in depth: a value that reached this function without passing `allocationConfigSchema`
    // is still bounded, so the hard bound holds as a property of the function rather than only of
    // its callers.
    const unvalidated = { batchSize: 10_000 };

    expect(resolveBatchSize(10_000, unvalidated)).toBe(BATCH_SIZE_HARD_MAX);
  });

  it("never returns fewer than one entry, so a batch is never empty", () => {
    expect(resolveBatchSize(0, config())).toBe(1);
    expect(resolveBatchSize(-5, config())).toBe(1);
  });
});
