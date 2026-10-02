# Tasks

## 1. Review-flag domain logic

- [ ] 1.1 `src/lib/domain/review-flags.ts`: `evaluationsDisagree` and `correctionsDiverge` as pure
      functions over stored-response shapes, reusing `isQualifyingValidation` and taking no
      translation input. Verify with unit tests covering: disagreement among qualifying responses
      flags; `cannot_evaluate` alongside qualifying responses does not flag; two distinct
      corrections flag even when evaluations agree; identical corrections do not flag;
      whitespace-only correction differences do not flag; translation-only differences do not flag
      (assert at the type layer that the input shape has no translation field).
- [ ] 1.2 Can-fire: each predicate proved red by breaking it (e.g. comparing all responses instead
      of qualifying ones; folding case), with green controls and byte-identical restores.

## 2. Bulk validator reads

- [ ] 2.1 `ValidatorsRepository.listByIds(ids)` interface plus Supabase implementation with `.in()`,
      returning profiles in no assumed order. Verify with unit tests against the recording fake
      (argument shape, row mapping) and integration tests from the production migration directory
      (round trip, empty-list behavior stated explicitly).
- [ ] 2.2 Can-fire: the `.in()` call proved against a wrong-column variant going red.

## 3. Dashboard data service (server-only)

- [ ] 3.1 A server-only module that assembles the overview from repository reads: active entries,
      validations for those entries, validator profiles for responding validators; computes the
      eleven figures with the domain functions; returns per-entry review flags. No credential, no
      client component import. Verify with unit tests over fakes (figures on a hand-built dataset
      with known bucket counts, disagreement cases, and non-qualifying rows contributing zero).
- [ ] 3.2 Per-entry assembly for the review route: entry plus every stored response with validator
      proficiency and per-response qualifying status plus reason. Verify with unit tests over fakes
      including an unknown id (null, not an exception shape the page could mistake for data).

## 4. Overview page

- [ ] 4.1 `(protected)/page.tsx` renders the eleven figures from the service, with the coverage
      denominator labeled next to the percentage. Soft neo-brutalism, mobile-first, no placeholder
      numbers. Verify with rendered-markup unit tests (every figure label present, values from an
      injected service) and dom tests for the review-list navigation.
- [ ] 4.2 Review list: flagged entries link to their review routes; bucket counts link to nothing
      that does not exist (no dead links). Verify with markup tests asserting exact link targets.

## 5. Per-entry review page

- [ ] 5.1 `(protected)/entries/[id]/page.tsx` renders source fields plus every response separately:
      proficiency as stored, evaluation, correction, both translations, qualifying status with
      reason. Unknown id renders not-found. Verify with rendered-markup unit tests (all fields
      present per response, unmerged) and a test asserting translations of one validator never
      appear under another.
- [ ] 5.2 Read-only scan: no dashboard module under `src/app/researcher/` imports a repository
      write path or defines a Server Action mutating research data. Verify with a source-text unit
      test plus a can-fire control pointed at a fixture that does.

## 6. Close out

- [ ] 6.1 `pnpm run lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`,
      `build` — all run, all reported with the figures they actually produced.
- [ ] 6.2 Gate: sign in on the local dev server with the operator credential and read every
      dashboard figure and one entry review off rendered HTML; record that no desktop browser has
      rendered them (residual stands).
- [ ] 6.3 `openspec change validate researcher-dashboard --strict` exits 0.
- [ ] 6.4 Update `docs/ROADMAP.md` `## Project Status`: change state, figures, residuals.
- [ ] 6.5 Independent verification pass. No CRITICAL finding may survive, and no WARNING may be
      silently waived.
- [ ] 6.6 Merge with a merge commit only after 6.1–6.5 are green.
