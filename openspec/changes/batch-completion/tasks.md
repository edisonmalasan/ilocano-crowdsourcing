# Tasks

Roadmap Phase 6, first bounded slice. Every task names its verification in the same line, because a
ticked box asserting coverage the code does not provide is the specific failure this file exists to
prevent.

## 0. Scope decisions taken before implementation

- [ ] 0.1 **Roadmap task 6, interrupted-batch restoration, is NOT done here.** It is a different
      screen, needs discovery that does not exist, and needs a lifecycle column that modifies
      `research-schema`. **Verify:** `design.md` *Deliberately not in this change* records the
      blast radius, the ordering risk, and why no work is lost. Assert in review that this is a
      deliberate deferral with a stated next change, not an omission.

- [ ] 0.2 **No batch lifecycle column is added** (`design.md` D4). The finished state is derived from
      the absence of unanswered entries and stays derived.
      **Verify:** `git diff main --numstat -- supabase/` is **empty**, and the ADDED requirement *A
      finished batch is recognised from the absence of work* carries a scenario asserting that no
      status, completion timestamp, or abandonment marker is written. If a migration appears, this
      decision was reversed without the spec being updated.

- [ ] 0.3 **`validators.total_validations` is NOT maintained here** (`design.md` D6). It is set to `0`
      at enrolment and has no increment method.
      **Verify:** assert the displayed lifetime figure is derived from `ValidationsRepository` and that
      no code reads or writes the profile column. A test that reads the figure from a profile counter
      would pass while the research source of truth is wrong.

## 1. The two figures, derived from the right sources

- [ ] 1.1 Add the batch figure to the finished presentation, from the **existing** `completedCount`
      already carried by the `finished` outcome.
      **Verify:** a test asserting the rendered finished screen contains the completed count. Measure
      the value used before asserting it — do not invent an expected number.

- [ ] 1.2 Surface the lifetime figure by **calling the existing, never-called
      `countForValidator`** (`design.md` D2). Confirm at implementation time that its query carries no
      `evaluation` predicate, so a `cannot_evaluate` response is counted.
      **Verify:** a test asserting a recorded `cannot_evaluate` response increments the lifetime total,
      built from a **real** inserted row rather than a stubbed number. This is the research-integrity
      case: if it does not increment, the figure has become a covert quality score.

- [ ] 1.3 Prove 1.2's honesty claim is real, not assumed, by mutating the repository call to filter
      on evaluation and confirming the suite goes red **naming the count test**.
      **Verify:** mutation probe with a negative control on the unmutated file and a byte-identical
      restore. A probe whose mutant was never built cannot attribute its own result.

- [ ] 1.4 Label both figures so they are distinguishable (`design.md` D5).
      **Verify:** a test asserting each figure renders with its own label, not merely that two numbers
      appear. Asserting the presence of digits cannot tell which figure is which.

- [ ] 1.5 Keep the lifetime figure a **static record on the finished screen only**
      (`design.md` D7). No screen shows a lifetime total that rises during validation, and no
      comparison, target, milestone, or rank accompanies it.
      **Verify:** a test over the finished presentation asserting the figure appears once with no
      comparative or milestone wording. **State honestly if this only covers the finished screen** —
      the cross-screen claim needs every screen enumerated, and naming one file is not that.

## 2. Continuing: one control, requested from the server

- [ ] 2.1 Add a continue control that calls the existing `requestBatchAction` and then presents the
      new batch (`design.md` D1). Do **not** link to `/validate`.
      **Verify:** a DOM test that a click reaches the action and the resulting batch is presented, not
      a source-text assertion. The precedent for handler-level coverage is `tests/dom/`.

- [ ] 2.2 Assert **exactly one** continue control and **exactly one** finish control on the finished
      screen, by counting occurrences — never by asserting a second is absent.
      **Verify:** the count assertions must be able to fail: mutate the render to emit the continue
      control twice and confirm the suite goes red naming this test. A count of `1` that was never
      observed at `2` is an assertion that cannot fail.

- [ ] 2.3 Confirm the in-flight pending state follows the established Phase 5 pattern (busy control,
      `aria-busy`, in-button progress, conditional inputs hidden rather than disabled), and answer
      open question 1 in `design.md`.
      **Verify:** a DOM test asserting the control's pending state while the request is in flight. The
      Phase 5 DOM project exists because `renderToStaticMarkup` can prove neither.

- [ ] 2.4 Report an exhausted pool when continuing finds no eligible entry, reusing the existing
      exhausted outcome rather than inventing a failure shape, and never fabricate a batch.
      **Verify:** a test against the existing allocation contract, asserting the exhausted outcome is
      surfaced and **no batch was created**.

- [ ] 2.5 Assert the continued batch excludes entries the validator already answered.
      **Verify:** this is `batch-allocation`'s existing guarantee; assert it is still true **through the
      continue path**, rather than only at the allocation unit. Re-deriving a guarantee from its own
      implementation proves nothing.

## 3. Finishing: a distinct control that writes nothing

