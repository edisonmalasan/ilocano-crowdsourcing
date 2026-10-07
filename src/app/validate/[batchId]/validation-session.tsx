"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { EntryCard } from "@/components/validation/entry-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { translatorFor } from "@/lib/i18n/copy";
import { requestNextEntryAction } from "@/lib/validation/next-entry-actions";
import { batchRouteHref } from "@/lib/validation/batch-route";
import { failureMessageFor } from "@/lib/validation/entry-form-flow";
import type { SubmitValidationResult } from "@/lib/validation/validation-actions-core";
import { verifyBatchResponsesAction } from "@/lib/validation/verify-batch-actions";
import {
  createSaveQueue,
  type QueuedSave,
  type SaveQueue,
  type SaveQueueSnapshot,
} from "@/lib/validation/save-queue";
import type { ValidationResponseInput } from "@/schemas/validation";
import type { AllocatedEntry } from "@/schemas/batch";

import { FinishedBatch } from "./finished-batch";
import { ValidationForm } from "./validation-form";

/**
 * ============================================================================
 * THE OPTIMISTIC VALIDATION SESSION RUNNER
 * ============================================================================
 * Owns what the route used to own per navigation: which entry is on screen, the
 * figures around it, and — new — one prefetched future entry plus the
 * background save queue. The Server Component renders once with the opening
 * entry; every later transition happens here, in place, without a navigation.
 *
 * ============================================================================
 * WHAT ADVANCING IS, PRECISELY
 * ============================================================================
 * The form validates locally and hands a payload up. The runner enqueues it —
 * the queue starts a same-origin POST immediately, up to `MAX_ACTIVE_SAVES` in
 * flight with the rest waiting FIFO — and swaps in the already prefetched next
 * entry in the same task. Advancement never waits on worker occupancy: a slow or
 * retrying save continues its own lifecycle while the session moves on. The
 * response is marked saved only when the server confirms it; until then the
 * complete payload sits in the queue, retried with bounded backoff, never
 * reported as saved, never dropped.
 *
 * The runner never decides WHAT comes next. The prefetch response names the
 * entry, the position, and the figures; this component renders exactly those.
 * At most one future entry is ever held: a prefetch fires per presented entry,
 * keyed to the position it follows, and a stale resolution — one that arrives
 * after the runner has moved on — is discarded rather than rendered.
 *
 * ============================================================================
 * WHERE A FULL NAVIGATION STILL HAPPENS, AND WHY IT IS THE FALLBACK
 * ============================================================================
 *   - No usable prefetch (failed, or not yet resolved): enqueue, wait for the
 *     drain, then navigate to position + 1. The route resolves from its own
 *     record exactly as it does today — the old path, kept as the fallback
 *     rather than reimplemented. The drain first is what makes the navigation
 *     safe: arrival elsewhere proves nothing is pending.
 *   - Permanently refused save: the runner shows the refusal with a retry
 *     control (transient exhaustion) or a way back to the entry, which
 *     navigates so the route presents the still-unanswered entry again.
 *
 * The final entry does NOT navigate: the runner transitions in place to the
 * finished card with the queue intact — the same mount, the same queue — and
 * the hard checkpoint (queue drained AND fresh server verification of every
 * placement) gates both completion controls. No routine checkpoint message is
 * shown; failures surface as actionable errors.
 *
 * No progress is presented: no sentence x-of-y readout, no saved count, no
 * progress bar, no percentage. Internal placement and counts are still derived
 * server-side; they are simply no longer presented.
 */

export interface ValidationSessionInitial {
  readonly batchId: string;
  readonly entry: AllocatedEntry;
  readonly position: number;
  readonly total: number;
  readonly completedCount: number;
}

export interface ValidationSessionRunnerProps {
  readonly locale: InterfaceLocale;
  readonly initial: ValidationSessionInitial;
}

interface PresentedEntry {
  readonly entry: AllocatedEntry;
  readonly position: number;
  readonly total: number;
  readonly completedCount: number;
}

interface PrefetchedEntry extends PresentedEntry {
  /** The position it was prefetched after. A resolution for any other position is stale. */
  readonly forPosition: number;
}

type RunnerPhase = "answering" | "finishing";

/**
 * How long a newly presented entry's controls stay disabled so the participant
 * registers the new sentence before answering.
 *
 * PRESENTATION ONLY. This number never gates, delays, or observes persistence:
 * the previous entry's save started at submit time, and a save confirming early
 * does not shorten the interval while a save confirming late does not extend it.
 * Exported so tests assert against the shipped value rather than a retyped copy.
 */
