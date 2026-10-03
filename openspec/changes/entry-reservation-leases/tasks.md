# Tasks

## 1. Migration and row-level guarantees

- [x] 1.1 Write `supabase/migrations/20261004130000_entry_reservations.sql`: `entry_reservations`
  (`entry_id` PK + FK with cascade, `validator_id` FK with cascade, `reserved_at`,
  `expires_at`), validator + expiry indexes, RLS enabled with no public policies, and
  `claim_entry_reservations(validator_id, entry_ids, ttl_seconds)` deleting expired rows over
  the candidates then inserting with `ON CONFLICT DO NOTHING`, returning granted ids. Plain
  PostgreSQL only. Verify: the file applies under the PGlite harness with the existing suite
  green.
- [x] 1.2 Prove the migration's guarantees in `tests/integration/`: simultaneous-claim
  arbitration (second claim skipped), expired reclaim without a watcher (backdated row
  reclaimed by time comparison), unexpired block (row unchanged), deny-all RLS posture for the
  new table matched by named policy/code like the existing tables. Verify: the new file passes
  and the whole integration project stays green.
- [x] 1.3 Prove the migration test can fail: drop the `ON CONFLICT` clause (or the expiry
  predicate) in a scratch copy — never the committed file — and confirm the arbitration test
  reds by name. Restore and re-verify green. Record the counts.

## 2. Repository seam and configuration

- [x] 2.1 Add `EntryReservationsRepository` (`claimReservations`, `releaseReservation`) with a
  Supabase RPC implementation, in-memory fakes, and `reservationTtlSeconds` (default 1800,
  hard-max bounded) in `allocationConfigSchema`. Verify: `pnpm run typecheck` exits 0.
- [x] 2.2 Update `tests/unit/batch.test.ts` for the new key (default, bounds, closed key set)
  and prove the closed set still fires by re-adding a stray key in a probe. Verify: green.

## 3. Service claim loop and release

- [x] 3.1 In `allocateBatch`: claim the selected ids via the new seam, backfill shortfalls by
  re-selecting excluding granted ids (at most two extra rounds), persist the batch from granted
  ids only, collapse to `exhausted` when nothing grants. In `validation-actions-core`: delete
  the submitter's row after successful insert, swallowing release failure with an operator log.
  Verify: `pnpm run typecheck` exits 0.
- [x] 3.2 Add service tests: second simultaneous request granted nothing twice (barrier fake
  forcing interleaving — deterministic, no timing); shortfall backfill fills from remaining
  candidates; contention-collapse reports `exhausted` with no batch; release called after
  successful insert and submit still recorded when release throws. Verify: the file passes.
- [x] 3.3 Prove the claim path can fail: bypass the claim call (grants assumed), confirming the
  race test reds by name. Restore byte-identical (sha256-checked) and record the counts.

## 4. Whole-project verification

- [x] 4.1 Run `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run test:unit`,
  `pnpm run test:dom`, `pnpm run test:integration`, and `pnpm run build`, recording real output.
  Verify: all exit 0 with the figures read back, not inferred.
- [x] 4.2 Confirm `openspec validate --specs --strict` is **still 19** — the deltas live only
  under `openspec/changes/`, so a rise before the Sync is a leak. Confirm the new migration
  applies in filename order with the existing set (integration run proves it).
- [x] 4.3 State what is proven vs assumed in the PR body: forced-interleaving service race +
  sequential RPC semantics are measured; true wire-level concurrent racing and PostgREST-layer
  behavior are not observed here. Do not convert either into the other.

## 5. Ledger

- [x] 5.1 Update `docs/ROADMAP.md` Project Status (`Current OpenSpec change`, `Lifecycle state`;
  archived count word untouched) and verify `tests/unit/ledger-integrity.test.ts` passes.
- [x] 5.2 Re-scan edited status rows for table shape (3 pipes), NUL bytes, and replacement
  characters before committing.
