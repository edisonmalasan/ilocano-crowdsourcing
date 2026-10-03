# Proposal

## Why

Allocation currently excludes entries the attempt **answered** but never consults entries it was
**assigned**: a second Continue in one attempt can be served entries sitting unanswered in its own
earlier batches, and the double-submit refuses only at insert time as `already_recorded`
confusion. That was tolerable while overlap between attempts was the collection mechanism. It is
not tolerable under the approved exclusive-assignment rule: **the same incomplete entry must
never be actively assigned to two validation attempts at once**, and two simultaneously-requesting
attempts must not both claim it. Read-then-write application logic cannot enforce that — only the
database can, by arbitrating concurrent claims itself.

## What Changes

- **BREAKING** — A reserved incomplete entry is excluded from allocation to other attempts.
  Assignment without a reservation is no longer a complete allocation: the batch row, its entry
  rows, and the reservation claims commit as one atomic unit, so a second simultaneous request
  cannot observe or claim the same entry.
- **New operational table `entry_reservations`** (migration): one row per reserved entry —
  `entry_id` (PK, FK), `validator_id` (holder attempt), `reserved_at`, `expires_at`. No synthetic-dataset column is touched; the immutable source stays immutable. RLS deny-all,
  consistent with every research table.
- **Atomic claim RPC `claim_entry_reservations`**: one transaction deletes expired claims over
  the candidate ids and inserts the caller's claims with `ON CONFLICT (entry_id) DO NOTHING`,
  returning the granted subset. PostgreSQL's unique-constraint arbitration — not application
  read-then-write — decides simultaneous claims. `SKIP LOCKED` is not needed because no row
  needs locking: unclaimed entries have no row to lock, and contended entries are arbitrated by
  the primary key itself. This is the equivalent database-enforced design the requirement asks
  for, stated as equivalent rather than disguised as row locking.
- **Bounded backfill in the service**: granted shortfalls re-run selection excluding granted ids
  (at most two extra rounds); persistent contention collapses to `exhausted` rather than an empty
  batch, documented as contention-collapse and distinct from pool exhaustion.
- **Expiry without a watcher**: `expires_at` defaults to 30 minutes (`reservationTtlSeconds`,
  allocation configuration like `batchSize`). Expired rows are lazily deleted inside the claim
  transaction and lazily reclaimed by conflict arbitration — no cron, no sweeper, no background
  worker. Abandoned tabs and batches decay back into the pool by time alone.
- **Release on submit**: after every successful validation insert, the service deletes the
  submitter's reservation row for that entry (best-effort: a release failure is logged, never
  fails the submit). Qualifying submits need no row (the entry is complete and allocation
  ignores it); `cannot_evaluate` submits release the row so the entry becomes allocatable again.
  Abandonment without submit relies on TTL expiry — deliberately, so retiring an attempt still
  writes nothing to the server.
- **The completed entry stays out permanently**: completeness filtering precedes reservation
  logic everywhere, so stale reservation rows on completed entries are inert, and a completed
  entry never re-enters allocation through expiry, reclaim, or retry.

## Capabilities

### New Capabilities

(none — the rule extends an existing capability's allocation path)

### Modified Capabilities

- `batch-allocation`: assignment is exclusive while reserved — a second simultaneous request
  cannot be granted the same incomplete entry; reservations expire by time without a watcher;
  release on submit; contention-collapse to `exhausted`; `reservationTtlSeconds` configuration.
- `research-schema`: the `entry_reservations` table, its indexes, its RLS posture, and the
  `claim_entry_reservations` function, with the same deny-all + named-constraint guarantees as
  every research table.

## Impact

- `supabase/migrations/20261004130000_entry_reservations.sql` (new): table, indexes, RLS,
  claim function. Applies under PGlite in CI like every migration.
- New `EntryReservationsRepository` seam (`claimReservations`, `releaseReservation`) with a
  Supabase RPC implementation and in-memory fakes; `AllocationDependencies` gains it.
- `allocateBatch`: claim-then-backfill loop around the unchanged selection rule; release call
  in `validation-actions-core` after successful insert (failure-swallowed by design).
- `allocationConfigSchema` gains `reservationTtlSeconds` (default 1800, hard-max bounded like
  `batchSize`).
- Tests: RPC semantics in PGlite (conflict, expiry-reclaim, release, no-watcher laziness);
  service race test with a barrier-controlled fake proving no double-grant under forced
  interleaving; shortfall/backfill and contention-collapse cases; can-fire probes on the claim
  call and the release call.
- Deferred by design: production deployment (owner Vercel auth), real-flow verification
  (production test-data strategy decided: run against the live project), adjudication
  (Phase 12).
