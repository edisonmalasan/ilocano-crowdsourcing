import { describe, expect, it } from "vitest";

import {
  BATCH_SIZE_DEFAULT,
  BATCH_SIZE_HARD_MAX,
  INDEPENDENT_VALIDATION_TARGET_DEFAULT,
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
    expect(allocationConfigSchema.parse({})).toEqual({
      batchSize: BATCH_SIZE_DEFAULT,
      independentValidationTarget: INDEPENDENT_VALIDATION_TARGET_DEFAULT,
    });
    expect(BATCH_SIZE_DEFAULT).toBe(10);
  });

  it("defaults the independent-validation target to 3, the current planning target", () => {
    expect(INDEPENDENT_VALIDATION_TARGET_DEFAULT).toBe(3);
    expect(allocationConfigSchema.parse({}).independentValidationTarget).toBe(3);
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
    // A typo in a research parameter must not quietly mean "10 entries, 3 validators".
    const result = allocationConfigSchema.safeParse({ batchSizes: 5 });

    expect(result.success).toBe(false);
  });

  it("rejects a non-positive independent-validation target", () => {
    for (const target of [0, -3]) {
      const result = allocationConfigSchema.safeParse({ independentValidationTarget: target });

      expect(result.success, `expected target ${target} to be rejected`).toBe(false);
      if (result.success) continue;
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(
        "independentValidationTarget",
      );
    }
  });

  it("allows the independent-validation target to be changed without a code change", () => {
    // The thesis team and adviser have not approved the final count, so this is configuration.
    expect(
      allocationConfigSchema.parse({ independentValidationTarget: 5 }).independentValidationTarget,
    ).toBe(5);
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
    const unvalidated = { batchSize: 10_000, independentValidationTarget: 3 };

    expect(resolveBatchSize(10_000, unvalidated)).toBe(BATCH_SIZE_HARD_MAX);
  });

  it("never returns fewer than one entry, so a batch is never empty", () => {
    expect(resolveBatchSize(0, config())).toBe(1);
    expect(resolveBatchSize(-5, config())).toBe(1);
  });
});
