# Design: five-entry-concurrent-persistence

## Context

True batch size becomes 5. The current runner (`validation-session.tsx`, `MAX_PENDING_SAVES = 2` as advancement gate, `submitValidationAction` per-save transport, multi-round-trip insert path) cannot carry five independent responses with controlled concurrency. The finished card is reached by navigation after a client drain; the queue does not survive it as a guarantee.

## Decisions

### Batch size 5 at the schema default

- `BATCH_SIZE_DEFAULT` 10 to 5 in `src/schemas/batch.ts`; `BATCH_SIZE_HARD_MAX` stays 50; `allocationConfigSchema.parse({})` in `src/lib/allocation/actions.ts` picks up the new default with no other production edit.
- Copy, specs, AGENTS.md durable rules, and docs updated; batch-size-10 recorded as superseded, never rewritten in archives.

### Transport: POST Route Handler per response

- New `POST /api/validation-responses` (exact route per repo conventions): zod-strict body `{ batchId, datasetEntryId, response }`; resolves attempt/validator from stored batch server-side; mints id/timestamps server-side; calls one RPC.
- Queue `submit` adapter switches from `submitValidationAction` to `fetch` POST. Server Actions stay for one-shot flows (enroll, allocate, continue, verify, finish).
- Service-role stays server-only; browser never sees it; RPC never exposed to anon/authenticated.

### RPC: `submit_validation_response_v1`

Forward migration only, following `allocate_validation_batch_v1` conventions (`SET search_path`, `SECURITY DEFINER`, `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role`):

1. `p_batch_id`, `p_dataset_entry_id`, `p_evaluation`, `p_corrected`, `p_english`, `p_filipino` in; look up batch, derive `validator_id`.
2. Verify entry is a member of the batch (`batch_entries`); else typed refusal `entry_not_in_batch`.
3. `INSERT INTO validations (...)` with bilingual/correction checks enforced by existing CHECKs; on `UNIQUE (validator_id, dataset_entry_id)` conflict return `already_recorded` with the stored row identity (no second row).
4. On success, delete that entry's reservation (`batch_reservations`) best-effort: failure recorded in the acknowledgement (`reservation_release: ok | skipped`) but never fails the recorded response.
5. Return typed JSON `{ status: recorded | already_recorded, validationId, reservationRelease }` or typed refusal `{ status: refused, reason }`.

Repository adds `submitResponseViaRpc(...)` on the privileged path only; strict mapping of refusal reasons; no response text in logs.

### Queue: MAX_ACTIVE_SAVES = 3, capacity 5

- Rewrite `src/lib/validation/save-queue.ts` around active-worker counting instead of an advancement gate:
  - `MAX_ACTIVE_SAVES = 3`; queue holds all 5 current-batch items; key = dataset entry id (placement second).
  - `enqueue` single-flights duplicates; starts work while `active < 3`; else waits.
  - Worker completion refills immediately from FIFO waiting items; out-of-order completion attributed by key.
  - Per-item bounded retry (3 attempts, 500ms/1s/2s backoff, transient only); permanent refusals parked with full payload retained.
  - Snapshot exposes `{ queued, active, confirmed, failed, pending }` for the runner and checkpoint; no routine UI binds to it except failure states.
- Runner `handleValidSubmit` always enqueues then advances optimistically; backlog phase removed; `submittedRef` retained to complete held advances only where still needed.
- Benchmark note: MAX_ACTIVE_SAVES = 2 vs 3 measured during Apply (median single-save wall time, 5-rapid drain time, RPC duration, failure rate). Default candidate 3 stands unless measurement shows it worse; evidence recorded in Apply summary.

### Checkpoint: in-place finished card + server verification

- After entry 5, runner switches in place to the finished-card state (reuse `finished-batch.tsx` visual shell); the queue-owning component stays mounted; URL may update via replaceState only (no unmounting navigation).
- New `verifyBatchResponsesAction(batchId)` (or equivalent): server counts stored validations per batch placement; returns `{ complete: boolean, missing: placement[] }`.
- Controls disabled with aria-busy until `{ queue drained AND verification.complete }`; missing items retried from retained payloads where present; otherwise actionable error. No "Saving your responses" text.
- `finish` path reuses existing retirement but gated on checkpoint; `continue` keeps same attempt, new batch id, allocate up to 5.

### Copy and progress removal

- Delete progress block from session markup; delete orphaned `progress.tsx` usage only (keep component if other screens use it, else remove + tests).
- Catalog: ten/sampu to five/lima where numbers remain; progress/saved keys removed from both languages; finished body becomes invitation; per-outcome h1 and bilingual absence guards updated.

## Alternatives considered

- Keep Server Action transport with concurrency wrapper: rejected. Client Server Functions are not an independently schedulable pool and hide retry attribution.
- Persist queue to sessionStorage: rejected. Policy forbids response payloads in browser storage; memory-only plus mounted-queue preservation is the approved mechanism.
- Full-page navigation to finished route with server re-read: rejected. It unmounts the queue and recreates the old multi-hop path Change 2 exists to remove.

## Risks

- POST retry after recorded-but-unacked: handled by `already_recorded` idempotency.
- Reservation release inside RPC failing: best-effort with observability, TTL backstop.
- Double-click storms: single-flight by entry key plus server uniqueness.

## Test plan

Unit: queue (5 independent, max-3 active, refill, out-of-order, retry/parking, single-flight, already_recorded), copy absence, batch-size config, RPC input mapping. DOM: runner rapid 5x cannot-evaluate, checkpoint gating, queue-survives-finished transition, no progress/saved markup. Integration (PGlite): migration applies, RPC records once, duplicate returns already_recorded, membership enforced, reservation released post-insert only, short-batch and concurrency interplay with allocation RPC.
