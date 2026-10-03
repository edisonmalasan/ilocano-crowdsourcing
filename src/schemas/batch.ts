import { z } from "zod";

import {
  datasetCategorySchema,
  datasetEntryIdSchema,
  optionalTextSchema,
  requiredTextSchema,
} from "./dataset";
import { anonymousValidatorIdSchema } from "./validator";

/**
 * Batch request and allocation-configuration contract.
 *
 * The one research parameter here is CONFIGURATION, not a settled fact: `batchSize` defaults to
 * 10, matching the approved participant experience, but the thesis team and adviser have not
 * signed off a final value.
 *
 * That is precisely why it lives in a validated configuration object with a hard upper bound
 * rather than as a constant baked into the allocation query. When the approved number arrives it
 * changes a configuration value; it does not change a schema, a migration, or an interface.
 *
 * There is deliberately no independent-validation target any more. A dataset entry is complete
 * when one validation establishes the complete bilingual package, so there is no number of
 * validators or attempts for configuration to hold: the `independentValidationTarget` key, its
 * default of 3, and its hard maximum were deleted by the `single-validation-package` change, and
 * re-adding a target here would contradict the methodology rather than configure it.
 *
 * The upper bound exists for an operational reason, not a research one: a batch larger than the
 * hard maximum indicates a misconfiguration or a hostile request, and must fail loudly at the
 * boundary rather than quietly producing an allocation that no validator can complete.
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

/**
 * `strictObject` so a misspelled or unrecognised setting is rejected at the boundary instead of
 * being stripped and silently replaced by a default — a typo in a research parameter must not
 * quietly mean "10 entries". The object holds exactly one key, asserted by an exact `Object.keys`
 * set in `tests/unit/batch.test.ts`, so a re-added target fails the test rather than going
 * unnoticed.
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

/**
 * An opaque, non-empty batch identifier that can be carried in a URL PATH SEGMENT.
 *
 * Not a `uuid`, for the same reason the other research identifiers are not: no validator is an
 * authenticated user, so nothing here has a subject to derive one from, and the identifiers are read
 * in logs and matched by hand during review.
 *
 * **The no-`/` rule was ADDED by `batch-route-round-trip`, and the reason is worth reading rather
 * than inheriting.** Producers emit the identifier RAW — encoding is the transport's business and the
 * route decodes it once — which is correct for the production scheme `VAL_<hex8>-<ISO>`. It does mean
 * the address a producer builds is exactly `/validate/` followed by whatever this schema accepts, so
 * an identifier containing a path separator would make the router address a DIFFERENT route.
 *
 * The pre-change code did not have this problem, and the reason is instructive rather than lucky: it
 * called `encodeURIComponent` on every producer, so the injection was blocked *incidentally*, as a
 * side effect of the encoding bug this change removes. Deleting the bug therefore deleted the
 * protection with it, and `min(1)` alone does not restore it — a value of `batch/../../admin` is
 * non-empty and perfectly valid to a `min(1)`.
 *
 * So the invariant is asserted where it belongs: an identifier that cannot appear in a stored batch
 * cannot be turned into an address that leaves `/validate`. `defaultBatchId` builds
 * `<validatorId>-<ISO>`, `AnonymousValidatorId` is `VAL_` plus eight hex characters, and an ISO
 * instant contains no solidus — so every identifier this platform can mint passes, and the rule
 * constrains nothing real while closing the hole.
 */
export const batchIdSchema = z
  .string()
  .min(1, "batch id must not be empty")
  .refine((value) => !value.includes("/"), {
    message: "batch id must not contain a path separator",
  });

/**
 * Where one entry sits in the order the SERVER chose for its batch.
 *
 * 1-based, because the position is read by humans in review ("the third entry of batch 12") and a
 * 0-based index makes that conversation need a subtraction. The integer and lower bounds are not
 * decoration: they mirror `batch_entries_position_positive` in the allocation migration, so a
 * value the database would refuse cannot be constructed here either.
 *
 * What this deliberately cannot be is client-supplied. The position is derived by the allocation
 * service from the order `selectBatchEntries` returned; there is no code path by which a payload
 * chooses it.
 */
export const batchEntryPositionSchema = z
  .number()
  .int("position must be an integer")
  .min(1, "position must be at least 1");

/** One entry of a batch, with the position the server gave it. */
export const batchEntryPlacementSchema = z.strictObject({
  datasetEntryId: datasetEntryIdSchema,
  position: batchEntryPositionSchema,
});

export type BatchEntryPlacement = z.infer<typeof batchEntryPlacementSchema>;

/**
 * A persisted batch and its ordered entries.
 *
 * ONE type for both the write and the read-back, deliberately. The service builds it, hands it to
 * `BatchesRepository.create`, and then READS A BATCH BACK with `findById` rather than echoing the
 * argument — the same choice `enrollValidator` makes when it returns the identifier the repository
 * returned instead of the one it minted. Echoing would let a repository that stored something
 * different (reordered entries, a dropped row) be papered over by the service that built the
 * request.
 *
 * This RECORD carries no timestamps. `validation_batches` now does — `created_at` was added by the
 * `interrupted-batch-recovery` migration so an abandoned batch can be recognised without a lifecycle
 * column, and the repository reads it separately (`listForRecovery` selects it; `findById` does not).
 * The distinction is deliberate and worth keeping: a timestamp is needed to ORDER a validator's batches,
 * but nothing about a single batch's own lifecycle needs one, so this type stays timestamp-free and the
 * record the participant reads back is unchanged.
 *
 * A lifecycle `status` still does not exist, and adding columns for behavior no code implements is the
 * exact thing the structural-table scenario in the research-schema spec forbids.
 *
 * `entries` is `.min(1)`, and that minimum is a correctness guard rather than a validation
 * nicety. `create` issues two PostgREST calls — the batch row, then its entry rows — and there is
 * no transaction spanning them. A read-back that found zero entries is a PARTIAL WRITE, and
 * returning it would report a batch containing no entries, which the allocation contract forbids
 * and which a validator would experience as being given nothing to do. Failing the translation here
 * turns that into a `RepositoryError` the service reports as a persistence failure.
 */
