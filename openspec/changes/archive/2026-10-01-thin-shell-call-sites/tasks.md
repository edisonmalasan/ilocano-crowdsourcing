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
- [x] 1.4 A **fourth instrument defect, found by measurement and not by reasoning, is recorded in
      `AGENTS.md`** under task 4.2: a PowerShell display filter of `Select-String -NotMatch '^\s*\+'`
      silently deleted the probe's own `+ mutation` lines, making a correct report look like it had
      printed nothing. The probe was right and the console was wrong — the same instrument failure as
      the `git show` pipe and the `U+2026` mis-render already in that file.

      **VERIFIED PRESENT**, as the bullet at `AGENTS.md` L697-709. Checked by
      reading the entry, not by grepping for a phrase: it names the exact filter
      `Select-String -NotMatch '^\s*\+'`, records that **two of four "defects"** investigated in
      one round were the console rather than the code, and states the rule "judge a run by the bytes,
      not by what a PowerShell pipeline printed". All four identifying strings were asserted to be
      present before this note was written, and the note was refused rather than written if any
      were missing — a tick asserting something about a second file that was not read is exactly the
      checked-box-as-evidence failure this project treats as worse than an unticked box.

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
- [x] 3.2 **RV-1** (critical) — the component reads the stored identifier, so resume works for a
      returning validator. Verify by re-running `const stored = readStoredValidatorId();` →
      `const stored = null;` and confirming red.

      **VERIFIED.** `1 failed | 14 passed (15)`, exit 1, mutant `fcc647c1262d4c6e`. Named:
      `RV-1 … > resolves the stored identifier instead of claiming none is held`. Paired with a
      control asserting the no-identifier path asks the server about nothing, so the positive
      claim cannot be satisfied by a stub that ignores its input.

      **RE-MEASURED 2026-10-01, and the recorded count above no longer reproduces: it is now
      `5 failed | 10 passed (15)`, exit 1.** An independent verification pass found this; it is
      re-derived here rather than adopted, and **the mutant is byte-identical**
      (`fcc647c1262d4c6e`, 5833 bytes). **The mutation did not change — the suite grew.**
      `tests/dom/feasibility-spike.test.tsx` was added to the `dom` project after this figure was
      recorded, and its `BAR A` and `BAR B` scenarios exercise the same stored-identifier
      behaviour, so they now fail with it. The five named failures are `BAR A`, `BAR B`, `RV-1`,
      and both `RV-2` tests.

      **The original figure is KEPT rather than overwritten.** It was correct when written, and a
      number that was right and has since been overtaken is a different defect from a number that
      was wrong. Replacing it would destroy the record of when the measurement was taken. **The
      conclusion is unaffected and is stronger than the count: `RV-1` is `critical`, and a mutation
      that breaks five independent tests is better evidence than one that breaks a single test.**
- [x] 3.3 **RV-2 and SF-5** (critical, low) — a recognised or freshly enrolled participant is
      navigated to `/ready`. Verify by removing `router.push("/ready");` from each file
      independently and confirming red for each. These are the two `router.push` sites, and
      `router.push` currently has **0** hits anywhere in `tests/unit`.

      **VERIFIED, each file independently.** `resume-validator.tsx` → `1 failed | 14 passed (15)`,
      exit 1, mutant `906aada439cd14c7`, named `RV-2 … > navigates to /ready when the server
      restores the identity`. `screening-form.tsx` → `1 failed | 14 passed (15)`, exit 1, mutant
      `582540d6c251dea0`, named `SF-5 … > navigates to /ready and stores the minted identifier`.
      Each has a paired opposite proving the destination is conditioned on a **recognised or fresh
      identity**, not merely on a click.

      **RE-MEASURED 2026-10-01: the two figures diverge, and the divergence is informative.**
      `RV-2` (`resume-validator.tsx`) is now **`2 failed | 13 passed (15)`** — the extra failure is
      the spike's `BAR A`. `SF-5` (`screening-form.tsx`) is **still `1 failed | 14 passed (15)`**.
      Both mutants are byte-identical to the recorded ones (`906aada439cd14c7`, `582540d6c251dea0`),
      so again **the mutation did not change, the suite grew** — and only the resume component's
      mutation happens to also break a spike scenario. **A probe that reports a count which no
      longer reproduces is not thereby a wrong claim**; it is a measurement whose denominator
      moved, and both figures are kept so the movement is visible.
- [x] 3.4 **SF-2 and SF-3** (critical, medium) — the Continue and Skip buttons bind the pending
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
- [x] 3.5 **SF-1** (medium) — the screening options are inert while a write is in flight. Verify by
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
- [x] 3.7 Confirm the three previously-guarded sites are **still** guarded after this change, so
      closing seven gaps did not cost three: re-run the SF-6, RV-3, and RV-4 mutations from
      `proposal.md` and confirm each stays red. A change that adds coverage while silently dropping
      existing coverage would report a net gain.

      **VERIFIED — all three stay red, and two of them are now guarded twice.** Each mutation, at
      `--project unit`, exit 1, attributed by name:

      | Site | Mutant | Summary | Named failure |
      | --- | --- | --- | --- |
      | SF-6 | `a4e7538b14264eb3` | `1 failed \| 880 passed (881)` (now `1 failed \| 896 passed (897)`) | `onboarding-routes.test.tsx > … > is what the screening form actually calls, so the cast is gone from the file` |
      | RV-3 | `7b32760ba43832a1` | `1 failed \| 880 passed (881)` (now `1 failed \| 896 passed (897)`) | `screening-form-wiring.test.ts > … > clears the stale identifier unconditionally on the path that claims it did` |
      | RV-4 | `c7e82cff615f0964` | `1 failed \| 880 passed (881)` (now `1 failed \| 896 passed (897)`) | `screening-form-wiring.test.ts > … > reports a failed resume rather than swallowing it` |

      **The `unit` denominator moved from 881 to 897 and every total above is annotated with both
      figures.** The audit file and its 16 tests were added to `unit` after this table was recorded,
      so `880 passed (881)` was accurate then and `896 passed (897)` is accurate now. Same cause as
      the `dom` figures in 3.2 and 3.3, and the same rule: **the original is kept, because it dates
      the measurement rather than contradicting it.**

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

