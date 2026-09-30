# Tasks

> **Ordering is load-bearing.** Group 1 exists because design decision D1 is the whole approach, and
> it is cheap to be wrong about before seven guards depend on it. Groups 2 and 3 must not begin
> until group 1 has returned a verdict, and group 3 must not begin until group 2 exists.
>
> **Every guard in group 3 is verified by re-running the exact mutation from
> `proposal.md` against it**, not by observing that the new test passes. A test that has never been
> seen red is an untested test.

## 1. Feasibility spike: can a DOM test observe a handler effect at all?

- [x] 1.1 **`happy-dom` 20.14.5 installed and BAR A proved.** `tests/dom/feasibility-spike.test.tsx`
      renders the real `ResumeValidator` with `createRoot` + React 19's `act` inside a
      `happy-dom` document, dispatches a real click, and observes the recording `useRouter` stub
      record `push("/ready")`. Baseline `1 file / 4 tests`.

      **Proved red, not merely green.** Control `4 passed`, then three reversals, each at
      `--project dom`, each restored byte-identical afterwards (`ba9e30a1f6c30d6c`):

      | Probe | Mutation | Result | Attributed to |
      | --- | --- | --- | --- |
      | P1 | `control().click();` → `// the click was removed` | `1 failed \| 3 passed (4)`, exit 1 | `BAR A … > navigates to /ready when a stored identity is restored` |
      | P2 | `h.resume = neverResolves;` → `h.resume = null;` | `1 failed \| 3 passed (4)`, exit 1 | `BAR B … > marks the control busy and disabled while the write is in flight` |
      | P3 | `act(() => { control().click(); })` → click removed | `1 failed \| 3 passed (4)`, exit 1 | `BAR B … > marks the control busy and disabled while the write is in flight` |

      **P2 and P3 are both required, and together they are what makes P2's red attributable.** P2
      shows the pending assertions depend on the lookup staying unresolved; P3 shows they depend on
      the click having happened at all. One alone would be consistent with an incidental cause.
- [x] 1.2 **BAR B proved — the pending window is reachable, which is the half static markup cannot
      do.** With a never-resolving resume lookup, the control is observed `disabled === false` and
      `aria-busy` absent **before** the click, and `disabled === true` with `aria-busy="true"`
      **during** the in-flight write. The before/after pair is what stops this from being an
      assertion that is true in one state by accident; P2 reverses it to `h.resume = null`, the
      window closes, and the test goes red.
- [x] 1.3 **VERDICT: the spike HOLDS. D1 is implemented and seven guards may now be written against
      it.** Both bars were seen red, each attributed to a named test, so a green in `tests/dom/`
      means something. The structural-scan fallback is **not** taken, so D3 applies to the guards
      written in group 3: each states the mutation it does *not* catch.

      **This verdict was wrong three times before it was right, and the failures are the
      point.** A probe of mine shipped with a syntax error and ran **nothing**, exiting 1 — which
      read exactly like "ran and refused". Then the report printed an **empty `TO:` block** for P1
      and P3, so the replacement was never stated, and captured **no failing test names** at all,
      so no red could be attributed. Both were defects in the instrument, not in the spike.

      The attribution bug is the **fourth occurrence in this repository of a bug already recorded in
      `AGENTS.md`**: the ANSI strip was written `/\[[0-9;]*[A-Za-z]/g` **without the escape byte**, so
      `[41m` matched literally, every strip left a bare `U+001B` in front of the text, and a
      `^\s*FAIL` pattern matched nothing. Measured ground truth, read in Node rather than read off a
      console:

      ```
      \u001b[41m\u001b[1m FAIL \u001b[22m\u001b[49m \u001b[30m\u001b[42m unit \u001b[49m tests/… > <name>
      ```

      The failure mode this time was **an empty capture rather than a false green**, which is the
      sibling defect and the more dangerous one: the earlier occurrence scored genuinely red probes
      green, and this one would have scored a genuine red as *unattributable* and let it pass
      unexamined. The verdict now refuses `named=false` rather than treating it as a pass.
- [ ] 1.4 A **fourth instrument defect, found by measurement and not by reasoning, is recorded in
      `AGENTS.md`** under task 4.2: a PowerShell display filter of `Select-String -NotMatch '^\s*\+'`
      silently deleted the probe's own `+ mutation` lines, making a correct report look like it had
      printed nothing. The probe was right and the console was wrong — the same instrument failure as
      the `git show` pipe and the `U+2026` mis-render already in that file.

