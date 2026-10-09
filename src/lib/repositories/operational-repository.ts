/**
 * Durable operational monitoring counters, as a persistence seam interface.
 *
 * This package exports INTERFACES ONLY (see `@/lib/repositories/index.ts`): no Supabase import,
 * no `server-only` marker, no environment read. The implementation lives in
 * `src/lib/repositories/supabase/operational-events.ts` and satisfies this same interface.
 *
 * WHAT IS STORED, AND WHAT IS NOT
 * -------------------------------
 * A row holds a signal name, a window marker, and an optional dedupe digest — truncated SHA-256
 * hex over caller-supplied nonce material. It holds no response, no dataset entry, no validator,
 * and nothing derived from a validator. The digest is opaque here: this interface receives an
 * already-digested string (or nothing) and never the material it was built from.
 *
 * Raises `RepositoryError` on failure — see `@/lib/repositories/errors`. It MUST NOT return a
 * fallback value to mean "the write failed": a caller that reads a failed increment as zero would
 * evaluate a threshold against a count the database never confirmed, in the wrong direction.
 */
import type { OperationalSignal } from "@/lib/ops/monitoring";

export interface OperationalEventsRepository {
  /**
   * Records one occurrence of `signal` in the window starting at `windowStart`.
   *
   * When `dedupeKey` is present the occurrence is recorded at most once per
   * (signal, window, key): a retried request reuses its key, so the retry inserts once rather
   * than inflating the signal. A second call with the same triple is a no-op, not a failure.
   * When it is absent the occurrence is always recorded: a missing key never conflicts.
   */
  recordEvent(signal: OperationalSignal, windowStart: Date, dedupeKey?: string): Promise<void>;

  /** The number of recorded occurrences of `signal` in the window starting at `windowStart`. */
  countForWindow(signal: OperationalSignal, windowStart: Date): Promise<number>;

  /** Whether a dispatch row already exists for (`rule`, `windowStart`). */
  hasDispatch(rule: OperationalSignal, windowStart: Date): Promise<boolean>;

  /**
   * Records the once-per-window dispatch for a breached rule.
   *
   * Returns `true` when this call wrote the row and `false` when a concurrent caller already had:
   * only the winner proceeds to the push path, so one breached window produces one dispatch.
   */
  recordDispatch(
    rule: OperationalSignal,
    windowStart: Date,
    count: number,
    threshold: number,
  ): Promise<boolean>;

  /**
   * Deletes event rows created before `before`, bounding retention.
   *
   * Best-effort by contract: the recorder calls it inside its own failure guard, so a refused
   * cleanup degrades to the existing diagnostic log rather than breaking a research write.
   */
  pruneBefore(before: Date): Promise<void>;
}
