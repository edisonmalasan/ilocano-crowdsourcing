import "server-only";

import {
  isRepositoryError,
  RepositoryError,
  type BatchesRepository,
  type DatasetEntriesRepository,
  type ValidatorsRepository,
} from "@/lib/repositories";
import { projectAllocatedEntry } from "@/lib/validation/allocated-entry";
import {
  resolveBatchSize,
  type AllocationConfig,
  type AllocationFailureReason,
  type AllocationOutcome,
} from "@/schemas/batch";
import type { AnonymousValidatorId } from "@/schemas/validator";

/**
 * Coverage-aware batch allocation, served by the versioned database function.
 *
 * ============================================================================
 * WHAT THE CLIENT SENDS AND WHAT IT GETS BACK
 * ============================================================================
 * The request carries an identifier and, at most, a *preference* for how many entries it would
 * like. Everything that decides the batch is derived server-side. There is no parameter through
 * which a caller could supply an entry list, an order, a per-entry coverage figure, or a
 * coverage target, and that is the guarantee rather than a convenience. There is not even a
 * target to supply — the corrected methodology holds none.
 *
 * `requestedSize` is capped by `resolveBatchSize` against the server's configuration, so a client
 * can ask for FEWER entries and never for more.
 *
 * ============================================================================
 * WHERE EACH DECISION LIVES NOW
 * ============================================================================
 * The order of operations is the specification:
 *
 *   1. Confirm the validator exists (`unknown_validator` before anything else, exactly as
 *      before — no batch, no reservation, nothing read past the profile).
 *   2. Enforce the proficiency gate (`screening_required` on the profile read alone).
 *   3. Resolve the effective size against the server's configuration.
 *   4. ONE database call — `allocate_validation_batch_v1` — computes eligible entries with the
 *      pooled-completion pillars, excludes this attempt's answered/assigned entries and
 *      others' active reservations, randomizes, claims with bounded in-function backfill, and
 *      persists the batch with 1-based positions, returning only the granted placements.
 *   5. Read the batch back through `findById` (never echo) and project the granted entries.
 *
 * Steps 1–3 perform no write; the allocation call in step 4 is the first one. The ordinary
 * path is four round trips: profile read, allocation call, batch read-back, granted-entry
 * projection. The 4,800-row pool transfer and the 200-id chunk loops are gone from this path;
 * they remain the fallback/recovery/export reads, not allocation's.
 *
 * ============================================================================
 * WHY COMPLETION IS EVALUATED IN SQL HERE, DESPITE THE STANDING RULE
 * ============================================================================
 * This module used to read the whole pool plus the pool's responses and reduce completion
 * with the TypeScript definition, refusing on principle to express the predicate in SQL —
 * two implementations in two languages drift, and drifted coverage is invisible. That
 * refusal cost ~37 round trips per batch and is SUPERSEDED for the allocation-time
 * evaluation by explicit task requirement, with the safeguard the refusal was standing in
 * for: the pillars live in exactly ONE SQL place (the versioned function), and the parity
 * suite `tests/integration/allocation-rpc-parity.test.ts` proves the function and the
 * TypeScript definition classify every response combination identically. A drift in either
 * direction fails loudly rather than retiring entries quietly.
 *
 * The TypeScript definition is unchanged and remains the definition for every other
 * consumer (dashboard, export, review). This module does not reimplement it; it calls the
 * function that embodies it and reads the answer back.
 *
 * ============================================================================
 * WHY `unknown_validator` IS NOT `persistence`
 * ============================================================================
 * A returning browser with a stale local-storage identifier is the single most likely thing to go
 * wrong, and the correct response is to offer a fresh identity. Reporting it as a database fault
 * would tell a participant the study is broken when nothing is.
 */

/** What a caller asks for. An identifier and a preference; nothing authoritative. */
export interface AllocationRequest {
  readonly validatorId: AnonymousValidatorId;
  /**
   * A PREFERENCE, capped by `resolveBatchSize`. `undefined` means "whatever the configuration
   * says". There is deliberately no way to ask for more than the configured batch size.
   */
  readonly requestedSize?: number;
}

