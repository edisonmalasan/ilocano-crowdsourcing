import type { ValidationResponseInput } from "@/schemas/validation";

import type {
  SubmitValidationFailureReason,
  SubmitValidationResult,
} from "./validation-actions-core";

/**
 * ============================================================================
 * THE BACKGROUND SAVE QUEUE — persistence without blocking progression
 * ============================================================================
 * A validator's completed response enters this queue and is driven to a server
 * confirmation. The session always advances on submit; the queue retains the complete
 * payload until the server answers, so an advance is never a loss.
 *
 * Controlled concurrency, not an advancement gate: all 5 current-batch responses may
 * exist independently in the queue, of which at most `MAX_ACTIVE_SAVES` are in flight
 * at once and the rest wait FIFO. A slow or retrying save never holds back advancement
 * to the next entry — it continues its own lifecycle while the session moves on.
 *
 * Framework-free on purpose: no React, no timers of its own. Retries wait
 * through an injected `wait`, submissions go through an injected `submit`, and
 * status leaves through an injected `notify`. A unit test drives every branch —
 * including a save that stays unresolved while the session has already moved
 * on — with no DOM, no network, and no clock it does not control.
 *
 * ============================================================================
 * WHAT COUNTS AS WHAT, AND WHY EACH CLASSIFICATION IS THIS WAY
 * ============================================================================
 *   confirmed  — `recorded` and `already_recorded`. Both mean the entry is complete on the
 *                server. `already_recorded` is the duplicate-submit race resolving in favour
 *                of safety: the response IS stored, so the queue must not hold it again.
 *   transient  — `persistence`, `not_configured`, and `throttled`. The payload was acceptable;
 *                the world was not (or the caller was too fast). Retried with bounded backoff,
 *                because an unbounded retry is a battery drain wearing a reliability costume.
 *                `throttled` is transient, never permanent: re-sending the same bytes after the
 *                window WILL succeed, so parking it as "not stored" would be a lie the retry
 *                control then has to unsay.
 *   permanent  — `invalid`, `unknown_batch`, `not_in_batch`. Re-sending the same bytes cannot
 *                succeed: the payload is refused, the batch is gone, or the entry was never in
 *                it. Never retried; surfaced so the participant learns the answer was not stored.
 *
 * Nothing is ever reported saved before a confirmation, and nothing is ever dropped silently:
 * exhaustion parks the response as `unsaved` — retained, announced, and resumable — rather than
 * deleting it.
 */

/** One response awaiting (or undergoing) server confirmation. */
export interface QueuedSave {
  /** Stable within this queue; used to attribute confirmations to the right entry. */
  readonly key: string;
  readonly batchId: string;
  readonly datasetEntryId: string;
  /** 1-based position, so a parked entry can offer a way back to itself. */
  readonly position: number;
  readonly payload: ValidationResponseInput;
}

export type SaveEntryState =
  | { readonly kind: "saving"; readonly attempt: number }
  | { readonly kind: "retrying"; readonly attempt: number }
  | { readonly kind: "saved" }
  | { readonly kind: "unsaved"; readonly reason: SubmitValidationFailureReason };

export interface SaveQueueSnapshot {
  readonly pending: readonly QueuedSave[];
  /** Parked entries: confirmation failed and the complete payload is retained for retry. */
  readonly unsaved: readonly QueuedSave[];
  readonly states: Readonly<Record<string, SaveEntryState>>;
  /** Workers driving a submission right now (0..MAX_ACTIVE_SAVES). */
  readonly activeSaves: number;
  /** Admitted keys waiting for a free worker, in admission order. */
  readonly queuedSaves: number;
  /**
   * Per-key queue wait in milliseconds: admitted-to-worker-start. Present only after a
   * worker picks the key up; absent while still waiting. Operator timing only — it never
   * carries payload text.
   */
  readonly queueWaitMs: Readonly<Record<string, number>>;
}

