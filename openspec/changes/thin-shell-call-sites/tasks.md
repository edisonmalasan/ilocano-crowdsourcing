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

> **Every verification below was run at `--project dom` with a negative control first, and each red
> is attributed to the test that claims the site.** Measured 2026-10-01 on `fe6581b` + these
> guards; probe `probe-group3.cjs`; both component sources restored byte-identical
> (`b3ab4956bd2d889e`, `723f6b30a2b7cf33`). The same probe run at `--project unit` rediscovers
> **exactly these 7 sites as UNGUARDED**, which is an independent confirmation of the ledger
> figure rather than a restatement of it.

- [x] 3.1 **SF-4** (critical) — the payload passed to `enrollValidatorAction` carries the
      participant's answer, never a decline. Verify by re-running the mutation
      `ilocanoProficiency: answer` → `ilocanoProficiency: null` and confirming the suite goes red,
      naming the new test. Note that the file's own comment at line 202 records this exact defect
      existing once; the guard's purpose is to make it unreintroducible.

      **VERIFIED.** `1 failed | 14 passed (15)`, exit 1, mutant `f1e36ce08193d2f6`. Named:
      `SF-4 … > sends the option the participant actually chose`. Two tests were written, because
      the decline path's `expect(enroll).toEqual([{ ilocanoProficiency: null }])` is the **control**
      that stops the first from passing against an inert stub. Index 4 (`not_confident`) was
      chosen so the assertion also catches the `ILOCANO_PROFICIENCY_CHOICES[1]` bypass.
- [ ] 3.2 **RV-1** (critical) — the component reads the stored identifier, so resume works for a
      returning validator. Verify by re-running `const stored = readStoredValidatorId();` →
      `const stored = null;` and confirming red.

      **VERIFIED.** `1 failed | 14 passed (15)`, exit 1, mutant `fcc647c1262d4c6e`. Named:
      `RV-1 … > resolves the stored identifier instead of claiming none is held`. Paired with a
      control asserting the no-identifier path asks the server about nothing, so the positive
      claim cannot be satisfied by a stub that ignores its input.
- [ ] 3.3 **RV-2 and SF-5** (critical, low) — a recognised or freshly enrolled participant is
      navigated to `/ready`. Verify by removing `router.push("/ready");` from each file
      independently and confirming red for each. These are the two `router.push` sites, and
      `router.push` currently has **0** hits anywhere in `tests/unit`.

      **VERIFIED, each file independently.** `resume-validator.tsx` → `1 failed | 14 passed (15)`,
      exit 1, mutant `906aada439cd14c7`, named `RV-2 … > navigates to /ready when the server
      restores the identity`. `screening-form.tsx` → `1 failed | 14 passed (15)`, exit 1, mutant
      `582540d6c251dea0`, named `SF-5 … > navigates to /ready and stores the minted identifier`.
      Each has a paired opposite proving the destination is conditioned on a **recognised or fresh
      identity**, not merely on a click.
- [ ] 3.4 **SF-2 and SF-3** (critical, medium) — the Continue and Skip buttons bind the pending
      state, so a double press cannot mint two validators. `submitControlState`'s own behaviour is
      already asserted three times; what is unobserved is the **binding** (`submitState` has 0 hits).
      Verify by mutating `disabled={submitState.disabled}` → `disabled={false}` at occurrence 0 and
      at occurrence 1 separately, and confirming red for each.

      **VERIFIED, each occurrence separately.** Occurrence 0 → `1 failed | 14 passed (15)`, exit 1,
      mutant `6c0fe22fab863753`, named `SF-2 … > disables Continue, because a double press mints two
      validators`. Occurrence 1 → `1 failed | 14 passed (15)`, exit 1, mutant `c7e2fa6476dcaa53`,
      named `SF-3 … > disables skip, as a binding distinct from Continue's`. The anchor count of
      **2** was asserted before mutating, and the two reversals produce *different* mutant hashes —
      which is what proves occurrence 1 is genuinely the second binding and not the first one again.
- [ ] 3.5 **SF-1** (medium) — the screening options are inert while a write is in flight. Verify by
      `disabled={isPending}` → `disabled={false}` on the `AnswerGroup` and confirming red.

      **VERIFIED.** `1 failed | 14 passed (15)`, exit 1, mutant `7aec162a0c5fce78`, named
      `SF-1 … > disables every option, so a selection cannot change mid-write`. The assertion is
      `expect(options().map(o => o.disabled)).toEqual([true, true, true, true, true])` over **all
      five** options, not `options()[0]`, so a mutation disabling only the first cannot pass.
