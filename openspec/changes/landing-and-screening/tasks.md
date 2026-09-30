# Tasks

## 1. Server-side enrollment service

- [ ] 1.1 Create `src/lib/validators/enrollment.ts` as a `server-only` module exporting an
      `enrollValidator(input, deps)` function whose dependencies are a `ValidatorsRepository` and
      a `now: () => Date` function, and verify by type-checking that neither the repository
      implementation nor a Supabase client is importable from it.
- [ ] 1.2 Have the service mint the identifier with `createAnonymousValidatorId()`, derive
      `createdAt` and `lastActiveAt` from the injected clock, set `totalValidations` to `0`, and
      call `validators.create(...)` exactly once; verify with a recording fake repository that the
      stored profile carries the minted identifier and the injected clock's exact ISO timestamp.
- [ ] 1.3 Add an `EnrollmentOutcome` discriminated result covering enrolled, failed, and
      already-exists conditions rather than throwing for expected outcomes; verify a unit test
      asserting each branch is reachable and that no branch is an untyped string.
- [ ] 1.4 Add a unit test proving the service never reads an identifier, timestamp, or counter from
      its input: submit an input carrying extra authoritative-shaped keys and assert the persisted
      profile's identifier differs from the supplied one and its timestamps equal the injected
      clock's. Verify the test fails if the service is changed to prefer supplied values.
- [ ] 1.5 Add a `resumeValidator(storedId, deps)` path that calls `validators.findById`, returns
      restored when the profile exists, and reports absent otherwise without throwing; verify both
      branches against the fake repository.

## 2. Client-side anonymous identity storage

- [ ] 2.1 Create `src/lib/validators/browser-identity.ts` as a client-only module exporting
      read, write, and clear functions over a single documented storage key; verify by reading the
      module that it imports no server module and holds no Supabase or repository import.
- [ ] 2.2 Validate any stored value against `anonymousValidatorIdSchema` on read and return absent
      for anything malformed, clearing the bad entry as a side effect; verify a unit test over
      malformed, empty, and well-formed stored values.
- [ ] 2.3 Guard `localStorage` access so an unavailable storage (private browsing, disabled storage,
      throwing getter) is reported as absent rather than raising; verify with a fake storage object
      whose accessors throw, and verify the enrollment path still completes in that case.
- [ ] 2.4 Assert in a unit test that the module reads and writes no key other than the identity
      key, and stores no screening answer, batch, or research response; verify by inspecting the
      fake storage's recorded operations.

## 3. Screening form client component

- [ ] 3.1 Create `src/app/start/screening-form.tsx` as a client component rendering `AnswerGroup`
      with `ILOCANO_PROFICIENCY_QUESTION` as the legend, `ILOCANO_PROFICIENCY_SUPPORTING_COPY` as
      the hint, and options mapped from `ILOCANO_PROFICIENCY_CHOICES` in declared order; verify a
      `react-dom/server` test asserting the rendered markup contains all five labels in order and
      the exact question string.
- [ ] 3.2 Make the form submittable with no proficiency selected, carrying an explicit
      "skip and continue" affordance, and verify a test that submitting with no selection still
      invokes the action and is not blocked by client validation.
- [ ] 3.3 Render the voluntary-participation and privacy notice on the same screen as the question,
      naming voluntariness, the ability to stop, and the absence of name, email, student ID, and
      phone collection; verify a rendered-markup test asserting each of those statements is present
      in the screening screen's output.
- [ ] 3.4 Surface a rejected submission's field error on the screening control, and a pending state
      that disables the submit affordance while the action runs; verify a rendered-markup test for
      the error text and a test that the submit control is not left enabled during a pending action.
- [ ] 3.5 Add a test asserting no unselected screening option carries an accent treatment class, and
      that the screening and validation option treatments are produced by the same frozen constant;
      verify the test fails if `AnswerGroup` is bypassed or given a per-option className.

## 4. Server actions

- [ ] 4.1 Create `src/lib/validators/actions.ts` with an `enrollValidator` action that re-parses its
      payload through `parseWriteIntent` before touching a repository; verify a test asserting an
      invalid payload results in zero repository calls.
- [ ] 4.2 Ensure the enroll action constructs its repositories through the existing
      `createSupabaseRepositories` factory and never imports them into a client module; verify by
      running `pnpm run lint`, whose `sadino/no-privileged-imports` rule must pass.
- [ ] 4.3 Add a `resumeValidator` action that re-validates the submitted identifier against the
      shared schema, treats an unrecognised identifier as absent rather than as an error, and
      returns no stored profile fields to the client; verify a test asserting the returned payload
      contains no proficiency, counter, or timestamp.
- [ ] 4.4 Map a missing database configuration to a distinct not-configured outcome whose message
      is plain language and contains no technical detail, and keep every other failure on a
      separate generic-failure outcome; verify two tests asserting neither message leaks a
      credential, a stack frame, or an environment variable value, and that they are distinguishable.
- [ ] 4.5 Add tests that no outcome reporting success reports a stored identifier unless the
      repository call actually succeeded, including the case where the repository raises; verify by
      asserting the failure outcome carries no identifier.

## 5. Routes

- [ ] 5.1 Create `src/app/start/page.tsx` as a Server Component rendering the screening form and the
      notice, with a page title and a single `h1`; verify a rendered-markup test for the heading,
      the title, and the absence of a second `h1`.
- [ ] 5.2 Create `src/app/ready/page.tsx` as a Server Component confirming enrollment, stating that
      no name, email, student ID, or phone was collected, and stating plainly that receiving
      sentences arrives in a later phase; verify a rendered-markup test asserting it links to no
      route that does not exist and that the later-phase statement is present.
- [ ] 5.3 Update `src/app/page.tsx` so the start action is a real link to the screening route and
      the "not open yet" notice is replaced by the actual next step; verify a rendered-markup test
      asserting an `href` to the screening route and that the stale notice text is gone.
- [ ] 5.4 Verify the landing and confirmation routes still render with no database reachable, so the
      `application-foundation` requirement stays true; verify with `pnpm run build` that every route
      compiles and reports in the route table.

## 6. Verification and documentation

- [ ] 6.1 Run `pnpm run lint`, `pnpm run format:check`, `pnpm run typecheck`, `pnpm run test:unit`,
      `pnpm run test:integration`, and `pnpm run build`, and record the observed results in
      `AGENTS.md` with what each command proves and does not prove, including that no Supabase
      client was constructed and no migration was applied.
- [ ] 6.2 Prove the new tests are load-bearing by temporarily breaking the implementation for each
      of: the server-minted identifier, the injected clock, the write-intake re-validation, the
      stored-value format check, and the screening option order, confirming the expected test goes
      red each time and restoring the implementation; record which test failed for each break in
      this file.
- [ ] 6.3 Update `docs/ROADMAP.md`'s `Project Status` block to move the lifecycle state to
      `verifying` for this change, add the local verification evidence table, and record the D5
      identifier-entropy open question in `Open Decisions` so it reaches the thesis team.
- [ ] 6.4 Confirm `data/ilocano-synthetic-data.json` is unchanged by the whole change, by blob hash
      against `main`, by SHA-256, and by an empty `git diff main -- data/`.
- [ ] 6.5 Confirm the completed implementation against the `validator-onboarding` spec and the
      `design-system` delta requirement by inspecting the code and tests, and record any requirement
      that is not satisfied by executable evidence in this file rather than leaving it silently
      unticked.
