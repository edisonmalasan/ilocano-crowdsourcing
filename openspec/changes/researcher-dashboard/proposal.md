# Proposal

## Why

The researcher area has an access boundary and nothing behind it: the landing page deliberately
renders no figures because dashboard views were an explicit Non-Goal of `researcher-admin-access`.
Coverage is now being collected on the hosted project, and the research team cannot see it. The
thesis team has approved exactly which figures the dashboard must show and what counts as
"requiring researcher review", which was the blocking decision — so the views can now be built
without inventing a research claim.

## What Changes

- A protected overview page behind the existing `(protected)` layout showing the eleven approved
  figures: total dataset entries, total qualifying validations, total validators, entries with 0 /
  1 / 2 / 3 qualifying validations (3 = coverage complete), overall coverage percentage,
  evaluation distribution, proficiency breakdown, and entries requiring researcher review.
- A protected per-entry review page showing the original Ilocano instruction, origin, destination,
  transit mode, and every stored response with the validator's proficiency, evaluation, correction,
  English translation, Filipino translation, and whether the response qualifies toward coverage.
- Review-flag logic as pure domain functions: an entry requires review when the qualifying
  validators disagree on evaluation, or when more than one distinct corrected Ilocano version was
  submitted. Differences in English or Filipino wording alone are never disagreement.
- Read paths only. No new tables, no new columns, no migration, no RLS change; privileged reads go
  through the existing server-only access path after the layout's authorization.
- No search, no filters, no export in this change: the approved list is figures plus inspection,
  and the rest stays deferred rather than smuggled in.

## Capabilities

### New Capabilities

- `researcher-dashboard`: what the protected dashboard shows, how review is flagged, and what a
  per-entry inspection contains.

### Modified Capabilities

(none — no existing requirement changes; the access boundary, allocation, and import specs are
consumers of shared definitions, not subjects of this change.)

## Impact

- `src/app/researcher/(protected)/`: overview page replaces the placeholder; new `entries/[id]`
  review route beneath the existing guard layout.
- `src/lib/domain/`: new pure review-flag module beside `validation-response.ts`, reusing
  `isQualifyingValidation` / `countQualifyingValidations` rather than redefining them.
- `src/lib/repositories/`: one read method (`ValidatorsRepository.listByIds`) so the dashboard
  does not N+1 profile reads; everything else reuses existing reads.
- Tests: unit (pure flags, markup), dom (dashboard interactions), integration (new repository
  method against PGlite from the production migration directory).