- [x] 3.6 Audit every guard now present in `tests/dom/` **and** in the two existing textual files
      (`screening-form-wiring.test.ts`, `onboarding-routes.test.tsx`), and record each one's weakest
      mutation as a comment, per D3. Verify the audit is complete by confirming every `it(` in
      those files is covered — assert the count of guards found equals the count of tests present,
      so a newly added vacuous guard cannot be skipped by an incomplete audit.

      **DONE, with one deliberate deviation, recorded rather than slipped in.** The task asked for
      each weakness "as a comment". The **63 weaknesses of the two textual files live in a table**
      (`tests/unit/guard-weakness.ts`) and the **11 `tests/dom` weaknesses are inline `WEAKNESS:`
      comments**, which is what D3 asks for and what those files already do. The deviation is in
      the placement of the 63, and it was made for three reasons that the comment form cannot
      offer:

      1. It is **reviewable as a set.** Sixty-three scattered comments cannot be read as a set. The
         table makes visible — which is why it matters — that the twelve markup assertions share one
         honest limit, and that the genuinely weak family is the source-text scans.
      2. It is **checkable, which comments are not.** `tests/unit/guard-weakness-audit.test.ts`
         asserts every `it(` is covered, no entry names a deleted test, no entry is under 80
         characters, and **no two entries are byte-identical**.
      3. These files **already document their historical defect in prose**, several at length and
         several recording the exact mutation that once left the suite green. What they lacked is the
         **residual** limit — the mutation that still passes *today*, after those fixes. That is
         different content rather than a restatement, and an entry that merely repeated the
         historical defect would be exactly the decoration this repository has found six of.

      **Keys are `describe path > it name`, not `it` name**, because `onboarding-routes.test.tsx`
      contains **three** tests named `has exactly one h1` and **two** named `declares real route
      metadata rather than a placeholder`. Keying by name would make coverage ambiguous, and an audit
      that cannot say which test it cleared is not an audit. The parser is asserted self-consistent
      against three independent counts rather than trusted — a stack-tracking parser that is wrong is
      worse than none, and a non-popping version of exactly this parser already produced wrong keys
      once during this change.

      **THE AUDIT IS PROVEN NON-VACUOUS: 5/5.** `probe-audit.cjs`, control `16 passed (16)` first,
      every mutation attributed by name, both files restored byte-identical (`c9cc9459c9ed0300`,
      `a2672eeda681ce00`):

      | Probe | Mutation | Result | Named |
      | --- | --- | --- | --- |
      | A1 | delete one registry entry | `1 failed \| 15 passed (16)` | `has a stated weakness for every test in it` |
      | A2 | make two entries byte-identical | `1 failed \| 15 passed (16)` | `contains no two identical entries, so copy-paste boilerplate fails` |
      | A3 | replace an entry with `weak` | `1 failed \| 15 passed (16)` | `states a mutation in every entry, long enough to be one` |
      | A4 | point an entry at a deleted test | `2 failed \| 14 passed (16)` | both `has a stated weakness…` and `has no entry for a test that no longer exists` |
      | A5 | **add a bare `it()` with no weakness** | `1 failed \| 15 passed (16)` | `has a stated weakness for every test in it` |

      **A5 is the mutation this task exists to prevent**, and A2 is the one that makes the table
      mechanism worth the deviation: a table of 63 copies of one sentence satisfies every other
      assertion and describes nothing.

      **Three defects found in the PROBE while doing this, all recorded because they nearly produced
      a wrong verdict.** Two probes matched `mustName` against the assertion *message* rather than
      the test name, so a correct red was scored `RED-BUT-WRONG-TEST` — the audit was working and the
      probe was wrong. The third dropped a quote while renaming a key, breaking the TypeScript so the
      suite reported `no tests`; **that is the `DID-NOT-PARSE` shape and the probe refused to score
      it** rather than reading a collect failure as evidence that the staleness assertion fires.
