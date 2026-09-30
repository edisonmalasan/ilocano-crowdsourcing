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
| `pnpm run lint` | exit 0, no errors, no warnings |
| `pnpm run format:check` | exit 0, "All matched files use Prettier code style!" |
| `pnpm run typecheck` | exit 0 |
| `pnpm run test:unit` | exit 0 — 20 files, 445 tests passed |
| `pnpm run test:integration` | exit 0 — 4 files, 69 tests passed |
| `pnpm run build` | exit 0, "Compiled successfully"; `/`, `/_not-found`, `/ready`, `/start` all prerendered static |
| `openspec validate landing-and-screening --strict` | exit 0, "Change 'landing-and-screening' is valid" |
| `openspec validate --specs --strict` | "Totals: 6 passed, 0 failed (6 items)" |

### What these do NOT prove

- **No Supabase client was ever constructed.** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` are all absent, so `getServerEnv()` throws
  `ServerEnvError` on every real request. The enrollment and resume logic is proven
  against an in-memory fake; the hop from the repository to PostgREST is unexercised,
  exactly as in Phase 2. Nothing in the suite pretends otherwise — the action core is
  tested through its injected dependencies precisely so that no test needs a database.
- **A successful build is not a behavioural result.** It proves four routes compile and
  prerender. It says nothing about the flow working, which is what the 445 unit tests
  and the probe run below are for.
- **No browser ever rendered any of this.** `renderToStaticMarkup` produces the HTML a
  server render would; it does not run effects, does not fire click handlers, and does
  not execute the Server Action round trip. The submit-time resume check, the
  `localStorage` write, and the navigation to `/ready` are proven by the pure decision
  functions plus unit tests on `browser-identity`, not by anything that clicked a button.
- **WCAG contrast is inferred from the token values, not measured.**

### Load-bearing proof (task 6.2)

15 deliberate single-line breaks, each reverted immediately. **14 turned the suite red
in the expected file.** The two that did not are recorded rather than hidden:

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
| a per-option "Recommended" hint added to screening options | RED — `onboarding-routes.test.tsx` |
| landing start link repointed at a nonexistent route | RED — `onboarding-routes.test.tsx` |
| confirmation page linked to `/validate` | RED — `onboarding-routes.test.tsx` |

**The one that did not go red, and what it means.** Removing the action's
`anonymousValidatorIdSchema` check changes no behaviour, because
`isAnonymousValidatorIdFormat` inside the service rejects the same values from the same
`ANONYMOUS_VALIDATOR_ID_PATTERN`. So the check is a duplicate, not a boundary. It was
kept and relabelled: it exists to narrow `unknown` to the branded
`AnonymousValidatorId` without a cast, and `onboarding-actions-core.ts` now says so
where the next editor will read it. A new test, `validators-identifier-format.test.ts`,
asserts the two checks agree across 4 valid and 17 near-miss inputs, so a future second
pattern definition cannot make them diverge silently.

**Two harness defects found and fixed while doing this**, both of which had briefly
produced false evidence:

1. The first harness restored files with `git checkout --`, which does nothing for an
   untracked file. Three breaks leaked into subsequent probes and inflated the failure
   counts. Replaced with in-memory content restore.
2. The first harness scored a suite that failed to *collect* as "did not go red". A
   probe that referenced an unimported component threw at collection, Vitest reported
   "no tests", and the probe was recorded as a pass. The harness now reports
   collection failure as its own outcome. "No tests" is not "passed".

A residue check confirmed all nine probed files were byte-identical afterwards.

### Dataset immutability (task 6.4)

- working-tree blob `acaaa05ac83c3a67f9eb1e81b4432d4b11da6263` == `main`
- SHA-256 `39F757E61B70386B87EC1BB9410E881DF342027BF580BED9C2F9BEEB2F2E8965`
- `git diff main -- data/` empty

### Requirement coverage against executable evidence (task 6.5)

Every `validator-onboarding` requirement and every `design-system` delta scenario is
backed by at least one test. The three worth naming because they are the ones that could
plausibly have been left to review:

| Requirement / scenario | Evidence |
| --- | --- |
| server mints the identifier; client-supplied values ignored | `validators-enrollment.test.ts` — an input carrying `id`, `createdAt`, `lastActiveAt`, `totalValidations` is stored with none of them |
| timestamps derived server-side | same file, against an injected fixed clock |
| screening choices in the approved order | `onboarding-routes.test.tsx` — index positions compared, not read by eye |
| screening options no more weighted than validation options | same file — `answerOptionClasses({selected:false})` compared directly for both screens |
| an unrecognised identifier is replaced, not reused | `validators-onboarding-flow.test.ts` — `absent` routes to `enroll-fresh`, and a FAILED resume routes to `error`, never to `enroll-fresh` |
| local storage is not a source of authority | `validators-actions.test.ts` — the resume result is asserted to contain no proficiency, counter, or timestamp |
| the notice precedes the screening answer | `onboarding-routes.test.tsx` — each notice statement asserted present on `/start` |
| failure is never reported as success | `validators-onboarding-flow.test.ts` — every failure decision asserted to carry no identifier |
| a missing database reads as "not open", not as a fault | `validators-actions.test.ts` + `validators-onboarding-flow.test.ts` — distinct messages, neither leaking a credential, variable name, host, or table |

**No requirement in this change is left without executable evidence.** The one honest
gap is environmental and stated above: the Supabase hop is unexercised, and no test
claims otherwise.