export interface AllocationDependencies {
  readonly validators: Pick<ValidatorsRepository, "findById">;
  readonly batches: Pick<BatchesRepository, "allocate" | "findById">;
  readonly datasetEntries: Pick<DatasetEntriesRepository, "listByIds">;
  /**
   * The research parameters, injected rather than imported as constants.
   *
   * `batchSize` is pending thesis-team and adviser approval, so hard-coding it would freeze a
   * provisional number into code. The corrected methodology holds no other research parameter:
   * there is no target for a future caller to pass *around*, because there is no target at all.
   */
  readonly config: AllocationConfig;
  /**
   * A batch's identity at the moment it is created: its identifier AND its creation instant.
   *
   * BOTH COME FROM ONE `Date`, and that is the whole reason they are returned together rather than
   * asked for separately. Migration `20261001120000` refuses to order batches by the ISO instant
   * embedded in the identifier, on the grounds that the string exists for a different reason and a
   * future id scheme would break the ordering silently. Having refused to READ that string, the
   * application would then be writing two instants for one event — the one inside the id and the one
   * in `created_at` — that could differ by however long the request took. A batch whose id says it
   * was created at `T1` while the column says `T2` is a batch nobody can reason about, so the two
   * are minted from the same `Date` and the dependency's return type says so.
   */
  readonly newBatch: (validatorId: AnonymousValidatorId) => MintedBatchIdentity;
}

/** A freshly minted batch's identifier and creation instant. See {@link AllocationDependencies}. */
export interface MintedBatchIdentity {
  readonly id: string;
  /** ISO 8601, as `Date.prototype.toISOString()` produces it. */
  readonly createdAt: string;
}

/**
 * Mints a batch identifier from the validator's identifier and the current time.
 *
 * Deliberately not a UUID and not a bare counter: batch ids are read in logs and matched by hand
 * during review, so `VAL_a81d92c1-2026-09-30T20:14:03.117Z` is more useful than a random string.
 * The validator's own id is included so that a log line naming a batch also names whose batch it is
 * — and it is the validator's OWN identifier, never another one, because a batch id is readable to
 * the validator who owns it.
 *
 * The embedded instant is NOT an ordering source, and migration `20261001120000` says why at length:
 * it exists because a log line should be readable, so a future id scheme could drop it and would
 * break any ordering built on it silently while the query kept working. The authoritative creation
 * instant is the `created_at` column, and {@link defaultBatch} writes both from ONE `Date` so they
 * cannot disagree.
 */
export function defaultBatchId(validatorId: AnonymousValidatorId, now: Date): string {
  return `${validatorId}-${now.toISOString()}`;
}

/**
 * The production `newBatch`: a batch identifier and its creation instant, from one `Date`.
 *
 * Exported rather than inlined in `actions.ts` so that the pairing — one instant, two facts — is a
 * named thing a test can check rather than a detail of a dependency object.
 */
export function defaultBatch(validatorId: AnonymousValidatorId, now: Date): MintedBatchIdentity {
  return { id: defaultBatchId(validatorId, now), createdAt: now.toISOString() };
}

/**
 * Allocates a coverage-aware batch for one validator.
 *
 * Contention-collapse as well as pool exhaustion collapse to `exhausted`: when nothing could be
 * granted — nobody else's fault and nothing persisted — the honest outcome is exhaustion, never
 * an empty batch.
 */
