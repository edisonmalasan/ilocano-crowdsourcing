"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { EntryCard } from "@/components/validation/entry-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BatchProgress } from "@/components/ui/progress";
import type { InterfaceLocale } from "@/lib/domain/locale";
import { translatorFor } from "@/lib/i18n/copy";
import { requestNextEntryAction } from "@/lib/validation/next-entry-actions";
import { submitValidationAction } from "@/lib/validation/actions";
import { batchRouteHref } from "@/lib/validation/batch-route";
import { failureMessageFor } from "@/lib/validation/entry-form-flow";
import {
  createSaveQueue,
  type QueuedSave,
  type SaveQueue,
  type SaveQueueSnapshot,
} from "@/lib/validation/save-queue";
import type { ValidationResponseInput } from "@/schemas/validation";
import type { AllocatedEntry } from "@/schemas/batch";

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
 * the queue starts the Server Action immediately — and swaps in the already
 * prefetched next entry in the same task. The response is marked saved only
 * when the server confirms it; until then the complete payload sits in the
 * queue, retried with bounded backoff, never reported as saved, never dropped.
 *
 * The runner never decides WHAT comes next. The prefetch response names the
 * entry, the position, and the figures; this component renders exactly those.
 * At most one future entry is ever held: a prefetch fires per presented entry,
 * keyed to the position it follows, and a stale resolution — one that arrives
 * after the runner has moved on — is discarded rather than rendered.
 *
 * ============================================================================
 * WHERE A FULL NAVIGATION STILL HAPPENS, AND WHY EACH ONE IS CORRECT
 * ============================================================================
 *   - No usable prefetch (failed, or not yet resolved): enqueue, wait for the
 *     drain, then navigate to position + 1. The route resolves from its own
 *     record exactly as it does today — the old path, kept as the fallback
 *     rather than reimplemented.
 *   - Final entry: enqueue, show the synchronizing state, drain the queue,
 *     then navigate. The route renders the finished screen from a fresh read —
 *     including the lifetime figure — never from client state.
 *   - Permanently refused save: the runner shows the refusal with a retry
 *     control (transient exhaustion) or a way back to the entry, which
 *     navigates so the route presents the still-unanswered entry again.
 *
 * The finished screen is therefore unreachable with pending saves: Continue and
 * Finish live there, and arrival there proves the drain. No separate gating.
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

/**
 * How many unconfirmed saves the runner tolerates before pausing advancement.
 *
 * A normal save confirms in ~1–2s, long before one sentence is answered; two covers one slow
 * save plus one in flight. This is a memory-safety bound, not a research target.
 */
export const MAX_PENDING_SAVES = 2;

type RunnerPhase = "answering" | "backlogged" | "flushing";