export const ENTRY_SETTLING_MS = 2000;

type CheckpointState =
  | { readonly kind: "checking" }
  | { readonly kind: "complete" }
  | { readonly kind: "blocked"; readonly message: string };

/**
 * One checkpoint pass: drain, verify, reconcile missing placements that are still
 * retained in the queue, then verify once more. The finishing effect and the Retry
 * control share this single rule so the two cannot drift: a placement missing on the
 * server but parked locally is retried from its retained payload, and anything still
 * missing afterwards is an actionable block, never an enabled control.
 */
async function runCheckpointPass(queue: SaveQueue, batchId: string): Promise<CheckpointState> {
  await queue.drain();
  const first = await verifyBatchResponsesAction({ batchId });
  if (first.status === "failed") {
    return { kind: "blocked", message: first.reason };
  }
  if (first.complete) {
    return { kind: "complete" };
  }
  const retainedKeys = new Set(queue.snapshot().unsaved.map((entry) => entry.datasetEntryId));
  const retried = first.missing.filter((placement) => retainedKeys.has(placement.datasetEntryId));
  if (retried.length === 0) {
    return { kind: "blocked", message: "unconfirmed" };
  }
  for (const placement of retried) {
    queue.retry(placement.datasetEntryId);
  }
  await queue.drain();
  const second = await verifyBatchResponsesAction({ batchId });
  if (second.status === "failed") {
    return { kind: "blocked", message: second.reason };
  }
  return second.complete ? { kind: "complete" } : { kind: "blocked", message: "unconfirmed" };
}

function emptySnapshot(): SaveQueueSnapshot {
  return { pending: [], unsaved: [], states: {}, activeSaves: 0, queuedSaves: 0, queueWaitMs: {} };
}

/**
 * Sends one queued payload to the same-origin POST. Never throws: transport faults
 * arrive as `persistence` results, so the queue's contract ("submit must not throw")
 * holds even when the network does not.
 */
async function postQueuedSave(item: QueuedSave): Promise<SubmitValidationResult> {
  let response: Response;
  try {
    response = await fetch("/api/validation-responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batchId: item.batchId,
        datasetEntryId: item.datasetEntryId,
        response: item.payload,
      }),
    });
  } catch {
    return { status: "failed", reason: "persistence" };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "failed", reason: "persistence" };
  }
  if (typeof body !== "object" || body === null) {
    return { status: "failed", reason: "persistence" };
  }
  const status = (body as { status?: unknown }).status;
  if (status === "recorded") {
    const responseId = (body as { responseId?: unknown }).responseId;
    // A recorded verdict without a stored response id is malformed, not confirmed:
    // the repository layer refuses the same shape, so the transport reports it as a
    // persistence failure (retryable, parked when permanent) rather than fabricating
    // an identifier the database never issued.
    if (typeof responseId !== "string") {
      return { status: "failed", reason: "persistence" };
    }
    return {
      status: "recorded",
      responseId,
      datasetEntryId: item.datasetEntryId,
    };
  }
  if (status === "already_recorded") {
    return { status: "already_recorded", datasetEntryId: item.datasetEntryId };
  }
  const reason = (body as { reason?: unknown }).reason;
  if (
    reason === "invalid" ||
    reason === "unknown_batch" ||
    reason === "not_in_batch" ||
    reason === "not_configured" ||
    reason === "persistence"
  ) {
    return { status: "failed", reason };
  }
  return { status: "failed", reason: "persistence" };
}