export async function allocateBatch(
  request: AllocationRequest,
  dependencies: AllocationDependencies,
): Promise<AllocationOutcome> {
  try {
    const profile = await dependencies.validators.findById(request.validatorId);
    if (profile === null) {
      return { status: "failed", reason: "unknown_validator" satisfies AllocationFailureReason };
    }

    // The methodology gate: no recorded proficiency answer, no sentences. Rows
    // without an answer predate the correction and stay valid rows — this
    // refuses the REQUEST, it does not judge, migrate, or rewrite the profile.
    // Placed before every other read so the refusal costs exactly the profile
    // read above: no allocation call, no batch persisted, no reservation claimed.
    if (profile.ilocanoProficiency === null) {
      return { status: "failed", reason: "screening_required" satisfies AllocationFailureReason };
    }

    const size = resolveBatchSize(request.requestedSize, dependencies.config);
    const minted = dependencies.newBatch(request.validatorId);

    // The single allocation call: selection, claims, and persistence commit atomically inside
    // the versioned function. An empty grant is exhaustion-or-total-contention, never failure.
    const placements = await dependencies.batches.allocate({
      batchId: minted.id,
      validatorId: request.validatorId,
      size,
      ttlSeconds: dependencies.config.reservationTtlSeconds,
      createdAt: minted.createdAt,
    });
    if (placements.length === 0) return { status: "exhausted" };

    // READ BACK, not the placements echoed. The function returns what it stored, and this
    // confirms it through the same path a later `findById` would use — a batch this class
    // could not itself produce is never reported.
    const stored = await dependencies.batches.findById(minted.id);
    if (stored === null) {
      throw new RepositoryError(
        "validation_batches.findById",
        `Batch ${minted.id} was allocated and reads back as absent. Reporting the placements ` +
          "instead would report a batch as persisted on the strength of a call this class could " +
          "not confirm.",
        { detail: "batch absent immediately after allocate" },
      );
    }

    // Project the STORED placements against the granted entries, in stored order. The read is
    // bounded by the grant (at most the effective size), never by the pool: the 4,800-row
    // transfer this replaces is exactly what this change removes. A stored id with no entry
    // behind it fails loudly rather than returning a shorter batch.
    const granted = await dependencies.datasetEntries.listByIds(
      stored.entries.map((entry) => entry.datasetEntryId),
    );
    if (granted.length !== stored.entries.length) {
      throw new RepositoryError(
        "dataset_entries.listByIds",
        `Batch ${minted.id} stores ${stored.entries.length} entries but only ${granted.length} ` +
          "resolve. Filtering the missing id out would return a batch the validator never " +
          "received.",
        {
          detail: `resolved ${granted.length} of ${stored.entries.length} granted entries`,
        },
      );
    }
    const byId = new Map(granted.map((entry) => [entry.id, entry]));
    const entries = stored.entries.map((placement) => {
      const found = byId.get(placement.datasetEntryId);
      if (found === undefined) {
        throw new RepositoryError(
          "dataset_entries.listByIds",
          `Batch ${minted.id} references ${placement.datasetEntryId}, which the granted-entry ` +
            "read did not return.",
          { detail: `granted entry ${placement.datasetEntryId} unresolved` },
        );
      }
      // Schema-enforced projection (six renderable fields, never the source payload), shared
      // with the session read so the two producers cannot disagree about what a participant
      // may see. A `null` here is a stored row the schema refuses — a bug or a database that
      // is not the one these tests assume — and it fails loudly rather than serving a partial
      // batch.
      const projected = projectAllocatedEntry(found);
      if (projected === null) {
        throw new RepositoryError(
          "dataset_entries.listByIds",
          `Batch ${minted.id} references ${placement.datasetEntryId}, which does not project ` +
            "to a renderable entry.",
          { detail: `granted entry ${placement.datasetEntryId} unprojectable` },
        );
      }
      return projected;
    });

    return {
      status: "allocated",
      batchId: stored.id,
      entries,
    };
  } catch (error) {
    // A `RepositoryError` is an expected outcome of an ordinary network call and the caller has to
    // be able to distinguish it from a programming error, which should stay loud. Anything else
    // propagates: swallowing an unknown throwable is how a real bug becomes a "persistence
    // failure" that nobody investigates.
    if (!isRepositoryError(error)) throw error;
    return { status: "failed", reason: "persistence" };
  }
}
