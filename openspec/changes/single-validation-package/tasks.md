# Tasks

## 1. The shared completion predicate

- [ ] 1.1 Add one exported pure predicate over an entry's stored responses returning a boolean,
      beside `isQualifyingValidation` in `src/lib/domain/validation-response.ts`, and leave
      `isQualifyingValidation` and `countQualifyingValidations` **unchanged**. Verify:
      `pnpm run typecheck` exits 0 and a new unit test proves one qualifying response returns true,
      many qualifying responses return true, and zero / `cannot_evaluate` / partial / missing-a-
      translation all return false.
- [ ] 1.2 Add unit tests that the predicate is independent of the number of responses and of the
      number of distinct validators, so that a reader can see the count plays no part. Verify: the
      new cases pass, including an entry with fifty qualifying responses asserted complete.
- [ ] 1.3 **Prove the new predicate's guards can fail.** Probe: replace the predicate's body with
      `return false` and confirm its own tests go red with the tests' names, and confirm
      `isQualifyingValidation`'s existing tests stay green — a new shared predicate that no
      mutation can redden is a claim, not a guard. Record the measured failure counts in the PR.

## 2. Remove the independent-validation target from the schema

- [ ] 2.1 Delete `INDEPENDENT_VALIDATION_TARGET_DEFAULT`, `INDEPENDENT_VALIDATION_TARGET_HARD_MAX`,
      the `independentValidationTarget` key from `allocationConfigSchema`, and rewrite the module
      header so it describes `batchSize` as the only research parameter. Verify: `pnpm run typecheck`
      exits 0.
- [ ] 2.2 Because `allocationConfigSchema` is a `strictObject`, deleting the key makes any caller
      still passing it a **type error rather than a silent strip**. Verify: before fixing the call
      sites, `pnpm run typecheck` exits non-zero and names the stale property — recorded as the
      measurement that the boundary caught them rather than that they happened to be caught.
- [ ] 2.3 Update `tests/unit/batch.test.ts`: delete the assertions that the default is `3` and that an
      over-maximum target is rejected, and assert that `allocationConfigSchema.parse({})` yields only
      `batchSize`. Verify: the file passes and the closed-key property is asserted by an exact
      `Object.keys` set so a re-added key fails the test rather than going unnoticed.

## 3. Allocation over incomplete entries

- [ ] 3.1 Change `selectBatchEntries` in `src/lib/domain/allocation.ts` to take completed entry ids
      instead of a coverage map plus a target, drop the coverage grouping, shuffle the eligible
      remainder with the supplied `random`, and truncate to `size`. Update the header so it no longer
      describes a three-rule ordering. Verify: `pnpm run typecheck` exits 0.
- [ ] 3.2 Update `src/lib/allocation/allocate-batch.ts` (`coverageByEntry` and the call at line ~266)
      and `src/lib/allocation/actions.ts` so nothing reads
      `dependencies.config.independentValidationTarget`. Verify: a repository-wide search for
      `independentValidationTarget` returns no hits outside this change's artifacts, and the result
      is recorded in the PR body rather than asserted in prose here.
- [ ] 3.3 Update `tests/unit/allocation.test.ts` and `tests/unit/allocation-service.test.ts`:
      replace the target-based retirement cases with completion-based ones, delete the case asserting
      the configurable target, and **keep** the determinism case (same inputs and same supplied
      randomness produce the same order) and the random-source case. Verify: both files pass.
- [ ] 3.4 Add a test that an entry retired by one qualifying response stays out of the pool when more
      qualifying responses arrive, and that an entry whose only responses are `cannot_evaluate` is
      still offered after many of them. Verify: the tests pass and **can fire** — deleting the
      retirement predicate reds the first and the completion check reds the second.

## 4. Dashboard figures

- [ ] 4.1 Replace `CoverageBuckets` in `src/lib/admin/dashboard.ts` with the complete/incomplete
      partition, delete `DashboardOverview.coverageTarget` and `EntryReview.coverageTarget`, delete
      the default parameters on `loadDashboardOverview` and `loadEntryReview`, and derive the
      partition from the shared predicate. Verify: `pnpm run typecheck` exits 0.
- [ ] 4.2 Update `src/app/researcher/(protected)/overview.tsx` and `entries/[id]/entry-review.tsx`
      to drop the "N of N" labels. Verify: `tests/unit/dashboard-views.test.tsx` passes after its
      `Coverage complete (3 of 3)` assertion is replaced by an assertion that **no** figure renders a
      target.
- [ ] 4.3 Update `tests/unit/dashboard-service.test.ts` for the new partition, and add a case where
      one qualifying response among several non-qualifying ones makes the entry complete. Verify: the
      file passes and the new case reds when the predicate is bypassed.