## 2. The `dom` Vitest project

- [x] 2.1 A third project `dom` added to `vitest.config.ts`: `environment: "happy-dom"`, include
      glob limited to `tests/dom/**/*.test.{ts,tsx}`, the same `@` alias as the other two, and its
      own `testTimeout: 15_000` for the microtask-crossing writes a client component performs.

      **The bar this task set for itself, and it is the one that matters:** the DOM runtime must not
      leak into `unit`. Measured after the change — `pnpm run test:unit` reports **32 files / 881
      tests**, byte-identical to the pre-change baseline. `unit` keeps `environment: "node"`; only
      `tests/dom/` opts in. The config comment records *why* the split exists rather than asserting
      a preference, and names the four critical handler/wiring sites that motivated it.
- [x] 2.2 `pnpm run test:dom` added, mirroring the existing scripts, running
      `vitest run --project dom`. Verified: exit 0, `1 file / 4 tests`. Added to `AGENTS.md`'s
      verified-commands table with what it proves **and does not prove**, per that file's own rule —
      it proves a click's effect and the pending window are observable in a synthetic DOM; it does
      **not** prove `happy-dom` behaves like a browser for anything subtler, and it is not a
      substitute for a human opening the app.
- [x] 2.3 `happy-dom` moved into the manifest deliberately and **only** by pnpm: `pnpm add -D
      happy-dom` → `^20.14.5` in `devDependencies`, `dependencies` unchanged, `pnpm-lock.yaml`
      regenerated by pnpm 12.6.0. Verified: `pnpm install --frozen-lockfile` exits **0** afterwards,
      which is the proof manifest and lockfile agree; and `require("happy-dom/package.json").version`
      resolves to `20.14.5`.

      **One new dependency, and that was the point of D1.** `act` is exported by React itself
      (19.2.8, checked directly rather than assumed) and `createRoot` by `react-dom/client`, so
      `@testing-library/react` and `user-event` were both declined. A DOM project that needs a
      third party's opinion about click synthesis is harder to explain when a guard misbehaves.

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

### OPEN ITEM — an intermittent `test:unit` failure with an unknown cause, never named

**Carried here deliberately, and it blocks nothing, because nothing about it is established.**

- **What was observed.** `pnpm run test:unit` reported `1 failed | 880 passed (881)` **twice**, on
  `fe6581b`, in roughly seventeen invocations. Both times `Test Files 1 failed | 31 passed (32)` —
  one test in one file.
- **What was NOT established.** The failing test has **never been named.** Both attempts to read
  it back were themselves broken — one filtered the name away, one died on a Windows
  path-escaping bug in its own reader — and the failure has not recurred since.
- **Reproduction attempts, all negative.** 8 consecutive single runs; 3 full rapid rounds of
  `test:dom → test:unit → test:integration → guard → build`; 12 further single runs on the branch;
  and **10 runs on `main` as a control**. Totals: **2 failures in ~30 branch invocations, 0 in 10
  on main.**
- **That comparison is NOT statistically significant.** 2/30 against 0/10 is compatible with
  chance. It is recorded because it was measured, not because it points at this branch, and it
  does **not** establish that the `dom` project introduced anything. Claiming otherwise from
  these numbers would be the exact error this repository keeps recording.
- **Causes ruled out by search, not by assumption.** `Date.now` 0 hits, `performance.now` 0,
  `Math.random` 3 — all inside comments stating a random source has no default, `randomUUID` 0,
  `getRandomValues` 0, `os.tmpdir`/`mkdtemp` 0, `process.env` 1 and it is inside a comment. The
  single `setTimeout` (`locale-actions-core.test.ts:113`) sits **inside a promise the test
  awaits**, so `released` is deterministic rather than racy. So there is no clock, no random
  source, and no temp directory in the unit project. **A negative result is not a cause.**
- **Status: UNRESOLVED.** Not filed as noise, and not "fixed" by a guess. If it recurs, the failing
  name is the first thing to capture, and the reader that does it correctly is
  `probe-spike2.cjs`'s `strip()` — the ANSI pattern **with the escape byte**, which is the whole
  reason this could not be named before.

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
