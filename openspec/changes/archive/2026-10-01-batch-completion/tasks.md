# Tasks

Roadmap Phase 6, first bounded slice. Every task names its verification in the same line, because a
ticked box asserting coverage the code does not provide is the specific failure this file exists to
prevent.

## 0. Scope decisions taken before implementation

- [x] 0.1 **Roadmap task 6, interrupted-batch restoration, is NOT done here.** It is a different
      screen, needs discovery that does not exist, and needs a lifecycle column that modifies
      `research-schema`. `design.md` records the blast radius, the ordering risk, and why no work is
      lost, and quotes the roadmap's own wording — *"restore interrupted active batches"* — so this is a
      deferral with a stated scope and not an omission.
      **Measured:** no batch-resume lifecycle exists in `src/` (no `resumeBatch`,
      `restoreBatch`, `abandonedBatch`, `batchLifecycleStatus`, or any equivalent). The 6 files that
      match /resume/i are the Phase 3 **identity** resume — `resumeValidatorAction`,
      `ResumeValidator`, `resume.*` catalog keys — which is a different feature that *should* exist,
      and the first draft of this check got that distinction wrong and reported the Phase 3 code as a
      violation of the deferral.

- [x] 0.2 **No batch lifecycle column is added** (`design.md` D4). The finished state is derived from
      the absence of unanswered entries and stays derived.
      **Measured:** `git diff main --numstat -- supabase/` is **empty**, and the ADDED requirement *A
      finished batch is recognised from the absence of work, never from an assertion* carries the
      scenario asserting no status, completion timestamp, or abandonment marker is written. The delta
      states the reason too — a stored `status` "would create a second authority that can disagree
      with the entries" — so the prohibition is reasoned rather than merely stated. If a migration
      appears, this decision was reversed without the spec being updated.

- [x] 0.3 **Nothing MAINTAINS `validators.total_validations`** (`design.md` D6). It is
      set to `0` at enrolment and has no increment path.
      **Measured, and the original wording of this task was wrong.** It said "no code reads or writes the
      profile column", and `validators.total_validations` appears in **4** files in `src/`: read in
      `rows.ts`, mapped in both directions in `validators.ts` (row→domain and domain→row), and named
      in two module comments. What holds is narrower and is what the requirement needs — **nothing
      maintains it**: the single `.update()` in `validators.ts` (L178, `touchLastActive`) writes only
      `last_active_at`, there is no increment helper anywhere in `src/`, and the only write is the
      `.insert(toRow(profile))` at L123. A test reading the figure from a profile counter would still
      pass while the research source of truth is wrong, which is the risk this task names — and it is
      closed by `session-service.ts` reading `ValidationsRepository.countForValidator` and by the type
      pin below, not by the absence of reads.

## 1. The two figures, derived from the right sources

- [x] 1.1 Add the batch figure to the finished presentation, from the **existing** `completedCount`
      already carried by the `finished` outcome.
      **Verify:** a test asserting the rendered finished screen contains the completed count. Measure
      the value used before asserting it — do not invent an expected number.

- [x] 1.2 Surface the lifetime figure by **calling the existing, never-called
      `countForValidator`** (`design.md` D2). Confirm at implementation time that its query carries no
      `evaluation` predicate, so a `cannot_evaluate` response is counted.
      **Verify:** a test asserting a recorded `cannot_evaluate` response increments the lifetime total,
      built from a **real** inserted row rather than a stubbed number. This is the research-integrity
      case: if it does not increment, the figure has become a covert quality score.

- [x] 1.3 Prove 1.2's honesty claim is real, not assumed, by mutating the repository call to filter
      on evaluation and confirming the suite goes red **naming the count test**.
      **Verify:** mutation probe with a negative control on the unmutated file and a byte-identical
      restore. A probe whose mutant was never built cannot attribute its own result.

- [x] 1.4 Label both figures so they are distinguishable (`design.md` D5).
      **Verify:** a test asserting each figure renders with its own label, not merely that two numbers
      appear. Asserting the presence of digits cannot tell which figure is which.

- [x] 1.5 Keep the lifetime figure a **static record on the finished screen only**
      (`design.md` D7). No screen shows a lifetime total that rises during validation, and no
      comparison, target, milestone, or rank accompanies it.
      **Verify:** a test over the finished presentation asserting the figure appears once with no
      comparative or milestone wording. **State honestly if this only covers the finished screen** —
      the cross-screen claim needs every screen enumerated, and naming one file is not that.

## 2. Continuing: one control, requested from the server

- [x] 2.1 Add a continue control that calls the existing `requestBatchAction` and then presents the
      new batch (`design.md` D1). Do **not** link to `/validate`.
      **Verify:** a DOM test that a click reaches the action and the resulting batch is presented, not
      a source-text assertion. The precedent for handler-level coverage is `tests/dom/`.

