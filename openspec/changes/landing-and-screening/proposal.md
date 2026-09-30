# Proposal

## Why

The platform currently stops at a landing page whose "Start validation" button is deliberately
disabled. Nothing can join the study: there is no screening screen, no way to become an anonymous
validator, and no way to return as the same one. Phase 2 finished the persistence layer, so the
onboarding path is the last thing standing between a visitor and a participation record — and it is
the only part of the product that establishes the anonymity guarantee in the first place. Doing it
now, while the schema and the repository seam are fresh, keeps the screening answer a single
server-authoritative write rather than a retrofit.

## What Changes

- **Landing becomes a real entry point.** The disabled "Start validation" button becomes a working
  link to the screening screen, and the "not open yet" notice is replaced by the actual next step.
- **A screening screen at `/start`** presenting the approved question, its approved supporting copy,
  and exactly the five approved choices, in the approved order. The screening response is optional:
  a visitor who declines to answer may still continue, and their profile records a null
  proficiency rather than a fabricated one.
- **A server-authoritative enrollment action.** A Server Action mints the anonymous identifier
  server-side, derives the timestamps and the validation counter itself, and persists one profile
  through the existing `ValidatorsRepository.create`. No identifier, timestamp, or counter is ever
  accepted from the browser.
- **Browser-local identity.** The anonymous identifier is kept in `localStorage` as the only
  persistent client-side value, validated against the shared schema before use, and never trusted:
  the server re-verifies that the profile exists.
- **A returning-validator resume path.** A stored identifier is checked against the database; an
  existing validator is restored without re-asking for proficiency, and an unknown or malformed
  stored value is discarded and a fresh identity is minted instead.
- **A confirmation screen at `/ready`** that states plainly that enrollment succeeded, shows no
  personal data, and says honestly that receiving a batch arrives in a later phase rather than
  linking to a route that does not exist.
- **A participation and privacy notice** carried on the screening screen as well as the landing page.
- **A neutral-options guarantee extended to screening.** The design system's visual-neutrality rule
  was written about dataset-entry answers. A screening answer is also research data, so the same
  structural guarantee is extended to cover it.
- **A clear "not configured" state.** With no Supabase credentials present, the enrollment action
  reports a named, human-readable condition instead of a stack trace, so the screen is honest in
  this environment rather than appearing broken.

## Capabilities

### New Capabilities

- `validator-onboarding`: the public path from landing through Ilocano proficiency screening to
  anonymous validator creation and restore — including the approved step order, the
  server-authoritative enrollment action, browser-local identity storage and its validation,
  returning-validator resume, the voluntary-participation and privacy notice, and the
  not-configured state.

### Modified Capabilities

- `design-system`: the answer-neutrality requirement is currently scoped to "the answer choices for
  a dataset entry". A proficiency screening answer is also collected research data and must not be
  nudged by visual treatment, so the requirement's scope and its scenarios are widened to cover
  screening choices. The implementation already satisfies this by reusing the same
  `AnswerGroup` control; the specification did not yet say so.

## Impact

**New code**

- `src/app/start/page.tsx` — the screening route (server component shell + client screening form).
- `src/app/start/screening-form.tsx` — client component: the five approved choices, submit, and
  error rendering. Reuses `AnswerGroup` so neutrality is structural rather than conventional.
- `src/app/ready/page.tsx` — post-enrollment confirmation route.
- `src/lib/validators/enrollment.ts` — server-only domain service: mints the identifier, derives
  authoritative timestamps and counters, and calls the repository. Testable against a fake.
- `src/lib/validators/actions.ts` — the Server Actions: `enrollValidator` and `resumeValidator`,
  each re-parsing its payload through `parseWriteIntent` before any repository call.
- `src/lib/validators/browser-identity.ts` — client-only `localStorage` read/write/clear for the
  anonymous identifier, with schema validation on read.

**Modified code**

- `src/app/page.tsx` — the inert start button becomes a real link; the Phase 1 scope note is
  replaced with the real hand-off.
- `src/components/ui/button.tsx` — only if a link-styled action is needed; `linkButtonClasses`
  already exists, so this is expected to be unnecessary and is listed as conditional.

**Unchanged, deliberately**

- The `validators` table and its migration. The nullable `ilocano_proficiency` column already
  exists and is exactly the shape this flow needs, so this change adds **no** migration and **no**
  new `ValidatorsRepository` method. Screening is answered before an identifier exists and is
  carried into the single `create` write, which is why a "record proficiency on an existing
  validator" method is not required.
- `data/ilocano-synthetic-data.json`. Untouched; the immutability guard must stay green.
- Every archived spec. `validator-onboarding` and the `design-system` delta are the only spec
  changes.

**Dependencies** — none added.

**Runtime limitation, stated up front.** No Supabase project exists in this environment
(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are all absent). The enrollment
action's validation, authorization, and repository-invocation logic is fully verifiable against an
in-memory fake, and the screening screen is fully verifiable as markup; the one hop from the
repository to PostgREST cannot be exercised here, exactly as in Phase 2. This change will ship with
that gap recorded rather than papered over, and the not-configured state is part of the deliverable
precisely because it is the honest behavior in this environment.
