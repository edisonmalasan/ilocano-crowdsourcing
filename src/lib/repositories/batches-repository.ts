import type { BatchRecord } from "@/schemas/batch";

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
 * result: a read-back with no entries raises rather than returning a batch the allocation contract
 * forbids reporting.
 */
export interface BatchesRepository {
  /**
   * Persists a batch and its ordered entries, in ONE repository call.
   *
   * "One call" means one method invocation, not one SQL statement: the implementation issues the
   * `validation_batches` insert and then the `batch_entries` insert, because PostgREST cannot write
   * two tables in a single request through the narrow client this project is typed against. There
   * is therefore no transaction across them, and a failure between them leaves a batch row with no
   * entries. That residue is inert — `validation_batches` carries no lifecycle column and nothing
   * can reference a batch that has no entries — and it is detectable, because `findById` on such a
   * row raises rather than returning an empty batch. A compensating delete was considered and
   * rejected: it would be batch lifecycle behavior, which belongs to the change that owns the
   * lifecycle, and a write that can fail halfway and then try to undo itself is harder to reason
   * about than one that fails loudly.
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
  create(batch: BatchRecord): Promise<BatchRecord>;

  /**
   * The stored batch with this ID and its entries in `position` order, or `null` when absent.
   *
   * `null` means absent, not failed. A batch that exists with NO entries raises instead of being
   * returned, because the allocation contract says a batch the platform reports contains at least
   * one entry, and the realistic cause is the partial write described on {@link create}.
   */
  findById(id: string): Promise<BatchRecord | null>;
}
