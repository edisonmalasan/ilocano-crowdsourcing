# Tasks

## 1. Service exclusion

- [x] 1.1 In `allocateBatch`, read the attempt's batches via the existing
  `batches.listForRecovery(validatorId)` alongside the answered-ids read, union the assigned
  entry ids into the exclusion set, and pass the merged set to the unchanged `selectBatchEntries`.
  Verify: `pnpm run typecheck` exits 0.
- [x] 1.2 Add service tests: a second Continue in one attempt over the same pool is served no
  entry its first batch still holds; an entry assigned-but-unanswered stays excluded while an
  unassigned incomplete entry is served; two attempts drawing from one pool still overlap freely.
  Verify: the file passes.
- [x] 1.3 Prove the exclusion can fail: remove the union (answered-only exclusion), confirming the
  double-Continue test reds by name while the cross-attempt overlap test stays green. Restore
  byte-identical (sha256-checked) and record the counts.
- [x] 1.4 Add the remainders-only exhaustion test: every incomplete, unanswered entry assigned to
  the attempt's own batches → `exhausted`, and no batch persisted. Verify: it passes and reds
  when the exclusion is bypassed.

## 2. Recovery untouched

- [x] 2.1 Run the batch-recovery suites unchanged and confirm the recovery offer, lookup
  ordering, and resume path behave exactly as before. Verify: `recovery-actions`,
  `recovery-flow`, `batch-recovery`, and `start-batch-flow` suites pass with no edits.
  (The task as written named `start-batch.test.tsx`, which does not exist; the suite that
  covers that surface is `start-batch-flow.test.ts`, run instead and recorded here.)
- [x] 2.2 Assert the shared read: allocation's new batch read and recovery's lookup read the same
  `listForRecovery` rows (record the call in the service fake and compare inputs). A second
  recognition implementation would be the drift this design forbids.

## 3. Whole-project verification

- [x] 3.1 Run `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run test:unit`,
  `pnpm run test:dom`, `pnpm run test:integration`, and `pnpm run build`, recording real output.
  Verify: all exit 0 with the figures read back, not inferred.
- [x] 3.2 Confirm `openspec validate --specs --strict` is **still 19** — the delta lives only
  under `openspec/changes/`, so a rise before the Sync is a leak.
- [x] 3.3 Confirm no migration was added or edited and no route, action, or repository interface
  changed: `git diff --name-only` over the branch touches no file under `supabase/migrations/`
  and no `*-repository.ts` interface gains a method. Record the empty output.

## 4. Ledger

- [x] 4.1 Update `docs/ROADMAP.md` Project Status (`Current OpenSpec change`, `Lifecycle state`;
  archived count word untouched) and verify `tests/unit/ledger-integrity.test.ts` passes.
- [x] 4.2 Re-scan edited status rows for table shape (3 pipes), NUL bytes, and replacement
  characters before committing.
