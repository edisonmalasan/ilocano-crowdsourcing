# Tasks

Every task below names the evidence that closes it. A box ticked without that evidence is not closed.

## 0. Scope decisions taken before implementation

- [x] 0.1 Confirm by reading `selectBatchEntries` that an abandoned batch's unanswered entries stay
  allocatable, and that the proposal's framing follows the code rather than the intuitive story.
  **Evidence:** the `answeredEntryIds` and coverage filters are the only two exclusions, quoted in the
  proposal.
- [x] 0.2 Confirm `/validate/[batchId]` already resumes, so no resume logic is written. **Evidence:**
  `resolveSessionEntry` returns the first unanswered placement when no position is requested, and a test
  asserting a re-opened batch presents the first gap.
- [x] 0.3 Confirm `validation_batches` has exactly `id` and `validator_id`. **Evidence:** read from the
  migration, and from an integration test asserting the column set.
- [x] 0.4 Confirm the change adds one capability and modifies zero, by searching `openspec/specs/` for
  interruption, resumption, and batch age. **Evidence:** the search and its result recorded here;
  `research-schema`'s deferral quoted as the forward permission, not a breach.

## 0.5 Corrections already made from the independent verification pass

An independent verifier re-derived all seven factual claims in the proposal and design from the source
rather than inheriting them. Most were confirmed; five defects were found and **corrected in the artifacts
before the proposal was merged**. They are listed here because a task list that records only the work still
to do is a worse record than one that records what was already wrong and is now right.

- [x] 0.5.1 The `UNIQUE (validator_id, dataset_entry_id)` claim attributed *re-asking* to the wrong layer.
  It forbids a second **recorded response**; what prevents an answered entry being **offered** again is the
  allocation filter, and `validations.ts` already documents the case where that filter runs short and the
  entries would be offered again. Corrected in `proposal.md` and `design.md`.
- [x] 0.5.2 The `created_at DESC, id DESC` tiebreaker was justified by a claim that is **false**: two
  batches minted by one validator in the same millisecond produce an *identical* id, which is a primary-key
  collision and a refused insert, not a tie. Replaced with two reasons that survive — `id` is unique by
  primary key so the order is total, and the backfill stamps every pre-existing row with one identical
  instant, which makes a real tie possible in the world rather than only hypothetically.
- [x] 0.5.3 "The lookup cannot be used to enumerate participants" was an overstatement. The identifier is
  32 bits of entropy and the lookup answers an existence question for any guess. Restated as the accurate,
  weaker claim: the platform already answers that question through `unknown_validator`, so this adds no
  **new kind** of oracle.
- [x] 0.5.4 The requirement that the offer "reveal no identifier" was **unsatisfiable**, because
  `defaultBatchId` embeds the validator's own anonymous id and the mandated resume link therefore renders
  it. Restated as "introduces no identifier beyond the one it leads to", with the acceptance and the
  out-of-scope alternative written down.
- [x] 0.5.5 The delta's Purpose generalised "`selectBatchEntries` excludes only answered entries" into "stay
  in the allocation pool", which is wrong: an inactive entry is out of the pool for everyone. The claim is
  now scoped to eligibility and the third exclusion is named.

## 1. The one new column, by forward migration

- [x] 1.1 Add `created_at timestamptz` to `public.validation_batches`, nullable, backfilled, then set
  `NOT NULL` — forward only, with a precondition that raises by name if the column already exists so a
  re-application is loud rather than a duplicate-column error.
  **Evidence:** `supabase/migrations/20261001120000_validation_batches_created_at.sql`, sha256
  `0945b2b6…`, the fourth migration and strictly after all three predecessors. The three steps are three
  separate statements — `add column created_at timestamptz;`, then the backfill, then `alter column
  created_at set not null` — and the file's own header states why a `not null default now()` one-liner was
  rejected: it would make the backfill invisible and reintroduce the database default the same file
  argues against two sections earlier. **The precondition's control is 1.4**, not this line.
- [x] 1.2 Add the access path `(validator_id, created_at DESC, id DESC)`, stating on reasoning (no project
  exists to measure on) that the existing `validation_batches_validator_id_idx` cannot serve the ordering.
  **Evidence:** `create index validation_batches_validator_created_at_idx on public.validation_batches
  (validator_id, created_at desc, id desc);`, with a header section titled "WHY A SECOND INDEX, ON REASONING
  RATHER THAN ON A MEASUREMENT" that declines to claim a speedup nobody can take. `id` is in the index
  DESCENDING to match, which is what makes the order total rather than merely stated, and there is no
  partial predicate because a partial index over "interrupted batches" would require the stored flag this
  change exists to avoid.
