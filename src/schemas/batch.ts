import { z } from "zod";

import { anonymousValidatorIdSchema } from "./validator";

/**
 * Batch request and allocation-configuration contract.
 *
 * Both research parameters here are CONFIGURATION, not settled facts:
 *
 * - `batchSize` defaults to 10, matching the approved participant experience, but the thesis team
 *   and adviser have not signed off a final value.
 * - `independentValidationTarget` defaults to 3, matching the current planning target of three
 *   independent eligible validators per entry, and is explicitly pending adviser approval.
 *
 * That is precisely why both live in a validated configuration object with hard upper bounds
 * rather than as constants baked into the allocation query. When the approved numbers arrive they
 * change a configuration value; they do not change a schema, a migration, or an interface.
 *
 * The upper bounds exist for an operational reason, not a research one: a batch larger than the
 * hard maximum, or an independent-validation target above 100, indicates a misconfiguration or a
 * hostile request, and must fail loudly at the boundary rather than quietly producing an
 * allocation that no validator can complete and no coverage query can satisfy.
 */

/** Approved participant batch size. */
export const BATCH_SIZE_DEFAULT = 10;

/**
 * Hard upper bound on a single batch, 50 entries. Five times the approved size: generous enough
 * that any realistic research adjustment stays inside it, small enough that a misconfigured
 * request cannot ask one validator to judge more entries than a single sitting could plausibly
 * produce. This is a safety bound, not a research decision — raising it requires no data change.
 */
export const BATCH_SIZE_HARD_MAX = 50;

/** Planning default for independent validations per entry; pending thesis-team approval. */
export const INDEPENDENT_VALIDATION_TARGET_DEFAULT = 3;

/**
 * Hard upper bound on the independent-validation target. Far above any plausible methodology
 * choice, so it can only ever be hit by a bug or a hostile value.
 */
export const INDEPENDENT_VALIDATION_TARGET_HARD_MAX = 100;

/**
 * `strictObject` so a misspelled or unrecognised setting is rejected at the boundary instead of
 * being stripped and silently replaced by a default — a typo in a research parameter must not
 * quietly mean "10 entries, 3 validators".
 */
export const allocationConfigSchema = z.strictObject({
  batchSize: z
    .number()
    .int("batchSize must be an integer")
    .min(1, "batchSize must be at least 1")
    .max(
      BATCH_SIZE_HARD_MAX,
      `batchSize must not exceed the hard maximum of ${BATCH_SIZE_HARD_MAX}`,
    )
    .default(BATCH_SIZE_DEFAULT),
  independentValidationTarget: z
    .number()
    .int("independentValidationTarget must be an integer")
    .min(1, "independentValidationTarget must be at least 1")
    .max(
      INDEPENDENT_VALIDATION_TARGET_HARD_MAX,
      `independentValidationTarget must not exceed the hard maximum of ${INDEPENDENT_VALIDATION_TARGET_HARD_MAX}`,
    )
    .default(INDEPENDENT_VALIDATION_TARGET_DEFAULT),
});

export type AllocationConfig = z.infer<typeof allocationConfigSchema>;

/**
 * What a validator asks for. `requestedSize` is a *preference*, not an entitlement: it is capped by
 * the server-authoritative configuration in `resolveBatchSize`, so a client cannot ask for a
 * larger batch by claiming a larger number.
 */
export const batchRequestSchema = z.object({
  validatorId: anonymousValidatorIdSchema,
  requestedSize: z.number().int("requestedSize must be an integer").min(1).optional(),
});

export type BatchRequest = z.infer<typeof batchRequestSchema>;

/**
 * Resolves the effective batch size for a request.
 *
 * The configured `batchSize` is the ceiling and the hard maximum is the backstop, so the result is
 * `min(requested, configured, HARD_MAX)` — the client can ask for fewer entries, never for more.
 * A validator at the end of the dataset with only three eligible entries will still be served
 * three entries; the caller is responsible for returning fewer than the effective size when the
 * candidate pool is smaller.
 */
export function resolveBatchSize(
  requestedSize: number | undefined,
  config: AllocationConfig,
): number {
  const ceiling = Math.min(config.batchSize, BATCH_SIZE_HARD_MAX);

  if (requestedSize === undefined) return ceiling;

  return Math.max(1, Math.min(requestedSize, ceiling));
}