function emptySnapshot(): SaveQueueSnapshot {
  return { pending: [], unsaved: [], states: {} };
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
  const [hasConfirmedSave, setHasConfirmedSave] = useState(false);

  /**
   * Every submit this mount has enqueued, including ones that did not advance yet. When a
   * submitted entry's save confirms while the view is still on it — the unsaved-block path —
   * the resume effect below completes the held advance. Without this record the session would
   * sit on an answered, latched entry with no control that advances: the latch never releases
   * for the same entry, and the queue's idempotency would no-op a resubmit.
   */
  const submittedRef = useRef<ReadonlySet<string>>(new Set());

  /**
   * The queue outlives every render: payloads must survive the transition they were enqueued
   * for. Created once per mount — a batch is one mount — so a re-render never strands a save.
   */
  const queueRef = useRef<SaveQueue | null>(null);
  if (queueRef.current === null) {
    queueRef.current = createSaveQueue({
      submit: (item: QueuedSave) =>
        submitValidationAction({
          batchId: item.batchId,
          datasetEntryId: item.datasetEntryId,
          response: item.payload,
        }),
      notify: (next: SaveQueueSnapshot) => {
        setSnapshot(next);
        if (next.pending.length === 0 && next.unsaved.length === 0) setHasConfirmedSave(true);
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
  }, [initial.batchId, view.position]);

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
   * Resume after a backlog pause: the queue drained on its own, so the held advance completes
   * through the same branch a fresh submit would take — instant when the prefetch is still
   * good, flushed navigation otherwise — without the participant pressing anything again.
   */
  useEffect(() => {
    if (phase !== "backlogged") return;
    if (snapshot.pending.length > 0 || snapshot.unsaved.length > 0) return;
    advanceOrFlush();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- advanceOrFlush reads the prefetch and view as they are at the moment the drain completes; subscribing to them would re-fire the held advance on every unrelated prefetch resolution.
  }, [phase, snapshot.pending.length, snapshot.unsaved.length]);

  /**
   * Complete a held advance: the view is still on an entry it already submitted, and that
   * entry's save has since confirmed. Normal submits advance synchronously, so by the time a
   * save confirms the view is elsewhere and this does nothing; it fires only for the held
   * paths (unsaved-block, backlog) whose advance was deferred. Flush phases are excluded —
   * they own their own navigation — and so is anything but a confirmed save of THIS entry.
   */
  useEffect(() => {
    if (phase !== "answering") return;
    if (!submittedRef.current.has(view.entry.id)) return;
    if (snapshot.states[view.entry.id]?.kind !== "saved") return;
    advanceOrFlush();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the effect above.
  }, [phase, snapshot, view.entry.id]);

  /** Swap the presented entry in place and record where the address bar says we are. */
  function advanceTo(next: PresentedEntry): void {
    setView(next);
    setPrefetched(null);
    setPrefetchAtEnd(false);
    setPhase("answering");
    window.history.replaceState(null, "", batchRouteHref(initial.batchId, next.position));
  }

  /**
   * Wait for every confirmation, then hand the route the decision — finished screen when
   * nothing remains, the first remaining entry otherwise. When a save parked as unsaved along
   * the way, there is no navigation: the batch is not reported complete and the unsaved panel
   * below is where the response is resolved instead.
   */
  async function flushThenNavigate(): Promise<void> {
    setPhase("flushing");
    await queueRef.current?.drain();
    const after = queueRef.current?.snapshot() ?? emptySnapshot();
    if (after.unsaved.length > 0) {
      setPhase("answering");
      return;
    }
    router.push(batchRouteHref(initial.batchId, view.position + 1));
  }

  /**
   * The one branch every advance takes. Instant when the prefetch for THIS position is
   * already here; flushed navigation at the end of the batch and whenever no prefetch is
   * usable. Never invents an entry, never skips the drain.
   */
  function advanceOrFlush(): void {
    if (prefetchAtEnd) {
      void flushThenNavigate();
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
    if (queue === null) return;
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
    // resolved instead.
    if (queue.snapshot().unsaved.length > 0) return;

    if (queue.pendingCount() > MAX_PENDING_SAVES) {
      setPhase("backlogged");
      return;
    }

    advanceOrFlush();
  }

  const formVisible = phase === "answering" || phase === "backlogged";

  return (
    <>
      <BatchProgress
        index={view.position}
        total={view.total}
        completed={view.completedCount}
        labels={{
          progress: t("validate.progress.label"),
          item: `${t("validate.progress.sentence")} ${view.position} ${t("validate.progress.of")} ${view.total}`,
          saved: `${view.completedCount} ${t("validate.progress.saved")}`,
        }}
      />

      <EntryCard
        entry={view.entry}
        label={t("validate.entry.label")}
        instructionLabel={t("validate.entry.instructionLabel")}
      />

      <SaveStatus
        locale={locale}
        snapshot={snapshot}
        confirmed={hasConfirmedSave}
        queue={queueRef.current}
        batchId={initial.batchId}
      />

      {phase !== "answering" ? (
        <p role="status" className="text-small text-ink-muted">
          {t("validation.save.backlog")}
        </p>
      ) : null}

      {formVisible ? (
        <Card as="section" padding="lg">
          <ValidationForm
            key={view.entry.id}
            locale={locale}
            datasetEntryId={view.entry.id}
            onValidSubmit={handleValidSubmit}
          />
        </Card>
      ) : null}
    </>
  );
}

function SaveStatus({
  locale,
  snapshot,
  confirmed,
  queue,
  batchId,
}: {
  locale: InterfaceLocale;
  snapshot: SaveQueueSnapshot;
  confirmed: boolean;
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

  if (snapshot.pending.length > 0) {
    const retrying = Object.values(snapshot.states).some((state) => state.kind === "retrying");
    return (
      <p role="status" className="text-small text-ink-muted">
        {retrying ? t("validation.save.retrying") : t("validation.save.saving")}
      </p>
    );
  }

  if (confirmed) {
    return (
      <p role="status" className="text-small text-ink-muted">
        {t("validation.save.saved")}
      </p>
    );
  }

  return null;
}