- **Fixed at the source first, and only then given time.** `locale-copy.test.ts` made **204,000**
  individual `expect()` calls — 2 catalogs x 85 keys x 600 entries x 2 directions. It now collects
  violations and asserts once per catalog, which is orders of magnitude faster **and reports
  strictly more**: the old form stopped at the first offending cell, and the rewritten form named
  all 29 violations in one failure. Raising the timeout alone would have hidden a 204,000-call
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
      else back. **`RV-3` is now guarded twice**, at both layers; and the run
      independently re-confirmed the one gap this audit surfaced — **`RV-4` is caught at
      `--project unit` while `--project dom` is green** (`15 passed (15)`), which is the textual
      scan standing alone exactly as recorded in 3.6.
- [x] 4.2 Record both lessons from design decision D6 in `AGENTS.md`: the one-test-file probe scope
      error that wrongly reported S20 unguarded, and the inherited-label-mismatches-its-own-text
      error that would have mutated the skip button while calling it the primary submit. Verify by
      re-reading both entries against this `tasks.md`, and by confirming neither introduces a
      `U+FFFD` or any CR byte — judge the bytes in Node, never what PowerShell printed.

      **DONE, both D6 lessons verified present, plus two more this change earned.** Re-read
      against this `tasks.md`: the probe-scope entry is there (it names
      `onboarding-routes.test.tsx:208` as the reader that made SF-6 look unguarded, exactly as 3.7
      measured), and the inherited-figure entry is there (it names the `disabled={isPending}`
      occurrence count of **1** against the archive's "PRIMARY submit" label).

      The two additional entries are recorded because they are the durable part of the flake fix
      above and of the guard probe: **"cannot be reproduced" is a statement about the reproduction
      method**, and **a `RegExp.exec` index taken from `src.slice(a, b)` is relative to the slice**.

      **The flake entry is a RETRACTION, and it is marked as one on the same line as each retracted
      phrase** — "in the earlier version of this file, that a `test:unit` failure was *"never named"*
      … and that its *"cause is unknown"*. **Both halves of that were falsified**". That is
      deliberate and follows the rule already recorded here: rewording until a phrase disappears would
      hide the retraction to satisfy a checker, and weakening the check until it passes would be the
      same error wearing a different hat. The phrases remain, quoted and marked.

      **Encoding measured on the ADDED lines, in Node — never on the whole file.** A naive
      `not.toContain("\uFFFD")` over `AGENTS.md` is **wrong here**, because the file legitimately
      contains three `U+FFFD` as the quoted mojibake lesson itself. Result over the **55 added
      lines**: **0** `U+FFFD` added, **0** CR bytes, **0** C1 controls, and a non-ASCII inventory of
      `{U+2014: 9, U+2026: 1}` — em dash and horizontal ellipsis, both legitimate. The whole file
      still reads **3** `U+FFFD`, unchanged. The checker also **flagged its own expectation** as
      wrong (it had predicted those three would be removed) instead of quietly reconciling the
      numbers, which is the behaviour this repository wants from an instrument.
- [x] 4.3 Correct the `docs/ROADMAP.md` Project Status figure from "21 unguarded client-shell call
      sites, two of them critical" to the measured result — 7 unguarded of 10 probed, 4 critical —
      with the scope (`vitest run --project unit`), the date, and the script's location attached, per
      D5. Verify by re-reading the row and confirming the stale phrase no longer appears anywhere in
      `docs/ROADMAP.md`.

      **DONE — six rows corrected, and the scope recorded is BOTH projects, not `unit`.** The
      figure did not appear in one place. It was in two, in two different registers, and correcting
      only the headline row would have left the falsehood standing in prose:

      | Row | What it said | Now |
      | --- | --- | --- |
      | `Current roadmap phase` | stage `proposing` | Apply on `feat/thin-shell-call-sites` |
      | `Current OpenSpec change` | "Propose merged, Apply not started" | Apply, PR not yet opened |
      | `Lifecycle state` | the figure, attributed to `--project unit` | PRE-REPAIR 7/10 and POST-REPAIR 0/10, both scopes, tool path attached |
      | `Next eligible objective` | omitted the change entirely | names it, plus the `RV-4` follow-up |
      | L306 (planned-change list) | "21 of them, two critical", plain prose | states the count and criticality were wrong in the version that inherited them |
      | `Last merged OpenSpec stage` | **#20** | **#33** |

      **The scope correction is the substantive part, and getting it wrong would have been a NEW
      falsehood.** The task text says `--project unit`, which was the scope of the *original*
      re-derivation. It is not the scope of the current one: the guards now live in the separate
      `dom` project, so a `unit`-only run still reports 7 unguarded of 10 **and always will**. The
      row now reads PRE-REPAIR 7 unguarded / POST-REPAIR 0 unguarded and names both projects, with
      `tests/tools/rederive-shell-worklist.mjs` attached per D4.

      **Verification — the literal absence check 4.3 asks for, and it holds.** A scan of all
      1,975 lines for `21 unguarded`, `two of them critical`, `two critical`, and
      `(21 of them` returns **no matches at all**. That is stronger than a marked retraction, and
      deliberately so: the retraction rule recorded in `AGENTS.md` exists so a phrase kept as
      *quoted falsified history* is not mistaken for a live claim, and here there was no need to keep
      the quote — the row was rewritten rather than annotated, so the phrase is simply gone. The
      one surviving mention of the number is `21-site enumeration` in the `Lifecycle state` row,
      which is a **true** statement about what the archive produced, not the stale claim.

      **`Last merged OpenSpec stage` was stale by thirteen merged PRs, found in passing.** It said
      #20 while #33 was merged — and the row's *own* text already set the rule for that ("a row
      left describing a merge that has since happened is a false claim sitting on `main`"), with two
      prior PRs (#9, #10) existing solely to correct it. It is now #33 `b5b59b2`, and the commit was
      **read back from `gh` and verified to be an ancestor of `origin/main`** rather than typed from
      memory, because a row asserting a merge commit that does not exist is the same defect one
      stage earlier. The row also enumerates all 13 PRs it superseded, so the next reader can check
      the correction instead of trusting it. Recorded as an additional correction found while doing
      4.3, per the rule to record rather than silently expand.

      **A ledger sentence of my own was caught this way, and the retraction is left in the text.** A
      first draft of the `Lifecycle state` row read "`SF-7` and `RV-3` are now guarded at
      **two** layers." The committed tool probes **ten** sites and `SF-7` is **not among them**, so
      no mutation run had ever measured it. That clause was authored from memory of the group-3 work
      instead of read off the committed tool — the same "an enumeration is a claim to be
      re-derived" error, committed by the same agent that wrote the lesson. It is corrected in place
      and **the retraction stays in the row**, marked as an earlier draft, so a future reader sees
      that the ledger was wrong there rather than finding a tidy row that was never wrong.

- [x] 4.4 State explicitly in the ledger that the archived `landing-and-screening` review's claims
      that S2 and R6 were repaired **do not hold against the current code**, with the measurement as
      the evidence. This is a statement about today's code, not a claim that the archived change was
      wrong at the time — its line numbers had simply moved. Verify no archived change, spec, or
      historical row was modified: `git diff main -- openspec/changes/archive/ openspec/specs/` must
      be empty.

      **DONE**, as a new `### A correction about an ARCHIVED change's claims, and what it does not
      say` section at the end of the `## Project Status` block. It states that the archived review's
      **S2** (`SF-5`, the missing `router.push("/ready")` after enrollment) and **R6** (`RV-2`, the
      same push inside the resume handler) were recorded as repaired, that **that claim does not hold
      against the current code**, and that both measured **unguarded** with `router.push` at **0
      hits anywhere in `tests/unit`** at the time of measurement.

      **The section carries an explicit "What this does NOT say" paragraph**, because the claim is
      easy to misread as an accusation against the archived change. It does not say the archive was
      wrong when written, and it modifies no archived artifact: the line-number anchors had moved
      across four merges, and a remediation claim tied to a line number is a claim about a location
      rather than about a behaviour. It also records the label problem, so the section cannot be read
      as merely a number dispute.

      **Verified: no archived change, no in-force spec, and no historical row was modified.**

      ```
      git status --porcelain
        M AGENTS.md
        M docs/ROADMAP.md
        M openspec/changes/thin-shell-call-sites/tasks.md
      git diff --stat main -- openspec/changes/archive/ openspec/specs/   (empty)
      ```

      Nothing under `openspec/changes/archive/` or `openspec/specs/` appears in either, and the
      forward-only rule holds: `thin-shell-call-sites` declares `skip_specs: true` and no delta was
      written.

      **Placement was wrong on the first attempt and was caught by reading the result.** The
      insertion anchored on the first `\n---\n\n## ` boundary, which turned out to be the one
      before `## 2. Core Product Principles` — so the section landed as a `###` subsection of
      **`## 1. Project Goal`**, filing archived-claims corrections under "Project Goal". The
      re-anchor is on the `## 1. Project Goal` heading itself, and the script prints the resulting
      heading order so the placement is a measurement rather than an intention. It now sits at L480,
      inside the `## Project Status` block whose other `###` subsections are the same kind of
      ledger text.

      **Encoding, measured on the whole file in Node: 0 `U+FFFD`, 0 CR bytes**, and a non-ASCII
      inventory of `{U+2014: 78, U+2026: 3, U+2192: 4, U+2193: 3}` — em dash, ellipsis, and
      arrows only. Two ASCII ` - ` prose dashes inside the new section were normalised to
      `U+2014` to match the document's convention, which is why the em-dash count rose from 76 to 78.

      ### A ledger gap found while doing 4.3, and deliberately NOT fixed here

      The `### Archived Changes` table at L32 lists **3 of the 7** archived changes
      (`project-foundation`, `od-dataset-schema-and-import`, `interface-localization`). It is
      missing `landing-and-screening`, `required-bilingual-translations`,
      `coverage-aware-allocation`, and `research-schema-guarantee-coverage`, so a reader
      consulting the index would conclude only three changes have ever been archived.

      **Recorded rather than fixed, and the distinction is deliberate.** Every other ledger edit in
      this group corrects a **false claim**; this one is an **omission**. A row that states something
      untrue is the defect this repository keeps finding, and a row that is merely absent is a
      different and lower-severity problem. Reindexing four changes is `while I am here` work, which
      `AGENTS.md` forbids, and it would enlarge this change's diff for a problem it did not cause.

      The derivation is cheap for whoever does take it, and is recorded here so it is not
      rediscovered: the change names come from `openspec/changes/archive/` (7 directories) and each
      row's "Merged as" comes from `gh pr list --state merged` matched on the change name — #4,
      #8, #13, #20, #25, #28, #32 for the seven Archive stages. **A reindex should assert that the
      set it writes equals the set of directories on disk**, since that equality is the whole check
      and the table is currently the only place it fails.
- [x] 4.5 Extend the CI workflow's `verify` job to run `test:dom`, and confirm the step **appears by
      name** in the job's step list on the pull request. Do not assume it ran because the job is
      green: a required job in this repository has four times reported `success` having run nothing.
      Verify with the refusing log reader, not `gh pr checks`.

      **The workflow edit is DONE, and the local half is established by a PARSE rather than a
      search.** A new step sits between `Unit tests` and `Integration tests`:

      ```yaml
      - name: DOM tests
        run: pnpm run test:dom
      ```

      **A grep would not have been sufficient evidence, and the reason is on record four times
      over.** A required job in this repository has reported `success` with its test steps
      **absent from the step list entirely** — not failed, not skipped, gone — and a text search
      for `name: DOM tests` would have passed on a file whose structure put that step under the
      wrong job. So the workflow is parsed as real YAML and the step list is read out of the
      **parse**. `js-yaml` is not resolvable from the project root (pnpm does not hoist it), and
      no dependency was added for a one-time check; it is required by absolute path out of the
      pnpm store, where it already exists as a transitive dependency. The fallback considered
      first — a regex — was rejected, and the rejection is recorded here rather than left implicit.

      Verified from the parse:

      ```
      jobs: verify, immutable-research-source
      job "lint, types, and tests" — 11 steps:
         1. Check out             5. Lint                9. DOM tests
         2. Install pnpm          6. Check formatting   10. Integration tests
         3. Install Node.js       7. Type-check         11. Production build
         4. Install dependencies  8. Unit tests
      -> found at position 9; run is "pnpm run test:dom"
      -> ordered: Unit(8) < DOM(9) < Integration(10) = true
      -> every step in both jobs has a run or a uses; none is a silent no-op
      ALL CHECKS PASS
      ```

      Three properties are asserted rather than eyeballed. The step is **in the `verify` job and
      nowhere else** — its absence from the `immutable-research-source` job is checked explicitly.
      Its `run` is the **literal string** `pnpm run test:dom`, not merely something containing it.
      And **every** step in both jobs has a `run` or a `uses`, because a step with neither is a
      silent no-op that reports success — the exact shape the four recorded incidents took.

      **The immutability guard was re-asserted in the same parse**, so this edit could not have
      quietly unscoped it: `Verify the synthetic dataset is unchanged` still runs
      `pnpm exec vitest run --project integration tests/integration/immutable-dataset.test.ts` —
      the literal scoped command, verified equal, and not the `pnpm run test:integration -- <path>`
      form that once silently executed all 18 integration tests while the job reported success.

      **No path filter is used for `test:dom`, deliberately.** The `pnpm run` layer drops a path
      filter on Linux, which is how the guard job came to run the wrong suite. There is nothing to
      filter here — the script is already scoped to `--project dom` — so that failure mode cannot
      recur. The rule that a step's name proves nothing about what it ran applies just as much
      here, which is why the by-name confirmation below is still owed.

      **The by-name confirmation in the CI log is NOT part of this box.** An independent
      verification pass flagged that this task is ticked while its own text defers the confirmation
      it asks for, and flagged it as a WARNING for exactly the right reason: **a checkbox is weaker
      than a measurement**, and a deferral buried inside a ticked box is easy to miss. That is fair,
      so the owed half is now **task 4.6, unticked**, where a scan for `- [ ]` finds it. 4.5 covers
      the workflow edit, which is done and evidenced above; 4.6 covers the CI log, which is not.

      `read-ci.mjs` attributes every summary line to a **step name** and **exits non-zero rather than
      printing a partial answer**, and it is run against this PR's run before merge. A local parse
      proves the step is in the file and nothing about whether it ran — which is the distinction
      the four recorded CI incidents turned on.

- [x] 4.6 **Confirm by NAME in the CI run log that the `DOM tests` step ran**

      **DONE, read from run `36770800439` on head `681f5a3` (PR #34).** Three separate things
      are established, because any one alone would be satisfied by a step that did nothing
      useful:

      ```
      1. `DOM tests` is present BY NAME, at position 9 of 11, and the observed ORDER matches
         .github/workflows/verify.yml's own declaration:
         Check out -> Install pnpm -> Install Node.js -> Install dependencies -> Lint ->
         Check formatting -> Type-check -> Unit tests -> DOM tests -> Integration tests ->
         Production build
      2. It reported 3 files and 15 tests passed, the local measurement, and those numbers
         DIFFER from both neighbours in the same run — Unit 33 files / 897 tests and
         Integration 6 files / 100 tests — so it ran its own suite and not a renamed one.
      3. The immutability guard still reports 1 file / 7 tests, from the literal scoped
         command `pnpm exec vitest run --project integration tests/integration/immutable-
         dataset.test.ts`, so this workflow edit did not unscope the one check that can never
         be skipped.
      ```

      All 679 parsed log lines were scanned: no `FAIL` line and no summary line containing
      `failed`. Both jobs appear, and every step name in the run is accounted for.

      **What this does NOT establish, so it is not read as more than it is:** the log proves the
      steps RAN, not that the tests are meaningful. `happy-dom` is a synthetic DOM and **no human
      has ever rendered any screen.** The recorded limit of every number above is that it came
      from a run, not from an eye.

      **The reader was wrong five times before it was right, and that is the more useful half.**
      Every failure surfaced as a REFUSAL, which is the only reason any of them was visible; each
      would otherwise have produced a confident wrong CI report.

      1. The step-name regex **guessed** `|` separators and a 2+ space gap. The real format is
         TAB-separated, `<job>\t<step>\t<timestamp> <message>`. The guess matched **0 of 11**
         steps and reported every expected step missing. A regex written from a plausible memory
         of a log format is a claim; the format has to be read off the file.
      2. The ANSI strip removed **0 of 992** sequences. **This is the FIFTH wrong form of that
         regex in this repository, and the form is NEW.** The earlier four were all about a
         missing ESCAPE BYTE; this one had the byte-or-caret handled correctly and got the
         BRACKET COUNT wrong. Measured on this log: 0 real `0x1b` bytes, **992 literal `^[`
         pairs**, no codepoints above ASCII, and a summary line reading
         `^[[2m Test Files ^[[22m ^[[1m^[[32m33 passed^[[39m...`. That is FIVE characters before
         the parameters, because `gh` renders ESC as the two characters `^[` and the CSI bracket
         then follows. The pattern `^\[[0-9;]*[A-Za-z]` consumes ONE bracket, so `[0-9;]*`
         matches EMPTY and `[A-Za-z]` is asked to match `[`, which fails — and every captured
         count came back wrapped in escapes while still *looking* like the right number.
      3. **The strip's self-test PASSED while doing that**, because its probe was built from the
         single-bracket form, which never occurs in this log. A self-test built from a
         *construction* rather than from the artefact passes while the artefact is untouched.
         All three notations are now probes against one shared body, so the test can still fail.
      4. Fixing (2) double-escaped its way into requiring TWO brackets on the real-0x1b form
         too — the same bracket bug reintroduced by a nested template literal — and was caught
         only because the corrected self-test carries an ESC probe that the previous one had no
         reason to include. **A fix for a guard must be able to fail the guard's own probe.**
      5. The reader's hardcoded expectation placed `DOM tests` BEFORE `Unit tests`. `verify.yml`
         and the log both place it after (8 Unit, 9 DOM, 10 Integration). It never noticed,
         because it compared SET MEMBERSHIP and therefore **cannot see a reordering at all** — it
         would have reported success for a step in the wrong place. The expectation is now parsed
         from the workflow file at run time, and ORDER is asserted separately.

      Four in-place patches then each spliced a range wider than intended and deleted a block
      whose consumer survived, so the reader died at run time with a `ReferenceError` — **after**
      printing `order matches: true`. Half a verdict sat on screen with only the exit code to
      distinguish it, which is a shape with no clean signal: `DID-NOT-PARSE` is loud,
      `DID-NOT-RUN` is loud, and a wrong verdict is caught by the refusing shape, but a crash
      after a reassuring partial report reads as a broken reader rather than a gap in one. It was
      rewritten clean rather than patched a fifth time.

      Two harness limits cost a cycle each and are the already-recorded reasons to write scratch
      scripts to files: the `edit` tool **cannot match text containing a real `0x1b` byte**, and an
      inline `node -e` escape mangled a regex outright.

      **Merge on the log, never on the checkmark** — the property this repository has now
      exercised four separate times, when a required job reported `success` with its test steps
      absent from the step list entirely., before this change
      merges. Use `read-ci.mjs`, which attributes every summary line to a step name and **exits
      non-zero rather than printing a partial answer**. Do not read it off `gh pr checks`: a
      required job in this repository has four times reported `success` with its test steps absent
      from the step list entirely, so a green job is not evidence that this step ran.

      Three things must be established from the log, and a refusal is a stop rather than a
      judgement call:

      1. the step list of the `verify` job **contains a step named `DOM tests`**;
      2. its output reports **3 files and 15 tests passed**, which is what `pnpm run test:dom`
         measured locally — a step that ran the wrong suite would report different numbers
         rather than none;
      3. the `immutable-research-source` job still reports **1 file and 7 tests**, so the
         workflow edit did not unscope the guard that must never be skipped.

      **This task exists as a separate unticked box because a deferral inside a ticked box is
      indistinguishable from completion to anyone scanning checkboxes.** It was created during
      Apply, after an independent verification pass flagged the ambiguity.

## 5. Full-gate verification

- [x] 5.1 Run every gate and record the real output, not the expectation:
      `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck`, `pnpm run test:unit`,
      `pnpm run test:integration`, `pnpm run test:dom`, `pnpm run build`, and
      `pnpm exec vitest run --project integration tests/integration/immutable-dataset.test.ts`.
      Verify `data/ilocano-synthetic-data.json` is unchanged by hash and that
      `git diff main -- data/ supabase/` is empty.

      **Ten of ten steps exit 0. Recorded output, not the expectation — and read back out
      of a log by a reader that refuses rather than one that infers:**

      ```
      ok    lint                 exit=0
      ok    format:check         exit=0
            All matched files use Prettier code style!
      ok    typecheck            exit=0
      ok    openspec validate    exit=0      Change 'thin-shell-call-sites' is valid
      ok    openspec specs       exit=0
      ok    test:unit            exit=0      33 files, 897 tests passed
      ok    test:dom             exit=0      3 files, 15 tests passed
      ok    test:integration     exit=0      6 files, 100 tests passed
      ok    dataset guard        exit=0      1 file, 7 tests passed
      ok    build                exit=0      Compiled successfully in 4.6s

      === every expected step accounted for? ===
        expected 10, present 10
        all present — nothing unaccounted for and nothing missing
      === VERDICT ===
        10 steps, 0 non-zero exits.
      ```

      **The reader asserts three things a green job cannot.** That all **10 expected** steps are
      *present* — the fourth-recorded CI failure was a required job reporting `success` with
      its test steps **absent from the step list entirely**, which is indistinguishable from a pass
      if you only count non-zero exits. That the **dataset guard is scoped to 1 file / 7 tests** and
      not merely green, since the whole integration suite is 6 files / 100 tests and the one job
      that silently ran the wrong suite did so while succeeding. And that the captured text is
      **non-empty**, so a broken read cannot be reported as a clean gate.

      **The reader was itself wrong once, and the correction is recorded rather than quietly
      patched.** Its first version searched the guard's captured output for a line containing the
      literal word `Tests` and reported "no Tests line" — while the summary printed directly
      above it read `7 passed (7)`. The PowerShell writer stores the **captured group** after
      `Tests`, so the word never reaches the log and the reader searched for something that had
      never been written. The gate was green; the instrument was wrong. That is the shape this
      repository keeps meeting: **a control that reports a shape you did not expect is evidence
      about your harness, not about the code under test.**

      **`data/` and `supabase/` are untouched, and the hash is read from the bytes in Node.**

      ```
      git diff main --stat -- data/ supabase/     exit 0, output empty
      data/ilocano-synthetic-data.json         sha256 39f757e61b70386b
                                                 records 600, CR bytes false
      ```

      **The full hash rather than a prefix is in the working copy's own CI output and in
      `tests/integration/immutable-dataset.test.ts`; the prefix is shown here only to keep this
      table readable, and the guard step above is what proves it.** The hash is computed in Node
      with no shell in the path, because a PowerShell pipeline re-encodes the bytes and has
      produced **three different hashes for one blob** in this repository — the `git show` pipe
      is the recorded instance. `core.autocrlf` on this machine is why the CR check is stated
      explicitly rather than assumed.

      **A note on what these ten steps do NOT establish**, restated because the temptation grows
      with a longer list: nothing about Supabase, nothing about visual rendering, and no human has
      ever rendered any screen. `test:dom` drives a **synthetic** DOM. A successful build is not a
      behavioural result and is not counted as one above.

- [x] 5.2 Confirm no behaviour changed: review the full diff of `src/` and assert every change is
      test or configuration. If any file under `src/app/start/` or `src/components/onboarding/`
      changed behaviourally, stop — that would make `skip_specs: true` false.

      **Measured, and the result is stronger than the task asked for: `src/` is not merely
      behaviour-preserving, it is UNTOUCHED.**

      ```
      git diff main --stat    -- src/     exit 0, output empty
      git diff main --numstat -- src/     exit 0, output empty
      ```

      `git diff main --stat -- src/` was **empty**, so there is no change to classify. `numstat`
      is checked as well as `stat` because a `stat` that printed nothing for a reason other than
      an empty diff would look identical, and `numstat` is the form that would still report
      something if a file's *mode* or *type* changed without its lines changing.

      **This is the whole justification for `skip_specs: true`, and it is why `skip_specs` was
      defensible rather than a shortcut.** The two directories the task names, `src/app/start/`
      and `src/components/onboarding/`, are inside the empty diff, so neither the screening form
      nor the resume validator changed in any way. Every product behaviour this change claims to
      protect is asserted by a **test added or strengthened here**, and no behaviour was altered
      in order to make one testable — which is design decision **D2**, recorded as "no
      refactor for testability" precisely so that this row could read `empty`.

      **The full change diff, for completeness — four files, and none of them product
      behaviour:**

      ```
       M .github/workflows/verify.yml                        (CI: one added step)
       M AGENTS.md                                           (documentation)
       M docs/ROADMAP.md                                     (ledger, root-owned)
       M openspec/changes/thin-shell-call-sites/tasks.md    (this file)
      ```

      **Plus the test and tooling files committed earlier in this change**
      (`tests/dom/screening-form.test.tsx`, `tests/dom/resume-validator.test.tsx`,
      `tests/dom/support/dom-harness.tsx`, `tests/dom/feasibility-spike.test.tsx`,
      `tests/unit/guard-weakness.ts`, `tests/unit/guard-weakness-audit.test.ts`,
      `tests/unit/locale-copy.test.ts`, `tests/tools/rederive-shell-worklist.mjs`,
      `vitest.config.ts`, `package.json`, `pnpm-lock.yaml`, and the group-1/2 commits). **Two
      additions are worth stating explicitly because they are the only places this change edits
      something outside `tests/` and `docs/`:** `vitest.config.ts` gains the `dom` project and a
      **declared `testTimeout` on the `unit` project**, and `package.json` gains one dev
      dependency. The timeout is a **test-runtime setting, not a product setting**, and it was
      added only after the source of the flake was fixed; the measurement is in the file's comment
      and in the task that introduced it.
- [x] 5.3 Independent verification pass comparing the implementation against `proposal.md`'s

      **VERDICT: ACCEPT WITH WARNINGS. 0 CRITICAL, 5 WARNING — and all five are now FIXED, not
      accepted.** `AGENTS.md` states that any unresolved WARNING blocks completion unless it is
      explicitly accepted, so each was re-derived independently and then repaired. Every one
      turned out to be a true finding.

      **What the pass confirmed, and it is the strongest evidence in this change:** it ran the
      committed `tests/tools/rederive-shell-worklist.mjs` and got **`0 unguarded, 10 guarded, 0
      inconclusive, of 10 probed`** D the same result recorded in the proposal, from running the
      artefact rather than reading the prose. Negative controls were green **first at every
      scope** (`897 passed (897)` and `15 passed (15)`), both source files were restored
      byte-identical (`b3ab4956bd2d889e`, `723f6b30a2b7cf33`), and the `dom`/`unit` split was
      reproduced: **8 sites caught by `dom`, 1 by `unit` alone, 1 by both**.

      **WARNING 1 D the `skip_specs: true` rationale overstated its own coverage. CORRECTED IN
      PLACE, and the substantive finding of the pass.**

      `proposal.md` and `design.md` D7 both asserted that `validator-onboarding` "already
      specifies **all seven** behaviours" and that "nothing here is unspecified". **That was
      false.** Re-derived here by enumerating the requirement blocks of all **nine** in-force specs,
      deliberately *not* by grepping for words, because `design-system` contains "WHEN a control is
      disabled THEN it does not respond to activation" D which uses the entire vocabulary while
      specifying only the *semantics* of a disabled control, conditioned on *when* it is disabled.

      ```
      0    of 181 scenarios MANDATE a control be disabled while a write is in flight
      3    requirement blocks mention the vocabulary, none of them about a disabled control
            (accessible interactive states; dataset not mutated; landing/screening/enrollment)
      0    files name the route /ready across all nine specs
      9 specs, 50 requirement blocks, 181 scenarios in force at measurement time

      **The `15 requirement blocks` figure this block originally recorded does NOT reproduce.**
      Re-derived here against six plausible definitions of both terms, the highest count any reached
      was 3. The `0` re-derives EXACTLY, which is what the finding rests on, so the conclusion stands
      and the supporting count moved. Recorded rather than dropped, because this is the first
      recorded instance in this repository of the verification pass itself introducing a figure that
      the next reader had to re-derive — the lesson that an enumeration is a claim to be re-derived
      rather than a fact to be inherited, applied to a number written minutes earlier.
      ```

      So the claim held for **`SF-4`** and **`RV-1`**, was **partial** for `SF-5`/`RV-2` (onward
      movement is implied by the `validator-onboarding` sequence, but no spec names the route), and
      was **wrong for `SF-1`, `SF-2`, and `SF-3`** D the three pending-state bindings, one of which
      (`SF-2`, the primary Continue button) `design.md` itself classes as **critical**.

      **What was corrected, and what deliberately was not:** the *rationale* was rewritten in both
      artifacts, with the per-site table and the measurements above. **`skip_specs: true` itself
      stands**, because its criterion is that no spec-level behaviour changed, and
      `git diff main --numstat -- src/` is empty — the flag never depended on the claim that was
      wrong. **No requirement was added**: the pending-state bindings already exist in the
      implementation, so this is a *pre-existing* gap of existing behaviour carrying no requirement,
      not new behaviour introduced here, and writing a requirement for it inside a change that
      alters no product behaviour is precisely the invention `openspec instructions specs`
      forbids D the same paragraph already declines on its own reasoning. The gap is recorded in
      `docs/ROADMAP.md`'s **Active Blockers** instead, as something to close **before Phase 5**
      extends these same components.

      **An honest note on my own process here:** the ROADMAP entry did not exist when
      `proposal.md` first claimed it did. A verification check that read the ROADMAP found the
      claim false D **I was making the exact defect class this change exists to repair, inside the
      repair.** It was then written, and the check re-run. This is the reason the check reads the
      other file rather than trusting the prose.

      **WARNING 2 D two recorded per-probe counts no longer reproduce. ANNOTATED, NOT OVERWRITTEN.**

      ```
      RV-1  mutant fcc647c1262d4c6e  recorded 1 failed | 14 passed (15)  now 5 failed | 10 passed (15)
      RV-2  mutant 906aada439cd14c7  recorded 1 failed | 14 passed (15)  now 2 failed | 13 passed (15)
      SF-5  mutant 582540d6c251dea0  recorded 1 failed | 14 passed (15)  still 1 failed | 14 passed (15)
      3.7   unit totals             recorded 1 failed | 880 passed (881)  now 1 failed | 896 passed (897)
      ```

      **The mutant hashes are byte-identical, and that is the whole diagnosis: the mutation did
      not change, the suite grew.** `tests/dom/feasibility-spike.test.tsx` was added to the `dom`
      project after 3.2 and 3.3 were recorded, and its `BAR A` / `BAR B` scenarios exercise the same
      stored-identifier and navigation behaviour, so they now fail with it D which is why `SF-5`
      is unchanged (its mutation does not touch the spike) while `RV-1` and `RV-2` moved. The
      audit file and its 16 tests moved the `unit` denominator the same way.

      **The original figures are KEPT.** They were correct when written, and a number that was
      right and has since been overtaken is a different defect from a number that was wrong;
      overwriting would destroy the record of when the measurement was taken. Each is now annotated
      with both figures and the cause. **The conclusions are unaffected and in one case stronger:**
      a mutation that breaks five independent tests is better evidence than one that breaks a
      single test.

      **WARNING 3 D the `201,600` / "84 keys" figure was wrong. CORRECTED to 204,000 / 85 keys in
      four files, with the reason recorded next to it.**

      **Four instruments disagreed on the key count and every one of them counted TEXT:** a
      quoted-key regex said 84, a depth-0 tokenizer said 92, the verification pass said 85, and my
      own first re-derivation said 92 as well. Ground truth was taken by **evaluating the module**
      through the project's own Vitest and reading `Object.keys(...).length`:

      ```
      englishKeys 85   filipinoKeys 85   identicalKeySets true   datasetRecords 600
      2 catalogs x 85 keys x 600 entries x 2 directions = 204,000
      unquotedInSource ["skipToContent"]
      ```

      **The 85th key is `skipToContent`, declared UNQUOTED** D which is exactly why a quoted-key
      regex reports 84, and why two such regexes agreeing on 84 is not evidence. That fact is now
      written into `tests/unit/locale-copy.test.ts` and `vitest.config.ts` so the number need not
      be re-derived. **A NEW inaccuracy in newly-written text, not an inherited one:** `main`
      already had 85 keys. Immaterial to the argument D still ~200k, still the right diagnosis D but
      a wrong number in a comment this change wrote is still a wrong number.

      **WARNING 4 D `AGENTS.md`'s `--specs` row was stale and self-contradictory. CORRECTED.**

      The row read "Totals: 6 passed, 0 failed (6 items)" while the command reports **9**, and the
      same file recorded the count rising "8/8 -> 9/9" at L566 D so it disagreed with itself.
      **PRE-EXISTING, not introduced here** (only the three `test:*` rows were edited), but it sits
      two rows above them, and a table that disagrees with itself is worse than a stale one.

      **The enumeration was re-derived from the command's own output rather than extended from the
      old six**, and the row's trailing clause was corrected too: it attributed every capability to
      the `od-dataset-schema-and-import` archive alone, which was true of six and is not true of the
      three that arrived with later archives (`batch-allocation`, `interface-localization`,
`validator-onboarding`), each now named with the change that synced it. The row now agrees with
      itself, with `openspec`, and with `git ls-tree -d`.

      **WARNING 5 D task 4.5 was ticked while deferring the confirmation it asked for. SPLIT.**

      4.5's own text said the by-name CI confirmation was DEFERRED D and ticked the box anyway.
      That is defensible only because the deferral was disclosed in the same box, which is fragile:
      **a deferral inside a ticked box is indistinguishable from completion to anyone scanning
      checkboxes.** The owed half is now **task 4.6, unticked**, so a scan for `- [ ]` finds it.
      4.5 covers the workflow edit, which is done and evidenced; 4.6 covers the CI log, which is
      not, and **must be completed before this change merges** D see the remaining box below.

      **What the pass did NOT check, stated so it is not read as covered:** it opened no PR and so
      ran no CI, which is precisely the gap 4.6 now tracks. It did not verify the recorded
      `P1`/`P2`/`P3`, `A1`-`A5`, or `P1`/`P2` probe transcripts, only that the guards they
      validate are real and non-vacuous D and two of those figures proved stale, which is why that
      limitation matters. No human visual verification: `happy-dom` is a synthetic DOM and nothing
      here says otherwise. Nothing about Supabase, Auth, Storage, Realtime, or gateway-enforced RLS,
      because no credentials exist.

      **The two instruments the pass itself got wrong, recorded because they generalise and
      because a verifier's own errors are part of its output:**

      1. A first `pnpm run lint` reported 2 unused-variable warnings in `screening-form.tsx` D
      which would have been a **confident false finding**. The mutation tool was concurrently
      editing that exact file, and the `SF-6` mutant replaces `toIlocanoProficiency(value)` with
      `null`, orphaning both identifiers. Re-run after restoration: clean, exit 0. **The tell was
      that the warnings were in precisely the file under mutation** D and the lesson is the one
      this repository already records: *the instrument, not the file, was wrong.*
      2. Two key-counting methods agreed on 84 and it nearly reported the documented figure as
      "confirmed", which would have missed WARNING 3 entirely. Evaluating the object said 85. **When
      two instruments disagree, the disagreement is the finding** D and picking the answer that
      agrees with the documentation is the one option guaranteed to launder an error.

      **My own instruments were wrong four further times while applying these five fixes**, all of
      them refused-to-write rather than wrong-writes: a guard demanding zero `U+FFFD` in a file that
      legitimately holds 3 as quoted lesson text; a `git ls-tree` count that included
      `openspec/specs/.gitkeep` (a blob in the right place with the wrong kind) and reported 10
      capabilities; a predicate comparing the number 9 to the string `"9"` with `===` and
      reporting "all three disagree" while all three plainly agreed; and a row self-check that
      counted 12 capabilities because its regex matched the enumeration and the provenance clause
      separately. The fourth is the instructive one: **a fix that leaves the surrounding sentence
      asserting something different is worse than the stale row it replaced**, which is why the
      count was corrected before the enumeration was, and the enumeration before the clause.
      measured table and this task list. Any CRITICAL blocks; any WARNING is fixed or explicitly
      accepted by the user, not silently dropped.