- [x] 2.2 Assert **exactly one** continue control and **exactly one** finish control on the finished
      screen, by counting occurrences — never by asserting a second is absent.
      **Verify:** the count assertions must be able to fail: mutate the render to emit the continue
      control twice and confirm the suite goes red naming this test. A count of `1` that was never
      observed at `2` is an assertion that cannot fail.

- [x] 2.3 Confirm the in-flight pending state follows the established Phase 5 pattern (busy control,
      `aria-busy`, in-button progress, conditional inputs hidden rather than disabled), and answer
      open question 1 in `design.md`.
      **Verify:** a DOM test asserting the control's pending state while the request is in flight. The
      Phase 5 DOM project exists because `renderToStaticMarkup` can prove neither.

- [x] 2.4 Report an exhausted pool when continuing finds no eligible entry, reusing the existing
      exhausted outcome rather than inventing a failure shape, and never fabricate a batch.
      **Verify:** a test against the existing allocation contract, asserting the exhausted outcome is
      surfaced and **no batch was created**.

- [x] 2.5 Assert the continued batch excludes entries the validator already answered.
      **Verify:** this is `batch-allocation`'s existing guarantee; assert it is still true **through the
      continue path**, rather than only at the allocation unit. Re-deriving a guarantee from its own
      implementation proves nothing.

## 3. Finishing: a distinct control that writes nothing

- [x] 3.1 Add a finish control as a **link**, performing no write (`design.md` D3).
      **Verify:** a test asserting the control is a link with an internal `href`, and — the
      load-bearing half — that **no server action is invoked**. Assert the absence of a write by
      asserting the control is not a form and issues no request, not by asserting a string is absent.

- [x] 3.2 Assert that choosing to finish leaves every recorded response exactly as recorded.
      **Verify:** a test that persists responses, follows the finish path, and re-reads the rows to
      confirm none changed, none deleted, none flagged. Assert the **row state**, not that a function
      was not called.

- [x] 3.3 Assert finishing and continuing are distinct controls and neither triggers the other.
      **Verify:** two independent DOM tests, each driving one control and asserting the other's effect
      does not occur.

## 4. What the finished screen must not reveal

- [x] 4.1 Assert the finished presentation shows no stored identifier and no self-reported proficiency
      answer.
      **Verify:** assert against **real rendered markup**, using the identifiers and proficiency values
      the fixtures actually contain. A regex for a marker that matches zero of the fixture passes
      vacuously — this repository has two recorded instances of exactly that.

- [x] 4.2 Prove 4.1's guard can fire: render the finished screen through a fixture that **does** carry
      an identifier and proficiency value, and confirm the guard goes red.
      **Verify:** the negative control is mandatory. Without it, 4.1 reports coverage it has not
      provided.

## 5. Localization, in both catalogs

- [x] 5.1 Add every new string to **both** catalogs, English and Filipino.
      **Verify:** a test asserting **key-set parity** between the catalogs. Asserting both catalogs
      contain a key the test itself invented proves nothing; derive the expectation from the English
      catalog and require the Filipino catalog to match it exactly.

- [x] 5.2 Revise the finished-screen body copy in **both** catalogs to remove the stale claim that
      asking for another batch is unavailable.
      **Verify:** assert the retired sentence is absent from **both** catalogs. `interface-localization`
      already requires localization to cover the continue and finish controls; this task supplies them
      rather than changing the requirement.

- [x] 5.3 Describe the lifetime figure as **entries answered**, never as contributions to study
      coverage (`design.md` D2).
      **Verify:** a test asserting the copy does not describe the total as a coverage or qualifying
      count. Enumerate the forbidden phrasings rather than forbidding the word "coverage", which
      appears legitimately elsewhere in the interface.

- [x] 5.4 Assert neither catalog contains any dataset entry text — using the project's own
      `parseSyntheticDataset` comparison, not a keyword marker.
      **Verify:** the existing data-driven guard, extended to the new keys. A keyword guard that
      matched zero of the 600 real instructions was found in this repository already.

## 6. Server authority over the finished state and the figures

- [x] 6.1 Assert a client cannot dictate completion: supplying a completion status, an answered
      count, or a remaining count changes nothing.
      **Verify:** the **exact key-set assertion on the intent interface**, so any third key fails
      typecheck regardless of its name. A behavioural test cannot pin the absence of a parameter, and
      a two-file mutation that adds a field *and honours it* was measured to leave a naive suite
      green here.