- [x] 1.3 Add integration coverage: the column exists and is `NOT NULL`; a row inserted without it is
  refused; ordering by `created_at DESC, id DESC` is total when two rows share a timestamp.
  **Evidence:** five named tests in `tests/integration/batch-recovery-migration.test.ts` — "exists, is a
  timestamp, and cannot be written without one" (`:170`), "refuses a batch row written without a creation
  instant, matched by column" (`:188`), "accepts a batch row written WITH a creation instant, so the refusal
  is not vacuous" (`:198`), "does not supply a default, so a missing instant is never silently invented"
  (`:212`), and the two ordering tests "breaks a tie on created_at by id, descending, so two tied rows have
  one order" (`:248`) and "puts a newer row first even when its id sorts earlier than the older row's"
  (`:268`). The non-vacuity arm is the one that matters: a refusal test with no accepting counterpart
  passes just as well against a constraint that refuses everything.
- [x] 1.4 **Control required:** reverse the precondition in a scratch copy and prove the migration goes red
  by name, not by an incidental error.
  **Evidence: measured, 2026-10-01, by `probe-precondition-control.mjs`.** The precondition's `if exists`
  predicate was made unsatisfiable by changing only the column name it looks for
  (`and column_name = 'created_at'` -> `'zzz_not_a_real_column'`, 30 chars -> 41, at offset 6887) — chosen
  over deleting the `do $$ … end $$;` block because it leaves the file otherwise byte-identical, so a red
  is attributable to the lost guard and not to a structural edit. Control GREEN at `20 passed (20)`;
  probe **RED `3 failed | 17 passed (20)`**, and the three failures are exactly the named-refusal tests at
  `:493`, `:537`, and `:568`. **The diagnostic is the finding, and it is the reverse of what 1.4 might have
  meant:** with the guard unable to fire, the error becomes
  `column "created_at" of relation "validation_batches" already exists` — the *incidental* duplicate-column
  failure — instead of the named `interrupted-batch-recovery:` message. So the named refusal is produced by
  this precondition and by nothing else, which is the property the task asks for. The migration was
  restored byte-identical at sha `0945b2b6…`, proved by hash rather than assumed.

## 2. Recognition, as a pure function

- [x] 2.1 A pure function that takes a validator's batches with their entries plus the validator's
  answered entry ids, and returns the most recently created interrupted batch with remaining and total
  counts, or the explicit *none* outcome.
  **Evidence:** `recognizeInterruptedBatch` at `src/lib/domain/batch-recovery.ts:275`, returning the
  `RecoveryRecognition` union (`:172`) built from `RecoverableBatch` (`:106`) and `InterruptedBatchOffer`
  (`:156`). *None* is a member of the union rather than a null, because the offer and the absence of one
  are different answers.
- [x] 2.2 Cover: one interrupted batch; several, resolving to the most recent; a tie on `created_at` broken
  by `id`; a fully answered batch never offered; a batch whose entries are all answered in a *different*
  batch still counts the shared entries as answered; **an empty batch row is not interrupted and does not
  fail the lookup.**
  **Evidence:** thirteen named tests in `tests/unit/batch-recovery.test.ts`, one per clause: the only
  interrupted batch (`:53`), most recent of several (`:68`), tie broken by identifier descending (`:82`),
  and — the one worth keeping — "chooses the same batch whichever order the rows arrived in" (`:98`), which
  pins *totalness* rather than a single lucky ordering. Never offered when all answered (`:122`); shared
  entries answered elsewhere (`:133`); the entry-less row (`:159`); a newer finished batch that must not
  mask an older interrupted one (`:187`) and its entry-less twin (`:214`); and "refuses to choose rather
  than picking silently when a creation instant is unreadable" (`:231`), which is the honest response to an
  unorderable input rather than a silent pick.
- [x] 2.3 **No database.** Pure, like `selectBatchEntries`, so the rule is testable without a connection.
  **Evidence:** measured, not asserted — `tests/unit/batch-recovery.test.ts` was searched for `supabase`,
  `createClient`, `pglite`, `PGlite`, and `server-only` and matched **nothing**; the only two hits for those
  terms are prose in the file's own header explaining why the domain rule is here and the query is not.
  This is the whole reason the coverage target is testable at all on a machine where all three
  `SUPABASE_*` variables are absent.
