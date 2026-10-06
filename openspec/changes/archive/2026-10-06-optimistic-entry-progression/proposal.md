# Proposal

## Why

Advancing between validation entries feels slow: Save and continue blocks on the
response write, then navigates, then the server re-reads the whole session before
the next sentence appears. Measured against the hosted project (service-role REST,
read-only, 5 samples each, medians): the three session reads alone cost ~211ms +
~189ms + ~205ms sequentially (~600ms), and the write path adds a batch read plus
the validation INSERT plus reservation release before navigation even starts —
old entry-to-entry latency is on the order of 1.5–2.5s of blocked waiting per
transition, nine times per batch.

## What changes

- The thesis methodology does NOT require the next sentence to stay hidden until
  the current response finishes saving. The old
  "next sentence must not be fetched before the current response is stored"
  assumption is superseded by this change (recorded as superseded, not deleted).
- New server-authoritative `requestNextEntryAction({ batchId, position })` that
  resolves ONLY the immediate next allocated entry (same reads as
  `openValidationSession`, same `AllocatedEntry` projection, never the whole
  batch, never beyond position + 1).
- The validation form prefetches entry N+1 while entry N is being answered,
  holds at most one future entry, and on Save and continue advances to it
  immediately while the response persists through an in-memory save queue with
  typed retry (transient retried with bounded backoff, invalid/unknown-batch/
  not-in-batch never retried).
- Save status indicator (Saving… / Saved / Could not save. Retrying…);
  backlog threshold of 2 pending saves pauses advancement with a plain
  "Saving your recent responses…" state; Finish and Continue both flush the
  queue first (Finish never clears the attempt identity while saves are pending);
  before-unload warning while the queue is non-empty; memory-only payloads, no
  new persistent browser storage.
- Reservation release moves off the critical path (after INSERT success, failure
  stays operator-logged with TTL recovery); nothing is reported persisted before
  the INSERT succeeds.

## Capabilities

### New capabilities

(none — this extends the validation session behind an existing capability)

### Modified capabilities

- `validation-experience`: optimistic advancement, one-entry prefetch, save
  queue with retry/backlog/flush semantics, save status, superseded
  fetch-after-store assumption.

## Impact

- `src/lib/validation/` (new prefetch action + core, save-queue module,
  session-service reuse), `src/app/validate/[batchId]/` (form + page wiring,
  no full-page loading state on advance), `src/lib/i18n/copy.ts` (status
  strings in both catalogs), dashboard/admin/export/allocation/completion
  untouched, no migration, no hosted writes for testing.
- Success criterion: with the next entry prefetched, Save and continue replaces
  the entry without waiting for the previous write round trip; the ~1–2s save
  no longer blocks progression and no pending response can be silently lost.
