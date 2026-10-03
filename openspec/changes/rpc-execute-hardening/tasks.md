# Tasks

## 1. Migration

- [x] 1.1 Write `supabase/migrations/20261004140000_rpc_execute_hardening.sql` with five
  explicit `REVOKE ALL ON FUNCTION <signature> FROM anon, authenticated` statements covering
  exactly the measured set. Verify: applies under PGlite with the existing suite green.
- [x] 1.2 Grep every `client.rpc(` call site in `src/` and record that no legitimate caller uses
  anon/authenticated for any of the five functions. Verify: the list is pasted into the PR body;
  an empty grep discipline is stated, not assumed.

## 2. Tests

- [x] 2.1 Add integration coverage: `has_function_privilege` false for anon/authenticated on all
  five functions post-migration, plus source-text parity between the migration's function set
  and the test's function set. Verify: green, and red on a reverted migration (temporarily
  comment one revoke in a scratch run — never the committed file — and confirm the set test
  names the missing function).
- [x] 2.2 Confirm `openspec validate --specs --strict` is **still 19** and no migration file
  was modified in place (only added).

## 3. Ledger

- [x] 3.1 Update `docs/ROADMAP.md` Project Status rows and verify
  `tests/unit/ledger-integrity.test.ts` passes.
