# Tasks

## 0. Scope decisions taken before implementation

These are recorded as decisions rather than tasks, because each one is a choice this change made
deliberately and a later stage should not silently reverse. Each is falsifiable by the check beside it.

- [ ] 0.1 **`RV-4` is NOT fixed here, and the reason is stated rather than implied.** `RV-4` — the
      failed-resume path in `src/components/onboarding/resume-validator.tsx` — is an **onboarding**
      concern. Fixing it means changing an onboarding component and the onboarding tests, which is a
      different capability, and `AGENTS.md` is explicit that a change must not be broadened because a
      related opportunity turned up. **Verify:** `git diff -- src/components/onboarding/` is empty at the
      end of this change, and this decision appears in the change's Proposal, so the Sync stage reviews
      an argued exclusion rather than discovering an omission. `docs/ROADMAP.md` is corrected to say the
      item is still open and now has a worked example of the fix's shape to copy, not a fix.
- [ ] 0.2 **The `Archived Changes` ledger guard is NOT built here.** Same reasoning: it is a new test
      class this project has never had and belongs to its own change. **Verify:** the ledger still states
      the absence, and `grep -r ROADMAP tests/` still returns **0** case-sensitively at the end.
- [ ] 0.3 **The vacuous `design-system` scenario stays vacuous, per `design.md` D5.** **Verify:** no
      control in this change is rendered `disabled` for unavailability; a check over the new components
      reports **0** such controls, and the scenario remains honestly unwitnessed.

## 1. The session route, and which entry it presents

- [ ] 1.1 Add `src/app/validate/[batchId]/page.tsx` as a server component that reads the batch, resolves
      the requested position **through the batch's own recorded `batch_entries.position`**, and renders
      **one** entry. **Verify:** a route test asserting that for a 10-entry batch the rendered markup
      contains exactly **one** dataset entry id and **nine** do not appear.
- [ ] 1.2 Show the entry's Ilocano sentence together with its **intended origin** and **intended
      destination**, and show **progress** through the active batch derived from the server-allocated
      batch rather than from client bookkeeping. **Verify:** a rendered-markup test asserting both
      endpoints and a progress indicator are present, and a test asserting the progress figure is the
      server's position and not a counter the client could have supplied.
- [ ] 1.3 Exclude entries this validator has already completed, computed at request time from the
      existing `listEntryIdsForValidator` intersected with the batch (`design.md` D2). **Verify:** a test
      seeding completed entries and asserting the completed entry's id is absent from the rendered entry
      and that the request carries no client-supplied completion state.
- [ ] 1.4 Pin the request's key set exactly (`design.md` D1): a position and nothing else, so a field
      added later that would let a client dictate order fails `pnpm run typecheck`. **Verify:** the
      exact-key-set assertion compiles, and adding a `clientOrder` field to the request type turns
      `pnpm run typecheck` red with `TS2322`.

## 2. The four evaluation choices, offered neutrally

- [ ] 2.1 Render the four approved evaluation values through the existing `AnswerGroup`, in both
      interface locales. **Verify:** a rendered-markup test asserting **all four** values are present for
      the presented entry.
- [ ] 2.2 Assert neutrality on the **rendered** class of every option, following the precedent that
      every screening option's rendered class is already asserted equal. **Verify:** a test comparing the
      class attribute of all four rendered options for equality, plus a negative control: promoting one
      option turns the test red.
- [ ] 2.3 Assert no choice is pre-selected and none is marked as the expected or recommended answer.
      **Verify:** a test asserting no option carries `checked`/`selected`/`aria-checked` on first render,
      and that no rendered string marks a recommendation.

## 3. The conditional correction

- [ ] 3.1 Render the correction input **only** when the chosen evaluation requires one, deciding that
      with the existing `isCorrectionRequired` imported from the domain module and not reimplemented
      (`design.md` D3). **Verify:** a test over all four evaluations asserting the input is present for
      *correct but sounds unnatural* and *incorrect* and **absent** for the other two.
- [ ] 3.2 Require a non-blank corrected sentence before the response can be completed, reusing the
      existing validation schema rather than a local rule. **Verify:** a test asserting a
      whitespace-only correction does not complete the response, and a test asserting the form and the
      schema **agree** across a set of representative responses — the check that a second implementation
      of one rule would eventually fail.
- [ ] 3.3 Prove 3.1 is not a second rule by mutating the call site to a hardcoded evaluation and
      confirming the tests go red. **Verify:** the reversal produces a named failure; a green result means
      the tests do not guard the single-sourcing.

## 4. Both required research translations, and no skip affordance

- [ ] 4.1 Render an English and a Filipino translation input for every evaluable evaluation, and
      **neither** for *cannot confidently evaluate*, deciding that with the existing
      `requiresBilingualTranslations`. **Verify:** a test over all four evaluations asserting two inputs
      for the three evaluable ones and **zero** for *cannot confidently evaluate*.
- [ ] 4.2 Assert there is no control that skips, defers, or postpones either translation, by enumerating
      the rendered interactive controls rather than by matching a phrase. **Verify:** the enumeration
      finds no such control, **and** the enumeration is proven able to find controls at all — a control
      search that cannot match reports "none" for the same reason a broken predicate reports "no gap".
- [ ] 4.3 Assert the translations are of the **validated** sentence — the correction where one was
      required, the original where none was — by asserting the submitted value, not the prompt text.
      **Verify:** a test that submits an *incorrect* response with a correction and asserts the persisted
      translation pair is what the validator typed and that the original instruction is not substituted.