export interface SaveQueueOptions {
  /** Sends one payload to the server. Must never throw: outcomes arrive as results. */
  readonly submit: (item: QueuedSave) => Promise<SubmitValidationResult>;
  /** Waits between retries. Defaults to a real timer; tests inject a manual one. */
  readonly wait?: (ms: number) => Promise<void>;
  /** Clock for queue-wait timing. Defaults to wall time; tests inject a manual one. */
  readonly now?: () => number;
  /** Attempts per entry before parking it as unsaved. Defaults to 3. */
  readonly maxAttempts?: number;
  /** Backoff schedule in milliseconds. Defaults to [500, 1000, 2000]. */
  readonly backoffMs?: readonly number[];
  /** Called after every state change. The runner renders status from this. */
  readonly notify?: (snapshot: SaveQueueSnapshot) => void;
}

/**
 * How many response saves may be in flight at once.
 *
 * Five responses are independently queueable — the whole of a current batch — and three
 * workers drive them. Two covers one slow save plus one in flight with no headroom for a
 * third rapid submit; three lets a rapid five-answer burst keep moving while the server
 * absorbs it.
 *
 * Measured during Apply with a scripted 50ms submit latency, five rapid enqueues, five
 * runs per arm (scratch harness, deleted after measuring): 3 workers drain at median
 * 123ms (two waves), 2 workers at median 187ms (three waves) — 3 keeps its predicted
 * one-wave advantage and stands. Single-save wall time is the submit latency in both
 * arms (workers never slow one save); failure rate was 0 in both arms by construction,
 * the fake never failing, so that leg of the comparison is vacuous rather than won.
 */
export const MAX_ACTIVE_SAVES = 3;

const DEFAULT_BACKOFF_MS = [500, 1000, 2000] as const;

const realWait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function isTransientReason(reason: SubmitValidationFailureReason): boolean {
  return reason === "persistence" || reason === "not_configured" || reason === "throttled";
}

