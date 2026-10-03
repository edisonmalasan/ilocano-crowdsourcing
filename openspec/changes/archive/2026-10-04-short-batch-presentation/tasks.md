# Tasks

## 1. Short-batch session regression (9-entry batch)

- [x] 1.1 Extend `tests/unit/validation-session.test.ts` (or a sibling suite that
  imports the production `resolveSessionEntry`) with a 9-placement batch:
  total is 9; positions resolve 1..9 in order; completed/remaining counts sum
  to 9; completing all 9 returns null (finished); a completed entry is never
  re-presented; requesting position 10 with nothing completed presents
  placement position 1 with total 9 (fallback documented in `design.md` D4).
  Verify: green, and red when the fixture is widened to 10 (total follows the
  fixture) and when a duplicate id is introduced (uniqueness assertion names
  it).
- [x] 1.2 Assert the finished figures use the actual size: through
  `openValidationSession` with recording fakes, a fully-completed 9-entry
  batch reports `finished` with `completedCount` 9 and `total` 9. Verify:
  green; red when the service reads any configured constant instead.

## 2. Allocation short-batch under contention (no reservation change)

- [x] 2.1 Add `allocateBatch` cases with a denying `claimReservations` fake:
  10 requested, 9 granted after backfill; persisted batch has 9 rows,
  positions exactly 1..9, 9 unique ids, denied id absent; zero-grant still
  reports `exhausted` with no batch. Verify: green; red when backfill
  re-selects a denied id (duplicate appears) and when rounds are unbounded
  (loop does not terminate on persistent denial).
- [x] 2.2 Confirm no file under `src/lib/repositories/`,
  `supabase/migrations/`, or the claim loop changed except by test import:
  `git diff --name-only` names only tests, the change delta, and the ledger.
  Reservation exclusivity is preserved by exclusion, not by re-implementation.

## 3. Ledger and spec hygiene

- [x] 3.1 Confirm `openspec validate --specs --strict` is **still 19** (delta
  lives under `openspec/changes/`, no new capability) and no migration file
  was added or modified.
- [x] 3.2 Update `docs/ROADMAP.md` Project Status rows and verify
  `tests/unit/ledger-integrity.test.ts` passes.