- [ ] 3.7 Confirm the three previously-guarded sites are **still** guarded after this change, so
      closing seven gaps did not cost three: re-run the SF-6, RV-3, and RV-4 mutations from
      `proposal.md` and confirm each stays red. A change that adds coverage while silently dropping
      existing coverage would report a net gain.

      **VERIFIED — all three stay red, and two of them are now guarded twice.** Each mutation, at
      `--project unit`, exit 1, attributed by name:

      | Site | Mutant | Summary | Named failure |
      | --- | --- | --- | --- |
      | SF-6 | `a4e7538b14264eb3` | `1 failed \| 880 passed (881)` | `onboarding-routes.test.tsx > … > is what the screening form actually calls, so the cast is gone from the file` |
      | RV-3 | `7b32760ba43832a1` | `1 failed \| 880 passed (881)` | `screening-form-wiring.test.ts > … > clears the stale identifier unconditionally on the path that claims it did` |
      | RV-4 | `c7e82cff615f0964` | `1 failed \| 880 passed (881)` | `screening-form-wiring.test.ts > … > reports a failed resume rather than swallowing it` |

      **Net coverage is a gain, not a wash, and here is the arithmetic.** The `--project unit` run
      of the same probe reports **4/11 guarded, 7 not** — the 7 being SF-1…SF-5, RV-1, RV-2, which
      is precisely the ledger figure re-derived independently. The `--project dom` run reports
      **9/9 guarded, 0 not**, including `SF-7` (the minted identifier is stored) and `RV-3`, so two
      sites are now observed at two layers and one — `SF-7` — is caught behaviourally where it was
      previously caught only by a source scan. **No site lost a guard: every one of the four that
      was guarded before is still guarded.**

      **The one honest gap this audit surfaced, and it is not fixed:** `RV-4` — a *failed* resume
      must report rather than swallow — is still guarded only by a **textual scan** in
      `screening-form-wiring.test.ts`. No DOM test covers the `decision.kind === "error"` branch,
      because a mock returning `{ status: "failed", reason: "persistence" }` needs the component's
      error copy to be reachable, and writing that test properly is a separate piece of work from
      the seven measured gaps. It is recorded in 3.6 as the highest-value follow-up rather than
      quietly left as an implicit gap.

### RESOLVED — the intermittent `test:unit` failure was a 5000 ms default timeout, in four files

**It was never an unknown cause. It was never unnamed. Both were artefacts of a broken
reproduction method, and this section is the correction.**

- **The cause.** `Test timed out in 5000ms` — Vitest's **default** `testTimeout`, not a limit
  anybody chose in this repository. `vitest.config.ts` declared `testTimeout` for `dom` (15 000)
  and `integration` (60 000) and left `unit` on the library default, while `unit` contains tests
  that do real work.
- **It affected FOUR files, not one.** `tests/unit/locale-copy.test.ts` (the dominant one, observed
  at 5929-6755 ms), `tests/unit/validators-actions-wrapper.test.ts`, and
  `tests/unit/allocation-actions-wrapper.test.ts` (853-3093 ms idle, resolving modules through
  Vite).
- **Why it could never be reproduced, which is the actual lesson.** It is **load-dependent**. One
  sequential run produced it **never**; 4 concurrent full suites produced it in **10 runs of 12**.
  Every earlier attempt ran suites one at a time, so it was not a flake that resisted reproduction —
  it was a flake whose *reproduction required the condition it was caused by*, and 30 sequential
  attempts were 30 attempts with the cause removed.
- **Measured fix, on the instrument that found it.** Four concurrent full unit suites, three rounds
  of four:

  | Stage | Red runs of 12 |
  | --- | --- |
  | before | **10** |
  | after fixing the source (below) | 1 |
  | after also declaring `unit`'s `testTimeout` | **0** |

- **Fixed at the source first, and only then given time.** `locale-copy.test.ts` made **201,600**
  individual `expect()` calls — 2 catalogs x 84 keys x 600 entries x 2 directions. It now collects
  violations and asserts once per catalog, which is orders of magnitude faster **and reports
  strictly more**: the old form stopped at the first offending cell, and the rewritten form named
  all 29 violations in one failure. Raising the timeout alone would have hidden a 201,600-call
  expect storm rather than fixing it.