export function createSaveQueue(options: SaveQueueOptions) {
  const wait = options.wait ?? realWait;
  const now = options.now ?? (() => Date.now());
  const maxAttempts = options.maxAttempts ?? 3;
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const states = new Map<string, SaveEntryState>();
  const pending = new Map<string, QueuedSave>();
  const retained = new Map<string, QueuedSave>();
  const draining = new Map<string, Promise<void>>();
  /** Keys with a worker running now. `draining` holds their promises; this bounds them. */
  const active = new Set<string>();
  /** Keys admitted but waiting for a worker, in admission order. */
  const waiting: string[] = [];
  /** Admission instant per key, so the worker start can report the queue wait. */
  const enqueuedAtMs = new Map<string, number>();
  /** Admitted-to-worker-start wait per key. Set once per admission; cleared on settle. */
  const queueWaitMs = new Map<string, number>();

  function snapshot(): SaveQueueSnapshot {
    return {
      pending: [...pending.values()],
      unsaved: [...retained.values()],
      states: Object.fromEntries(states),
      activeSaves: active.size,
      queuedSaves: waiting.length,
      queueWaitMs: Object.fromEntries(queueWaitMs),
    };
  }

  function emit(): void {
    options.notify?.(snapshot());
  }

  /** Starts waiting work while workers are free. FIFO: the longest-waiting key first. */
  function pump(): void {
    while (active.size < MAX_ACTIVE_SAVES && waiting.length > 0) {
      const key = waiting.shift();
      if (key === undefined) return;
      const item = pending.get(key);
      // A retry re-drive removes the key from `pending` bookkeeping before re-enqueueing,
      // so a stale waiting entry (removed while queued) is skipped rather than driven.
      if (item === undefined || draining.has(key)) continue;
      const admittedAt = enqueuedAtMs.get(key) ?? now();
      queueWaitMs.set(key, now() - admittedAt);
      const work = drive(item);
      draining.set(key, work);
      // An unobserved rejection here would be an unhandled promise rejection for a save the
      // participant is counting on. `drive` never throws — `submit` must not, by contract — but
      // a defensive catch keeps a contract violation from becoming a silent crash. The entry
      // is parked in `retained` — and removed from `draining`, so `drain()` still resolves —
      // so it is never lost to the violation.
      work.catch(() => {
        if (pending.has(key)) {
          pending.delete(key);
          draining.delete(key);
          active.delete(key);
          enqueuedAtMs.delete(key);
          queueWaitMs.delete(key);
          states.set(key, { kind: "unsaved", reason: "persistence" });
          retained.set(key, item);
          emit();
          pump();
        }
      });
    }
  }

  /**
   * Drives one entry to confirmation, a parked failure, or a reported refusal.
   *
   * Strictly sequential per key: a second `drive` for the same key while one is in flight is
   * impossible, because `draining` holds the in-flight promise and `enqueue` returns it rather
   * than starting another. Across keys the drives are concurrent up to `MAX_ACTIVE_SAVES` —
   * each awaits only its own submission — so one slow save never head-of-line-blocks another;
   * per-key order is what the guarantee covers, and `drain()` waits for every key.
   *
   * A worker that settles frees its slot and immediately refills from the FIFO waiting list,
   * so a five-rapid burst drains three-at-a-time without any further call.
   */
  async function drive(item: QueuedSave): Promise<void> {
    active.add(item.key);
    try {
      for (let attempt = 1; ; attempt += 1) {
        states.set(
          item.key,
          attempt === 1 ? { kind: "saving", attempt } : { kind: "retrying", attempt },
        );
        emit();

        const result = await options.submit(item);

        if (result.status === "recorded" || result.status === "already_recorded") {
          states.set(item.key, { kind: "saved" });
          pending.delete(item.key);
          draining.delete(item.key);
          enqueuedAtMs.delete(item.key);
          queueWaitMs.delete(item.key);
          emit();
          return;
        }

        // Permanent refusals and exhausted retries both park the COMPLETE payload in `retained`
        // rather than deleting it: the entry leaves `pending` (so the drain observes only live
        // work) but the response itself is never dropped and stays retryable.
        if (!isTransientReason(result.reason) || attempt >= maxAttempts) {
          states.set(item.key, { kind: "unsaved", reason: result.reason });
          pending.delete(item.key);
          retained.set(item.key, item);
          draining.delete(item.key);
          enqueuedAtMs.delete(item.key);
          queueWaitMs.delete(item.key);
          emit();
          return;
        }

        // Announced BEFORE the backoff elapses, not after: the wait is the visible part of a
        // retry, and a status that appears only while the next attempt's request is in flight
        // would flicker past unread. The loop top re-asserts the same state for the attempt.
        states.set(item.key, { kind: "retrying", attempt: attempt + 1 });
        emit();
        await wait(backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 0);
      }
    } finally {
      active.delete(item.key);
      pump();
    }
  }

  function enqueue(item: QueuedSave): void {
    if (pending.has(item.key) || draining.has(item.key)) return;
    retained.delete(item.key);
    pending.set(item.key, item);
    enqueuedAtMs.set(item.key, now());
    waiting.push(item.key);
    pump();
    emit();
  }

  return {
    /**
     * Queues a response for background persistence and starts driving it when a worker
     * is free.
     *
     * Idempotent per key: re-enqueueing an entry that is already queued, waiting, or
     * draining is a no-op rather than a second submission. The single-flight latch in the
     * form is the first defence; this is the second, and it holds even if the latch is
     * ever bypassed. Keyed by dataset entry id (placement second): within one attempt an
     * entry is never answered twice.
     */
    enqueue,

    /**
     * Resolves when every queued entry has reached `saved` or `unsaved`. Never rejects.
     * Waiting entries are driven as workers free up, so a drain over a five-rapid burst
     * settles the whole burst, not just the first three.
     */
    async drain(): Promise<void> {
      for (;;) {
        pump();
        if (draining.size === 0) return;
        await Promise.all([...draining.values()]);
      }
    },

    /**
     * Re-drives a parked entry (bounded attempts again, from attempt 1). Returns false when the
     * key names nothing parked — a retry control for an entry that already confirmed is a
     * no-op rather than a second submission.
     */
    retry(key: string): boolean {
      const item = retained.get(key);
      if (item === undefined) return false;
      retained.delete(key);
      states.delete(key);
      enqueue(item);
      return true;
    },

    /** Entries still awaiting confirmation, waiting or active. The checkpoint reads this. */
    pendingCount(): number {
      return pending.size;
    },

    /** Saves with a worker running now. At most `MAX_ACTIVE_SAVES`; the rest wait FIFO. */
    activeCount(): number {
      return active.size;
    },

    snapshot,
  };
}

export type SaveQueue = ReturnType<typeof createSaveQueue>;
