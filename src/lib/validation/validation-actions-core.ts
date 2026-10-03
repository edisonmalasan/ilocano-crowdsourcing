import { z } from "zod";

import { createValidationResponseId } from "@/lib/domain/validation-response-id";
import {
  POSTGREST_UNIQUE_VIOLATION_CODE,
  isRepositoryError,
  type BatchesRepository,
  type EntryReservationsRepository,
  type ValidationsRepository,
} from "@/lib/repositories";
import { isWriteIntentError, parseWriteIntent } from "@/lib/server/write-intake";
import { datasetEntryIdSchema, type DatasetEntryId } from "@/schemas/dataset";
import {
  validationBatchIdSchema,
  validationResponseInputSchema,
  validationResponseSchema,
  type ValidationResponse,
} from "@/schemas/validation";

/**
 * ============================================================================
 * THE VALIDATION SERVER ACTION'S CORE — the testable half
 * ============================================================================
 * No `import "server-only"` in THIS file, and that is deliberate rather than an oversight. The
 * decisions here — is this payload acceptable, whose response is this, is this refusal a duplicate
 * or a fault — are pure reasoning over injected repositories, so a unit test can reach every branch
 * of them with no credential and no network. The `"use server"` wrapper in `actions.ts` owns the
 * privileged client and the environment check, and does nothing else.
 *
 * A CORRECTION to an earlier version of this comment, which claimed a unit test needs no stub of the
 * module marker at all. That was measured and it was wrong: this module imports `parseWriteIntent`
 * from `@/lib/server/write-intake`, which carries the marker in its own right — correctly, since it is
 * the write-intake boundary. So `tests/unit/validation-actions.test.ts` does stub it, exactly as
 * `allocation-actions.test.ts` does. The distinction that remains real is narrower than the original
 * claim: this file does not ADD a marker, it INHERITS one, and the difference is visible in that
 * `validation-actions-core` can be imported by a plain unit test while
 * `validation/actions.ts` cannot be without a credential.
 *
 * ============================================================================
 * THE PAYLOAD IS THREE KEYS, AND TWO OF THE FACTS EVERYONE EXPECTS IN IT ARE NOT
 * ============================================================================
 * A client might reasonably expect to send a validator id, a response id, a timestamp, or a
 * position. It sends NONE of them, and the omissions are the guarantee rather than a convenience:
 *
 *   - No `validatorId`. The owner is read from the batch the response is filed against. A caller
 *     that supplied its own would be making a second claim about identity that the server would
 *     have to reconcile with the batch's, and the reconciliation is exactly where "did I answer
 *     this, or did somebody else?" goes wrong.
 *   - No `id` and no `createdAt`/`updatedAt`. They are minted here, from a CSPRNG and an injected
 *     clock, for the same reason `enrollValidator` mints its own.
 *   - No `position`, no entry list, no order. The order is `batch_entries.position`, which this
 *     module only checks membership against — it never chooses what comes next. What comes next is
 *     decided when the NEXT REQUEST is served: the client navigates to
 *     `?position=<placement position + 1>`, and `resolveSessionEntry` answers from the server's own
 *     record. This paragraph previously named `resolveNextSessionEntry` as that decider. That export
 *     had no production caller, was deleted, and was in any case **wrong for the real path** — it
 *     resolved `requestedPosition: undefined`, which is the first *remaining* entry, where the route
 *     asks for the first remaining entry **at or after** the requested position. The two differ
 *     exactly when a participant resumes part-way through a batch. Recording it here because a
 *     comment naming the wrong mechanism is the same defect the Phase 5 verification pass raised
 *     against `/ready`, and fixing it in one place while leaving it in another would be fixing the
 *     symptom.
 *
 * `strictObject`, so an attempt to add any of the above is REFUSED with nothing read and nothing
 * written. A stripped extra field would look, from the outside, exactly like a successful request
 * whose values happened not to matter.
 */
const submitValidationIntentSchema = z.strictObject({
  batchId: validationBatchIdSchema,
  datasetEntryId: datasetEntryIdSchema,
  response: validationResponseInputSchema,
});

export type SubmitValidationIntent = z.output<typeof submitValidationIntentSchema>;

