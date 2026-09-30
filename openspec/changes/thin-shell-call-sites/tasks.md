# Tasks

> **Ordering is load-bearing.** Group 1 exists because design decision D1 is the whole approach, and
> it is cheap to be wrong about before seven guards depend on it. Groups 2 and 3 must not begin
> until group 1 has returned a verdict, and group 3 must not begin until group 2 exists.
>
> **Every guard in group 3 is verified by re-running the exact mutation from
> `proposal.md` against it**, not by observing that the new test passes. A test that has never been
> seen red is an untested test.

## 1. Feasibility spike: can a DOM test observe a handler effect at all?

- [ ] 1.1 Add `happy-dom` and prove, **before anything depends on it**, that a `dom`-environment
      test can render `ResumeValidator` with `createRoot`, dispatch a click inside `act`, and
      observe the effect. The concrete bar: the recording `useRouter` stub must record a `push`
      after the click, and the test must pass. Verify by reverting the click dispatch and
      confirming the assertion fails — a spike that passes without doing the thing is the exact
      failure this repository keeps finding.
- [ ] 1.2 Confirm the spike also reaches the **pending** state, not only the idle one. Static markup
      cannot (`onboarding-routes.test.tsx:446`), so this is the half that matters: a test must
      observe `isPending === true` between the click and the action's resolution. Verify by
      asserting a control is disabled mid-flight with a never-resolving action stub.
- [ ] 1.3 Record the verdict in this `tasks.md`, and — **if either bar failed** — record that D1 was
      not implemented, name the failure, and state that the remaining sites fall back to structural
      scans carrying the stated weakness required by D3. A failed spike is a legitimate outcome; an
      unrecorded one is not.

## 2. The `dom` Vitest project

- [ ] 2.1 Add a third project to `vitest.config.ts` named `dom`, `environment: "happy-dom"`, with an
      include glob limited to `tests/dom/`, and the same `@` alias as the other two. Verify that
      `pnpm exec vitest run --project unit` still reports **32 files / 881 tests** unchanged —
      proving the DOM runtime is opt-in and did not leak into `unit`, which is D1's premise.
- [ ] 2.2 Add `pnpm run test:dom` mirroring the existing `test:unit` / `test:integration` scripts,
      using `pnpm exec vitest run --project dom`. Verify the script runs and exits 0. Add the same
      command to `AGENTS.md`'s verified-commands table with what it proves **and does not prove**, per
      that file's existing rule.
- [ ] 2.3 Move `happy-dom` into the manifest deliberately: `package.json` plus a `pnpm-lock.yaml`
      regenerated **by pnpm only**. Verify `pnpm install --frozen-lockfile` exits 0 afterwards,
      which is the proof the lockfile and manifest agree.

## 3. Close the measured gaps

> Grouped by what catches the mutation, not by file. Each task states the layer that catches it, so
> the coverage claim is falsifiable rather than asserted.

- [ ] 3.1 **SF-4** (critical) — the payload passed to `enrollValidatorAction` carries the
      participant's answer, never a decline. Verify by re-running the mutation
      `ilocanoProficiency: answer` → `ilocanoProficiency: null` and confirming the suite goes red,
      naming the new test. Note that the file's own comment at line 202 records this exact defect
      existing once; the guard's purpose is to make it unreintroducible.
- [ ] 3.2 **RV-1** (critical) — the component reads the stored identifier, so resume works for a
      returning validator. Verify by re-running `const stored = readStoredValidatorId();` →
      `const stored = null;` and confirming red.
- [ ] 3.3 **RV-2 and SF-5** (critical, low) — a recognised or freshly enrolled participant is
      navigated to `/ready`. Verify by removing `router.push("/ready");` from each file
      independently and confirming red for each. These are the two `router.push` sites, and
      `router.push` currently has **0** hits anywhere in `tests/unit`.
- [ ] 3.4 **SF-2 and SF-3** (critical, medium) — the Continue and Skip buttons bind the pending
      state, so a double press cannot mint two validators. `submitControlState`'s own behaviour is
      already asserted three times; what is unobserved is the **binding** (`submitState` has 0 hits).
      Verify by mutating `disabled={submitState.disabled}` → `disabled={false}` at occurrence 0 and
      at occurrence 1 separately, and confirming red for each.
