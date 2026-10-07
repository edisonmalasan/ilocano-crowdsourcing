import "server-only";

import { recognizeInterruptedBatch } from "@/lib/domain/batch-recovery";
import {
  isRepositoryError,
  type BatchesRepository,
  type DatasetEntriesRepository,
  type ValidationsRepository,
  type ValidatorsRepository,
} from "@/lib/repositories";
import { isWriteIntentError, parseWriteIntent } from "@/lib/server/write-intake";
import { anonymousValidatorIdSchema } from "@/schemas/validator";
import {
  type AllocatedEntry,
  type AllocationConfig,
  type AllocationFailureReason,
} from "@/schemas/batch";
import { z } from "zod";

import { allocateBatch, type MintedBatchIdentity } from "@/lib/allocation/allocate-batch";
import { projectAllocatedEntry } from "./allocated-entry";
import { resolveSessionEntry } from "./session";

/**
 * ============================================================================
 * THE VALIDATION-START ORCHESTRATION CORE — the testable half
 * ============================================================================
 * Same split as `allocation-actions-core.ts` and `recovery-actions-core.ts`, and for the same
 * reason: a file marked `"use server"` may only export async functions, which would make every
 * decision below reachable only by constructing a Supabase client. No credential exists in this
 * repository, so a client cannot be constructed. Every claim in this header is therefore checkable
 * here, with fakes, and no database.
 *
 * The core is a THIN SEQUENCER, deliberately. It owns no selection rule, no reservation, no
 * completion predicate, and no projection of its own: recovery recognition lives in
 * `recognizeInterruptedBatch`, allocation (profile gate, size cap, single versioned-function call,
 * read-back, granted-entry projection) lives in `allocateBatch`, first-entry resolution lives in
 * `resolveSessionEntry`, and the six-field projection lives in `projectAllocatedEntry`. What this
 * module owns is the ORDER — recovery check first, allocation only when there is nothing to
 * resume, first-entry resolution last — and the SHAPE of the result (batch id plus exactly one
 * entry plus its completed count, never the batch).
 *
 * ============================================================================
 * WHY THE RESULT IS A NEW CLOSED UNION AND NOT `AllocationOutcome`
 * ============================================================================
 * The shape contract — exactly one entry, never the batch — is the point of this change, and
 * reusing the wide type would let the `entries` array leak back in through the same field the
 * old clients deliberately read past. A new union carrying one `entry` (plus its `position`,
 * the batch `total`, and the `completedCount` the session runner opens with) makes a second entry
 * unrepresentable rather than merely unread.
 *
 * Terminal outcomes reuse `AllocationFailureReason` rather than inventing a second vocabulary:
 * `invalid` (nothing read, nothing written), `unknown_validator`, `screening_required`,
 * `not_configured`, and `persistence` already say everything a start can report, and the two
 * start screens' existing deciders (`decideStartBatch`, `decideContinueBatch`) already map every
 * one of them to a participant-facing state with an onward action.
 *
 * ============================================================================
 * WHY THE RECOVERY CHECK FALLS THROUGH ON AN INTERNAL FAILURE
 * ============================================================================
 * A lookup that cannot complete is not shown as an error sentence — the participant cannot act
 * on it — and the run proceeds to allocation exactly as when no interrupted batch exists. That
 * is the additive rule from the recovery path, restated for an orchestration with no separate
 * lookup round trip to preserve. Only the CONFIGURATION failure is distinguished: it is
 * reported, because allocation behind it would fail the same way and the honest answer is the
 * deployment state rather than a second attempt at it.
 */

/**
 * What a start request may contain.
 *
 * `validatorId` plus an optional size PREFERENCE, capped server-side by `resolveBatchSize`
 * inside `allocateBatch`. Anything else — an entry list, an order, a coverage value, batch
 * ownership, timestamps — is refused before any repository call, matching the allocation
 * intent's reject-don't-ignore posture.
 */
export const startValidationIntentSchema = z.strictObject({
  validatorId: anonymousValidatorIdSchema,
  requestedSize: z.number().int("requestedSize must be an integer").min(1).optional(),
});

/** What a client's start request is allowed to be, as a TYPE. */
export type StartValidationIntent = z.infer<typeof startValidationIntentSchema>;

/** The keys of `T`, as a union. */
type KeyUnion<T> = keyof T;

/**
 * Exact (not assignable) equality, so a WIDER key set fails rather than passing.
 *
 * The `true : false` spelling is load-bearing and not stylistic, measured on this
 * module: with `true : never`, adding `clientOrder` to the intent left
 * `pnpm run typecheck` green at exit 0 — the pin was decoration. With
 * `true : false` the same widening fails at
 * `TS2322: Type 'true' is not assignable to type 'never'` at the assertion site,
 * exit 2, with the control green. The `never` false-branch lets a deferred
 * comparison pass silently; the `false` one does not.
 */
type Equals<A, B> =
  (<G>() => G extends A ? 1 : 2) extends <G>() => G extends B ? 1 : 2 ? true : false;

