import "server-only";

import {
  OPERATIONAL_THRESHOLDS,
  buildDedupeDigest,
  floorWindowStart,
  isBreach,
  type OperationalSignal,
} from "@/lib/ops/monitoring";
import { buildAlertPayload, dispatchAlert } from "@/lib/ops/dispatch";
import type { OperationalEventsRepository } from "@/lib/repositories";

/**
 * Best-effort recording of one operational failure, with lazy threshold evaluation.
 *
 * NEVER BREAKS THE CALLER. Every statement below runs inside one `try`, and the `catch`
 * degrades to the injected `log` — which defaults to the existing namespaced `console.error`.
 * A refused counter write, an unreadable count, a lost dispatch race, and a failed POST all
 * end in the same place: the research response the caller already decided is untouched, and
 * the failure is a log line with no research content.
 *
 * WHAT REACHES STORAGE
 * --------------------
 * The signal name, the window marker, and at most one truncated digest of caller-supplied
 * nonce material. The digest is opaque: the raw material is hashed at the boundary below and
 * never forwarded to the repository, the payload, or the log. Keyless signals record every
 * occurrence; keyed ones record once per (signal, window, digest).
 *
 * LAZY ONCE-PER-WINDOW DISPATCH
 * -----------------------------
 * After incrementing, the recorder reads the window count and evaluates the documented
 * threshold. Only on a breach, and only when no dispatch row exists for (rule, window), does
 * it write the dispatch row FIRST and then POST the five-field aggregate — and only when a
 * hook URL is configured. The row is written before the POST so a failed POST keeps the row:
 * no silent re-fire on every later request, and the next window re-evaluates on its own.
 * A lost write race (`recordDispatch` returning `false`) means a concurrent caller won, so
 * this caller stops: one breached window produces one dispatch.
 *
 * Retention piggybacks here: one indexed range delete of rows older than 30 days, inside its
 * own guard, because this serverless deployment has no worker to run a scheduled cleanup.
 */

/** Retention bound, in days: rows older than this are deleted best-effort on each call. */
export const OPERATIONAL_RETENTION_DAYS = 30;

const RETENTION_MS = OPERATIONAL_RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Everything the recorder needs from the outside world, injected rather than reached for. */
export interface OperationalRecorderDeps {
  /** The durable counter. The only persistence this module touches. */
  readonly events: OperationalEventsRepository;
  /** The hook URL, or `null` when unconfigured — in which case the panel is the surface. */
  readonly webhookUrl?: string | null;
  /** POST implementation, injectable so tests never open a connection. */
  readonly dispatchFetch?: typeof fetch;
  /**
   * Where one line per recorder-side failure goes. Receives a short static note and the
   * underlying error for the operator log — never a payload, never nonce material.
   */
  readonly log?: (message: string, error?: unknown) => void;
  /** Clock, injectable so window bucketing is testable at an exact instant. */
  readonly now?: () => Date;
}

export async function recordOperationalSignal(
  deps: OperationalRecorderDeps,
  signal: OperationalSignal,
  dedupeMaterial?: string,
): Promise<void> {
  const log = deps.log ?? ((message, error) => console.error(`[sadino:ops] ${message}`, error));
  try {
    const at = (deps.now ?? (() => new Date()))();
    const window = floorWindowStart(at);
    const digest =
      dedupeMaterial === undefined ? undefined : buildDedupeDigest(signal, dedupeMaterial);
    await deps.events.recordEvent(signal, window, digest);
    try {
      await deps.events.pruneBefore(new Date(at.getTime() - RETENTION_MS));
    } catch (error) {
      log("operational retention cleanup failed", error);
    }
    const count = await deps.events.countForWindow(signal, window);
    if (!isBreach(signal, count)) return;
    if (await deps.events.hasDispatch(signal, window)) return;
    const threshold = OPERATIONAL_THRESHOLDS[signal];
    const won = await deps.events.recordDispatch(signal, window, count, threshold);
    if (!won) return;
    const hook = deps.webhookUrl ?? null;
    if (hook === null) return;
    const posted = await dispatchAlert(
      buildAlertPayload(signal, window, count, threshold, at),
      hook,
      deps.dispatchFetch,
    );
    if (!posted.delivered) log("operational alert POST was not delivered");
  } catch (error) {
    log("operational signal recording failed", error);
  }
}

/**
 * Alias the call sites use, so a reader at a failure point sees the promise being made: this
 * call is safe to place after the research response is decided, because it cannot throw.
 */
export const safeRecordOperationalSignal = recordOperationalSignal;
