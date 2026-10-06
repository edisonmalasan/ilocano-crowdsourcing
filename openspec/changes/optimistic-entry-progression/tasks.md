# Tasks

## 1. Prefetch read

- [x] 1.1 New `requestNextEntryAction` + pure core reusing `resolveSessionEntry`
  and the `AllocatedEntry` projection; strictObject position-only request;
  returns entry + figures or `finished`; never the batch, never past N+1.
- [x] 1.2 Unit tests: resolves N+1 through the server order, stale positions,
  finished at batch end, whole batch never exposed, malformed request refused,
  researcher fields absent from the projection.
- [x] 1.3 Read-only guard extended: the new action performs no writes.

## 2. Save queue

- [x] 2.1 Pure FIFO queue module: enqueue → saving → saved / retrying(bounded
  3, 500ms/1s/2s) → failed(sticky, response retained); `already_recorded`
  counts as saved; invalid/unknown_batch/not_in_batch never retried.
- [x] 2.2 Unit tests over delayed fakes: advance-while-saving, resolution
  attribution to the right entry, transient retry then success, permanent
  failure not retried, order preservation, double-submit single-flight.

## 3. Form + page integration

- [x] 3.1 Form prefetches N+1 on entry render, advances instantly when present,
  falls back to navigation when absent; backlog ≥2 pauses with plain copy;
  in-place transition preserving chrome; form reset without flashing prior
  answers; locale switch inert to queue/prefetch.
- [x] 3.2 DOM tests: instant advance with prefetched entry + delayed save,
  Saving→Saved status transitions, retry status, backlog pause/resume, final
  entry drains before finished screen, Finish/Continue gated on drain,
  double-click single submit, locale switch duplicates nothing.
- [x] 3.3 Copy keys added to both catalogs (parity + research-boundary +
  encouragement guards stay green).

## 4. Flush, finish, and safety

- [x] 4.1 Final-entry synchronizing state; Finish refuses to clear identity
  while pending; Continue waits for drain; beforeunload while non-empty.
- [x] 4.2 Reservation release ordering kept (after INSERT, logged + TTL on
  failure); no persisted-before-insert reporting; integration test over PGlite
  for the write path unchanged.
- [x] 4.3 before/after measurement comparison; no migration; no hosted writes.

## 5. Spec sync + verification

- [ ] 5.1 Full matrix (format, lint, typecheck, unit, DOM, integration, build,
  guards, OpenSpec validation) with counts from logs; independent verification
  before Apply merge; CI + Vercel green on every PR.
- [ ] 5.2 Sync `validation-experience` (superseded fetch-after-store
  assumption recorded, new prefetch/queue/status scenarios); Archive.