export function ValidationSessionRunner({ locale, initial }: ValidationSessionRunnerProps) {
  const t = translatorFor(locale);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [view, setView] = useState<PresentedEntry>({
    entry: initial.entry,
    position: initial.position,
    total: initial.total,
    completedCount: initial.completedCount,
  });
  const [prefetched, setPrefetched] = useState<PrefetchedEntry | null>(null);
  const [prefetchAtEnd, setPrefetchAtEnd] = useState(false);
  const [phase, setPhase] = useState<RunnerPhase>("answering");
  const [snapshot, setSnapshot] = useState<SaveQueueSnapshot>(emptySnapshot);
  const [checkpoint, setCheckpoint] = useState<CheckpointState>({ kind: "checking" });

  /**
   * The entry-settling interval: which presented entry is still reading-settling.
   *
   * Belongs to the PRESENTED entry, not to the save. The effect below starts a
   * fresh `ENTRY_SETTLING_MS` timer whenever the presented entry CHANGES — the
   * first presentation is not a change, so it settles nothing — and clears the
   * timer on entry change and unmount. Expiry re-checks
   * identity, so a timer from an older entry can never enable a newer one early.
   * `locale` is deliberately not a dependency (no locale value is read), so a
   * language switch neither restarts the interval nor touches the queue. The
   * queue is never consulted here: this state cannot see persistence, by
   * construction rather than by discipline.
   */
  const [settlingEntryId, setSettlingEntryId] = useState<string | null>(null);

  /**
   * The previously presented entry, so the first presentation is not mistaken
   * for a change. StrictMode remounts reset this ref, and a remount is not a
   * change either — either way no timer starts without an actual transition.
   */
  const previousEntryIdRef = useRef<string | null>(null);

  useEffect(() => {
    const presentedId = view.entry.id;
    const previous = previousEntryIdRef.current;
    previousEntryIdRef.current = presentedId;
    // The initial presentation is not a change: the participant arrives from a
    // loading state with nothing to re-register, so the first entry is usable
    // at once and only transitions settle.
    if (previous === null) return;
    setSettlingEntryId(presentedId);
    // Bare globals, not `window.`-qualified: in a browser they are the same function, and under
    // test doubles they are the ones fake timers replace, so the interval stays controllable
    // without ever sleeping a real two seconds.
    const timer = setTimeout(() => {
      setSettlingEntryId((current) => (current === presentedId ? null : current));
    }, ENTRY_SETTLING_MS);
    return () => {
      clearTimeout(timer);
    };
    // `locale` is deliberately not a dependency: switching language must not
    // restart the settling interval. (No disable directive: the effect body
    // references no locale value, so there is nothing for exhaustive-deps to
    // ask for.)
  }, [view.entry.id]);

  /**
   * Every submit this mount has enqueued, including ones that did not advance yet. When a
   * submitted entry's save confirms while the view is still on it — the unsaved-block path —
   * the resume effect below completes the held advance. Without this record the session would
   * sit on an answered, latched entry with no control that advances: the latch never releases
   * for the same entry, and the queue's idempotency would no-op a resubmit.
   */
  const submittedRef = useRef<ReadonlySet<string>>(new Set());

  /**
   * The queue outlives every render AND the transition to the finished card: payloads must
   * survive the transition they were enqueued for, including the final one. Created once per
   * mount — a batch is one mount — so a re-render never strands a save, and the finished
   * card is rendered by this same component rather than by a navigation that would unmount it.
   */
  const queueRef = useRef<SaveQueue | null>(null);
  if (queueRef.current === null) {
    queueRef.current = createSaveQueue({
      submit: (item: QueuedSave) => postQueuedSave(item),
      notify: (next: SaveQueueSnapshot) => {
        setSnapshot(next);
      },
    });
  }

  /**
   * Prefetch the entry after the one on screen.
   *
   * Keyed to the position it follows: the resolver closes over the position requested, and a
   * response for any other position is discarded. That is what makes a slow prefetch harmless —
   * it can never paint entry N+1 over entry N+2.
   */
  useEffect(() => {
    if (phase !== "answering") return;
    const requestedPosition = view.position;
    let discarded = false;
    // A rejection here is a transport failure, not a result: the prefetch is simply unavailable
    // and the submit path falls back to confirm-then-navigate. Swallowed deliberately — there is
    // no entry to attribute it to and nothing to render from it.
    void requestNextEntryAction({ batchId: initial.batchId, position: requestedPosition })
      .then((result) => {
        if (discarded || result.status === "failed") return;
        if (result.status === "finished" || result.position <= requestedPosition) {
          setPrefetchAtEnd(true);
          return;
        }
        setPrefetched({
          entry: result.entry,
          position: result.position,
          total: result.total,
          completedCount: result.completedCount,
          forPosition: requestedPosition,
        });
      })
      .catch(() => {});
    return () => {
      discarded = true;
    };
    // `locale` is deliberately not a dependency: switching language must not prefetch another
    // entry. (No disable directive: the effect body references no locale value, so there is
    // nothing for exhaustive-deps to ask for.)
  }, [initial.batchId, view.position, phase]);

  /**
   * While anything is unconfirmed, leaving loses work. The warning is removed the moment the
   * queue drains — a participant with nothing pending is never nagged.
   *
   * This also covers the locale switch: it navigates away through a form POST, which fires
   * `beforeunload` like any other navigation, so a pending save is never silently discarded
   * by a language change.
   */
  const anythingUnconfirmed = snapshot.pending.length + snapshot.unsaved.length > 0;
  useEffect(() => {
    if (!anythingUnconfirmed) return;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [anythingUnconfirmed]);

  /**
   * The hard checkpoint: queue drained AND fresh server verification of every placement.
   * Runs once the finished card is shown, with the queue intact in this same mount.
   *
   * Missing placements whose payloads are still retained are retried from those payloads and
   * re-verified once; anything still missing afterwards is an actionable error, never a
   * silent loss and never an enabled Finish. Finish therefore cannot retire the attempt
   * before the checkpoint passes, because its control stays unavailable until it does.
   */
  useEffect(() => {
    if (phase !== "finishing") return;
    let cancelled = false;

    async function pass(): Promise<void> {
      const queue = queueRef.current;
      if (queue === null) return;
      const verdict = await runCheckpointPass(queue, initial.batchId);
      if (cancelled) return;
      setCheckpoint(verdict);
    }

    void pass();
    return () => {
      cancelled = true;
    };
  }, [phase, initial.batchId]);

  /**
   * Complete a held advance: the view is still on an entry it already submitted, and that
   * entry's save has since confirmed. Normal submits advance synchronously, so by the time a
   * save confirms the view is elsewhere and this does nothing; it fires only for the held
   * unsaved-block path whose advance was deferred. Finishing phases are excluded —
   * they own their own transition — and so is anything but a confirmed save of THIS entry.
   */
  useEffect(() => {
    if (phase !== "answering") return;
    if (!submittedRef.current.has(view.entry.id)) return;
    if (snapshot.states[view.entry.id]?.kind !== "saved") return;
    advanceOrFlush();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the prefetch effect above: advanceOrFlush reads the prefetch and view as they are at the moment the save confirms; subscribing to them would re-fire the held advance on every unrelated prefetch resolution.
  }, [phase, snapshot, view.entry.id]);

  /** Swap the presented entry in place and record where the address bar says we are. */
  function advanceTo(next: PresentedEntry): void {
    setView(next);
    setPrefetched(null);
    setPrefetchAtEnd(false);
    window.history.replaceState(null, "", batchRouteHref(initial.batchId, next.position));
  }

  /**
   * Wait for every confirmation, then hand the route the decision for a MID-BATCH fallback:
   * the first remaining entry. When a save parked as unsaved along the way, there is no
   * navigation: the batch is not reported complete and the unsaved panel below is where
   * the response is resolved instead. The final entry never takes this path — it
   * transitions in place to the finished card, so the queue is never unmounted with work
   * still in it.
   */
  async function flushThenNavigate(): Promise<void> {
    const entryId = view.entry.id;
    const position = view.position;
    await queueRef.current?.drain();
    const after = queueRef.current?.snapshot() ?? emptySnapshot();
    if (after.unsaved.length > 0) {
      return;
    }
    // Consume the held advance so the resume effect does not re-fire it: the view never
    // changed (fallback navigates rather than swapping in place), so without this the
    // confirmation that just drained the queue would advance a second time.
    const remaining = new Set(submittedRef.current);
    remaining.delete(entryId);
    submittedRef.current = remaining;
    router.push(batchRouteHref(initial.batchId, position + 1));
  }

  /**
   * The one branch every advance takes. Instant when the prefetch for THIS position is
   * already here; in-place finished card at the end of the batch; flushed navigation only
   * whenever no prefetch is usable. Never invents an entry, never skips the drain on the
   * fallback path.
   */
  function advanceOrFlush(): void {
    if (prefetchAtEnd) {
      startTransition(() => {
        setCheckpoint({ kind: "checking" });
        setPhase("finishing");
      });
      return;
    }
    if (prefetched !== null && prefetched.forPosition === view.position) {
      const next = prefetched;
      startTransition(() => {
        advanceTo(next);
      });
      return;
    }
    void flushThenNavigate();
  }

  function handleValidSubmit(payload: ValidationResponseInput): void {
    const queue = queueRef.current;
    if (queue === null || phase !== "answering") return;
    queue.enqueue({
      key: view.entry.id,
      batchId: initial.batchId,
      datasetEntryId: view.entry.id,
      position: view.position,
      payload,
    });
    // Recorded even when the advance below is held: the resume effect completes it once the
    // save confirms, which is what keeps a submit-while-parked from wedging the session.
    submittedRef.current = new Set(submittedRef.current).add(view.entry.id);

    // A parked failure blocks advancement until it is retried: moving on would strand a
    // response the participant believes is queued, and the unsaved panel below is where it is
    // resolved instead. Worker occupancy never blocks: all 5 responses are independently
    // queueable and a slow save continues its own lifecycle while the session moves on.
    if (queue.snapshot().unsaved.length > 0) return;

    advanceOrFlush();
  }

  if (phase === "finishing") {
    const gateComplete = checkpoint.kind === "complete";
    return (
      <>
        <Card as="section" padding="lg">
          <h2 className="text-heading">{t("validate.finished.label")}</h2>
          <p className="text-body text-ink-muted mt-3">{t("validate.finished.body")}</p>

          <SaveStatus
            locale={locale}
            snapshot={snapshot}
            queue={queueRef.current}
            batchId={initial.batchId}
          />

          {checkpoint.kind === "blocked" ? (
            <div role="alert" className="mt-4 flex flex-col gap-2">
              <p className="text-small text-status-alert font-semibold">
                {t("validation.failure.persistence")}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  size="lg"
                  onClick={() => {
                    setCheckpoint({ kind: "checking" });
                    // Re-run the same checkpoint pass the effect uses: retained payloads
                    // retry from the shared rule, then a single fresh verification decides.
                    void (async () => {
                      const queue = queueRef.current;
                      if (queue === null) return;
                      setCheckpoint(await runCheckpointPass(queue, initial.batchId));
                    })();
                  }}
                >
                  {t("validation.failure.retry")}
                </Button>
              </div>
            </div>
          ) : null}

          {/*
            The queue-owning component stays mounted through this card: submissions made on
            the final entries are still draining above while these controls wait. Both stay
            unavailable — disabled with aria-busy semantics, and no routine saving message —
            until the checkpoint proves every placement stored.
          */}
          <FinishedBatch locale={locale} gate={{ complete: gateComplete }} />
        </Card>
      </>
    );
  }

  return (
    <>
      <EntryCard
        entry={view.entry}
        label={t("validate.entry.label")}
        instructionLabel={t("validate.entry.instructionLabel")}
      />

      <SaveStatus
        locale={locale}
        snapshot={snapshot}
        queue={queueRef.current}
        batchId={initial.batchId}
      />

      <Card as="section" padding="lg">
        <ValidationForm
          key={view.entry.id}
          locale={locale}
          datasetEntryId={view.entry.id}
          settling={settlingEntryId === view.entry.id}
          onValidSubmit={handleValidSubmit}
        />
      </Card>
    </>
  );
}

function SaveStatus({
  locale,
  snapshot,
  queue,
  batchId,
}: {
  locale: InterfaceLocale;
  snapshot: SaveQueueSnapshot;
  queue: SaveQueue | null;
  batchId: string;
}) {
  const t = translatorFor(locale);
  const router = useRouter();

  if (snapshot.unsaved.length > 0) {
    return (
      <div role="alert" className="flex flex-col gap-3">
        {snapshot.unsaved.map((item) => {
          const state = snapshot.states[item.key];
          const reason = state !== undefined && state.kind === "unsaved" ? state.reason : null;
          const retryable = reason === "persistence" || reason === "not_configured";
          return (
            <div key={item.key} className="flex flex-col gap-2">
              <p className="text-small text-status-alert font-semibold">
                {reason === null
                  ? t("validation.failure.persistence")
                  : failureMessageFor(reason, t)}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {retryable ? (
                  <Button type="button" size="lg" onClick={() => queue?.retry(item.key)}>
                    {t("validation.failure.retry")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    variant="secondary"
                    onClick={() => router.push(batchRouteHref(batchId, item.position))}
                  >
                    {t("validation.failure.backToEntry")}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // The routine Saving…/Saved indicator was removed by owner decision: a validator
  // answering steadily does not need a running commentary on background work. What stays
  // is everything that needs action or explains a hold: the retrying notice while a save
  // is being retried, and the unsaved alert above.
  if (snapshot.pending.length > 0) {
    const retrying = Object.values(snapshot.states).some((state) => state.kind === "retrying");
    if (!retrying) return null;
    return (
      <p role="status" className="text-small text-ink-muted">
        {t("validation.save.retrying")}
      </p>
    );
  }

  return null;
}