- [x] 2.4 The remaining count must be derived from the **validator's** answered set, not the batch's. Two
  wrong implementations are named here so neither is written by accident: counting only the responses whose
  `batch_id` equals this batch (a validator who answered an entry in an earlier batch would be shown it as
  remaining work, which is also a lie the allocation filter would then act on), and filtering to qualifying
  responses so a `cannot_evaluate` reappears as work. The guard must assert the **filter the application
  used**, and `lifetime-figure.test.ts` cannot be copied here — it writes its own SQL rather than exercising
  the query builder, which is the exact weakness recorded against it.
  **Evidence:** both wrong implementations are named by tests rather than only by comment. "counts an entry
  answered in ANOTHER batch as answered here" (`batch-recovery.test.ts:133`) is the first: a
  `batch_id`-scoped count returns *remaining* for that entry and the assertion fails. "counts a
  cannot_evaluate answer as answered, because the rule does not filter by evaluation" (`:145`) is the
  second: a qualifying-only filter re-surfaces the entry as work. **The filter is asserted where it is
  applied, not in the layer that fetches it** — `recovery-actions-core.ts:170-180` awaits the existing
  `listEntryIdsForValidator` and the comment there records that neither wrong implementation could be fixed
  in the domain, because both live in the read that fetches the set.

## 3. The repository read

- [x] 3.1 Add the method to `BatchesRepository` for a validator's batches in `created_at DESC, id DESC`
  order, and its operation name to the `RepositoryOperation` union so the existing `satisfies` assertion
  fails `typecheck` if either is missing.
  **Evidence:** `listForRecovery`, awaited at `recovery-actions-core.ts:171`. The union is not merely
  documented as covered — `repositories-supabase.test.ts` asserts it three separate ways, which is what makes
  the claim checkable rather than asserted: "pins every place the union and the method name disagree"
  (`:1878`), "gives every method of one interface its own operation name" (`:1892`), and "uses only names
  from the RepositoryOperation union" (`:1899`).
- [x] 3.2 Reuse the existing answered-entry read; do not add a second way to ask which entries are
  answered. **Evidence:** `recovery-actions-core.ts:179` calls the pre-existing
  `validations.listEntryIdsForValidator`, and the comment above it says so explicitly. Measured: searching
  the recovery path for `answeredEntryIds` / `listAnswered` / `findAnswered` returns **two** hits, both in
  that one file — the `Promise.all` that fetches it and the `new Set(...)` that consumes it. There is one
  way in this codebase to ask the question, and it selects one column.
- [x] 3.3 Unit coverage against the recording fake for the **filters and ordering it was handed** — and a
  stated limit that this proves the query and not PostgREST's wire behaviour, as every repository test in
  this project does.
  **Evidence:** eight tests in `repositories-supabase.test.ts` — "asks for this validator's batches, newest
  first, on BOTH keys in order" (`:1512`, the ordering claim itself), "reads the entries of exactly those
  batches, without asking for the stored order" (`:1559`), "normalises the instant, so the domain holds one
  representation whatever the server's offset" (`:1585`), "returns an entry-less batch with an empty list,
  rather than raising as findById does" (`:1603`), "groups entries onto the right batch, without reordering
  them" (`:1631`), "reads nothing about entries when the validator has no batches" (`:1658`), "names the
  recovery operation when either read fails" (`:1673`), and "refuses an unreadable creation instant rather
  than handing the rule a broken string" (`:1696`). **The stated limit is load-bearing and is repeated in
  `AGENTS.md`:** this file proves the filters and the order the repository was *handed*, against a
  recording fake. It proves nothing about PostgREST, and no Supabase client has ever been constructed in
  this repository, so nothing about the wire.
- [x] 3.4 **Can-fire control required:** the ordering argument must go red when reversed, proved by a
  failing mutation and not by inspection.
  **Evidence: measured, by `probe-new-assertions.mjs` ARM A** — the `id` comparison in the read's sort is
  reversed so equal-instant batches come back oldest-id-first. Control GREEN; probe **RED `1 failed | 16
  passed (17)`**, naming the ordering test. The same probe carries a can-fire control proving the
  arrangement can detect the defect at all. The probe prints the removed and inserted text and the mutant's
  own sha256 rather than its replacement, so the mutation it performed is stated rather than guessed at.