/**
 * Type-level pin on the START INTENT's key set.
 *
 * A third key fails `pnpm run typecheck` with
 * `TS2322: Type 'true' is not assignable to type 'never'` whatever it is called, because the
 * compiler sees the absence of a key that does not exist yet. A behavioural test cannot do
 * this: it can smuggle plausible extra keys and assert refusal, which catches a schema that
 * forgot to be `strictObject` but cannot catch a fourth key someone added on purpose.
 */
export type StartValidationIntentKeysAreIdentifierAndSizeOnly =
  Equals<KeyUnion<StartValidationIntent>, "validatorId" | "requestedSize"> extends true
    ? true
    : never;

/**
 * Every way one start orchestration can resolve. A closed union so a consumer switching on
 * `status` is forced to handle every case.
 *
 *   `started` — a fresh batch was allocated; the single entry to present, with its 1-based
 *               position in the server's order, the batch total, and the completed count (zero).
 *   `resumed` — an interrupted batch was resumed; the first unanswered entry, addressed the
 *               same way, with the authoritative completed count. Zero allocation calls behind it.
 *   `exhausted` — an ordinary research outcome, never a failure.
 *   `failed` — nothing usable resulted, with the reused `AllocationFailureReason` vocabulary.
 */
export type StartValidationOutcome =
  | {
      readonly status: "started";
      readonly batchId: string;
      readonly entry: AllocatedEntry;
      readonly position: number;
      readonly total: number;
      readonly completedCount: number;
    }
  | {
      readonly status: "resumed";
      readonly batchId: string;
      readonly entry: AllocatedEntry;
      readonly position: number;
      readonly total: number;
      readonly completedCount: number;
    }
  | { readonly status: "exhausted" }
  | { readonly status: "failed"; readonly reason: AllocationFailureReason };

/**
 * Type-level pin on the START RESULT's key set, both presentational arms.
 *
 * The one-entry wire shape is the point of the orchestration, and a second entry (or a
 * payload, coverage figure, or researcher field) added on purpose must fail
 * `pnpm run typecheck` whatever it is called — the same pin already holding the intent.
 * The runtime half is the exact `Object.keys` assertion in `start-validation-core.test.ts`.
 */
export type StartValidationOutcomeKeysAreBatchIdEntryPositionTotalAndCountOnly =
  Equals<
    KeyUnion<Extract<StartValidationOutcome, { readonly status: "started" }>>,
    "status" | "batchId" | "entry" | "position" | "total" | "completedCount"
  > extends true
    ? Equals<
        KeyUnion<Extract<StartValidationOutcome, { readonly status: "resumed" }>>,
        "status" | "batchId" | "entry" | "position" | "total" | "completedCount"
      > extends true
      ? true
      : never
    : never;

export interface StartValidationDependencies {
  readonly validators: Pick<ValidatorsRepository, "findById">;
  readonly validations: Pick<ValidationsRepository, "listEntryIdsForValidator">;
  readonly batches: Pick<BatchesRepository, "listForRecovery" | "allocate" | "findById">;
  readonly datasetEntries: Pick<DatasetEntriesRepository, "findById" | "listByIds">;
  readonly config: AllocationConfig;
  /**
   * A batch's identity at the moment it is created: its identifier AND its creation instant,
   * from ONE `Date`. Passed through to `allocateBatch`, which is the module that owns the
   * pairing — see `AllocationDependencies.newBatch`.
   */
  readonly newBatch: (
    validatorId: Parameters<typeof allocateBatch>[0]["validatorId"],
  ) => MintedBatchIdentity;
  /**
   * Thrown by the dependency builder when the deployment has no database configured. Typed
   * as a constructor so this file can recognise the condition without importing the
   * environment module, which is what keeps it testable without stubbing `process.env`.
   */
  readonly ConfigurationFailure: new (...args: never[]) => Error;
}

function isConfigurationFailure(error: unknown, deps: StartValidationDependencies): boolean {
  return error instanceof deps.ConfigurationFailure;
}

/**
 * Resolves the first entry to present for one batch: completed set, server-order choice,
 * single stored entry, six-field projection.
 *
 * Shared by the resume and fresh-start arms so the two cannot disagree about what "first"
 * means. Returns `null` when the batch holds no presentable entry (finished, or a stored
 * row the schema refuses), letting the caller decide what that means for its own arm.
 */
async function resolveFirstEntry(
  batchId: string,
  validatorId: StartValidationIntent["validatorId"],
  deps: StartValidationDependencies,
): Promise<{
  entry: AllocatedEntry;
  position: number;
  total: number;
  completedCount: number;
} | null> {
  const batch = await deps.batches.findById(batchId);
  if (batch === null) return null;
  const completedEntryIds = new Set(await deps.validations.listEntryIdsForValidator(validatorId));
  const choice = resolveSessionEntry(batch.entries, completedEntryIds, undefined);
  if (choice === null) return null;
  const stored = await deps.datasetEntries.findById(choice.placement.datasetEntryId);
  if (stored === null) return null;
  const entry = projectAllocatedEntry(stored);
  if (entry === null) return null;
  return {
    entry,
    position: choice.placement.position,
    total: choice.total,
    completedCount: choice.completedCount,
  };
}

