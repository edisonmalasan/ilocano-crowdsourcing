# Tasks

## 1. Server-side enrollment service

- [x] 1.1 Create `src/lib/validators/enrollment.ts` as a `server-only` module exporting an
      `enrollValidator(input, deps)` function whose dependencies are a `ValidatorsRepository` and
      a `now: () => Date` function, and verify by type-checking that neither the repository
      implementation nor a Supabase client is importable from it.
- [x] 1.2 Have the service mint the identifier with `createAnonymousValidatorId()`, derive
      `createdAt` and `lastActiveAt` from the injected clock, set `totalValidations` to `0`, and
      call `validators.create(...)` exactly once; verify with a recording fake repository that the
      stored profile carries the minted identifier and the injected clock's exact ISO timestamp.
- [x] 1.3 Add an `EnrollmentOutcome` discriminated result covering enrolled, failed, and
      already-exists conditions rather than throwing for expected outcomes; verify a unit test
      asserting each branch is reachable and that no branch is an untyped string.
- [x] 1.4 Add a unit test proving the service never reads an identifier, timestamp, or counter from
      its input: submit an input carrying extra authoritative-shaped keys and assert the persisted
      profile's identifier differs from the supplied one and its timestamps equal the injected
      clock's. Verify the test fails if the service is changed to prefer supplied values.
- [x] 1.5 Add a `resumeValidator(storedId, deps)` path that calls `validators.findById`, returns
      restored when the profile exists, and reports absent otherwise without throwing; verify both
      branches against the fake repository.

## 2. Client-side anonymous identity storage

- [x] 2.1 Create `src/lib/validators/browser-identity.ts` as a client-only module exporting
      read, write, and clear functions over a single documented storage key; verify by reading the
      module that it imports no server module and holds no Supabase or repository import.
- [x] 2.2 Validate any stored value against `anonymousValidatorIdSchema` on read and return absent
      for anything malformed, clearing the bad entry as a side effect; verify a unit test over
      malformed, empty, and well-formed stored values.
- [x] 2.3 Guard `localStorage` access so an unavailable storage (private browsing, disabled storage,
      throwing getter) is reported as absent rather than raising; verify with a fake storage object
      whose accessors throw, and verify the enrollment path still completes in that case.
- [x] 2.4 Assert in a unit test that the module reads and writes no key other than the identity
      key, and stores no screening answer, batch, or research response; verify by inspecting the
      fake storage's recorded operations.

## 3. Screening form client component

- [x] 3.1 Create `src/app/start/screening-form.tsx` as a client component rendering `AnswerGroup`
      with `ILOCANO_PROFICIENCY_QUESTION` as the legend, `ILOCANO_PROFICIENCY_SUPPORTING_COPY` as
      the hint, and options mapped from `ILOCANO_PROFICIENCY_CHOICES` in declared order; verify a
      `react-dom/server` test asserting the rendered markup contains all five labels in order and
      the exact question string.
- [x] 3.2 Make the form submittable with no proficiency selected, carrying an explicit
      "skip and continue" affordance, and verify a test that submitting with no selection still
      invokes the action and is not blocked by client validation.
- [x] 3.3 Render the voluntary-participation and privacy notice on the same screen as the question,
      naming voluntariness, the ability to stop, and the absence of name, email, student ID, and
      phone collection; verify a rendered-markup test asserting each of those statements is present
      in the screening screen's output.
- [x] 3.4 Surface a rejected submission's field error on the screening control, and a pending state
      that disables the submit affordance while the action runs; verify a rendered-markup test for
      the error text and a test that the submit control is not left enabled during a pending action.
- [x] 3.5 Add a test asserting no unselected screening option carries an accent treatment class, and
      that the screening and validation option treatments are produced by the same frozen constant;
      verify the test fails if `AnswerGroup` is bypassed or given a per-option className.

## 4. Server actions

- [x] 4.1 Create `src/lib/validators/actions.ts` with an `enrollValidator` action that re-parses its
      payload through `parseWriteIntent` before touching a repository; verify a test asserting an
      invalid payload results in zero repository calls.
- [x] 4.2 Ensure the enroll action constructs its repositories through the existing
      `createSupabaseRepositories` factory and never imports them into a client module; verify by
      running `pnpm run lint`, whose `sadino/no-privileged-imports` rule must pass.
- [x] 4.3 Add a `resumeValidator` action that re-validates the submitted identifier against the
      shared schema, treats an unrecognised identifier as absent rather than as an error, and
      returns no stored profile fields to the client; verify a test asserting the returned payload
      contains no proficiency, counter, or timestamp.
- [x] 4.4 Map a missing database configuration to a distinct not-configured outcome whose message
      is plain language and contains no technical detail, and keep every other failure on a
      separate generic-failure outcome; verify two tests asserting neither message leaks a
      credential, a stack frame, or an environment variable value, and that they are distinguishable.
- [x] 4.5 Add tests that no outcome reporting success reports a stored identifier unless the
      repository call actually succeeded, including the case where the repository raises; verify by
      asserting the failure outcome carries no identifier.

## 5. Routes

- [x] 5.1 Create `src/app/start/page.tsx` as a Server Component rendering the screening form and the
      notice, with a page title and a single `h1`; verify a rendered-markup test for the heading,
      the title, and the absence of a second `h1`.