- [ ] 3.5 **SF-1** (medium) — the screening options are inert while a write is in flight. Verify by
      `disabled={isPending}` → `disabled={false}` on the `AnswerGroup` and confirming red.
- [ ] 3.6 Audit every guard now present in `tests/dom/` **and** in the two existing textual files
      (`screening-form-wiring.test.ts`, `onboarding-routes.test.tsx`), and record each one's weakest
      mutation as a comment, per D3. Verify the audit is complete by confirming every `it(` in
      those files is covered — assert the count of guards found equals the count of tests present,
      so a newly added vacuous guard cannot be skipped by an incomplete audit.
- [ ] 3.7 Confirm the three previously-guarded sites are **still** guarded after this change, so
      closing seven gaps did not cost three: re-run the SF-6, RV-3, and RV-4 mutations from
      `proposal.md` and confirm each stays red. A change that adds coverage while silently dropping
      existing coverage would report a net gain.

## 4. Make the measurement reproducible and correct the record

- [ ] 4.1 Commit the re-derivation script under `tests/` with its reproduction command in the
      header, per D4. Verify it runs read-only against the unmodified tree, reports its negative
      control green **first**, and restores both files byte-identical afterwards — re-verify by
      checking `git status --porcelain` is empty and the two file hashes still read
      `b3ab4956bd2d889e` and `723f6b30a2b7cf33`.
- [ ] 4.2 Record both lessons from design decision D6 in `AGENTS.md`: the one-test-file probe scope
      error that wrongly reported S20 unguarded, and the inherited-label-mismatches-its-own-text
      error that would have mutated the skip button while calling it the primary submit. Verify by
      re-reading both entries against this `tasks.md`, and by confirming neither introduces a
      `U+FFFD` or any CR byte — judge the bytes in Node, never what PowerShell printed.
- [ ] 4.3 Correct the `docs/ROADMAP.md` Project Status figure from "21 unguarded client-shell call
      sites, two of them critical" to the measured result — 7 unguarded of 10 probed, 4 critical —
      with the scope (`vitest run --project unit`), the date, and the script's location attached, per
      D5. Verify by re-reading the row and confirming the stale phrase no longer appears anywhere
      in `docs/ROADMAP.md`.
- [ ] 4.4 State explicitly in the ledger that the archived `landing-and-screening` review's claims
      that S2 and R6 were repaired **do not hold against the current code**, with the measurement as
      the evidence. This is a statement about today's code, not a claim that the archived change was
      wrong at the time — its line numbers had simply moved. Verify no archived change, spec, or
      historical row was modified: `git diff main -- openspec/changes/archive/ openspec/specs/` must
      be empty.
- [ ] 4.5 Extend the CI workflow's `verify` job to run `test:dom`, and confirm the step **appears by
      name** in the job's step list on the pull request. Do not assume it ran because the job is
      green: a required job in this repository has four times reported `success` having run nothing.
      Verify with the refusing log reader, not `gh pr checks`.

## 5. Full-gate verification

- [ ] 5.1 Run every gate and record the real output, not the expectation:
      `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck`, `pnpm run test:unit`,
      `pnpm run test:integration`, `pnpm run test:dom`, `pnpm run build`, and
      `pnpm exec vitest run --project integration tests/integration/immutable-dataset.test.ts`.
      Verify `data/ilocano-synthetic-data.json` is unchanged by hash and that
      `git diff main -- data/ supabase/` is empty.
- [ ] 5.2 Confirm no behaviour changed: review the full diff of `src/` and assert every change is
      test or configuration. If any file under `src/app/start/` or `src/components/onboarding/`
      changed behaviourally, stop — that would make `skip_specs: true` false.
- [ ] 5.3 Independent verification pass comparing the implementation against `proposal.md`'s
      measured table and this task list. Any CRITICAL blocks; any WARNING is fixed or explicitly
      accepted by the user, not silently dropped.
