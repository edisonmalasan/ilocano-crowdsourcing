# Tasks

## 1. The pure selection rule

- [x] 1.1 Add `src/lib/domain/allocation.ts` exporting `selectBatchEntries`, which takes the
      candidate pool, the already-answered entry ids, the per-entry qualifying coverage, the
      configured `independentValidationTarget`, the effective size, and a required
      `random: () => number` source; it groups eligible entries by qualifying count, iterates the
      groups in ascending count, shuffles each group with Fisher–Yates, concatenates, and returns at
      most `size` entries. Verify: the module imports nothing from the schema layer, and
      `pnpm run typecheck` passes.

      > **Correction, applied during Apply.** This task originally enumerated five inputs and omitted
      > `independentValidationTarget`, while task 1.2 below requires a test proving "entries at the
      > target are excluded" — which is unsatisfiable without that parameter. The omission was in the
      > task, not a licence to weaken the test, so the parameter was added and this enumeration
      > corrected rather than the test dropped. Recorded because a checklist that misdescribes a
      > signature is worse than one that is silent.
- [x] 1.2 Unit-test the ordering: an entry already answered is excluded; entries at the target are
      excluded; every lowest-coverage entry precedes every higher-coverage entry; a partially filled
      lowest-coverage group is topped up from the next group rather than returning a short batch;
      and a batch is short only when the eligible pool is smaller than the requested size. Verify:
      `pnpm exec vitest run --project unit tests/unit/allocation.test.ts` passes.
- [x] 1.3 Unit-test the randomization: equal-coverage entries are not returned in input order, a
      fixed `random` source yields a specific expected permutation, and a constant-`0` source
      produces a known non-identity ordering (so a shuffle that silently does nothing fails). Verify:
      the same unit file passes.
- [x] 1.4 Add `@ts-expect-error` type-level assertions in `tests/unit/domain-types.test.ts`
      proving `selectBatchEntries` cannot be called without its random source, and that omitting the
      coverage argument is a type error. Verify: `pnpm run typecheck` passes, and the assertions
      fail the type-check if the parameter is ever made optional.

## 2. The persistence seam

- [x] 2.1 Add `src/lib/repositories/batches-repository.ts` with a `BatchesRepository` exposing
      `create` (a batch plus its ordered entries, in one call) and `findById`; export it from
      `src/lib/repositories/index.ts`; add the matching operation names to the `RepositoryOperation`
      union in `errors.ts` and entries to the map in `operations.ts`. Verify: `pnpm run typecheck`
      fails if the interface gains a method without a corresponding operation, and passes when both
      are present.
- [x] 2.2 Add `listForEntries` and `listEntryIdsForValidator` to `ValidationsRepository` with
      operation names and map entries. `listForEntries` SHALL be documented as returning every stored
      response for the pool without filtering, because filtering by the qualifying rule is the
      domain predicate's job and a repository that pre-filtered would be a second implementation of
      it. Verify: `pnpm run typecheck` passes and `tests/unit/repositories.test.ts` compiles the
      updated fake.
- [x] 2.3 Unit-test that `countForEntry` and `countForValidator` remain distinct raw
      distinct-validator diagnostics, with no allocation-facing method added to
      `DatasetEntriesRepository`. Verify: `pnpm exec vitest run --project unit
      tests/unit/repositories.test.ts` passes.

## 3. The forward migration

- [x] 3.1 Add `supabase/migrations/<timestamp>_allocation_batch_positions.sql`: add
      `batch_entries.position integer`, raise before altering if any `batch_entries` row already
      exists (naming the conflict and stating the order is unrecoverable and will not be invented),
      then set `not null` with a `> 0` check and a unique constraint on `(batch_id, position)`.
      Verify: the file applies cleanly inside the PGlite harness in filename order.
- [x] 3.2 Integration-test the migration: it applies after both existing migrations; a zero or
      negative position is rejected by the named `check` constraint; two entries in one batch cannot
      share a position; the same position in two different batches is allowed; and the refusal fires,
      naming the conflict, when a `batch_entries` row is inserted first. Verify:
      `pnpm exec vitest run --project integration` passes with every rejection matched against a
      named constraint rather than a generic `check constraint` phrase.
- [x] 3.3 Probe-confirm that guard 3.1 is load-bearing, since no other constraint stands behind it:
      run a negative control (un-mutated file green), then delete the precondition block and confirm
      the refusal test goes red for that reason and no other. The probe must report a three-way
      GREEN/RED/DID-NOT-RUN outcome and refuse to score DID-NOT-RUN as red. Verify: the probe output
      names a real vitest summary line for both runs.
