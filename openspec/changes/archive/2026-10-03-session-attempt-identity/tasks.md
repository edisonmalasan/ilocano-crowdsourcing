# Tasks

Every measurement below was **run**, and the command that produced it is named. A count in this file
that was not re-derived during this Apply is labelled as prior record rather than presented as
current.

## 1. Measure before changing

- [x] 1.1 Enumerate every file under `src/` that reads or writes browser storage, and record the result in `tasks.md` as a **control count with the file names**, not as a bare "none". A later guard that reports "no violations" is only meaningful against a measurement of what it scanned. Verify by re-running the enumeration and confirming the recorded count still matches the tree.
- [x] 1.2 Write the two candidate detectors for "touches storage that outlives the session" as standalone functions, and run **both against the real `src/` tree as it is now**. Record each one's true-positive count and each one's false-positive count in `tasks.md`. A detector that has never run against the tree it guards is an assumption, and the batch-route verification pass found exactly that failure. Verify by re-running and confirming the recorded numbers reproduce.
- [x] 1.3 Write the **negative control** for each detector: a fixture containing a real violating line, and a fixture containing legitimate near-misses (a comment naming `localStorage`, a string literal containing the word, a file that mentions storage in prose). Record which fixtures each detector correctly ignores. A detector that fires on a comment is the `screening-form-wiring` defect this repository has already paid for once.

### 1.1 — the control count, with the file names

**The enumeration was re-run after this change's source edits, not before them, and the two figures are
therefore not a before/after pair.** Recorded as two whole-tree counts:

```text
BEFORE (naive token match over raw source, all four tokens)
  24 lines across 10 files, of which exactly 1 is code:
  src/lib/validators/browser-identity.ts -> globalThis.localStorage

AFTER (same detector, re-run on the tree as it now stands)
  19 lines across 4 files:
  src/app/layout.tsx                         1
  src/app/ready/page.tsx                     1
  src/lib/i18n/interface-locale-cookie.ts    3
  src/lib/validators/browser-identity.ts    14
```

The single code reach is **gone**: the module now reads
`const candidate = globalThis.sessionStorage;`. Every one of the 19 remaining lines is a comment, and
they are **correct** comments — this repository documents its reasoning at length, and
`interface-locale-cookie.ts` legitimately explains why the *interface locale* uses a cookie **by
contrasting it with `localStorage`**. A regex guard would have had a **95.8% false-positive rate on
correct code** here, which is the mechanical reason the naive detector could not simply be extended.

The per-file breakdown of the BEFORE figure was **not** re-derived line by line after the change, so
the 24 and the 19 are reported as two counts of the same detector rather than subtracted into a
per-file diff. What the guard itself pins is the AFTER state: the literal `localStorage` occurs **13
times across those 4 files**, all in comments, at 13 named `file:line` sites.

### 1.2 — both detectors, run against the real tree

| Detector | Form | True positives on this tree | False positives on this tree |
| --- | --- | --- | --- |
| A — naive token match over raw source | `source.includes(token)` | **24 lines across 10 files** | **23 of those 24 are comments**, i.e. a **95.8% false-positive rate on correct code** |
| B — the state machine that shipped | four states (code, line comment, block comment, string) plus a regex-literal state | **1** — the single real code reach | **0** |

Detector A is not a strawman: it is what `screening-form-wiring.test.ts`'s original guard was, and it
is the shape any future "just grep for it" guard would take. **A guard with a 96% false-positive rate
is a guard nobody keeps**, which is the mechanical reason the naive form had to be replaced rather than
merely supplemented.

The regex-literal state is not decoration and its necessity was measured rather than assumed: without
it, `const re = /https?:\/\//;` looks like the start of a line comment at its final `//` and
everything after it on that line is silently masked — a false **negative** inside the detector that
exists to prevent false negatives. Measured on this tree: **0 of 111 files contain a line with an
escaped slash**, so the class cannot currently mask anything here.

### 1.3 — the negative controls, and where they actually landed