- [x] 5.2 Create `src/app/ready/page.tsx` as a Server Component confirming enrollment, stating that
      no name, email, student ID, or phone was collected, and stating plainly that receiving
      sentences arrives in a later phase; verify a rendered-markup test asserting it links to no
      route that does not exist and that the later-phase statement is present.
- [x] 5.3 Update `src/app/page.tsx` so the start action is a real link to the screening route and
      the "not open yet" notice is replaced by the actual next step; verify a rendered-markup test
      asserting an `href` to the screening route and that the stale notice text is gone.
- [x] 5.4 Verify the landing and confirmation routes still render with no database reachable, so the
      `application-foundation` requirement stays true; verify with `pnpm run build` that every route
      compiles and reports in the route table.

## 6. Verification and documentation

- [x] 6.1 Run `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck`, `pnpm run test:unit`,
      `pnpm run test:integration`, and `pnpm run build`, and record the observed results in
      `AGENTS.md` with what each command proves and does not prove, including that no Supabase
      client was constructed and no migration was applied.
- [x] 6.2 Prove the new tests are load-bearing by temporarily breaking the implementation for each
      of: the server-minted identifier, the injected clock, the write-intake re-validation, the
      stored-value format check, and the screening option order, confirming the expected test goes
      red each time and restoring the implementation; record which test failed for each break in
      this file.
- [x] 6.3 Update `docs/ROADMAP.md`'s `Project Status` block to move the lifecycle state to
      `verifying` for this change, add the local verification evidence table, and record the D5
      identifier-entropy open question in `Open Decisions` so it reaches the thesis team.
- [x] 6.4 Confirm `data/ilocano-synthetic-data.json` is unchanged by the whole change, by blob hash
      against `main`, by SHA-256, and by an empty `git diff main -- data/`.
- [x] 6.5 Confirm the completed implementation against the `validator-onboarding` spec and the
      `design-system` delta requirement by inspecting the code and tests, and record any requirement
      that is not satisfied by executable evidence in this file rather than leaving it silently
      unticked.

---

## Verification record

Recorded after the fact from the commands that were actually run. Nothing here is
inferred from the plan.

### Commands, with observed results

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0 — required to repair the working tree, see the note below |
| `pnpm run lint` | exit 0, no errors, no warnings |
| `pnpm run format:check` | exit 0, "All matched files use Prettier code style!" |
| `pnpm run typecheck` | exit 0 |
| `pnpm run test:unit` | exit 0 - 22 files, 509 tests passed |
| `pnpm run test:integration` | exit 0 - 4 files, 69 tests passed |
| `pnpm run build` | exit 0, "Compiled successfully"; `/`, `/_not-found`, `/ready`, `/start` all prerendered static |
| `openspec validate landing-and-screening --strict` | exit 0, "Change 'landing-and-screening' is valid" |
| `openspec validate --specs --strict` | "Totals: 6 passed, 0 failed (6 items)" |

> **The unit counts across the five review rounds were 445, 497, 506, 506, and 509.** The flat
> stretch is the interesting part and is not an absence of findings.
>
> - **445 -> 497**, round one: a discarded screening answer, an assertion comparing a function to
>   itself, and eight smaller repairs. Real defects a green suite had missed.
> - **497 -> 506**, round three: **four call sites of fully-tested functions were unguarded** -
>   deleting the storage write, deleting the resume early return, adding a `create` to the restored
>   branch, and fabricating an answer from the skip control each left the whole suite green.
> - **506 -> 506**, round four: three *more* unguarded call sites, all adjacent to the ones round
>   three had just repaired, each left the whole suite green - and all closed by strengthening
>   **existing** assertions rather than adding new ones, which is why the count did not move.
> - **506 -> 510**, round five: a participant-facing falsehood on `/ready` (a route reachable by
>   typing the URL, attesting to a database write that never happened) **and a dead end** (the
>   same route offering no way to begin, while telling the visitor they could finish); a message
>   claiming a storage clear nothing performed; and a test that asserted nothing at all.
>
> That no increase is a sign of ordinary maintenance. Every one of these movements came from
> independent review finding something a fully green suite could not see, and the tests exist to
> make those specific defects impossible to reintroduce.
>
> That is the entire point of the number moving. A suite that only grows when something breaks is
> not being maintained; it is being corrected, which is the same activity at three times the rate.

**The working tree was damaged during review, and the repair is part of the record.** The
reviewer ran its mutation probes in a throwaway copy under `%TEMP%`. All 13 direct dependency
junctions in the real `node_modules` ended up pointing into that copy, and deleting the copy
left them dangling — `pnpm run typecheck` failed with `Cannot find module
node_modules/typescript/bin/tsc`. `pnpm install --frozen-lockfile` repaired every junction
(exit 0, `pnpm-lock.yaml` unchanged). The source tree and the dataset were not touched:
`git status` showed only this change's own files, and the dataset blob still hashes to
`acaaa05ac83c3a67f9eb1e81b4432d4b11da6263`. Worth recording because the failure mode was
silent and would have been easy to misread as a code problem.

### What these do NOT prove