export interface ValidationActionDependencies {
  readonly batches: Pick<BatchesRepository, "findById">;
  readonly validations: Pick<ValidationsRepository, "insert">;
  readonly entryReservations: Pick<EntryReservationsRepository, "releaseReservation">;
  /**
   * Injected rather than read from `Date.now()` inside, for the reason
   * `EnrollmentDependencies.now` documents: the service owns when something happened, and it is
   * also what makes "the server derived this timestamp" a testable claim.
   */
  readonly now: () => Date;
}

/**
 * Every reason a submission can fail, as its own type, so a consumer that only needs the reason —
 * a form choosing what sentence to show — does not have to destructure the whole result first.
 */
export type SubmitValidationFailureReason = Extract<
  SubmitValidationResult,
  { readonly status: "failed" }
>["reason"];

/**
 * Every outcome, and every one of them is produced.
 *
 *   `recorded`          — the response is in storage. `responseId` is the id the REPOSITORY
 *                         returned, not the one this module minted, so a repository that stored
 *                         something else is visible rather than papered over.
 *   `already_recorded`  — this validator already has a response for this entry, and the
 *                         uniqueness constraint refused the second one. The entry is COMPLETE, so
 *                         the session advances; see `design.md` D6 for why that is a success and
 *                         not a discarded answer.
 *   `failed`/`invalid`  — the payload did not parse. Nothing was read, nothing was written, and
 *                         the field issues travel back so a form can attach each message to the
 *                         input the validator can fix.
 *   `failed`/`not_configured`  — this deployment has no database. Added by the wrapper, which is
 *                         the only layer that can know, because the core has no environment to
 *                         fail on.
 *   `failed`/`unknown_batch`      — no such batch. A stale link, not a study that is down.
 *   `failed`/`not_in_batch`       — the entry is not one of this batch's entries. Refusing is the
 *                         only honest answer: filing a response against a batch that never
 *                         contained it would put a research record in a place the allocation
 *                         audit does not cover.
 *   `failed`/`persistence`        — a read or the write failed. The response is NOT reported as
 *                         saved, because a participant who is told their answer is stored when it
 *                         is not has no way to know to give it again.
 */
export type SubmitValidationResult =
  | {
      readonly status: "recorded";
      readonly responseId: string;
      readonly datasetEntryId: DatasetEntryId;
    }
  | { readonly status: "already_recorded"; readonly datasetEntryId: DatasetEntryId }
  | {
      readonly status: "failed";
      readonly reason:
        "invalid" | "not_configured" | "unknown_batch" | "not_in_batch" | "persistence";
      /** Field-scoped messages, present only for `invalid`. Safe to render to a participant. */
      readonly issues?: readonly { readonly path: string; readonly message: string }[];
    };

/**
 * True only for "this validator already answered this entry".
 *
 * Deliberately narrow, because a duplicate and a fault look identical to a caller that checks only
 * "the insert failed": one of them means the participant's work IS saved and the session should
 * move on, and the other means it is NOT saved and they must be told so. Reporting the second as
 * the first would tell a validator their typed correction is stored when it was dropped.
 *
 * Two conditions, and both are load-bearing. The operation must be `validations.insert`, so a
 * uniqueness failure anywhere else in the write is not mistaken for this. And the code must be
 * `23505` on the original PostgREST error — which the repository keeps as `cause` and reduces to
 * prose in `detail`. Reading `detail` would mean matching a formatted sentence, and
 * `SupabaseValidationsRepository.insert` deliberately writes a DIFFERENT message for `23505` than
 * `persistenceFailure` would, so the two paths are distinguishable there but not in the prose.
 *
 * The imprecision this inherits is stated rather than hidden: on this table a `23505` is either the
 * `(validator_id, dataset_entry_id)` constraint or a primary-key collision, and nothing at this
 * layer can tell them apart. A duplicate id is a server bug — ids are generated — so treating it as
 * "already recorded" is the safe direction: the worst case is that a genuinely new response is
 * reported as already stored, which loses one response; the opposite error would tell a validator
 * their answer was not saved when it was.
 */
/**
 * Logs a failed reservation release for the operator. Never rendered to a participant and never
 * thrown: the submit it follows already succeeded, so this failure has no participant-facing
 * branch — only an operator reading logs. No error-monitoring dependency exists yet.
 */