- [ ] 4.4 Add every new interface string to **both** catalogs, English and Filipino. **Verify:** the
      existing copy-catalog guard passes, and it passes for the right reason — it compares all 600 real
      instructions against both catalogs bilaterally, so a real instruction pasted into either catalog
      turns it red. That guard was once a marker set matching **zero** of the 600, which is why its
      mechanism is named here rather than assumed.

## 5. Persisting a completed response, immediately, and advancing

- [ ] 5.1 Add `src/lib/validation/validation-actions-core.ts` as a pure core taking its repositories
      injected, and `src/lib/validation/actions.ts` as a thin server-action wrapper going through
      `write-intake`. **Verify:** the core is unit-tested against recording fakes with no database, no
      network, and no `server-only` import, and `pnpm run lint` confirms no client component reaches the
      privileged path.
- [ ] 5.2 Persist each completed response **as soon as it is complete**, never at batch end. **Verify:**
      a test that completes one entry **while other entries in the batch remain unanswered** and asserts
      the insert happened. This is the case a batch-end implementation fails, so it is the assertion that
      gives "immediately" its meaning rather than a comment.
- [ ] 5.3 Advance to the next entry in the server-allocated order after the write, without depending on
      the rest of the batch. **Verify:** a `dom` test driving a real click through `act`, asserting the
      next entry is presented after the write resolves.
- [ ] 5.4 Make the write single-flight, exposing the pending state on the control that initiated it and
      changing the appearance of controls made inert alongside it **uniformly** (`design.md`, and the
      `design-system` requirement this is the first non-onboarding consumer of). **Verify:** a `dom` test
      asserting `aria-busy` and `disabled` track the pending state **during** the write — which
      `renderToStaticMarkup` provably cannot see, since it never fires a handler — and a test asserting
      a second click produces **one** insert, not two.
- [ ] 5.5 Treat a duplicate refusal for this validator and entry as the entry being complete, and
      advance; report every other failure as a failure (`design.md` D6). **Verify:** a test seeding a
      duplicate and asserting an advance with **no** discard, plus a negative control asserting a
      non-duplicate failure is reported as a failure and does **not** advance.

## 6. Safe navigation, and preventing an invalid submission

- [ ] 6.1 Moving between entries in the active batch preserves completed work and never resubmits a
      completed response. **Verify:** a `dom` test that completes an entry, navigates, and asserts the
      persisted row is still there and no second insert occurred.
- [ ] 6.2 A completed entry is not offered again in the same batch, including after leaving and returning
      to the session. **Verify:** a test returning to the session and asserting the completed entry is
      absent from what is offered — the participant-facing counterpart to at-most-once, and a different
      failure from the database refusing the write, since a refusal has already cost the validator their
      typed answer.
- [ ] 6.3 Prevent an invalid response from being sent, and identify which input is required, **without**
      treating that prevention as the enforcement. **Verify:** a `dom` test asserting no request is made
      while a required input is missing and that the missing input is identified, plus a server-side test
      asserting an invalid response reaching the server is still refused.

## 7. The handoff out of `/ready`

- [ ] 7.1 Replace `/ready`'s honest dead end with the real onward path, correcting the comment that
      claims *"Allocation is Phase 4, so there is nothing to link to yet"* — false since
      `requestBatchAction` exists. **Verify:** a test asserting `/ready`'s internal hrefs against routes
      that exist, following the precedent that the existing set is asserted **exactly** rather than
      satisfied by having no links at all, which is how that assertion previously passed trivially.
- [ ] 7.2 Record that **no spec requirement covers this handoff**. It is participant-visible, so a
      reviewer may reasonably want one, but adding a requirement to `validator-onboarding` would modify a
      capability this change declares it does not touch. **Verify:** this item appears in the change's
      Proposal as an open question for the Sync stage, so the decision is reviewed rather than buried.

## 8. Integration verification

This group is cross-cutting checks only. Every test and every catalog update is owed by the group whose
work called for it above, so a failure here points at the boundary rather than at a late test.

- [ ] 8.1 `openspec validate validation-experience --strict` and `openspec validate --specs --strict`
      both exit 0, with the capability count and totals reported from their own output. **Verify:** the
      figures are read out of the command, not inferred; the in-force total must be **9 passed, 0 failed**
      and this change is a delta so it adds no capability directory until Sync.
- [ ] 8.2 The full gate passes: lint, format:check, typecheck, unit, dom, integration, the **scoped**
      dataset guard, and build. **Verify:** every figure is attributed to a **named step's own** summary
      line by a reader that refuses rather than reporting a partial answer, and the guard is confirmed
      scoped to 1 file and **distinct** from the whole suite.
- [ ] 8.3 `data/ilocano-synthetic-data.json` is unchanged, and `git diff main --numstat -- supabase/`
      is **empty** because this change writes no migration. **Verify:** the dataset SHA-256 is read
      directly rather than read off a checkmark, and the migration diff is empty.
- [ ] 8.4 State plainly what was **not** verified: no Supabase client has ever been constructed, PostgREST
      behaviour and API-gateway RLS are unverified, and **no human has looked at any screen**. **Verify:**
      these appear in the change's Proposal and in `docs/ROADMAP.md`, so no later stage reads a passing
      gate as visual or hosted verification.