- [ ] 3.1 Add a finish control as a **link**, performing no write (`design.md` D3).
      **Verify:** a test asserting the control is a link with an internal `href`, and — the
      load-bearing half — that **no server action is invoked**. Assert the absence of a write by
      asserting the control is not a form and issues no request, not by asserting a string is absent.

- [ ] 3.2 Assert that choosing to finish leaves every recorded response exactly as recorded.
      **Verify:** a test that persists responses, follows the finish path, and re-reads the rows to
      confirm none changed, none deleted, none flagged. Assert the **row state**, not that a function
      was not called.

- [ ] 3.3 Assert finishing and continuing are distinct controls and neither triggers the other.
      **Verify:** two independent DOM tests, each driving one control and asserting the other's effect
      does not occur.

## 4. What the finished screen must not reveal

- [ ] 4.1 Assert the finished presentation shows no stored identifier and no self-reported proficiency
      answer.
      **Verify:** assert against **real rendered markup**, using the identifiers and proficiency values
      the fixtures actually contain. A regex for a marker that matches zero of the fixture passes
      vacuously — this repository has two recorded instances of exactly that.

- [ ] 4.2 Prove 4.1's guard can fire: render the finished screen through a fixture that **does** carry
      an identifier and proficiency value, and confirm the guard goes red.
      **Verify:** the negative control is mandatory. Without it, 4.1 reports coverage it has not
      provided.

## 5. Localization, in both catalogs

- [ ] 5.1 Add every new string to **both** catalogs, English and Filipino.
      **Verify:** a test asserting **key-set parity** between the catalogs. Asserting both catalogs
      contain a key the test itself invented proves nothing; derive the expectation from the English
      catalog and require the Filipino catalog to match it exactly.

- [ ] 5.2 Revise the finished-screen body copy in **both** catalogs to remove the stale claim that
      asking for another batch is unavailable.
      **Verify:** assert the retired sentence is absent from **both** catalogs. `interface-localization`
      already requires localization to cover the continue and finish controls; this task supplies them
      rather than changing the requirement.

- [ ] 5.3 Describe the lifetime figure as **entries answered**, never as contributions to study
      coverage (`design.md` D2).
      **Verify:** a test asserting the copy does not describe the total as a coverage or qualifying
      count. Enumerate the forbidden phrasings rather than forbidding the word "coverage", which
      appears legitimately elsewhere in the interface.

- [ ] 5.4 Assert neither catalog contains any dataset entry text — using the project's own
      `parseSyntheticDataset` comparison, not a keyword marker.
      **Verify:** the existing data-driven guard, extended to the new keys. A keyword guard that
      matched zero of the 600 real instructions was found in this repository already.

## 6. Server authority over the finished state and the figures

- [ ] 6.1 Assert a client cannot dictate completion: supplying a completion status, an answered
      count, or a remaining count changes nothing.
      **Verify:** the **exact key-set assertion on the intent interface**, so any third key fails
      typecheck regardless of its name. A behavioural test cannot pin the absence of a parameter, and
      a two-file mutation that adds a field *and honours it* was measured to leave a naive suite
      green here.

- [ ] 6.2 Confirm the finished state is still derived from the absence of remaining entries and not
      from a position or a stored flag.
      **Verify:** a unit test at the pure resolver, including the bookmarked-past-the-end case the
      module documents.

## 7. Integration verification

- [ ] 7.1 Run `pnpm run lint` (exit 0, **0 warnings**), `pnpm run format:check`, `pnpm run typecheck`.
- [ ] 7.2 Run the whole suite and record exact file and test counts. Assert the per-project counts sum
      to the total, which is what proves nothing failed to collect.
- [ ] 7.3 Run the scoped dataset guard and confirm it reports **1 file**, not the whole integration
      project — a scoped run reporting the full suite is a defect that reads as a pass.
- [ ] 7.4 Run `pnpm run build` and confirm "Compiled successfully".
- [ ] 7.5 Confirm `git diff main --numstat -- supabase/` is **empty** and the dataset SHA-256 is
      `39f757e6…`, read in Node rather than through a shell pipeline.
- [ ] 7.6 Confirm `openspec validate --specs --strict` still reports **10 passed, 0 failed**. This
      change adds one capability; a new directory appearing before Sync would mean the delta leaked.

## 8. Verification pass

- [ ] 8.1 An independent verification round compares the implementation against the delta, and **does
      not assume the ticked boxes above are true.**
- [ ] 8.2 Every probe result is confirmed independently, with a negative control per probe, and every
      probe reports which mutation it performed.
- [ ] 8.3 Record honestly what is **not** verified: no Supabase client has ever been constructed, so
      the count query is proven against the mock rather than PostgREST; and no human has rendered any
      screen.

## 9. Ledger

- [ ] 9.1 Update `docs/ROADMAP.md` `## Project Status` at Apply: lifecycle state, next objective, and
      the doc-only PR count.
- [ ] 9.2 Record the measured `countForValidator` call-site figure **as measured** — 6 mentions, 0
      call sites before this change — and state that it now has one. Do not carry the number forward
      unre-derived.