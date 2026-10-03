/**
 * Access to exclusive assignment leases for incomplete dataset entries.
 *
 * ============================================================================
 * WHY THIS IS IN THE PERSISTENCE SEAM AT ALL
 * ============================================================================
 * Two simultaneous batch requests must never share an incomplete entry, and application logic
 * cannot enforce "never" across two concurrent requests: between the application's read and its
 * write there is always an interval, and a second request can act inside it. So the claim is a
 * row, arbitrated by a single database statement (`INSERT ... ON CONFLICT`), and this interface
 * is how the application reaches that statement. A module-level `Set` would be invisible to the
 * next serverless instance, and a guard that looks like protection in the source and is not
 * protection in production is the defect this project has already found twice.
 *
 * Two methods, and the absence of a third is the design. There is deliberately NO `read`:
 *
 *   - A separate read would be a second round trip to answer a question the atomic claim already
 *     answers, and the gap between the two is a window in which two requests both see "free" and
 *     both proceed — the exact interval this interface exists to close.
 *   - A read would also have to re-derive expiry. A stored row is only meaningful relative to
 *     `now()`, and that comparison is the database's job — which is why the function returns the
 *     granted subset and a reader never sees a stale lease at all.
 *
 * ============================================================================
 * WHAT IS AND IS NOT RESEARCH DATA HERE
 * ============================================================================
 * A row names a dataset entry and the attempt holding it. It holds no response, no correction,
 * no translation, and nothing derived from a validator — and it is operational state with a
 * deadline, not a research record. Expiry and release delete rows rather than archiving them,
 * because a lease is not evidence. See `20261004130000_entry_reservations.sql` for why expiry is
 * a comparison rather than a watcher.
 *
 * Raises `RepositoryError` on failure — see `@/lib/repositories/errors`. It MUST NOT return an
 * empty grant to mean "the claim failed": a caller that reads a failed claim as "nothing free"
 * would report exhaustion precisely when the database is unreachable, which is the wrong
 * direction. "Granted nothing" (a real answer about contention) and "could not ask" (a failure)
 * stay distinguishable.
 */
export interface EntryReservationsRepository {
  /**
   * Atomically claims the supplied candidate entries for one attempt and returns the granted
   * subset, in no guaranteed order.
   *
   * Expired rows — anyone's, including the caller's own — are reclaimed by time comparison
   * inside the same statement; unexpired foreign rows are skipped, never overwritten; the
   * caller's own unexpired rows are re-granted, so a retried claim is not phantom contention.
   * `ttlSeconds` is floored at one by the database rather than trusted.
   */
  claimReservations(
    validatorId: string,
    entryIds: readonly string[],
    ttlSeconds: number,
  ): Promise<string[]>;

  /**
   * Releases one attempt's own claim, so an answered entry stops occupying the exclusivity
   * table whether or not it completed.
   *
   * Holder-scoped: it deletes only the caller's row and cannot release another attempt's.
   * Releasing a row that was never claimed is not a failure — it is the ordinary outcome for
   * an entry whose claim already expired — and the interface asks for `void` precisely so the
   * caller does not have to distinguish "nothing to release" from "released".
   */
  releaseReservation(validatorId: string, entryId: string): Promise<void>;
}