## 5. Export

- [ ] 5.1 In `src/lib/export/records.ts`, compute `coverage_complete` from the shared predicate,
      delete `EntrySummary.coverage_target` and `ExportSummary.generated_from.coverage_target`, and
      delete the `coverageTarget` parameter of `buildExportSummary`. Verify: `pnpm run typecheck`
      exits 0.
- [ ] 5.2 Update `scripts/export-research.ts`: remove the `--coverage-target` option, the
      `coverageTarget` plumbing, and the summary line's `coverage target N`. Verify: the command's
      tests pass and its `--help` output no longer mentions a target.
- [ ] 5.3 Update `tests/unit/export-records.test.ts` and `tests/unit/export-command.test.ts`:
      delete every `coverage_target` assertion and add a case asserting the field is **absent** from
      the emitted summary, so the removal is asserted rather than merely unasserted. Verify: both
      files pass.

## 6. Cross-consumer agreement

- [ ] 6.1 Rewrite the second ladder implementation in
      `tests/unit/cross-consumer-consistency.test.ts` (lines ~197-208) to compare the
      complete/incomplete partition instead of the 0/1/2/3 buckets, and delete its `TARGET`
      constant. Verify: the file passes.
- [ ] 6.2 Prove the agreement check can fail in **both directions**: alter the dashboard's partition
      so it disagrees with the export, and separately alter the export's, confirming each reds the
      check with the differing figure named. Restore byte-identically and record the measured result.

## 7. Remaining consumers and stale text

- [ ] 7.1 Edit `openspec/specs/batch-recovery/spec.md`'s Purpose directly — **deltas cannot express a
      Purpose change**, which is why this step exists and why there is no `batch-recovery` delta file.
      Replace "has already reached the coverage target" with the completeness condition. Verify: the
      file contains no occurrence of "coverage target", checked by reading the committed bytes.
- [ ] 7.2 Update `tests/unit/domain-types.test.ts` so the closed `AllocationRequest` key set excludes
      any target field, and `tests/unit/allocation-actions.test.ts` so no fixture carries one.
      Verify: both pass and the type-layer pin still fails `typecheck` when a target field is
      re-added — probed, not assumed.
- [ ] 7.3 Repository-wide sweep for surviving references to the retired model: the identifiers
      `INDEPENDENT_VALIDATION_TARGET`, `independentValidationTarget`, `coverageTarget`,
      `coverage_target`, and the phrases "coverage target", "independent validation target",
      "3 qualifying", and "three validators". **Every hit is either fixed or listed in the PR body with
      its reason.** Verify: the sweep output is pasted into the PR body; a sweep that reports nothing
      is reported as nothing found, never as "clean" without the command shown.
- [ ] 7.4 Confirm no migration was added or edited: `git diff --name-only` over the branch touches no
      file under `supabase/migrations/`. Verify: the command's empty output is recorded, and
      `tests/integration/immutable-dataset.test.ts` plus the research-schema integration suite still
      pass unchanged.

## 8. Whole-project verification

- [ ] 8.1 Run `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run test:unit`,
      `pnpm run test:dom`, `pnpm run test:integration`, and `pnpm run build`, and record the real
      output of each. Do not convert a green build into a claim that behaviour passed.
- [ ] 8.2 Confirm `openspec validate --specs --strict` is **still 18** — this change adds
      `entry-completion` as a *delta*, so the in-force count must not rise until the Sync. A rise
      before the Sync is a delta written to the wrong path.
- [ ] 8.3 Record the boundary explicitly in the PR body: the dashboard figure list and the RAW
      RESEARCH RESPONSES / FINAL VALIDATED DATASET export split belong to
      `completion-metrics-and-export`, and attempt-scoped allocation to `attempt-scoped-allocation`.
      This change leaves the dashboard with **fewer** figures than the thesis team approved; that is
      a known temporary state, not an oversight.

## 9. Ledger

- [ ] 9.1 Update `AGENTS.md`'s attribution sentence so `single-validation-package` is recorded as
      the change implementing completion semantics and allocation over incomplete entries, and
      `completion-metrics-and-export` as the change implementing the dashboard figures and both
      exports — replacing the sentence that currently describes both as not yet implemented.
- [ ] 9.2 Correct the stale sentence at `AGENTS.md:473-476`, which says
      `countQualifyingValidations` "has no production caller yet"; it has four.
- [ ] 9.3 Update `docs/ROADMAP.md`'s Project Status and Next eligible objective. Verify:
      `pnpm run test:unit tests/unit/ledger-integrity.test.ts` passes, and the archived-change count
      word is left untouched because this change is not archived until a later stage.