- [x] 3.4 Extend the existing content-hash guard so `20260930120000_research_schema.sql` and
      `20260930160000_required_bilingual_translations.sql` are each compared against a fixed
      constant derived from `main` via `git cat-file` (never a digest recomputed from the file under
      test), and assert the new migration is applied strictly after both. Verify:
      `pnpm exec vitest run --project integration tests/integration/migration-precondition.test.ts`
      passes, and a deliberate edit to either prior migration is rejected by that guard.

## 4. The Supabase implementations

- [x] 4.1 Add `src/lib/repositories/supabase/batches.ts` implementing `BatchesRepository`: insert the
      batch and its ordered `batch_entries` rows together, map rows to domain types, and raise
      `RepositoryError` naming the correct operation on failure rather than returning an empty
      result. Verify: `tests/unit/repositories-supabase.test.ts` drives it with a recording fake.
- [x] 4.2 Implement `listForEntries` and `listEntryIdsForValidator` in
      `src/lib/repositories/supabase/validations.ts`, reusing the existing row ⇄ domain translation
      so the NULL ⇄ absent rules for the correction and both translation columns are applied by
      already-tested code. `listEntryIdsForValidator` selects one column; `listForEntries` selects
      the ten columns of `ValidationResponse`. Verify: unit tests assert the selected columns, the
      `in` predicate, and that a stored `cannot_evaluate` row is returned to the caller unfiltered.
- [x] 4.3 Wire both into `factory.ts` and `supabase/index.ts`. Verify: `pnpm run lint` and
      `pnpm run typecheck` pass, and the compile-time member check in `factory.ts` still holds.

## 5. The allocation service and the Server Action boundary

- [x] 5.1 Add the outcome contract to `src/schemas/batch.ts`: an `AllocatedEntry` carrying only the
      fields needed to render an entry (id, category, instruction, origin, destination, transit
      mode — deliberately not `sourcePayload`, `createdAt`, or `isActive`), a closed
      `AllocationOutcome` union of `allocated` / `exhausted` / `failed`, and the failure reason set
      `invalid | unknown_validator | persistence | not_configured`. Verify: `pnpm run typecheck`
      passes and an `AllocatedEntry` cannot be constructed with `sourcePayload`.
- [x] 5.2 Add `src/lib/allocation/allocate-batch.ts`: confirm the validator exists, resolve the
      effective size with the existing `resolveBatchSize`, read the active pool, read the pool's
      responses once, reduce them with `countQualifyingValidations`, exclude the entries the
      validator already answered, call `selectBatchEntries`, persist the batch with 1-based
      positions, and map the result to `AllocatedEntry` values. Return `exhausted` when no eligible
      entry remains. Verify: unit tests against in-memory fakes.
- [x] 5.3 Unit-test the service: an entry whose stored responses are all `cannot_evaluate` is
      offered with zero coverage (this test fails if anyone substitutes `countForEntry` for the
      qualifying read); an entry at the configured target is not offered; an unknown validator yields
      `unknown_validator` and performs no write; an exhausted pool yields `exhausted` and is
      distinguishable from `persistence`; a successful allocation never returns zero entries; and
      the returned entries carry no `sourcePayload`. Verify: `pnpm exec vitest run --project unit`
      passes.
- [x] 5.4 Add `src/lib/allocation/allocation-actions-core.ts` and `actions.ts`, following the
      established split: the core is plain functions over injected dependencies that parse the
      intent through `parseWriteIntent` before building any dependency, and the `"use server"`
      wrapper only builds real dependencies and delegates. Verify: a core test asserts zero
      repository calls on a rejected payload, and a wrapper test drives it with the environment
      module throwing to prove the `not_configured` reason, mirroring
      `tests/unit/validators-actions-wrapper.test.ts`.

## 6. Whole-change verification and status

- [x] 6.1 Run the full verification surface and record the actual results: `pnpm run lint`,
      `pnpm run format:check`, `pnpm run typecheck`, `pnpm run test:unit`,
      `pnpm run test:integration`, `pnpm run build`,
      `openspec validate coverage-aware-allocation --strict`, and
      `openspec validate --specs --strict`. Verify: each command's exit code is read directly, and
      a failing `pnpm` is judged on `$LASTEXITCODE` rather than on the PowerShell
      `NativeCommandError` banner.
- [x] 6.2 Confirm nothing immutable moved: `git diff main -- supabase/migrations/20260930120000_research_schema.sql
      supabase/migrations/20260930160000_required_bilingual_translations.sql data/` is empty, and
      the dataset SHA-256 still matches the guard's expected digest. Verify: the immutability test
      file passes and the diff is empty.
- [x] 6.3 Update `AGENTS.md` and the `## Project Status` block in `docs/ROADMAP.md` to record what
      was executed, with each claim scoped to what it does and does not prove — in particular that
      no Supabase client was ever constructed and no screen was rendered. Verify: the diff shows the
      ledger updated and nothing else outside those two files.