Thirteen injected fixtures live in `attempt-storage-enumeration.test.ts` as source strings, and the
two that matter most were re-measured **against the real file** with a scoped probe
(`canfire-scanner-scoped.mjs`), each append-only, each restored byte-identical:

| Injected mutation | Expected | Measured, scoped to the scanner's own test |
| --- | --- | --- |
| `globalThis.localStorage` appended to the identity module | RED | RED `4 failed of 22`, naming four tests |
| `globalThis["localStorage"]` — bracket access with a literal name | RED | RED `4 failed of 22` |
| `globalThis.localStorage` appended to `src/components/ui/badge.tsx`, far from the identity module | RED | RED `2 failed of 22` |
| `globalThis.localStorage` appended to `src/lib/domain/text.ts`, a server-side domain module | RED | RED `2 failed of 22` |
| `indexedDB.open("x")` — to show the token list is not one name | RED | RED `1 failed of 22` |
| correct prose naming `localStorage` **in a comment** | GREEN | GREEN `1 passed \| 21 skipped` |
| correct prose putting the token **inside a string literal** | GREEN | GREEN `1 passed \| 21 skipped` |

**The last two rows needed a second probe, and the reason is the most useful thing in this section.**
`canfire-attempt-storage.mjs` scored them over the **whole file** and both came back RED with exactly
one failing test — `finds exactly the pinned mentions, and no others`. That test is not the scanner;
it is the **closed allow-list pin**, which counts *raw* `localStorage` mentions and demands a recorded
reason for each. So the two halves of one file **disagree on purpose**: the scanner must ignore prose,
and the pin must make adding prose a deliberate act. Scoring them together cannot tell "the scanner
misfired" from "the pin did its job", and the honest report is that the whole-file probe's `wantRed:
false` was the **wrong instrument**, not that the guard misfired. Re-scoped to the scanner's own test
name, both are green.

## 2. The storage the attempt token lives in

- [x] 2.1 Move `src/lib/validators/browser-identity.ts` from `localStorage` to `sessionStorage`, and rewrite the module's header comment so its rationale is the **attempt** rather than a returning visitor. The comment currently justifies the storage choice by anonymity and says `localStorage` by name in three places; all of that must be true of the code it now describes. Verify by re-reading the header against the implementation.
- [x] 2.2 Keep every property the module already had and the requirements already rely on: exactly one key owned by this module, format validation on read, discard-and-do-not-send on a malformed value, narrow guarded access that reports `absent` when the storage throws on **access**, an availability check that touches no key and writes nothing, and the exported key constant for tests. Verify by running `tests/unit/validators-browser-identity.test.ts` and confirming each of these still has a named test.
- [x] 2.3 Do **not** read, migrate, or delete any legacy `localStorage` value (design.md D5). Verify by a test that seeds a `localStorage` value and asserts the module returns `absent` while that value is still present afterwards — i.e. unread and undeleted.
- [x] 2.4 Rewrite `tests/unit/validators-browser-identity.test.ts` against a fake `sessionStorage`, keeping every existing case and its name where the behaviour is unchanged. Verify by running the file and confirming no test was dropped: compare the passing count with the file's pre-change count and account for every difference by name.

## 3. The guard that nothing in `src/` touches storage that outlives the session

- [x] 3.1 Add the enumeration guard from task 1.2, rooted at **all of `src/`** and not at one directory or one component (design.md D4). It must fail on a real violating line anywhere under `src/`, including a component, a hook, and a server module. Verify by running the new test file.
- [x] 3.2 **Prove it can fire, with a green control first.** Add a real violating line to a real file under `src/`, run the guard and observe RED; restore the file byte-identical and observe GREEN. Record both results, the mutation performed, and the restored file's hash in `tasks.md`. A guard that has only ever been seen green has not been shown to guard anything. **Do not skip the control**: a red result from a harness whose control was not green proves nothing.
- [x] 3.3 Close the recorded weakness in `tests/unit/guard-weakness.ts` for `the resume component does not reach globalThis either`, whose entry says plainly that "`window.localStorage` — only the literal `globalThis.` is forbidden in this component, so the same class of access it is guarding against is reachable by another route." Record how this change discharges that specific mutation, and update the entry's text to match what is now enforced. The audit test requires an entry for every `it(` in the audited files, so this edit and the table edit must land together.
- [x] 3.4 Update `tests/unit/screening-form-wiring.test.ts`'s existing storage guard, whose current `not.toMatch(/localStorage/)` over one component is the list-not-definition defect. Keep its test name — `guard-weakness-audit.test.ts` asserts the table entry and the test stay in step. Verify by running both files together.

### 3.2 — the can-fire measurement, with its control

`canfire-attempt-storage.mjs`, seven append-only probes, **control GREEN `22 passed (22)` first**:

| Probe | File mutated | Unmutated sha256 | Verdict | Restored byte-identical |
| --- | --- | --- | --- | --- |
| a real `localStorage` reach | `src/lib/validators/browser-identity.ts` | `3138371959bdcff9` | RED `4 failed \| 18 passed (22)` | yes |
| bracket access `globalThis["localStorage"]` | same | `3138371959bdcff9` | RED `4 failed \| 18 passed (22)` | yes |
| a reach in a **component** far from the identity module | `src/components/ui/badge.tsx` | `e18d1ad4d4a7e056` | RED `2 failed \| 20 passed (22)` | yes |
| a reach in a **server-side domain module** | `src/lib/domain/text.ts` | `5f8507738180a350` | RED `2 failed \| 20 passed (22)` | yes |
| an `indexedDB` open, to show the list is not one name | `src/lib/domain/text.ts` | `5f8507738180a350` | RED `1 failed \| 21 passed (22)` | yes |
| correct prose in a comment | `browser-identity.ts` | `3138371959bdcff9` | RED `1 failed` — **the allow-list pin, not the scanner**; re-scoped, GREEN | yes |
| the token inside a string literal | `browser-identity.ts` | `3138371959bdcff9` | RED `1 failed` — same test; re-scoped, GREEN | yes |

The third and fourth rows are the ones that discharge the batch-route verification finding directly:
a guard scoped to `src/app` plus three navigation idioms passed violating sites green, and this one is
rooted at all of `src/` and goes red for a component and for a server module alike.

### 3.3 / 3.4 — what the two recorded weaknesses now rest on

- `guard-weakness.ts`'s resume-component entry previously forbade only the literal `globalThis.`. It
  now records that the whole-`src/` guard closes that route — and, honestly, that it closes it by
  forbidding `globalStorage` as a **token** and `globalThis[name]` by **shape**, so a computed
  property name remains invisible. The entry states the residual rather than implying the weakness is
  gone.
- `screening-form-wiring.test.ts` **keeps its test name** (the audit test requires the two to stay in
  step) and now states its component scope in the body and delegates the closed set to
  `attempt-storage-enumeration.test.ts`. The three files together measure **53 tests**
  (`screening-form-wiring` + `guard-weakness-audit` + `attempt-storage-enumeration`).

## 4. Retiring the attempt

- [x] 4.1 Change `FinishedBatch`'s FINISH from a bare `<Link>` to a control that discards the attempt token and then navigates to the same internal `FINISH_HREF` (design.md D3), clearing before navigating. Keep `FINISH_HREF` exported. Do not give the control an unmount effect, a cleanup, or any other path that could retire an attempt the participant did not choose to finish. Verify by reading the finished component and confirming there is exactly one place the token is discarded.
- [x] 4.2 Replace the assertion in `tests/dom/finished-batch.test.tsx` that Finish is a link with no handler. The replacement asserts the property that actually survives: activating Finish invokes **no Server Action** (no request leaves the component) **and** the attempt token is discarded **and** navigation is requested. Verify by running the file and by confirming the old assertion is gone rather than merely supplemented.
- [x] 4.3 Add the `happy-dom` half honestly: record in the test file's header that `happy-dom` here exposes neither `localStorage` nor `sessionStorage`, measured rather than assumed, so the stub proves wiring and not storage behaviour. Verify by a test that asserts the stub is in use, so the file cannot silently start claiming more than it can see.

### 4.1 / 4.2 — what shipped, and how it was held

`FINISH_HREF` is still exported and still `/`; the control is a `<Button variant="secondary" size="lg"
fullWidth>` whose handler calls `clearStoredValidatorId()` and then `router.push(FINISH_HREF)`. There
is exactly one `clearStoredValidatorId()` call site in the file, and there is **no** unmount effect and
**no** cleanup.

The old assertion — that Finish is a link with no handler — was **replaced, not supplemented**, because
the component it described no longer exists: it proved a link had no handler, and a button that has one
satisfies neither half of it. Its replacement asserts the ordered log is exactly
`["clear-token", "push:/"]`, that no request left the component, and that the control is a `<button>`
and not an anchor or a form.

`tests/dom/finished-batch.test.tsx` is **20 tests**. `tests/dom/finish-retires-attempt.test.tsx` is
**6 tests** and drives the **real** identity module against **real** `sessionStorage` (see Corrections).

### 4.2 — the four can-fire probes, each with a green control and a byte-identical restore

`canfire-finish-token.mjs`. Control GREEN `6 passed (6)` and `20 passed (20)` before each probe:

| Probe | Mutation | Verdict | Restored |
| --- | --- | --- | --- |
| discard the whole storage instead of one key | `storage.removeItem(IDENTITY_KEY)` → `storage.clear()` | RED `2 failed \| 4 passed (6)` | byte-identical |
| retire the attempt on unmount | added the `useEffect` import **and** the effect — two edits, not one | RED `1 failed \| 5 passed (6)` | byte-identical |
| navigate before discarding | `router.push` hoisted above `clearStoredValidatorId()` | RED `1 failed \| 19 passed (20)` | byte-identical |
| discard when Continue is pressed instead | clear moved into the Continue handler | RED `2 failed \| 18 passed (20)` | byte-identical |

The third probe is also a **scope** measurement: run against `finish-retires-attempt.test.tsx` it was
NOT ATTRIBUTABLE, because both effects there are synchronous. Scoped to `finished-batch.test.tsx`, where
the ordering is observable, it went red by name. A probe that cannot reach the behaviour it names must
report that, not a pass.

## 5. Copy that stated the old model

- [x] 5.1 Rewrite `resume.body` in **both** catalogs so it refers to continuing within this browser session and makes no claim about having taken part on this browser before. `interface-localization` requires the two languages to carry the same meaning, so English and Filipino change together and neither is the weaker rendering. Verify with a rendered-markup assertion over both locales.
- [x] 5.2 Rewrite `validate.finished.finishNote` in both catalogs so it states that what was submitted is unchanged **and** that taking part again means starting a new participation, rather than implying the participant will be resumed. It must still say nothing about how many batches anyone ought to do. Verify with a rendered-markup assertion over both locales and a negative assertion that no forbidden phrasing survives in either language.
- [x] 5.3 Confirm no other catalog string claims recognition across sessions. **Enumerate the catalogs and read every string that mentions coming back, continuing, returning, or being recognised**, and record the count read — not the count of violations found, which is a different number and a much weaker claim. Verify by re-running the enumeration.

### 5.3 — the count READ, which is the number task 5.3 asks for

The English and Filipino catalogs were enumerated and every string mentioning coming back, continuing,
returning, or being recognised was read. **24 `locale:key` entries** were read in total — **11 English
and 13 Filipino** — and that closed set is pinned in `tests/unit/locale-copy.test.ts` (45 tests) as an
exact list, so a twenty-fifth such string fails rather than passing unnoticed. Two of the 24 are the two
this change rewrote. **The count of violations found is 0 and that is the weaker number**: it would be 0
if the enumeration had read nothing, which is why the 24 is the figure recorded.

## 6. Comments that name the storage they no longer describe

- [x] 6.1 Correct every comment under `src/` that names `localStorage` as the reason for a decision — including the press-time-read rationale in `start-batch.tsx` and `finished-batch.tsx` and the load-time rationale in `resume-validator.tsx` — so each states the reason that still holds. The reasoning (storage does not exist while the server renders) is unchanged; only the storage's name is. Verify by enumerating `src/` for the literal and confirming every remaining occurrence is either the new correct statement or a deliberate historical quotation.
- [x] 6.2 Decide and record, per remaining occurrence, whether it is code, comment, or string. A comment that says `localStorage` while the code says `sessionStorage` is the class of defect this repository's `ledger-integrity` and copy guards exist for, and it is invisible to every behavioural test.

### 6.1 / 6.2 — the enumeration, before and after

**Two different measurements, and they must not be subtracted from each other.** Before this change,
a naive token match over raw source found **24 lines across 10 files** for all four long-lived storage
tokens, of which **exactly 1 was code** and 23 were comments. After this change, the literal
`localStorage` alone appears **13 times across 4 files**, every one of them in a comment. The first
figure covers four tokens, the second covers one, so "23 → 13" would be an arithmetic claim about two
different quantities and is not made here.

**11 comment sites were corrected across 7 files:**

```text
src/app/ready/page.tsx                          1  the cookie rationale (a cookie exists because middleware cannot read storage)
src/app/start/screening-form.tsx                2
src/app/validate/start-batch.tsx                4  including the press-time-read rationale
src/app/validate/[batchId]/finished-batch.tsx   1  the same press-time-read rationale, in the component that changed most
src/components/onboarding/resume-validator.tsx   1  the load-time rationale
src/lib/validation/recovery-actions-core.ts     1
src/lib/validators/onboarding-actions-core.ts   1
```

The reasoning at each site is unchanged — *storage does not exist while the server renders* — and only
the storage's **name** changed. `screening-form.tsx` deliberately says "browser storage" rather than
naming either API, because `screening-form-wiring.test.ts` asserts `not.toMatch(/sessionStorage/)` and
`/localStorage/` over that file and the guard has a reason to be narrow there.

Every one of the 13 remaining occurrences is **a comment** — asserted mechanically by
`attempt-storage-enumeration.test.ts`, which pins the exact 13 `file:line` sites, asserts each sits in
a comment, and requires a stated reason for each. Two categories remain deliberately:

1. **History.** `browser-identity.ts`'s header explains why the storage moved and therefore has to name
   the storage it moved from. Removing the name would make the rationale unverifiable.
2. **A correct statement about something else.** `interface-locale-cookie.ts` explains why the
   *interface locale* uses a cookie by contrasting it with `localStorage`. That is the
   interface-localization rule working as specified, and deleting the contrast would delete the reason.

Zero occurrences are code. Zero are strings.

## 7. Durable rules that still state the superseded methodology

- [x] 7.1 Correct `AGENTS.md` lines 90–93. They currently state the three-distinct-validators target **twice** and the persistent-identity model. Replace them with the approved methodology: an entry is complete when **one** validation establishes the complete package; `cannot_evaluate` leaves it incomplete and eligible; within one attempt no entry is answered twice; and no part of the platform may claim an attempt identifier proves a distinct human. Verify by re-reading the corrected lines against `proposal.md`'s Why and the `participation-attempt` delta.
- [x] 7.2 Correct the stale `pnpm run test:unit` ledger row in `AGENTS.md`, which reads `54 files, 1434 tests` against a measured `73 files, 1639 tests`. Record the measurement and the date, and state what the count does **not** prove, as the surrounding rows do. Verify by running the command and comparing.
- [x] 7.3 Check whether `AGENTS.md`'s "Verified project tools" section asserts anything about browser storage, `localStorage`, or the returning-validator model, and correct it. Verify by enumerating `AGENTS.md` for those terms and accounting for every hit.

### 7.2 — the measurement, and the baseline it is a delta from

The `task 7.2` figure of `73 files, 1639 tests` is **the branch baseline**, and it was measured rather
than read: the working copy was `git stash`ed, the command run, and the stash popped.

```text
branch baseline (working copy stashed)   unit  73 files, 1639 tests
branch baseline (working copy stashed)   dom    7 files,   87 tests
this Apply                              unit  74 files, 1670 tests   (+1 file, +31 tests)
this Apply                              dom    8 files,   96 tests   (+1 file,  +9 tests)
```

The `dom` row's `7 files, 87 tests` was measured the same way, which is how the prior row's own figure
was found to be *exactly* the branch baseline — i.e. the row was not stale by one change, it was
correct as of `researcher-admin-access` and had simply never been re-measured since.

### 7.3 — every hit in `AGENTS.md`, accounted for

`enumerate-agents-storage.mjs` searched the whole file for `localStorage`, `sessionStorage`,
`indexedDB`, `browser-local`, `browser storage`, `returning`, `recognised`/`recognized`,
`distinct validator`, `3 distinct`, `three distinct`, `coverage`, `persistent`, and
`validator identifier`: **35 term hits across 21 lines.** Every one is accounted for:

| Where | Hits | Disposition |
| --- | --- | --- |
| Project overview | 2 | Both are the phrase "coverage-aware", which is still true. Not a claim about 3 validators. |
| Stack | 2 | **Corrected.** The bullet said "browser-local storage may retain only the anonymous validator identifier/session convenience state"; it now names the **attempt** identifier and says **session-scoped**, because "browser-local" was true but no longer specific after this change. |
| Durable product & UX constraints | 7 | Lines 90–94 **rewritten** (task 7.1). The remaining three are line 93's "browser storage scoped to the browser session", line 94's "recognised as the same person as before", and line 101's interface-localization rule, which is a **different** feature whose storage genuinely is browser-local. |
| Verified project tools | 14 | **Two rows corrected** (`test:unit`, `test:dom`): the `localStorage` write claim, the "Finish is a link with no handler" claim, and the "happy-dom exposes neither `localStorage` nor `sessionStorage" claim were all false after this change. The rest are the new, correct statements recording the measurement. |
| Repository tooling notes | 10 | All are either a historical note about a **change name** (`coverage-aware-allocation`, `research-schema-guarantee-coverage`), the word "coverage" in the sense of test coverage, or a roadmap phase title. None is a claim about the methodology. |

**Two rows beyond the task's literal scope were corrected anyway**, because leaving them would have put
two contradictory measurements in one repository:

- `openspec validate --specs --strict` read **`12` passed (12 items)** against a measured **17**. That
  row had been stale across **four** archived changes. `participation-attempt` lives only under
  `openspec/changes/` while this change is active, so **17 is also the leak check passing**.
- `pnpm run test:integration` read `10 files, 170 tests` against a measured **12 files, 197 tests**.
  This change moved that number by nothing — it touches no file under `tests/integration/` and none
  under `supabase/migrations/` — which is stated in the row so the correction is not misread as this
  change's work.

## 8. Full verification

- [x] 8.1 Run `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test:unit`, `pnpm run test:dom`, `pnpm run test:integration`, and `pnpm run build`, and record each result with its actual numbers. **A green build is not a test result and a green type-check is not a behavioural one.**
- [x] 8.2 Run `openspec change validate session-attempt-identity --strict` and `openspec validate --specs --strict`, and record the in-force spec count, which must still be **17** — a proposal creates no in-force spec, and a rise here would mean the delta was written to the wrong place.
- [x] 8.3 Run the dataset guard on its own (`pnpm exec vitest run --project integration tests/integration/immutable-dataset.test.ts`) and confirm `data/ilocano-synthetic-data.json` is untouched by this change. `git status` must show no modification to it.
- [x] 8.4 Record what this change does **not** verify, explicitly: no browser was opened, no real `sessionStorage` was exercised, and no second-tab behaviour was observed. `happy-dom` performs no real storage and no real navigation, so every DOM assertion here is a wiring assertion.

### 8.1 — actual results, 2026-10-03

| Command | Result |
| --- | --- |
| `pnpm run format:check` | exit 0, "All matched files use Prettier code style!" — **after** `prettier --write` on four files, which is recorded because it is the first time this change touched a formatter-owned file since it began |
| `pnpm run lint` | exit 0, no errors and no warnings |
| `pnpm run typecheck` | exit 0, **after** repairing five type errors — see Corrections |
| `pnpm run test:unit` | exit 0 — **74 files, 1670 tests passed** |
| `pnpm run test:dom` | exit 0 — **8 files, 96 tests passed** |
| `pnpm run test:integration` | exit 0 — **12 files, 197 tests passed** |
| `pnpm run build` | exit 0, Next.js compiled successfully; nine routes, all `ƒ (Dynamic) server-rendered on demand` |

**A green build is not a test result.** No route in this change is data-backed and no browser was
opened, so the build proves the tree compiles and nothing about how the finished screen behaves.

### 8.2 — specification validation

```text
openspec change validate session-attempt-identity --strict
  → exit 0, "Change \"session-attempt-identity\" is valid"
    (the deprecation warning recommending verb-first commands is expected and is not a failure)

openspec validate --specs --strict
  → exit 0, "Totals: 17 passed, 0 failed (17 items)"
```

**17 is the required figure and it is the leak check passing**: `participation-attempt` is a delta under
`openspec/changes/` and is not in force while this change is active. A directory appearing under
`openspec/specs/` during this Apply would have meant the delta was written to the wrong place.

### 8.3 — the immutable research source

```text
pnpm exec vitest run --project integration tests/integration/immutable-dataset.test.ts
  → exit 0, 1 file / 7 tests passed

git status --short data/    → empty
git diff --stat -- data/ supabase/   → empty
```

`data/ilocano-synthetic-data.json` is untouched, and so is every file under `supabase/migrations/`.
This change adds no migration: `validations` already carries `UNIQUE (validator_id, dataset_entry_id)`,
which under an attempt-scoped identity **is** the approved within-attempt rule.

### 8.4 — what this change does NOT verify

Stated plainly, because several of these are the property the requirement is actually about:

- **No browser was opened.** No screen was rendered by a human or by a real engine.
- **No real `sessionStorage` was exercised.** See Corrections: `happy-dom` provides a working
  `Storage`, and its behaviour is **not** a browser's. Tab scoping, survival across a reload, and
  clearing when the session ends are all unverified here. What is verified is only **which API the
  module calls**.
- **No second tab was opened**, so the tab-scoping claim is a property of the API's name and nothing
  more.
- **No real navigation occurred.** `happy-dom` performs no navigation and no form submission, so
  `router.push("/")` is observed as a recorded call in an ordered log, never as a page change.
- **No Supabase client was constructed.** This change touches no server module.
- **Nothing about human uniqueness.** An attempt identifier is an anonymous participation record; the
  change forbids the platform from presenting it as a distinct person and implements no way to know
  whether two attempts are one person, because no such way exists here.
- **The two halves of the storage guard disagree on purpose** and this is recorded rather than smoothed
  over: the state machine ignores prose, the closed allow-list does not. See 1.3.

---

## Corrections

Findings that falsified something this change or an earlier one had recorded. Each was measured, and
each names what it cost.

### C1 — Task 4.3's stated premise was FALSE, and the false half was the useful half

Task 4.3 said: *record in the test file's header that `happy-dom` here exposes neither `localStorage`
nor `sessionStorage`*. Measured on the real `happy-dom` document:

```text
globalThis.localStorage   undefined
window.localStorage       undefined
globalThis.indexedDB      undefined
window.indexedDB          undefined
globalThis.caches         undefined
window.caches             undefined
globalThis.sessionStorage  PRESENT   ctor = Storage   length = 1   round-trip = "v"
window.sessionStorage      PRESENT
```

`localStorage`, `indexedDB` and `caches` really are absent; **`sessionStorage` is present, is a real
`Storage`, and round-trips a value.** The premise was half right, which is the worst shape for a
premise: it reads as a measurement and functions as a decision.

**What it changed.** The half of the premise that was wrong was the one that removed the only reason to
stub the module. A second DOM file, `tests/dom/finish-retires-attempt.test.tsx` (6 tests), was added
that drives the **real** identity module against **real** `sessionStorage` — so the Finish control's
removal is asserted as a **removal of a key**, with an unrelated key proven to survive, rather than as
a call to a stub. `finished-batch.test.tsx` keeps its stub, because it needs to count reads and to
control the identity module; `vi.mock` is file-wide, which is the whole reason the second file exists.

**What it did not buy, and this is the part worth keeping.** `happy-dom`'s `Storage` is an in-memory
object. It has no tab scoping, no reload survival, and no session-end clearing. So the requirement's
actual subject — *scoped to the browser session* — remains verified only as a statement about which API
the module calls. A guard that passed here and a module that called `localStorage` would both be caught;
a requirement about session **behaviour** is not verified by anything in this change.

### C2 — Five type errors were invisible to a fully green test suite

`tsc --noEmit` failed with **5 × `TS2558: Expected 0 type arguments, but got 1`** — all five introduced
by this change, all five in `view.all<HTMLButtonElement>("button")`, where `happy-dom`'s `all` takes no
type arguments. **Both DOM files were green throughout**: `8 files, 96 tests` passed with the type
errors present.

The general form is the mirror of the one this repository records about builds: a green build is not a
test result, and here **a green test run is not a type-check result**. Vitest transforms through esbuild,
which erases types without checking them, so a type error is invisible to the runner by construction.
The repair used the file's existing convention — `view.all("button") as HTMLButtonElement[]` — which is
what four other DOM files already did.

The process finding is the part to keep: this Apply ran the unit and DOM suites many times before it
ever ran `typecheck`, and every one of those runs was green. **Run the cheap whole-tree checks
first.**

### C3 — A PowerShell output limiter killed a probe mid-run and left a mutation in the source tree

`canfire-attempt-storage.mjs` was piped into `Select-Object -First 60`. That does not merely truncate
displayed output: PowerShell **stops the upstream command**, so the Node process died between probe 6
and probe 7 with probe 7's append already written to `src/lib/validators/browser-identity.ts`.

Three things made this dangerous rather than merely untidy:

1. **`git status` could not see it.** The file was *already* modified by this change, so the leak added
   no new entry to the status output. A reviewer comparing `git status` before and after would have
   seen nothing.
2. **The residue was a plausible line of code**, not a marker: `const probeLabel = "do not reach for
   localStorage here";` at the end of the identity module.
3. **It survived a green-looking check for a while.** The leaked line is inside a *string*, so the
   state-machine scanner correctly ignored it; only the closed allow-list pin, which counts raw
   mentions, went red — and that red appeared as a single failing test in a 22-test file.

It was removed and the file restored to **`3138371959bdcff9…`, the probe's own reported pre-mutation
digest**, which is a better control than "it looks right": the artefact's own report named the
fingerprint of the clean state. The lesson generalises past PowerShell — **a display filter that stops a
producer is a mutation that never gets restored**, and the harness must be the thing that restores,
not the reader's scrollback.

### C4 — Two ledger rows were stale before this change and were corrected with it

`pnpm run test:integration` read `10 files, 170 tests` against a measured **12 / 197**, and
`openspec validate --specs --strict` read `12` against a measured **17**. Neither was made stale by
this change; both were found because this change re-ran the commands. Both rows now carry the
measurement, the date, and — for the integration row — the explicit statement that **this change moved
it by nothing**, so the correction is not misread as this change's work.

The general form is already in `AGENTS.md` and this is another instance of it: **a ledger row is a
measurement with an expiry date**, and "which change made it stale" is a different and less useful
question than "is it stale now".

### C5 — A repair script duplicated a sentence, and the first attempt to fix it was itself wrong

While correcting a ledger row, a stale `next:` line left over from an earlier anchor attempt was applied
alongside the intended one, inserting a second copy of a sentence inside the `interrupted-batch-recovery`
row. The repair needed its own repair, and the first repair script **refused to write** because its
digest check disagreed — correctly: the anchor it removed left a trailing blank line, so the file was
still not byte-identical to the probe-reported digest.

The general form: **a patch script's post-condition must be a property of the artefact, not of the
replacement text.** Checking "the new string is present" would have passed on the damaged row; checking
"the damaged run's digest equals the digest the artefact itself reported" is what caught it.