- [ ] 3.5 Decide and implement what an **entry-less batch row** does. `create` performs two writes with no
  transaction across them, so a batch with no entries is a known residue, and `findById` **raises** on one
  because `batchRecordSchema` requires at least one entry. A listing method must therefore either filter
  such rows out or return them as recognisably empty — it must not surface a row that a later
  `findById` turns into an exception. **Evidence:** a test inserting a real residue row through the
  production schema and asserting the lookup reports *none* rather than raising.
  **Decision (made, implemented, and partly evidenced):** the row is **returned as recognisably empty**,
  not filtered out. Two integration tests establish why filtering is the wrong answer: the residue row "is
  a LEGAL row: nothing in the production schema refuses a batch that has no entries" and "is RETURNED by
  two flat reads, which is why the implementation groups rows in JavaScript"
  (`batch-recovery-migration.test.ts:640`, `:651`), with a third recording that it "would VANISH under a
  joined select, which is the measured reason this read is not one" (`:690`). Dropping the row in the
  repository would be indistinguishable from a validator who never had a batch.
  **Left open, deliberately: the single test this line asks for was not written.** The named evidence was
  "a test inserting a real residue row through the production schema *and* asserting the lookup reports
  *none* rather than raising", and no such test exists. What exists instead is the chain in two halves, one
  per vitest project:
    - the **row** is real and legal — the four integration tests above, plus `:733` recording that it is
      precisely the row `findById` refuses, "so the two methods genuinely disagree";
    - the **lookup** treats it as no work — `repositories-supabase.test.ts:1603` proves the repository
      returns it with an empty list rather than raising, and `batch-recovery.test.ts:159` proves the
      recognition rule then reports *none*.
  **Why the halves cannot be joined, stated rather than left as an excuse:** the repository is written
  against the narrow hand-written client interface, and PGlite is a PostgreSQL engine reachable only through
  that interface's absence — there is no PostgREST in front of it, and no Supabase client has ever been
  constructed. Driving the *real* repository over a *real* residue row would need a network. So a single
  test asserting both at once is not currently writable in this repository, and the honest position is that
  the two halves are covered and their junction is inferred from the row's schema-level legality rather
  than executed. **This tick is therefore partial: the decision is made, implemented, and covered at both
  ends, and the one test that would execute the junction is outstanding.** It is recorded here rather than
  left for a reader to assume, because a ticked box that overstates its evidence is the exact defect this
  change's verification pass spent its whole budget removing.

## 4. Server authority over the lookup

- [x] 4.1 A Server Action taking the anonymous identifier only. **No batch-id parameter exists** — see D9.
- [x] 4.2 Re-check the identifier against enrolled validators, returning the same refusal as every other
  validator-keyed operation.
- [x] 4.3 Three modelled outcomes: interrupted batch, explicit *none*, explicit *unavailable*. A repository
  failure maps to *unavailable* as a typed error boundary, never swallowed into *none*. **Also:** the
  **wrapper** now catches and translates, which the first draft did not. Because `getServerEnv()` runs
  while building the argument, a missing credential never reaches the core, so without the `try` the
  action would *reject* — and the island calls it with `.then()` and no `.catch()`. D4 would then have
  been satisfied **by accident**: `outcome` would stay `null`, and `null` collapses to `none`. Nothing
  would have failed, and nothing would have failed on the next edit either.
  `tests/unit/recovery-actions-wrapper.test.ts` drives the real wrapper with the environment module
  throwing, which is the only path that runs in this repository — all three `SUPABASE_*` are absent.
- [x] 4.4 A pure decision function mapping the three outcomes to what the screen shows, so the branches are
  testable with no DOM and no database.
- [x] 4.5 **Can-fire control required:** the identity re-check must go red when removed. **Evidence:**
  control GREEN `10 passed`; deleting the `findById` read **and** its `null` early return → RED
  `3 failed | 7 passed (10)`; keeping the read and dropping only the early return → RED
  `1 failed | 9 passed (10)`. Both reds name the identity test, and the file was restored byte-identical
  (sha `21614d66…`). The second probe is the one that carries the claim: the first would also be red if
  the read were missing, so it cannot tell "re-checks the identity" from "calls a repository".

## 5. The screen, on `/validate`

- [x] 5.1 The lookup is issued on mount from the existing `StartBatch` island. `Start a batch` is **never**
  disabled, delayed, or removed by it (D3).