function logReleaseFailure(datasetEntryId: string, error: unknown): void {
  // The message names the entry, never the validator: the log line is about a stuck lease row,
  // and the holder's identity is not needed to understand or repair it.
  console.error(`[sadino:reservations] release failed for entry ${datasetEntryId}`, error);
}

function isDuplicateResponseRefusal(error: unknown): boolean {
  if (!isRepositoryError(error)) return false;
  if (error.operation !== "validations.insert") return false;

  const cause = error.cause;
  if (typeof cause !== "object" || cause === null) return false;

  return (cause as { readonly code?: unknown }).code === POSTGREST_UNIQUE_VIOLATION_CODE;
}

/**
 * Builds the stored record from the participant's answer plus the server's own facts.
 *
 * `validationResponseSchema` is used rather than an object literal, and that is the point: it is
 * the SAME schema, with the SAME `superRefine`, that the payload was just parsed with, so a
 * response cannot be accepted from the network and then rejected on the way to storage (or worse,
 * stored having skipped a rule). The four server-assigned fields are the only additions, and none
 * of them came from the client.
 */
function buildStoredResponse(
  intent: SubmitValidationIntent,
  validatorId: string,
  timestamp: string,
): ValidationResponse {
  const stored = validationResponseSchema.safeParse({
    ...intent.response,
    id: createValidationResponseId(),
    validatorId,
    datasetEntryId: intent.datasetEntryId,
    batchId: intent.batchId,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  if (stored.success) return stored.data;

  // Unreachable while the intent was parsed with `validationResponseInputSchema`, which shares the
  // integrity rules. It is here because a stored record that failed its own schema would be a
  // research record that does not satisfy the study's own rules, and reporting that as a persistence
  // fault would send an operator to the database for a defect in the code.
  throw new Error(
    "a payload that passed validationResponseInputSchema failed validationResponseSchema: " +
      JSON.stringify(
        stored.error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
      ),
  );
}

/**
 * Records one completed response, immediately.
 *
 * "Immediately" is not a comment: this is called once per finished entry, so a validator who closes
 * the tab after the third of ten has still banked three responses. There is no batch-end flush
 * anywhere in this module, and there is nothing here that knows how many entries the batch holds.
 */
export async function runSubmitValidation(
  raw: unknown,
  deps: ValidationActionDependencies,
): Promise<SubmitValidationResult> {
  let intent: SubmitValidationIntent;
  try {
    intent = parseWriteIntent(submitValidationIntentSchema, raw, {
      schemaName: "submitValidationIntent",
    });
  } catch (error) {
    if (isWriteIntentError(error)) {
      return { status: "failed", reason: "invalid", issues: error.issues };
    }
    throw error;
  }

  let validatorId: string;

  try {
    const batch = await deps.batches.findById(intent.batchId);
    if (batch === null) return { status: "failed", reason: "unknown_batch" };

    // Membership, not selection: the batch's own recorded placements decide which entries this
    // response may be filed against, and nothing in the payload participates in that decision.
    if (!batch.entries.some((placement) => placement.datasetEntryId === intent.datasetEntryId)) {
      return { status: "failed", reason: "not_in_batch" };
    }

    validatorId = batch.validatorId;
  } catch (error) {
    if (isRepositoryError(error)) return { status: "failed", reason: "persistence" };
    throw error;
  }

  const stored = buildStoredResponse(intent, validatorId, deps.now().toISOString());

  try {
    const persisted = await deps.validations.insert(stored);
    // Release the submitter's own claim: an answered entry stops occupying the exclusivity
    // table whether or not it completed. Best-effort ON PURPOSE — a stuck row decays by TTL,
    // while a recorded submit reported as failed would tell a validator work they banked was
    // lost. The release runs after the insert, never before it: releasing first would open a
    // window where the entry is neither reserved nor answered, claimable mid-submit.
    try {
      await deps.entryReservations.releaseReservation(validatorId, intent.datasetEntryId);
    } catch (releaseError) {
      logReleaseFailure(intent.datasetEntryId, releaseError);
    }
    return {
      status: "recorded",
      responseId: persisted.id,
      datasetEntryId: intent.datasetEntryId,
    };
  } catch (error) {
    if (isDuplicateResponseRefusal(error)) {
      return { status: "already_recorded", datasetEntryId: intent.datasetEntryId };
    }
    if (isRepositoryError(error)) return { status: "failed", reason: "persistence" };
    throw error;
  }
}
