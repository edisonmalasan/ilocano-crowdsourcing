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
 * confirmation. The session may advance while the save is in flight; the queue
 * retains the complete payload until the server answers, so an advance is never
 * a loss.
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
 *   transient  — `persistence` and `not_configured`. The payload was acceptable; the world
 *                was not. Retried with bounded backoff, because an unbounded retry is a
 *                battery drain wearing a reliability costume.
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
}

export interface SaveQueueOptions {
  /** Sends one payload to the server. Must never throw: outcomes arrive as results. */
  readonly submit: (item: QueuedSave) => Promise<SubmitValidationResult>;
  /** Waits between retries. Defaults to a real timer; tests inject a manual one. */
  readonly wait?: (ms: number) => Promise<void>;
  /** Attempts per entry before parking it as unsaved. Defaults to 3. */
  readonly maxAttempts?: number;
  /** Backoff schedule in milliseconds. Defaults to [500, 1000, 2000]. */
  readonly backoffMs?: readonly number[];
  /** Called after every state change. The runner renders status from this. */
  readonly notify?: (snapshot: SaveQueueSnapshot) => void;
}

const DEFAULT_BACKOFF_MS = [500, 1000, 2000] as const;

const realWait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function isTransientReason(reason: SubmitValidationFailureReason): boolean {
  return reason === "persistence" || reason === "not_configured";
}

export function createSaveQueue(options: SaveQueueOptions) {
  const wait = options.wait ?? realWait;
  const maxAttempts = options.maxAttempts ?? 3;
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const states = new Map<string, SaveEntryState>();
  const pending = new Map<string, QueuedSave>();
  const retained = new Map<string, QueuedSave>();
  const draining = new Map<string, Promise<void>>();

  function snapshot(): SaveQueueSnapshot {
    return {
      pending: [...pending.values()],
      unsaved: [...retained.values()],
      states: Object.fromEntries(states),
    };
  }

  function emit(): void {
    options.notify?.(snapshot());
  }

  /**
   * Drives one entry to confirmation, a parked failure, or a reported refusal.
   *
   * Strictly sequential per key: a second `drive` for the same key while one is in flight is
   * impossible, because `draining` holds the in-flight promise and `enqueue` returns it rather
   * than starting another. Across keys the drives are concurrent — each awaits only its own
   * submission — so one slow save never head-of-line-blocks another; per-key order is what the
   * guarantee covers, and `drain()` waits for every key.
   */
  async function drive(item: QueuedSave): Promise<void> {
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
        emit();
        return;
      }

      // Permanent refusals and exhausted retries both park the COMPLETE payload in `retained`
      // rather than deleting it: the entry leaves `pending` (so the backlog bound and the drain
      // observe only live work) but the response itself is never dropped and stays retryable.
      if (!isTransientReason(result.reason) || attempt >= maxAttempts) {
        states.set(item.key, { kind: "unsaved", reason: result.reason });
        pending.delete(item.key);
        retained.set(item.key, item);
        draining.delete(item.key);
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
  }

  function enqueue(item: QueuedSave): void {
    if (pending.has(item.key) || draining.has(item.key)) return;
    retained.delete(item.key);
    pending.set(item.key, item);
    const work = drive(item);
    draining.set(item.key, work);
    // An unobserved rejection here would be an unhandled promise rejection for a save the
    // participant is counting on. `drive` never throws — `submit` must not, by contract — but
    // a defensive catch keeps a contract violation from becoming a silent crash. The entry
    // is parked in `retained` — and removed from `draining`, so `drain()` still resolves —
    // so it is never lost to the violation.
    work.catch(() => {
      if (pending.has(item.key)) {
        pending.delete(item.key);
        draining.delete(item.key);
        states.set(item.key, { kind: "unsaved", reason: "persistence" });
        retained.set(item.key, item);
        emit();
      }
    });
    emit();
  }

  return {
    /**
     * Queues a response for background persistence and starts driving it.
     *
     * Idempotent per key: re-enqueueing an entry that is already queued or draining is a no-op
     * rather than a second submission. The single-flight latch in the form is the first defence;
     * this is the second, and it holds even if the latch is ever bypassed.
     */
    enqueue,

    /** Resolves when every queued entry has reached `saved` or `unsaved`. Never rejects. */
    async drain(): Promise<void> {
      while (draining.size > 0) {
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

    /** Entries still awaiting confirmation. The backlog bound reads this. */
    pendingCount(): number {
      return pending.size;
    },

    snapshot,
  };
}

export type SaveQueue = ReturnType<typeof createSaveQueue>;