- [x] 5.2 The resume affordance is a `next/link` to the batch's own address, with no handler and no write
  (D6).
- [x] 5.3 While the lookup is in flight and after it reports *unavailable*, the screen renders exactly as
  it does with *none* — the same markup, not a second branch that happens to look the same (D4).
- [x] 5.4 The counts read as **remaining** entries, never answered ones and never a contribution total
  (D7).
- [x] 5.5 DOM coverage that the resume link exists when a batch is offered, does not exist otherwise, and
  that pressing `Start a batch` still issues its allocation request while a resume offer is on screen.
- [x] 5.6 **Can-fire control required:** deleting the resume affordance must turn 5.5 red. **Evidence:**
  control GREEN `15 passed`; deleting only the `<Link>` → RED `4 failed | 11 passed (15)`; deleting the
  whole conditional branch → RED `5 failed | 10 passed (15)`. Both mutations left the JSX balanced, and
  the second asserted that the span it removed contained every piece of the offer and **not** the start
  button, so the red is attributable rather than collateral.

## 6. What the offer may reveal

- [x] 6.1 The recovery outcome type carries **exactly** the batch id, remaining, and total — pinned at the
  type layer so a fourth field fails `typecheck`, with the accompanying prose assertion that the pin alone
  is defeatable.
- [x] 6.2 No proficiency, no screening answer, no activity timestamp, and no other batch's existence
  appears in the offer or the batch it leads to.
- [x] 6.3 The resume link's `href` carries the validator's anonymous identifier, because `defaultBatchId`
  embeds it. Assert that this is the **only** identifier rendered on the start screen beyond the one the
  participant's browser already holds — a closed assertion, not an absence check, since "no identifier
  appears" is already false and an absence test against it would pass for the wrong reason.
- [x] 6.4 Check `tests/unit/validation-routes.test.tsx`, which asserts `/validate` renders no
  `href="/validate/batch…"`. Real ids begin `VAL_`, so a resume link will not trip it, and the guard must be
  confirmed still meaningful rather than merely still passing. **Evidence — the guard was vacuous, and so
  was a second one beside it that nobody had read:**
  - The pattern `/href="\/validate\/batch/` cannot match a real batch href, because `defaultBatchId` mints
    `VAL_<identifier>-<instant>`. Repaired to `/href="\/validate\//` plus a derived named assertion.
  - **A sibling assertion in the same file, in the very next test, carried the identical vacuous
    pattern.** It had been recorded in the ledger as a pre-existing loose regex; the note described the
    symptom and not the cause. Repaired to assert the *start control's own tag* is a `<button>` with no
    `href` — a property of the element, so the resume `<Link>` above it cannot affect the result.
  - Four probes, all as expected, every file restored byte-identical. Control GREEN `58 passed`. With a
    real batch href injected into the island's server-rendered markup: the **old** guard GREEN
    `58 passed` — that green is the finding — and the **repaired** guard RED `1 failed | 57 passed`. Both
    old guards restored together GREEN; the repaired sibling guard RED when the start control is rendered
    as a link.
  - **The second repair is the more serious of the two.** A document-wide "no batch href" assertion is now
    a statement the *product contradicts* — a start screen with a resume offer legitimately carries one —
    while being too weak to notice. A guard in that position is worse than no guard, because the next
    author reads it as protection.

## 7. Localization

- [x] 7.1 Add every new key to **both** catalogs, and derive catalog key-set parity from the English
  catalog rather than from a list the test invents.
- [x] 7.2 Re-run the copy test that compares catalog values against the 600 real instructions, bilaterally,
  so no Ilocano instruction or place name can appear in either catalog. **Evidence:** re-run inside the
  full `test:unit` project as part of the §8.1 gate set; the five new `validateStart.resume.*` keys are
  read by `tests/dom/start-batch.test.tsx` from the English catalog — derived, not listed — and none of
  them, in either language, matches a failure-word pattern.

## 8. Verification

- [x] 8.1 `pnpm run lint`, `format:check`, `typecheck`, the three test projects, and `build`, each actually
  run and read back. **Evidence, all read off the command output rather than off a green exit code:**
  `lint` 0 problems; `format:check` "All matched files use Prettier code style!"; `typecheck` 0 errors;
  unit **45 files / 1176 tests**, dom **6 / 72**, integration **9 / 128**, all exit 0; `build` "Compiled
  successfully". Every gate was re-run **after** the last source edit rather than before it.
