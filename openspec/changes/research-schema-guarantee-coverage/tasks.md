# Tasks

## 1. Establish the two gaps by measurement, not by inheritance

- [x] 1.1 Locate every normative sentence in the in-force specs that asserts a guarantee, and find
      the ones no scenario covers. Re-derived by enumerating `SHALL NOT be reversed` across all
      eight in-force specs rather than trusting the ledger's summary.
- [x] 1.2 Enumerate what `The database independently enforces research-integrity rules` claims the
      database enforces, and check `batch_entries.position` against that list. It is absent from the
      enumeration and from all eleven scenarios, which is gap 2.
- [x] 1.3 Probe whether a test catches a **reversal** of the statement order in
      `20260930160000_required_bilingual_translations.sql`, to establish whether gap 1 is a missing
      guard or a missing scenario. Result: **RED, 7 failed | 6 passed (13)** against a **13 passed
      (13)** control, so a guard exists and the gap is the scenario.
- [x] 1.4 Enumerate `tests/integration/allocation-migration.test.ts` and confirm the 13 tests cover
      the position constraints and the migration's refusals, so gap 2 is a specification gap rather
      than an untested one.

## 2. Trace every scenario to a named test before writing it

- [x] 2.1 Build the scenario-to-test table in `design.md` §D1, covering all ten scenarios to be
      added. A row that could not be filled would have stopped this change.
- [x] 2.2 Confirm each trace names a test asserting the thing claimed, not something adjacent.

## 3. Write the delta

- [x] 3.1 Build the `research-schema` delta **by script**, inserting into the real in-force text
      rather than retyping it, because `openspec`'s delta validator treats a renamed scenario as a
      dropped one and a hand edit can do that invisibly.
- [x] 3.2 Prove each `MODIFIED` block is insertion-only: remove the inserted strings and require the
      original back byte for byte.
- [x] 3.3 Prove every pre-existing scenario heading survives verbatim and in the same relative
      order: 21 kept, 10 added, 0 renamed.
- [x] 3.4 Add the ordering scenario to the bilingual requirement, worded to claim a **named
      refusal** rather than an "enforced order", because rollback cannot enforce order and a
      scenario claiming enforcement would be unfalsifiable.
- [x] 3.5 Extend the bilingual requirement's text to say the guarantee lives in the migration's own
      SQL, not in transaction rollback.
- [x] 3.6 Extend the enforcement requirement's enumeration with the `position` guarantees.
- [x] 3.7 Add an **acceptance** scenario for each new constraint, so a constraint that refused
      everything could not pass every rejection test.
- [x] 3.8 Add the position migration's own requirement, mirroring the bilingual requirement's shape
      for its own migration: refuses over pre-existing rows, leaves no trace, refuses by name when
      the column already exists.
- [x] 3.9 `openspec validate research-schema-guarantee-coverage --strict` exits 0.

## 4. Record the scope decision

- [x] 4.1 Name gap 2 in `proposal.md`, `design.md` §D6, and the pull request, so absorbing it is a
      visible decision rather than silent drift.
- [x] 4.2 Record the measured observation about the reversed-plus-conflicting-row case, so a reader
      does not mistake the narrow ordering scenario for an oversight.
- [x] 4.3 Update the status ledger to name both gaps and to note that gap 2 is a defect in the
      `coverage-aware-allocation` change merged immediately before this one.

## 5. Sync

- [ ] 5.1 Relax the sync script's guard that refuses a scenario added inside a `MODIFIED` block,
      keeping the loss guard absolute: additions permitted, renames and removals still refused.
- [ ] 5.2 Sync the delta into `openspec/specs/research-schema/spec.md`, extracting text from the
      approved delta rather than retyping it.
- [ ] 5.3 Verify the resulting requirement and scenario counts, and that no pre-existing scenario
      heading was lost or renamed.
- [ ] 5.4 `openspec validate --specs --strict` exits 0, and `pnpm run format:check` exits 0.

## 6. Archive

- [ ] 6.1 Verify the sync landed for all three requirements before moving the change, comparing each
      delta block against its in-force counterpart.
- [ ] 6.2 Move the change to `openspec/changes/archive/` with `git mv`, and confirm `openspec list`
      reports no active changes.
- [ ] 6.3 Record the merge commits and the verification evidence in the status ledger, then set the
      next eligible objective.