- **No Supabase client was ever constructed.** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` are all absent, so `getServerEnv()` throws
  `ServerEnvError` on every real request. The enrollment and resume logic is proven
  against an in-memory fake; the hop from the repository to PostgREST is unexercised,
  exactly as in Phase 2. Nothing in the suite pretends otherwise — the action core is
  tested through its injected dependencies precisely so that no test needs a database.
- **A successful build is not a behavioural result.** It proves four routes compile and
  prerender. It says nothing about the flow working, which is what the 497 unit tests
  and the probe run below are for.
- **No browser ever rendered any of this.** `renderToStaticMarkup` produces the HTML a
  server render would; it does not run effects, does not fire click handlers, and does
  not execute the Server Action round trip. The submit-time resume check, the
  `localStorage` write, and the navigation to `/ready` are proven by the pure decision
  functions plus unit tests on `browser-identity`, not by anything that clicked a button.
  Where a component-level property could not be reached that way, it is covered by a
  source-text assertion in `screening-form-wiring.test.ts`, and that file says plainly in
  its header that a string assertion is weaker than a behavioural one.
- **WCAG contrast is inferred from the token values, not measured.**
- **Three behaviours were verified by review only, and were not verified by review
  either** — they were not verified at all, which is worse and is what review found. See
  the retraction below.

### Retraction: an earlier version of this record overstated its own evidence

An earlier draft of this file ended with the sentence **"No requirement in this change is
left without executable evidence."** That claim was false and is withdrawn.

Independent review demonstrated it false by replacing the screening form's `AnswerGroup`
with a bespoke `role="radiogroup"` that gave one *unselected* option an accent surface,
and by deleting the pending state and all error rendering. The full 445-test suite stayed
green. The specific lie was in the coverage table below, which claimed that "screening
options no more weighted than validation options" was evidenced by
`answerOptionClasses({selected:false})` "compared directly for both screens". That
assertion compared one function to one argument against itself:

```ts
const screening  = answerOptionClasses({ selected: false });
const validation = answerOptionClasses({ selected: false });
expect(screening).toBe(validation);
```

It touched neither screen. It could not go red for any possible change to the code. The
same applied to the claimed pending-state and error-surfacing coverage, neither of which
`renderToStaticMarkup` can observe, and to one entry in the probe table which tested for a
per-option *hint string* when the guarantee is about a *class*. All four are now real
assertions and all four now go red under the reviewer's own probe; see below.

The general lesson is recorded because it generalises: a probe table reporting a high red
ratio invites the reader to assume the remaining behaviours are guarded. Three were not,
and a table cannot tell you which three.

### Load-bearing proof (task 6.2)

15 deliberate single-line breaks, each reverted immediately. **14 turned the suite red
in the expected file.** The one that did not is recorded rather than hidden:

| Break | Result |
| --- | --- |
| service mints a hardcoded identifier instead of calling the generator | RED — `validators-enrollment.test.ts` |
| service reads `new Date()` instead of the injected clock | RED — `validators-enrollment.test.ts` |
| service trusts its input type instead of re-parsing proficiency | RED — `validators-enrollment.test.ts` |
| enroll action skips `parseWriteIntent` | RED — `validators-actions.test.ts` |
| `strictObject` relaxed to `object` on the enroll intent | RED — `validators-actions.test.ts` |
| **action drops its identifier check before the service** | **DID NOT GO RED** — see below |
| browser identity returns a stored value unvalidated | RED — `validators-browser-identity.test.ts` |
| browser identity writes a probe key to storage | RED — `validators-browser-identity.test.ts` |
| `firstActionFor` always enrolls, never resumes first | RED — `validators-onboarding-flow.test.ts` |
| a failed resume falls through to enrolling | RED — `validators-onboarding-flow.test.ts` |
| `not_configured` collapsed into `persistence` | RED — `validators-actions.test.ts` |
| screening options rendered in reverse order | RED — `onboarding-routes.test.tsx` |
| ~~a per-option "Recommended" hint added to screening options~~ | RED — but see the correction below; this probe tested a *string*, and the guarantee is about a *class* |
| landing start link repointed at a nonexistent route | RED — `onboarding-routes.test.tsx` |
| confirmation page linked to `/validate` | RED — `onboarding-routes.test.tsx` |

**The strikethrough row is the probe that was misleading.** A per-option hint is a real
risk, and the probe went red, so it was reported as proof that screening options are
neutral. It is not: it proved only that the *word* "Recommended" does not appear. The
reviewer's probe added `bg-accent shadow-brutal-lg border-accent` to one unselected
option — no string marker at all — and the entire suite stayed green. A red probe proves
that *the thing you broke* is guarded, and nothing more.

### Post-review re-probe: the reviewer's own breaks, re-run against the fixes

Every probe below is one the reviewer demonstrated passing when it should not have, or
one covering a behaviour the record previously claimed without evidence. All now go red in
the stated file.

| Break | Result |
| --- | --- |
| `AnswerGroup` bypassed by a bespoke group that accents one **unselected** screening option (the reviewer's exact proof) | RED — `onboarding-routes.test.tsx` |
| the same bypass, plus pending state and all error rendering deleted | RED — `onboarding-routes.test.tsx` |
| `decideResume` hardcodes `answer: null` again | RED — `validators-onboarding-flow.test.ts` |
| the component passes `null` instead of the participant's answer to `decideResume` | RED — `screening-form-wiring.test.ts` |
| the second round trip becomes fire-and-forget (`void enroll(answer)`) | RED — `screening-form-wiring.test.ts` |
| the participation notice moves back BELOW the submit control | RED — `onboarding-routes.test.tsx` |
| `submitControlState` stops disabling the control while a write is in flight | RED — `onboarding-routes.test.tsx`, `validators-onboarding-flow.test.ts` |
| the wrapper collapses `not_configured` into `persistence` | RED — `validators-actions-wrapper.test.ts` |
| the inaccurate "held only in this browser" claim returns to `/start` | RED — `onboarding-routes.test.tsx` |

Two of the first four deserve naming, because the pure function was fully tested in both
cases and the suite was still green:

- **`decideResume` hardcoding `null` went undetected because the tests were about the
  decision, not the call.** `decideResume`'s `answer` parameter now has a direct
  regression test asserting all five approved values survive the fallback, and
  `screening-form-wiring.test.ts` asserts the call site passes the answer. A tested pure
  function and an unexamined call site are the same mistake in different clothes.
- **The unawaited round trip was undetectable behaviourally**, because
  `renderToStaticMarkup` cannot start a transition. The structural fix is that `submit` is
  the only write path and every branch of it is awaited, and the guard against regressing
  it is a source assertion. That guard is weaker than a behavioural test and its file says
  so.

**The one that did not go red, and what it means.** Removing the action's
`anonymousValidatorIdSchema` check changes no behaviour, because
`isAnonymousValidatorIdFormat` inside the service rejects the same values from the same
`ANONYMOUS_VALIDATOR_ID_PATTERN`. So the check is a duplicate, not a boundary. It was
kept and relabelled: it exists to narrow `unknown` to the branded
`AnonymousValidatorId` without a cast, and `onboarding-actions-core.ts` now says so
where the next editor will read it. A new test, `validators-identifier-format.test.ts`,
asserts the two checks agree across 4 valid and 17 near-miss inputs, so a future second
pattern definition cannot make them diverge silently.

**Three harness defects found and fixed while doing this**, all of which had briefly
produced false evidence, and the third is the worst of the three because it reported real
failures as passes:

1. The first harness restored files with `git checkout --`, which does nothing for an
   untracked file. Three breaks leaked into subsequent probes and inflated the failure
   counts. Replaced with in-memory content restore.
2. The first harness scored a suite that failed to *collect* as "did not go red". A
   probe that referenced an unimported component threw at collection, Vitest reported
   "no tests", and the probe was recorded as a pass. The harness now reports
   collection failure as its own outcome. "No tests" is not "passed".
3. **The ANSI-stripping regex omitted the escape character** (`/\[[0-9;]*m/` rather than
   `/\u001b\[[0-9;]*m/`), so the summary line read `\x1b2m  Tests \x1b22m … 1 failed` and
   the `^\s*Tests` pattern never matched. The failure count stayed at zero and **every
   probe was scored green, including probes that were genuinely red.** This was caught
   only because one probe was verified by hand outside the harness and went red while the
   harness said it did not. The lesson is not about regexes: it is that a harness which
   reports "no failures" is indistinguishable from a harness that cannot detect failures,
   so at least one result must always be confirmed independently.

A residue check confirmed all probed files were byte-identical afterwards, including
after the post-review re-probe.

### Third-round re-probe: the four call sites that were unguarded

A third review returned FAIL and, unlike the two before it, its central finding was
not a false claim but **missing guards**. Four mutations to specified research-integrity
behaviour left the entire suite green, and none was among the three exceptions the
record had already named. All five probes below were re-run after the guards were
written; all five go red.

| Probe | Break | Result |
| --- | --- | --- |
| A1 / I2 / G1 | delete `writeStoredValidatorId(decision.validatorId)` entirely | RED — 1 failing, `screening-form-wiring.test.ts` |
| A2 / B1 / C1 | delete the `enroll-fresh` early-return branch, so a restored validator falls through to enrolling | RED — 1 failing, `screening-form-wiring.test.ts` |
| D1 / E3 | wire the skip control to `run("conversational")`, fabricating an answer the participant refused to give | RED — 1 failing, `screening-form-wiring.test.ts` |
| O4 | `error={undefined}`, so a rejected submission never reaches the field | RED — 1 failing, `screening-form-wiring.test.ts` |
| I3b | add `validators.create(...)` to the `restored` branch of the action core | RED — 4 failing, `screening-form-wiring.test.ts` and `validators-actions.test.ts` |
| CTL | negative control: inject `expect(1).toBe(2)` | RED — the harness can detect failure |

**A1 was a hole in a guard that already existed.** The assertion that the screening
form delegates to `browser-identity` was written as an *alternation* of the three
storage helpers:

```ts
expect(source).toMatch(/readStoredValidatorId|writeStoredValidatorId|clearStoredValidatorId/);
```

An alternation asserts that one of several names appears. It says nothing about
which — so deleting the write entirely still matched the read. For a research-data
write, that distinction is the entire content of the requirement.

**The negative control was wrong the first time it was written.** It appended an HTML
comment to a `.tsx` file, which broke *compilation* and was scored as a distinct
`INVALID` outcome — correctly, but it proved nothing about failure detection. It now
injects a false assertion, which is a genuine test failure. This is the third harness
defect in this change and the second one that produced evidence which looked valid and
was not.

**The category is the transferable finding.** All four unguarded sites were call sites
of code that was itself fully tested. `decideResume` was exhaustively unit-tested; the
line that called it was not. `decideEnrollment`'s terminal branch was type-narrowed;
whether control actually returned to it was not. `AnswerGroup` rendered `role="alert"`
and `aria-invalid`; whether the call site forwarded the value was not.

### Fourth-round re-probe: the same category, one level up

A fourth review independently re-ran all five round-three probes and got RED on every one,
then attacked the neighbourhood rather than the repaired sites themselves. It found three
more mutations that all 506 tests could not see - each adjacent to a site round three had
just guarded:

| Probe | Break | Result |
| --- | --- | --- |
| C1 | `run(selection ?? "fluent")` - a participant who pressed Continue without choosing anything is enrolled as Fluent | RED - 1 failing |
| C1b | the same defect arriving through a variable, so no literal sits next to the call | RED - 1 failing |
| C1c | the same defect with the literal hoisted to a module constant, leaving the call site clean | RED - 1 failing |
| C2 | `setError(decision.message)` to `setError(null)` - the error is forwarded but permanently empty, so a rejected submission renders nothing | RED - 1 failing |
| C3 | `if (selection !== null) writeStoredValidatorId(...)` - the decline path enrols with no stored identifier, so every later visit mints a second identity | RED - 1 failing |
| C3b | the same write made conditional in the other direction | RED - 1 failing |
| N15 | deleting `clearStoredValidatorId()` on the stale-identifier path | RED - 1 failing |
| CTL | negative control: a false assertion injected inside a real test body | RED - the harness detects failure |

**C1 is the one that mattered, and it is the exact defect class round one found.** A
fabricated self-reported screening datum, produced by a change that typechecks and lints
cleanly, invisible to a 506-test green suite. It survived my own round-three guard because
that guard was `\\(\\s*["'\`]${level}["'\`]` - it required the literal to sit immediately after
an open paren. `run(selection ?? "fluent")` has `selection` after the paren, so the regex
never saw it. The assertion was also narrower than its own comment, which claimed to cover
"anywhere in the component".

**So the assertion no longer looks for a shape at all.** No approved proficiency level may
occur as a string literal anywhere in the component, in any argument position. C1b and C1c
exist to prove that: the literal is forbidden whether it is inline, behind a variable, or
hoisted to a module constant.

**C3 is the same lesson as A1.** A1 closed "delete the write". C3 is "write only
sometimes", which loses the same data by a different route. The guard is now a
whole-statement match on its own line, so a leading `if (...)` fails it.

**C2 is the lesson from O4, one step further back.** O4 closed "the error is not
forwarded". C2 leaves it forwarded and makes the value permanently `null`. Forwarding is
necessary and not sufficient; `setError(decision.message)` is now required in the source.

**The reviewer's own harness hit the collection-failure trap.** Its first negative control
threw at module scope and produced `Test Files 1 failed | Tests 481 passed`, which is a
*collection* failure and proves nothing about detection; it was discarded and replaced with
a control that fails inside a test body. That is the fourth harness defect in this change
and the third that produced evidence which looked valid and was not. The pattern is
consistent: a probe harness that cannot distinguish "no failure" from "no verdict" will
happily report a green suite that never ran the assertion.

**The pattern across four rounds is the transferable finding, and it is not diminishing.**
Round one found a discarded answer. Round three found unguarded call sites of tested code.
Round four found unguarded *neighbours* of the sites round three had just repaired. A
repaired site is evidence about that site only, and this record should not be read as
claiming otherwise.

### Dataset immutability (task 6.4)

- working-tree blob `acaaa05ac83c3a67f9eb1e81b4432d4b11da6263` == `main`
- SHA-256 `39F757E61B70386B87EC1BB9410E881DF342027BF580BED9C2F9BEEB2F2E8965`
- `git diff main -- data/` empty

### Requirement coverage against executable evidence (task 6.5)

This table used to open with a universal - "every requirement and every scenario is backed by a test
confirmed to go red" - and **two separate reviews falsified that universal by finding the exceptions**.
The second review found three. The third review then found **four more**, none of them among the three
already named: deleting the storage write, deleting the resume early return, adding a `create` call to
the restored branch, and wiring the skip control to a fabricated proficiency level each left all 498
tests green.

So the table below states a scoped claim and **names every exception**, because a claim of the form
"every X is covered" is not checkable by a later reader - they cannot tell which items the author
happened to probe - while a claim that enumerates its exceptions is. The five exception groups are
listed immediately after the table.

> **That sentence was falsified a third time, and the pattern is now on the record as a
> known failure mode of this document.** Round four found three further unguarded call sites,
> none covered by the five: a fabrication reachable through `selection ?? "fluent"`, an error
> state forwarded but never populated, and a storage write made conditional. Each left all 506
> tests green. The universal has now been falsified three times and each time the falsifier was
> a *neighbour* of the site the previous round had just repaired - round four's three were all
> adjacent to round three's five. **A repaired site is evidence about that site only.** No reader
> should treat this table as exhaustive of the guards that exist, and no future revision should
> restate an enumeration as if it were complete.

The four newly-found gaps are worth naming as a category, because the pattern is the whole lesson:
**all four were call sites of code that was itself fully tested.** `decideResume` was exhaustively
unit-tested; what was untested was the line that called it. `decideEnrollment`'s terminal branch was
type-narrowed; what was untested was whether control actually returned to it. `AnswerGroup` rendered
`role="alert"` and `aria-invalid`; what was untested was whether the call site forwarded the value to
it. Testing a function and leaving its only caller unexamined is the same mistake in different
clothes, and this change made it three times.

| Requirement / scenario | Evidence | Red against WHICH mutation |
| --- | --- | --- |
| server mints the identifier; client-supplied values ignored | `validators-enrollment.test.ts` — an input carrying `id`, `createdAt`, `lastActiveAt`, `totalValidations` is stored with none of them | deleting the client-supplied id/timestamps/counter so the service would store them |
| timestamps derived server-side | same file, against an injected fixed clock | replacing the injected clock with `new Date()` |
| screening choices in the approved order | `onboarding-routes.test.tsx` — index positions compared, not read by eye | reversing the rendered option order |
| **screening options no more weighted than validation options** | `onboarding-routes.test.tsx` — the **rendered `class` attribute of every `role="radio"`** is read out of the markup and compared to `answerOptionClasses({selected:false})`, plus a no-`accent` check on resting classes with hover/focus variants stripped | the reviewer's own bypass: a bespoke group accenting one **unselected** screening option, so the rendered class diverges from `answerOptionClasses({selected:false})` |
| screening options gain weight only after selection | same file — **`AnswerGroup` rendered with a value set**, asserting exactly one option carries the selected class and the other four carry the unselected one. An earlier version of this row cited `answerOptionClasses({selected:false})` versus `({selected:true})`, which compares the function to itself and touches no screen; corrected to cite the rendered assertion | giving a second option the selected treatment |
| the submit control is disabled while a write is in flight | `submitControlState` is a pure function asserted directly, because `renderToStaticMarkup` can only ever render the idle state | making `submitControlState` return `disabled: false` |
| options are disabled, not restyled, while pending | `onboarding-routes.test.tsx` — `AnswerGroup` rendered with `disabled`, asserting every button carries `disabled` and keeps the unselected class | rendering `AnswerGroup` pending and disabled with the error removed |
| a rejected submission surfaces the error and marks the group invalid | same file — `AnswerGroup` rendered with `error`, asserting `role="alert"`, `aria-invalid="true"`, and that `aria-describedby` actually names the error node's id | rendering `AnswerGroup` with `error` removed |
| an answer given before a stale identifier is discovered is kept | `validators-onboarding-flow.test.ts` — all five approved values survive the `enroll-fresh` fallback; a genuine `null` decline still records as `null` | `decideResume` hardcoding `answer: null` again |
| the screening answer reaches the enrollment write, not just the decision | `screening-form-wiring.test.ts` — source assertions on the call site: no literal `null` passed to `decideResume`, and `await enroll(answer)` on the fallback | the call site passing `null` instead of the selection |
| an unrecognised identifier is replaced, not reused | `validators-onboarding-flow.test.ts` — `absent` routes to `enroll-fresh`, and a FAILED resume routes to `error`, never to `enroll-fresh` | routing `absent` to `error` instead of `enroll-fresh` |
| local storage is not a source of authority | `validators-actions.test.ts` — the resume result is asserted to contain no proficiency, counter, or timestamp | returning proficiency, a counter, or a timestamp in the resume result |
| the notice precedes the screening answer | `onboarding-routes.test.tsx` — each notice statement's **byte offset compared against the first `type="submit"`**, so position is asserted rather than presence | moving the participation notice below the submit control |
| failure is never reported as success | `validators-onboarding-flow.test.ts` — every failure decision asserted to carry no identifier | giving a failure decision an identifier |
| a missing database reads as "not open", not as a fault | `validators-actions-wrapper.test.ts` — the **real `actions.ts` wrapper** driven with the environment module throwing `ServerEnvError`, which is how production actually fails; plus `validators-onboarding-flow.test.ts` for the copy | collapsing `not_configured` into `persistence` |
| a payload carrying an identifying field is rejected | `validators-actions.test.ts` — nine literal field names (`name`, `email`, `studentId`, `phoneNumber`, `address`, …) each asserted `invalid` with zero repository calls, plus the exact stored key set | accepting any of nine literal personal field names |
| storage is usable when `localStorage` access itself throws | `validators-browser-identity.test.ts` — a throwing **getter**, as Safari private mode implements, plus a non-numeric `length`, plus the `length: 0` boundary | a `localStorage` getter that throws, as Safari private mode implements |
| the minted identifier is actually persisted | `screening-form-wiring.test.ts` - the **write** is required specifically, not an alternation of the three storage helpers, **and required as an unconditional whole statement**. The alternation still matched when the write was deleted; the presence-only check still matched when the write was made conditional | **A1** delete the write; **A2r** `if (selection !== null) writeStoredValidatorId(...)` |
| a restored validator never falls through to enrolling again | same file - the `enroll-fresh` guard, the `apply`, and the `return` are all required, and the stale-identifier fallback must appear after it. Asserting only the `apply` would have been half a guard | **A2** deleting the `enroll-fresh` early-return branch |
| the resume path performs no write, anywhere | same file, plus `onboarding-actions-core.ts` - the `restored` branch contains no `create`, and the whole `runResume` body contains no `create`/`update`/`delete`/`upsert` | **I3b** adding `validators.create(...)` to the `restored` branch |
| no screening answer is ever fabricated, on ANY path | same file - `run(null)` on the control; **no approved proficiency level may appear as a string literal anywhere in the component**; `run(selection)` unmodified; and no `??`/`||` fallback on the value reaching `run`. The literal-level check is deliberately **unanchored**: an earlier version required the literal to sit immediately after `(` and so missed `run(selection ?? "fluent")` | **D1** `run("conversational")` on the control; **D1r** `run(selection ?? "fluent")`; **D1v** the same via a variable; **D1c** the same via a module constant |
| a rejected submission identifies the field | same file - the `error` state must be forwarded to the control **and populated on the failure path**. Forwarding alone is not enough: with `setError(null)` the value is forwarded and permanently empty, so the participant presses Continue, the action fails, and nothing appears | **O4** `error={undefined}`; **O4r** `setError(decision.message)` to `setError(null)` |
| route metadata is real, not a placeholder | `onboarding-routes.test.tsx` - both new routes' title and description asserted against the exported `metadata`, which `renderToStaticMarkup` never emits | replacing a required route title with a placeholder string |

### The call-site enumeration, and the follow-up it assigns

**This section is the reason the exception list above can be trusted more than the four
versions of it that were falsified.** Four rounds each found call sites the record had not
named, so the fifth was scoped to produce a complete inventory rather than to probe whatever
the last round repaired. The inventory is below. It is mechanical, and it is the whole of the
client shell.

The finding that matters is not the fourteen. It is *what kind* of gap they are. Rounds 3 and 4
found guards with holes in them. These are sites with **no assertion of any kind** - neither
behavioural nor textual - and thirteen of the fourteen pass typecheck *and* lint, so all of them
would pass the entire gate.

| # | Site | Behaviour if unguarded | Severity |
| --- | --- | --- | --- |
| S2 | `screening-form.tsx:94` `router.push("/ready")` | a just-enrolled participant is returned to the question | low |

> **Also fixed in this round, and it was found while fixing the entry above, not by the
> review:** softening `/ready`'s copy made every *claim* on that page true, but left the page
> a dead end. It still said *"nothing is required of you… Closing this tab is a complete and
> legitimate way to finish"* - a finish that presupposes a start this route cannot know about
> - and it contained **no link out at all**. A participant who typed the URL was told they
> could finish, and had no way to begin.
>
> The test that should have caught this asserted `expect(hrefs).toEqual([])`, with the comment
> *"so it cannot link to a route that does not exist"*. It served that purpose only as a side
> effect of having **no links**, so it could never fail: a guarantee of a dead end, written as
> a guarantee against dangling links. Now that `/start` exists and is linked, the test asserts
> the exact set of internal hrefs against `KNOWN_ROUTES`, which is read from `src/app` by
> `readdirSync` so it cannot drift from the filesystem. The "finish" line is now conditional on
> having answered the question, and the route says in words that reaching it does not mean you
> did.
>
> **Probe record, with a caveat that belongs in the record rather than being quietly dropped.**
> Repointing `href` at `/ready` - a route that exists, so the render stays valid - fails RED on
> the assertion itself (`expected [ '/ready' ] to include '/start'`), which is the load-bearing
> check. Removing the `href` attribute *also* reports red, but as a **collection failure**:
> React's prop-type check throws while rendering, the suite never runs, `hrefs` is `[]`, and the
> loop over it passes vacuously. Only the explicit `toContain` caught it. This is the same
> lesson as round one, one level down - a red is not automatically evidence about the assertion
> you meant to test - and it is why the two verdicts are recorded separately instead of counted
> together as "2 red".
>
> **One known limitation, recorded not fixed:** weakening the `KNOWN_ROUTES` sanity assertion
> itself does not fail the suite, because it is bookkeeping about the test file and no other
> assertion depends on it. Emptying the inventory does fail (both assertions, verified), and
> that is the guard that matters.
| S5 | `screening-form.tsx:115` **payload to `enrollValidatorAction`** | `{ ilocanoProficiency: null }` fabricates a decline for **every** participant - round 1's defect class, one layer out | **critical** |
| S7 | `screening-form.tsx:157` `readStoredValidatorId()` | `stored = null` re-enrols a returning participant, splitting their record | **critical** |
| S8 | `screening-form.tsx:163` `firstActionFor(stored)` | a broken call site stops the resume path working at all | **critical** |
| S9 | `screening-form.tsx:168` **payload to `resumeValidatorAction`** | `{ storedId: "" }` makes every resume `absent`, so every return visit mints a second identity | **critical** |
| S12 | `screening-form.tsx:179` `clearStoredValidatorId()` | conditional, so a stale id survives and re-enrols the participant each visit | **critical** |
| S14 | `screening-form.tsx:186` the `await` inside `startTransition` | `isPending` ends mid-write; the file's own comment names this hazard | **critical** |
| S18 | `screening-form.tsx:241` skip button `disabled` | a press mid-write races a second enrollment | medium |
| R2 | `resume-validator.tsx:61` `readStoredValidatorId()` | resume is dead; a real returning validator is told they hold no identity | **critical** |
| R3 | `resume-validator.tsx:62` first-time-visitor branch | a first-time visitor is told the check *failed* rather than that they hold nothing | **critical** |
| R4 | `resume-validator.tsx:74` **payload to `resumeValidatorAction`** | as S9, on the landing page | **critical** |
| R6 | `resume-validator.tsx:77` `router.push("/ready")` | a restored validator is shown "you do not hold a saved identity" while being recognised | **critical** |
| R7 | `resume-validator.tsx:84` `clearStoredValidatorId()` | the message claims a clear that does not happen - **fixed in this round** | fixed |
| R9 | `resume-validator.tsx:89` `setMessage(decision.message)` | `setMessage(null)` swallows a failed resume entirely - **fixed in this round** | fixed |

`resume-validator.tsx` had **no substantive assertion of any kind** before this round. Two of the
four prior reviews never opened it, and one of them was reviewing call-site wiring.

**Both Server Action payload arguments are unasserted anywhere.** `firstActionFor`, `decideResume`,
and the whole enrollment service are all tested; the two values that actually reach the server are
not. That is the sharpest instance of the pattern this change has now demonstrated five times: a
tested function, and an unexamined caller.

### Follow-up: `thin-shell-call-sites`, scheduled for Phase 4

**The fix is structural, not more regexes, and this record says so on purpose.** Source-text
assertions can only check a shape someone thought of, and the set of shapes is unbounded - four
rounds have established that empirically. The reviewer rejected continuing to add them, and that
judgement is adopted here. Three options were considered:

1. **More textual guards.** Rejected. Five rounds of demonstrating that a repaired guard is
   evidence about that site only.
2. **Make the defects unexpressible.** **Chosen.** Extract the payload building into pure
   `enrollmentIntent(answer)` / `resumeIntent(stored)` functions, so S5 and S9 become
   typecheck-enforced rather than textually asserted - there is exactly one way to build a payload
   and it takes the participant's value. Then extract decision application over injected ports
   (`store`, `forget`, `go`, `say`), which converts twelve of the fourteen into assertions
   against a recording fake: no regex, no browser, no `renderToStaticMarkup` limitation. Roughly
   sixty lines extracted.
3. **A browser test runner.** Correct and worth having, and a change of its own. It would catch
   all fourteen with **zero** new assertions, because each changes observable participant-visible or
   persisted behaviour. Phase 4 is the first change with a genuinely multi-step client flow worth
   driving, which is where the justification for the dependency and the CI time belongs.

**Sequencing: option 2 now, option 3 at Phase 4.**

**This is a follow-up change, deliberately not part of `landing-and-screening`.** `AGENTS.md` forbids
mixing a refactor into a feature change, and `screening-form.tsx` is dense with research-integrity
commentary that a refactor would churn. Recording it here with its scope, its ranking, and its
severity is what makes this merge honest rather than a fourth falsified claim of completeness.

**The residual risk, stated plainly.** Until that change lands, any future edit to
`screening-form.tsx` or `resume-validator.tsx` can fabricate a screening answer, split a
participant's record across two identities, swallow a failure, or tell a participant something
untrue - and lint, format, typecheck, 509 unit tests, 69 integration tests and the build will all
be green. That risk is not reduced by the guards this change now has. It is concentrated entirely
in the fourteen sites that have none, and it should be read in those words rather than as
"guarded".

### Exceptions and gaps, named rather than absorbed

Five groups. Each is stated with what it would take to close it, so a later reader can disagree
with the judgement instead of re-deriving it.

**1. Three scenarios have no red-confirmed test, and are structural rather than accidental.**

- *"No half-enrolled identity is left behind"* - true because `/start` is a Server Component that
  performs no write on render. Closing it behaviourally needs a browser.
- *"Declining is possible"* - the affordance is asserted present and the `null` decline is asserted
  at the decision and persistence layers, but the control's wiring is a **source** assertion, not a
  pressed button.
- *The cross-screen half of design-system's neutrality scenario* - **now scoped out of the spec**
  rather than carried as a live obligation. It compared the screening screen against a validation
  answer screen, and no validation screen exists until Phase 4. A requirement that cannot be executed
  is not evidence of anything. The screening half is fully covered; the cross-screen comparison is
  Phase 4 work and is deliberately not promised here.

**2. No browser ever executed this flow.** Every component-level guarantee in the table above is a
rendered-markup assertion, a pure function, or a source-text assertion. A real click would be better
evidence than all three, and this project has no browser test runner. Adding one is its own change,
not something to smuggle into a screening change.

**3. The Supabase hop is unexercised**, for want of credentials, as stated above.

**4. A returning participant who navigates directly to `/start` does see the screening question
again.** The original scenario forbade this and is amended, because it is not achievable under D2's
storage choice. This is a deliberate, recorded departure rather than an untested gap - and the
original justification for it was itself wrong until the third review: the stated reason was React
lint compliance, which was falsified (`useSyncExternalStore` lints and typechecks clean). The reason
that holds is that `useSyncExternalStore` reveals an identifier is *stored*, not that the server
*recognises* it, so suppressing the question optimistically would enroll a participant whose
identifier has expired with no screening answer at all. What is guaranteed and tested is that their
stored answer is never overwritten. The difference between a recorded departure and an untested gap
matters, and it is why this paragraph exists.

**5. The four call sites the third review found unguarded are now guarded**, and each was
probe-confirmed before this claim was restated. That is the point of recording them here even though
they are closed: the previous version of this table named three exceptions and was still wrong, so
the reader needs to see that the count moved for a reason and not by luck.