- [x] 8.2 The dataset guard scoped to its own file: `pnpm exec vitest run --project integration
  tests/integration/immutable-dataset.test.ts` must report 1 file / 7 tests. **Evidence:** `1 passed (1)`
  and `7 passed (7)` — the literal command, named in the invocation, and the count read back. A
  `pnpm run test:integration -- <path>` form drops the filter on Linux and silently runs everything.
- [x] 8.3 `openspec change validate interrupted-batch-recovery --strict`. **Evidence:** exit 0,
  "Change "interrupted-batch-recovery" is valid". The deprecation warning the CLI prints alongside it is
  expected and is not a failure; the verdict line and the exit code are the answer.
- [x] 8.4 An independent verification pass comparing the implementation against this delta, per the
  orchestration rules. **A ticked box in this file is not evidence for any of the above.**
  **Evidence: the pass ran, returned NO, and its findings were repaired — it is ticked because the pass
  happened AND its CRITICAL findings are closed, not because the boxes above are ticked.** It reported
  **3 CRITICAL, 4 WARNING, 8 NOTE**. All 3 CRITICAL and all 4 WARNING were repaired and the repairs
  measured; 2 of the 8 NOTEs were repaired and 6 were not, each with its reason recorded in the diff and in
  `docs/ROADMAP.md`.
  **The finding worth carrying forward is that all three CRITICALs were claims of ENFORCEMENT that did not
  hold, rather than missing behaviour.** Two type-layer pins were advertised in two ledgers as making a
  fourth field fail `typecheck`, and neither was an assertion site — both were exported aliases nobody
  named, so the compiler never evaluated them. Measured before repair: an optional fourth field on
  `InterruptedBatchOffer` gave the **identical** `tsc` failure with the alias present and with it deleted,
  and a Zod optional key on `recoveryIntentSchema` left `tsc` at **exit 0**. The offer's pin was
  **deleted** as redundant (`tests/unit/batch-recovery.test.ts:256` already closed that key set, at the type
  layer and at runtime); the intent's pin was **given an assertion site** and now fires with
  `TS2322: Type 'true' is not assignable to type 'never'`. The third CRITICAL was that the migration's own
  backfill statement was executed by **no test at all** — the test hand-wrote its own `alter table` and its
  own `update` — so the whole justification for the `id DESC` tiebreaker rested on SQL nothing ran; it now
  applies the production migration, and deleting the shipped backfill is RED at `3 failed / 17 passed (20)`.
  **The verifier was forbidden from editing the repository and did not re-measure any of its own probe
  figures**, so every number above was re-derived from source by the root orchestrator with its own probe
  and its own negative control, not inherited.

## 9. Ledger

- [x] 9.1 `## Project Status` moved to the Propose state, with the branch, the change, and the next
  objective — every SHA resolved and proved an ancestor of `origin/main` before it is written.
  **Evidence: satisfied by the Propose PR (#47, `5962521`) and then carried forward through Apply and
  Archive, so this box describes a state the ledger has already moved past.** The row names the branch, the
  change, the capability added, the scenario count, and the next objective; every SHA it carries
  (`5962521`, `c067cf7`) was checked with `git merge-base --is-ancestor` against `origin/main` **in the edit
  that wrote it** rather than assumed, and the Apply merge `3faa312` was checked the same way before this
  line was written. **Ticked late, on purpose:** the alternative was leaving a Propose-stage box unticked in
  a permanent archive, which reads as work that was skipped rather than work that was overtaken.
- [x] 9.2 The design's framing decision recorded where a future reader will look for it: **this change is
  not a data-loss fix, and the measurement that shows so is in `proposal.md`.** That is the line most
  likely to be misremembered as a rescue, which is exactly why it belongs in the ledger rather than only in
  a proposal nobody will reread.
  **Evidence:** `docs/ROADMAP.md`, under the heading "What this change is, stated so it cannot be
  misremembered" — it names the change **not** a data-loss fix as a *measurement*, gives the two exclusions
  `selectBatchEntries` actually applies, concludes that only continuity was lost, and adds the second
  measurement that `/validate/[batchId]` already resumes via `resolveSessionEntry`. It closes by pointing
  at the change's `proposal.md` and by stating that the missing thing was **discovery**. It is placed in the
  roadmap rather than only in the proposal for exactly the reason this task gives.
