# Tasks

Every task below names the evidence that closes it. A box ticked without that evidence is not closed.

## 0. Scope decisions taken before implementation

- [ ] 0.1 Confirm by reading `selectBatchEntries` that an abandoned batch's unanswered entries stay
  allocatable, and that the proposal's framing follows the code rather than the intuitive story.
  **Evidence:** the `answeredEntryIds` and coverage filters are the only two exclusions, quoted in the
  proposal.
- [ ] 0.2 Confirm `/validate/[batchId]` already resumes, so no resume logic is written. **Evidence:**
  `resolveSessionEntry` returns the first unanswered placement when no position is requested, and a test
  asserting a re-opened batch presents the first gap.
- [ ] 0.3 Confirm `validation_batches` has exactly `id` and `validator_id`. **Evidence:** read from the
  migration, and from an integration test asserting the column set.
- [ ] 0.4 Confirm the change adds one capability and modifies zero, by searching `openspec/specs/` for
  interruption, resumption, and batch age. **Evidence:** the search and its result recorded here;
  `research-schema`'s deferral quoted as the forward permission, not a breach.

## 1. The one new column, by forward migration

- [ ] 1.1 Add `created_at timestamptz` to `public.validation_batches`, nullable, backfilled, then set
  `NOT NULL` — forward only, with a precondition that raises by name if the column already exists so a
  re-application is loud rather than a duplicate-column error.
- [ ] 1.2 Add the access path `(validator_id, created_at DESC, id DESC)`, stating on reasoning (no project
  exists to measure on) that the existing `validation_batches_validator_id_idx` cannot serve the ordering.
- [ ] 1.3 Add integration coverage: the column exists and is `NOT NULL`; a row inserted without it is
  refused; ordering by `created_at DESC, id DESC` is total when two rows share a timestamp.
- [ ] 1.4 **Control required:** reverse the precondition in a scratch copy and prove the migration goes red
  by name, not by an incidental error.

## 2. Recognition, as a pure function

- [ ] 2.1 A pure function that takes a validator's batches with their entries plus the validator's
  answered entry ids, and returns the most recently created interrupted batch with remaining and total
  counts, or the explicit *none* outcome.
- [ ] 2.2 Cover: one interrupted batch; several, resolving to the most recent; a tie on `created_at` broken
  by `id`; a fully answered batch never offered; a batch whose entries are all answered in a *different*
  batch still counts the shared entries as answered.
- [ ] 2.3 **No database.** Pure, like `selectBatchEntries`, so the rule is testable without a connection.

## 3. The repository read

- [ ] 3.1 Add the method to `BatchesRepository` for a validator's batches in `created_at DESC, id DESC`
  order, and its operation name to the `RepositoryOperation` union so the existing `satisfies` assertion
  fails `typecheck` if either is missing.
- [ ] 3.2 Reuse the existing answered-entry read; do not add a second way to ask which entries are
  answered.
- [ ] 3.3 Unit coverage against the recording fake for the **filters and ordering it was handed** — and a
  stated limit that this proves the query and not PostgREST's wire behaviour, as every repository test in
  this project does.
- [ ] 3.4 **Can-fire control required:** the ordering argument must go red when reversed, proved by a
  failing mutation and not by inspection.

## 4. Server authority over the lookup

- [ ] 4.1 A Server Action taking the anonymous identifier only. **No batch-id parameter exists** — see D9.
- [ ] 4.2 Re-check the identifier against enrolled validators, returning the same refusal as every other
  validator-keyed operation.
- [ ] 4.3 Three modelled outcomes: interrupted batch, explicit *none*, explicit *unavailable*. A repository
  failure maps to *unavailable* as a typed error boundary, never swallowed into *none*.
- [ ] 4.4 A pure decision function mapping the three outcomes to what the screen shows, so the branches are
  testable with no DOM and no database.
- [ ] 4.5 **Can-fire control required:** the identity re-check must go red when removed.

## 5. The screen, on `/validate`

- [ ] 5.1 The lookup is issued on mount from the existing `StartBatch` island. `Start a batch` is **never**
  disabled, delayed, or removed by it (D3).
- [ ] 5.2 The resume affordance is a `next/link` to the batch's own address, with no handler and no write
  (D6).
- [ ] 5.3 While the lookup is in flight and after it reports *unavailable*, the screen renders exactly as
  it does with *none* — the same markup, not a second branch that happens to look the same (D4).
- [ ] 5.4 The counts read as **remaining** entries, never answered ones and never a contribution total
  (D7).
- [ ] 5.5 DOM coverage that the resume link exists when a batch is offered, does not exist otherwise, and
  that pressing `Start a batch` still issues its allocation request while a resume offer is on screen.
- [ ] 5.6 **Can-fire control required:** deleting the resume affordance must turn 5.5 red.

## 6. What the offer may reveal

- [ ] 6.1 The recovery outcome type carries **exactly** the batch id, remaining, and total — pinned at the
  type layer so a fourth field fails `typecheck`, with the accompanying prose assertion that the pin alone
  is defeatable.
- [ ] 6.2 No proficiency, no screening answer, no activity timestamp, and no other batch's existence
  appears in the offer or the batch it leads to.

## 7. Localization

- [ ] 7.1 Add every new key to **both** catalogs, and derive catalog key-set parity from the English
  catalog rather than from a list the test invents.
- [ ] 7.2 Re-run the copy test that compares catalog values against the 600 real instructions, bilaterally,
  so no Ilocano instruction or place name can appear in either catalog.

## 8. Verification

- [ ] 8.1 `pnpm run lint`, `format:check`, `typecheck`, the three test projects, and `build`, each actually
  run and read back.
- [ ] 8.2 The dataset guard scoped to its own file: `pnpm exec vitest run --project integration
  tests/integration/immutable-dataset.test.ts` must report 1 file / 7 tests.
- [ ] 8.3 `openspec change validate interrupted-batch-recovery --strict`.
- [ ] 8.4 An independent verification pass comparing the implementation against this delta, per the
  orchestration rules. **A ticked box in this file is not evidence for any of the above.**

## 9. Ledger

- [ ] 9.1 `## Project Status` moved to the Propose state, with the branch, the change, and the next
  objective — every SHA resolved and proved an ancestor of `origin/main` before it is written.
- [ ] 9.2 The design's framing decision recorded where a future reader will look for it: **this change is
  not a data-loss fix, and the measurement that shows so is in `proposal.md`.** That is the line most
  likely to be misremembered as a rescue, which is exactly why it belongs in the ledger rather than only in
  a proposal nobody will reread.
