# Design

## Context

`ValidationForm.submit` awaits `submitValidationAction` (batch read + INSERT +
reservation release), then `router.push`es to position + 1, and the route
re-runs `openValidationSession` (batch read + completed-set read + entry read)
before anything renders. Every transition pays the full write round trip plus a
full session re-read plus navigation, sequentially. The research-integrity
reason once given for this — a validator must not see the next sentence before
committing — is superseded by explicit product decision: the methodology does
not require it.

## Goals

- Entry-to-entry transitions feel instant when the next entry is prefetched.
- No response is ever reported saved before the server confirms it, and none is
  ever silently dropped (typed retry, bounded backlog, flush-before-finish).
- The server still decides everything research-relevant; the client holds at
  most one future entry and no batch order.

## Non-goals

- No methodology, evaluation, translation, completion, allocation, export, or
  dashboard change. No persistent browser storage for payloads. No security
  hardening (separate program, runs after this change archives).

## Decisions

### D1: Prefetch is a new Server Action reusing the session read

- `requestNextEntryAction({ batchId, position })` (strictObject, position-only
  ordering key like the session request): `batches.findById` →
  `listEntryIdsForValidator` → `resolveSessionEntry(entries, completed,
  position + 1)` → `datasetEntries.findById` → `AllocatedEntry` projection.
  Returns the entry plus position/total/completedCount, or `finished` when the
  next position resolves to null (the final save flushes instead of advancing).
- Rejected: returning the next entry inside the write response — couples a read
  to a write with different failure semantics, and a failed write would then
  have already exposed the next sentence for nothing. Rejected: client-side
  position arithmetic into entry ids — the client never learns the order.
- The prefetch fires when an entry becomes current (and once after mount), is
  keyed to the entry it follows, and is discarded on mismatch (stale prefetch
  never renders under a new entry).

### D2: In-memory FIFO save queue with typed outcome handling

- Pure queue module (`src/lib/validation/save-queue.ts`): enqueue validated
  payload → states `saving` → `saved` (on `recorded`/`already_recorded`) or
  `retrying` (transient: `persistence`, `not_configured`-as-transient? no —
  see below) with bounded retries (3 attempts, 500ms/1s/2s backoff) then
  `failed` (sticky, blocking further advancement until resolved by retry
  control; response retained).
- `invalid` is never enqueued (client check first, and a server `invalid`
  returns to the form as a field error, never retried). `unknown_batch` /
  `not_in_batch` are permanent: surfaced, never retried.
- Single-flight per entry (existing latch retained); queue drains strictly in
  order so progress counts stay truthful.
- Race pin: Entry N's save resolving after Entry N+1 rendered must mark N saved
  without touching N+1's form — covered by delayed-fake tests.

### D3: Backlog threshold = 2 pending saves

- While 2 saves are unsent/unconfirmed, Save and continue waits for the drain
  ("Saving your recent responses…") instead of advancing. Rationale: normal
  saves finish (~1–2s) long before one sentence is answered; 2 covers one slow
  save plus one in flight without letting answers accumulate in memory. Not a
  research target; a memory-safety bound.

### D4: Finish and Continue flush

- Final entry: no prefetch past the end; answering entry 10 shows the
  synchronizing state until the queue drains, then the completed-batch screen
  renders from a fresh `openValidationSession` (finished branch, with the
  lifetime figure read there as today).
- Finish control refuses to clear the attempt identity while the queue is
  non-empty (waits for drain first, then clears + navigates). Continue/new
  batch likewise waits for the current batch's drain.
- `beforeunload` warning while the queue is non-empty; removed when drained.

### D5: No page navigation per transition

- Advance swaps entry content + form state in place (header/progress/card/
  locale chrome preserved); the `?position=` URL still updates (history
  replace, not push-navigate) so refresh/resume keeps working through the
  existing route. Form reset reuses the render-time entry-change reset.
- Locale switch touches nothing in the queue or prefetch.

### D6: Reservation release off the critical path

- `runSubmitValidation` still releases after INSERT success, but the release
  awaits nothing the participant waits on: the action returns `recorded` once
  the INSERT succeeds and releases before returning — the release is one local
  await the client no longer blocks on because the client advances
  optimistically. No semantic change: release-after-insert order kept, failure
  still operator-logged with TTL recovery, never reported as persistence.
  (If measurement shows the release await dominates, it may move after the
  return via `after()` — Propose-approved only if error observability is kept.)

### D7: Copy additions (both catalogs, parity-tested)

- `validation.save.saving` ("Saving…"), `validation.save.saved` ("Saved"),
  `validation.save.retrying` ("Could not save. Retrying…"),
  `validation.save.backlog` ("Saving your recent responses…"),
  `validation.save.unsavedWarning` (before-unload sentence). No timers, no
  streaks, no speed pressure; retrying copy is non-alarming.

## Risks / trade-offs

- A validator answers entry N+1 while entry N's save is in flight: progress
  counts derive from server-confirmed state, so the progress bar may lag one
  entry behind reality for ~1–2s. Accepted: the alternative (client-derived
  counts) would let the client influence research figures.
- Refresh with pending saves loses them (memory-only, by privacy design); the
  before-unload warning is the mitigation, and the methodology already treats
  an unanswered entry as unanswered.
- One extra read per entry (prefetch) roughly doubles session-read volume;
  each is the same cheap indexed read, and the eliminated full re-read per
  transition nets out.

## Open questions

- None blocking. Post-Apply comparison re-measures the three hosted reads
  (unchanged code path) and asserts the transition no longer awaits them.
