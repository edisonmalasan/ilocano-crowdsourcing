/**
 * Access to the durable researcher sign-in attempt counter.
 *
 * ============================================================================
 * WHY THIS IS IN THE PERSISTENCE SEAM AT ALL
 * ============================================================================
 * The sign-in surface must refuse further attempts after a configured number of consecutive failures,
 * and that count has to survive being answered by a DIFFERENT process next time. A module-level
 * `let` is invisible to the next serverless instance, so a party who varies which instance their
 * request lands on never reaches the limit — a guard that looks like protection in the source and is
 * not protection in production. So the count is a row, and this interface is how the application
 * reaches it.
 *
 * Two methods, and the absence of a third is the design. There is deliberately NO `read`:
 *
 *   - A separate read would be a second round trip to answer a question the atomic increment already
 *     answers, and the gap between the two is a window in which two requests both see "under the
 *     limit" and both proceed.
 *   - A read would also have to re-derive the window. The stored count is only meaningful relative
 *     to `window_started_at`, and that comparison is the database's job — which is why the function
 *     returns the count for the CURRENT window and a reader never sees a stale number at all.
 *
 * ============================================================================
 * WHAT IS AND IS NOT RESEARCH DATA HERE
 * ============================================================================
 * The key is a COARSE REQUEST ORIGIN, computed by the server from the request's own headers. It is
 * not a researcher identifier and it is not a validator identifier: it holds no name, no email, no
 * address, and nothing joined to a validation response. That is what lets an operational counter live
 * in a research database without weakening the anonymity guarantee. See
 * `20261002120000_researcher_signin_attempts.sql` for why the key is forgeable and what that costs.
 *
 * This table is deliberately NOT one of the six research tables, and no interface here can turn it
 * into one: there is no method that writes a response, a dataset entry, or a validator.
 *
 * Raises `RepositoryError` on failure — see `@/lib/repositories/errors`. It MUST NOT return `0` to
 * mean "the write failed": a caller that reads a failed count as zero would let an unbounded number
 * of attempts through precisely when the database is unreachable, which is the wrong direction.
 */
export interface SignInAttemptsRepository {
  /**
   * Atomically records ONE sign-in attempt for `originKey` and returns the number of attempts
   * recorded in the current window INCLUDING this one.
   *
   * Called for every attempt, successful or not. That is not an accident and it should not be
   * "optimised" into a failure-only path: a successful sign-in calls {@link clear} immediately
   * afterwards, so recording it first costs one insert-then-delete and buys a race-free check. The
   * alternative — record only failures, then read the count to decide — reintroduces exactly the
   * read-modify-write gap this interface exists to close.
   *
   * The count resets to `1` once the stored window is older than `windowSeconds`, so a party that
   * stops attacking is not locked out permanently.
   */
  recordAttempt(originKey: string, windowSeconds: number): Promise<number>;

  /**
   * Forgets `originKey`'s recorded failures, so the next allowance starts from nothing.
   *
   * Called only after a credential has already been verified. Clearing before verification would
   * hand an unlimited allowance to whoever guesses wrong most often.
   */
  clear(originKey: string): Promise<void>;
}