- [x] 6.2 Confirm the finished state is still derived from the absence of remaining entries and not
      from a position or a stored flag.
      **Verify:** a unit test at the pure resolver, including the bookmarked-past-the-end case the
      module documents.

## 7. Integration verification

- [x] 7.1 Run `pnpm run lint` (exit 0, **0 warnings**), `pnpm run format:check`, `pnpm run typecheck`.
- [x] 7.2 Run the whole suite and record exact file and test counts. Assert the per-project counts sum
      to the total, which is what proves nothing failed to collect.
- [x] 7.3 Run the scoped dataset guard and confirm it reports **1 file**, not the whole integration
      project — a scoped run reporting the full suite is a defect that reads as a pass.
- [x] 7.4 Run `pnpm run build` and confirm "Compiled successfully".
- [x] 7.5 Confirm `git diff main --numstat -- supabase/` is **empty** and the dataset SHA-256 is
      `39f757e6…`, read in Node rather than through a shell pipeline.
- [x] 7.6 Confirm `openspec validate --specs --strict` still reports **10 passed, 0 failed**. This
      change adds one capability; a new directory appearing before Sync would mean the delta leaked.

## 8. Verification pass

- [x] 8.1 An independent verification round compares the implementation against the delta, and **does
      not assume the ticked boxes above are true.**
- [x] 8.2 Every probe result is confirmed independently, with a negative control per probe, and every
      probe reports which mutation it performed.
- [x] 8.3 Record honestly what is **not** verified: no Supabase client has ever been constructed, so
      the count query is proven against the mock rather than PostgREST; and no human has rendered any
      screen.
      **Both halves are recorded, and each is gated on its own text being present rather than on this
      script having run:** the credentials half in the `## Project Status` **Blockers** row (which names
      the three absent env vars, that `getServerEnv()` therefore throws on every real request, and that
      **no Supabase client has ever been constructed**), and the visual half further down the ledger
      (**\*\*No human has looked at a page.\*\*`). The PostgREST gap is recorded in the `test:integration`
      row of `AGENTS.md`, which is where measured-command coverage claims belong.
      **And the gap this change itself widened is named there too:** `countForValidator` is proven against
      a mock and against PGlite, and the two integration files this change added prove properties of
      *PostgreSQL* — not of the application's own query builder. So the lifetime figure is proven as a
      *query string's meaning* and never as a *wire response*.

## 9. Ledger

- [x] 9.1 Update `docs/ROADMAP.md` `## Project Status` at Apply: lifecycle state, next objective, and
      the doc-only PR count.
      **All four rows that a lifecycle transition changes were updated, not just the two named here:**
      `Current OpenSpec change`, `Lifecycle state`, `Doc-only PRs since that stage`, and
      `Next eligible objective`. Leaving either of the other two describing the Propose stage is how a
      ledger drifts into lying.
      **Measured, and the writer was checked by a separate reader.** The writer refuses if a row it is
      about to replace does not end in a pipe — the first run dropped the closing pipe on all four and
      the reader caught it as \`mixed pipe counts\`. The reader then asserted the wrong invariant itself
      three ways (whole-document row count, truncating the `Blockers` row's 17 wrapped continuation
      lines, and demanding a 3-pipe shape that row has never had in `main` either), and the invariant
      that survives is comparative: **the table's shape is identical to the baseline's.** The header is
      still at line 12 and the block is still 10 rows.
      The `Doc-only PRs` row's own header used to read \*\*Three\*\* while listing four; the count and the
      enumeration are now stated separately so the two cannot contradict each other again.
- [x] 9.2 Record the measured `countForValidator` figure **as measured, with its unit**.
      At merge-base `377a816a`, scope `src/`, via `git grep -n`:

          6   matching **lines**
          9   **occurrences** on those lines
          0   **call sites**

      The original wording here said "6 mentions" without saying which unit, and that ambiguity is
      exactly what produced two different correct numbers in one round: the recorded 6 reproduced
      precisely, and the verification pass independently reported 9 and concluded the 6 "does not
      reproduce under the natural reading." Three of the six lines match **twice** — `operations.ts:91`,
      `validations.ts:425`, `validations.ts:431` each carry both `OPS.countForValidator` and the
      string `"validations.countForValidator"` — so 6 lines are 9 occurrences. **Neither number was
      wrong; both were correct under an unstated unit**, and a reader who does not know which is
      measuring which has no way to tell a re-derivation from a contradiction.

      The load-bearing half is the third figure: **0 call sites**, and exactly **one** now. Everything
      matched was a declaration, a type position, an operation-union member, an implementation, or a
      doc comment — none of which invokes it. Instrument proved on a positive control:
      `resolveSessionEntry` returns 8 lines, matching the earlier independent measurement, so the 0 is
      a real absence rather than a search that found nothing.