export const batchRecordSchema = z.strictObject({
  id: batchIdSchema,
  validatorId: anonymousValidatorIdSchema,
  entries: z
    .array(batchEntryPlacementSchema)
    .min(1, "a persisted batch must contain at least one entry"),
});

export type BatchRecord = z.infer<typeof batchRecordSchema>;

/**
 * ============================================================================
 * WHAT AN ALLOCATED BATCH RETURNS TO THE REQUESTING VALIDATOR
 * ============================================================================
 * `AllocatedEntry` is NOT `DatasetEntry` and must not become one. The difference is the whole point
 * of the type, and it is a CLOSED set rather than a widening of the dataset contract:
 *
 *   INCLUDED — the six fields the validation screen has to render. The instruction is the thing
 *   being judged; `id` is what the response is recorded against; `origin`, `destination`, and
 *   `transitMode` are the OD category's context; `category` is what lets one screen serve every
 *   future dataset category without hard-coding OD.
 *
 *   EXCLUDED, each for its own reason rather than as a blanket "trim the type":
 *
 *   - `sourcePayload` is the ARCHIVAL COPY of the source record. It exists so an unmodelled field
 *     survives in the database and stays recoverable. It is not research output and has no business
 *     crossing to a browser; `tests/unit/domain-types.test.ts` asserts it cannot be constructed
 *     here at all.
 *   - `createdAt` is an ingestion timestamp. It is not a research finding, and surfacing it invites
 *     a reviewer to reason about which entries were imported first.
 *   - `isActive` is an ALLOCATION INPUT, not an output. A batch the server just built cannot contain
 *     a retired entry, so returning the flag says either "impossible" or "you have a bug" and
 *     teaches the consumer to ignore it.
 *
 *   ALSO EXCLUDED, and this is the research-integrity half of the design: any other validator's
 *   response, any other validator's screening answer, and any coverage figure. The spec requires it
 *   and a type is the only place it can be enforced structurally — a component can always choose to
 *   fetch more, but it cannot render a field this type does not have. Internal coverage in
 *   particular would tell one validator which entries are under-collected, which is a research
 *   variable they have no business seeing.
 *
 * `strictObject` rather than `object`, for the same reason as everywhere else in this codebase: a
 * misspelled field is a bug, not something to strip silently.
 */
export const allocatedEntrySchema = z.strictObject({
  id: datasetEntryIdSchema,
  category: datasetCategorySchema,
  instruction: requiredTextSchema,
  origin: optionalTextSchema,
  destination: optionalTextSchema,
  transitMode: optionalTextSchema,
});

export type AllocatedEntry = z.infer<typeof allocatedEntrySchema>;

/**
 * Why an allocation did not produce a batch. A CLOSED set, and every value is produced.
 *
 * `invalid`
 *   The request could not be parsed at the intake boundary. Nothing was read and nothing was
 *   written.
 * `unknown_validator`
 *   The identifier names no stored validator. Distinct from `persistence` because the correct
 *   response is to offer a fresh identity, not to tell a participant the study is having trouble.
 * `persistence`
 *   A read or a write failed. The batch is NOT reported, and no batch id is returned, because a
 *   client that can read a batch id out of a failed response will treat it as stored.
 * `not_configured`
 *   This deployment has no database. The expected state of the current environment, and it deserves
 *   a plain "the study is not open" message rather than a database fault.
 *
 * These four are kept apart rather than collapsed into one "failed" on purpose. Collapsing would be
 * less code and would erase the one distinction that decides what a participant is told.
 */
export type AllocationFailureReason =
  "invalid" | "unknown_validator" | "persistence" | "not_configured";

/**
 * The result of one allocation request.
 *
 * THREE outcomes, not two, and the middle one is the reason for the type:
 *
 * `allocated` carries entries and is guaranteed NON-EMPTY. The guarantee is structural — there is no
 * way to construct an `allocated` with zero entries from a service result, and `batchRecordSchema`
 * refuses to persist one — because the spec forbids reporting a successful batch containing no
 * entries, and an empty array would present as "you have been given nothing to do".
 *
 * `exhausted` is an ordinary, expected research outcome: every remaining entry was already answered
 * by this validator or has reached the coverage target. It carries no batch, and it is deliberately
 * NOT a `failed`. Collapsing them would tell a validator who has finished the study that something
 * is broken, and would make the coverage-monitoring figure uncomputable.
 *
 * `failed` carries a reason and never carries a batch or a batch id.
 *
 * The union is closed (`z.union` of `z.strictObject`s would be the runtime form) so a consumer
 * switching on `status` is forced to handle every case, and so adding one is a compile error at each
 * consumer rather than a silently-ignored branch.
 */
export type AllocationOutcome =
  | {
      readonly status: "allocated";
      readonly batchId: string;
      readonly entries: readonly AllocatedEntry[];
    }
  | { readonly status: "exhausted" }
  | { readonly status: "failed"; readonly reason: AllocationFailureReason };