/**
 * Runs one validation start: recovery check, allocation where needed, first-entry
 * resolution — in a single server invocation.
 *
 * The payload is re-parsed with the shared write-intake boundary BEFORE any repository is
 * touched, so a rejected request cannot reach a repository even when dependencies were
 * already available. A test counts repository calls on the rejected path rather than
 * trusting this comment.
 */
export async function runStartValidation(
  raw: unknown,
  deps: StartValidationDependencies,
): Promise<StartValidationOutcome> {
  let intent: z.output<typeof startValidationIntentSchema>;
  try {
    intent = parseWriteIntent(startValidationIntentSchema, raw, {
      schemaName: "startValidationIntent",
    });
  } catch (error) {
    if (isWriteIntentError(error)) return { status: "failed", reason: "invalid" };
    throw error;
  }

  try {
    // The methodology gate, BEFORE the recovery check: a pre-correction attempt holds a
    // valid identifier but no proficiency answer, so no batch may be minted for it and no
    // resume may be offered under it either — the refusal carries the dedicated reason
    // rather than collapsing into persistence or exhaustion. One profile read serves both
    // arms below; neither arm re-checks.
    const profile = await deps.validators.findById(intent.validatorId);
    if (profile === null) return { status: "failed", reason: "unknown_validator" };
    if (profile.ilocanoProficiency === null) {
      return { status: "failed", reason: "screening_required" };
    }

    // Recovery first: an interrupted batch is the participant's own unfinished work, so it
    // wins over a fresh batch. A check that cannot complete falls through to allocation
    // exactly as when no interrupted batch exists — the participant cannot act on it, so
    // none is shown. Resuming performs ZERO writes: only read-only lookups run on this
    // arm, and a test counts allocation calls to prove it.
    let resumedBatchId: string | null = null;
    try {
      const [batches, answeredEntryIds] = await Promise.all([
        deps.batches.listForRecovery(intent.validatorId),
        deps.validations.listEntryIdsForValidator(intent.validatorId),
      ]);
      const recognition = recognizeInterruptedBatch(
        intent.validatorId,
        batches,
        new Set(answeredEntryIds),
      );
      if (recognition.kind === "interrupted") resumedBatchId = recognition.offer.batchId;
    } catch (error) {
      if (isConfigurationFailure(error, deps)) {
        return { status: "failed", reason: "not_configured" };
      }
      if (!isRepositoryError(error)) throw error;
      // A failed read is `unavailable` in the standalone lookup's vocabulary, and the
      // orchestration's answer to it is the same as to `none`: allocate below.
    }

    if (resumedBatchId !== null) {
      const first = await resolveFirstEntry(resumedBatchId, intent.validatorId, deps);
      if (first !== null) {
        return {
          status: "resumed",
          batchId: resumedBatchId,
          entry: first.entry,
          position: first.position,
          total: first.total,
          completedCount: first.completedCount,
        };
      }
      // The offer's batch reads back as absent or finished: a stale read between the
      // recognition and now. Falling through to allocation is the honest answer — the
      // validator asked for sentences, and there is no presentable entry at the address
      // the check named.
    }

    // Fresh allocation. `allocateBatch` owns the profile gate (re-checked on its own read),
    // the size cap, the single versioned-function call, the read-back, and the granted-entry
    // projection — this sequencer adds no second authority for any of them.
    const allocation = await allocateBatch(
      { validatorId: intent.validatorId, requestedSize: intent.requestedSize },
      deps,
    );
    if (allocation.status === "exhausted") return { status: "exhausted" };
    if (allocation.status === "failed") return { status: "failed", reason: allocation.reason };

    // The narrowed start response: the batch id plus the FIRST entry only. The persisted
    // batch, its entries, and its reservations are identical to a batch allocated through
    // the standalone path — only this response is narrowed. Later entries continue to
    // arrive through the existing per-position next-entry path.
    const first = await resolveFirstEntry(allocation.batchId, intent.validatorId, deps);
    if (first === null) {
      // A batch this invocation just persisted reads back with nothing presentable: a
      // read inconsistency, never exhaustion — reporting `exhausted` here would tell a
      // validator who has finished nothing that they have finished the study.
      return { status: "failed", reason: "persistence" };
    }
    return {
      status: "started",
      batchId: allocation.batchId,
      entry: first.entry,
      position: first.position,
      total: first.total,
      completedCount: first.completedCount,
    };
  } catch (error) {
    if (isConfigurationFailure(error, deps)) return { status: "failed", reason: "not_configured" };
    if (isRepositoryError(error)) return { status: "failed", reason: "persistence" };
    // A throw that reaches here is not a repository failure — it is a bug. Reporting it
    // as `persistence` would send an operator looking at the database for a defect in the
    // code, so it propagates and the wrapper's own catch decides what to log.
    throw error;
  }
}
