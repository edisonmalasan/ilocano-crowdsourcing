import type { RecoverableBatch } from "@/lib/domain/batch-recovery";
import type { BatchRecord } from "@/schemas/batch";
import type { AnonymousValidatorId } from "@/schemas/validator";

import type { IsoDateTimeString } from "./types";

/**
 * What the allocation call carries into the database.
 *
 * The batch identity is pre-minted by the service (`defaultBatch`: one instant for the id and
 * the column), the size is already capped by `resolveBatchSize`, and the TTL is the
 * server-authoritative reservation duration. None of these is a fact about coverage, and none
 * of them lets a caller choose entries.
 */
export interface AllocateBatchInput {
  readonly batchId: string;
  readonly validatorId: AnonymousValidatorId;
  readonly size: number;
  readonly ttlSeconds: number;
  readonly createdAt: IsoDateTimeString;
}

/** One granted placement, in the stored position order. */
export interface AllocatedPlacement {
  readonly entryId: string;
  readonly position: number;
}

/**
 * Access to persisted batches and their ordered entries.
 *
 * WHY THIS IS ITS OWN REPOSITORY RATHER THAN A METHOD ON `ValidationsRepository`
 * ----------------------------------------------------------------------------------
 * A batch is its own aggregate with its own identity and its own lifecycle: it exists before any
 * response does, it belongs to a validator rather than to an entry, and the phases that come after
 * this one (completion, resume, abandonment) will add state to it that has nothing to do with a
 * validation. Folding it into the validations repository would make "a validator asked for a batch"
 * and "a validator judged an entry" the same interface, which is the kind of merge that makes the
 * next reader assume a response implies a batch.
 *
 * The reconciliation between this interface and the `RepositoryOperation` union is a type-level
 * assertion, not a convention: `BATCHES_OPERATIONS` in
 * `src/lib/repositories/supabase/operations.ts` is annotated
 * `satisfies Record<keyof BatchesRepository, RepositoryOperation>`, so adding a method here
 * without adding its operation name fails `pnpm run typecheck`, and a name outside the union does
 * too.
 *
 * Raises `RepositoryError` on failure — see `@/lib/repositories/errors`. There is no "empty batch"
 * result from {@link BatchesRepository.findById}: a read-back with no entries raises rather than
 * returning a batch the allocation contract forbids reporting. {@link
 * BatchesRepository.listForRecovery} is the ONE method that returns an entry-less batch, as an empty
 * `entryIds`, and each method's own note says why the two differ.
 */
export interface BatchesRepository {
  /**
   * Allocates a coverage-aware batch for one attempt in a single database call.
   *
   * Selection, reservation claims, and batch persistence commit atomically inside the
   * versioned allocation function: the granted placements are the stored placements, so two
   * simultaneous requests arbitrate in Postgres rather than in the application. The input
   * carries the pre-minted batch identity (id scheme and one-instant pairing stay with the
   * service), the capped size preference, and the reservation TTL — and nothing else. There
   * is no parameter for an entry list, an order, or a coverage figure, so a caller cannot
   * steer the selection; the strictObject intent at the action boundary rejects such fields
   * before they reach here.
   *
   * Returns the granted placements in stored position order. An EMPTY array is a REAL answer
   * — exhaustion or total contention, not failure — and the service reports `exhausted` on
   * it rather than a batch. What raises is an allocation that never got an answer.
   *
   * Raises `RepositoryError` on failure — see `@/lib/repositories/errors`.
   */
  allocate(input: AllocateBatchInput): Promise<readonly AllocatedPlacement[]>;

  /**
   * Persists a batch and its ordered entries, in ONE repository call.
   *
   * `createdAt` is the batch's authoritative creation instant, SUPPLIED BY THE CALLER rather than
   * defaulted by the database. That is the same choice `ValidatorsRepository.touchLastActive` makes
   * with its `at`, and for the same reason: a column default would make the database a second source
   * of time for a fact the application already owns, which is the same duplication that removed
   * `requested_size` from this table. Migration `20261001120000` states it, and the migration's own
   * test asserts the column carries no default.
   *
   * "One call" means one method invocation, not one SQL statement: the implementation issues the
   * `validation_batches` insert and then the `batch_entries` insert, because PostgREST cannot write
   * two tables in a single request through the narrow client this project is typed against. There
   * is therefore no transaction across them, and a failure between them leaves a batch row with no
   * entries. That residue is inert — `validation_batches` carries no lifecycle column and nothing
   * can reference a batch that has no entries — and it is detectable, because `findById` on such a
   * row raises rather than returning an empty batch, and {@link listForRecovery} reports it with an
   * empty `entryIds` so the recognition rule can skip it rather than fail on it. A compensating
   * delete was considered and rejected: it would be batch lifecycle behavior, which belongs to the
   * change that owns the lifecycle, and a write that can fail halfway and then try to undo itself is
   * harder to reason about than one that fails loudly.
   *
   * Positions are written exactly as given and are never re-derived here. They were derived by the
   * allocation service from the order its selection rule returned, and re-deriving them in the
   * persistence layer would create a second authority for the order — the same class of duplication
   * that removed `requested_size` from `validation_batches`.
   *
   * A uniqueness violation becomes a `RepositoryError` naming `validation_batches.insert`, never a
   * silent no-op: a duplicate batch id is a server bug (ids are minted), and reporting it as success
   * would leave the caller holding a batch whose entries may never have been written.
   */
  create(batch: BatchRecord, createdAt: IsoDateTimeString): Promise<BatchRecord>;

  /**
   * The stored batch with this ID and its entries in `position` order, or `null` when absent.
   *
   * `null` means absent, not failed. A batch that exists with NO entries raises instead of being
   * returned, because the allocation contract says a batch the platform reports contains at least
   * one entry, and the realistic cause is the partial write described on {@link create}.
   */
  findById(id: string): Promise<BatchRecord | null>;

  /**
   * Every batch belonging to `validatorId`, newest first, each with its entry ids.
   *
   * ORDERED BY `created_at DESC, id DESC`, and the ordering is this method's contract rather than a
   * detail of its query string — see the note below on why that distinction matters here more than it
   * does for the other reads.
   *
   * NO POSITIONS. The result carries entry ids and nothing else about the order they were assigned
   * in, because the only consumer asks which entries REMAIN and the stored order is read through
   * {@link findById} by the batch's own route when a validator actually resumes. Returning positions
   * here would create a second path by which an order could be rendered, and the batch's order is
   * research data.
   *
   * AN ENTRY-LESS BATCH IS RETURNED, WITH AN EMPTY `entryIds`, rather than filtered out or treated
   * as a failure. That is a deliberate departure from {@link findById}, which raises on the same row,
   * and the reason is what this read is FOR: the residue of {@link create}'s two untransacted writes
   * is exactly the row this method must be able to see without failing, because it is the row that
   * would otherwise be offered to a participant as work that does not exist. Filtering it out here
   * would make that decision in the persistence layer, where the evidence for it does not exist;
   * returning it makes the decision in `recognizeInterruptedBatch`, which has the answered set and can
   * therefore judge interruption for itself. What this method must NOT do is hand back something a
   * later {@link findById} would turn into an exception — which is why the shape is the plain
   * structural one and not `BatchRecord`.
   */
  listForRecovery(validatorId: string): Promise<RecoverableBatch[]>;
}