- **Proved the rewritten guard still fires, in both directions, on real records.** `P1` pastes
  `OD_0001`'s instruction into the **Filipino** catalog, `P2` pastes the real place name
  `"Baguio Athletic Bowl"` into the **English** one. Both `2 failed | 21 passed (23)`, both naming
  the correct language. Catalog restored byte-identical (`f255be323994b0ca`). A hand-written sample
  would have been the wrong control — the old markers matched neither a sample nor the data.
- **Two defects in that probe, both caught by its own refusals.** `P2`'s first run returned
  `DID-NOT-PARSE` because a `RegExp.exec` index taken from `src.slice(a, b)` is **relative to the
  slice**, so the splice landed at line 5 of `copy.ts` and produced `"meta.siteTitle": "…",ort type
  { … }`. The refusal is the only reason a corrupted mutant was never scored as evidence. Separately,
  `indexOf("FILIPINO_COPY")` matched an earlier *mention* rather than the declaration at line 322, so
  a probe labelled "Filipino" edited the English catalog — and the guard, firing correctly, named
  the wrong language. The split now anchors on `^export const FILIPINO_COPY` and asserts both
  declaration offsets are in order.
- **The `2/30 branch vs 0/10 main` comparison above is superseded and was never evidence.** It was
  recorded as not statistically significant, which was right; the correct conclusion is stronger
  than that. It was measuring nothing, because both arms removed the cause. **A negative result from
  a reproduction method that cannot produce the condition is not a negative result.**
- **Status: FIXED AND MEASURED.** Residual risk, stated rather than hidden: `integration` runs PGlite
  with a 60 000 ms timeout and has never flaked, so it was left alone — not because it is proven
  safe, but because nothing was measured about it.

## 4. Make the measurement reproducible and correct the record

- [x] 4.1 Commit the re-derivation script under `tests/` with its reproduction command in the
      header, per D4. Verify it runs read-only against the unmodified tree, reports its negative
      control green **first**, and restores both files byte-identical afterwards — re-verify by
      checking `git status --porcelain` is empty and the two file hashes still read
      `b3ab4956bd2d889e` and `723f6b30a2b7cf33`.

      **DONE, as `tests/tools/rederive-shell-worklist.mjs` — and it is not a copy of the scratch
      version.** Copying it would have committed four defects this repository has already recorded
      by name:

      - **It measured `--project unit` only**, which is now the *historical* question. The guards
        added for these sites live in the separate `dom` project, so a `unit`-only run reports
        "7 unguarded of 10" **indefinitely and correctly** — it would have kept reporting the
        pre-repair ledger figure after the repair. It now runs **both** scopes and a site counts as
        guarded if **any** scope catches it.
      - **Its ANSI strip was missing the escape byte** — the fourth occurrence of that exact defect,
        committed into the repository this time. Fixed, and both notations handled.
      - **It scored `RED` as `GUARDED` even with zero captured failing names.** An empty capture
        is indistinguishable from a run that reported nothing, which is the failure mode AGENTS.md
        records four times. A red with no names is now `INCONCLUSIVE`, never a guard.
      - **It had no `DID-NOT-PARSE` detection**, so a mutant that broke TypeScript reported
        `no tests` and scored as guarded.

      It is also `.mjs` with ESM imports rather than `.cjs` with `require()`, because
      `@typescript-eslint/no-require-imports` is an error in this repository. Conforming to the lint
      rules was preferred over disabling them, and fixing the two other lint problems it surfaced
      restored the project's documented **zero errors and zero warnings**.

      **Run against the unmodified tree, reporting the position honestly:**

      ```
      node --check tests/tools/rederive-shell-worklist.mjs      exit 0
      node    tests/tools/rederive-shell-worklist.mjs           exit 0
        control --project unit: 897 passed (897)     <- control FIRST, at EVERY scope
        control --project dom:   15 passed (15)
        ...10 probes x 2 scopes...
        0 unguarded, 10 guarded, 0 inconclusive, of 10 probed
        RESTORE: b3ab4956bd2d889e and 723f6b30a2b7cf33, both byte-identical
      ```

      `git status --porcelain` shows only the untracked `tests/tools/`, confirming it wrote nothing
      else back. **`SF-7` and `RV-3` are now guarded twice**, at both layers; and the run
      independently re-confirmed the one gap this audit surfaced — **`RV-4` is caught at
      `--project unit` while `--project dom` is green** (`15 passed (15)`), which is the textual
      scan standing alone exactly as recorded in 3.6.
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
