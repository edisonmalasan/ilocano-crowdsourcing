# Tasks

## 1. Review-flag domain logic

- [x] 1.1 `src/lib/domain/review-flags.ts`: `evaluationsDisagree` and `correctionsDiverge` as pure
      functions over the shared `QualifyingResponseShape`, reusing `isQualifyingValidation`.
      Translations are excluded by enforcement, not by shape: a behavioural test proves differing
      translations do not flag, and a source-text test proves the module contains no translation
      reference at all. (An earlier draft used a narrower local shape; it was unworkable — the
      qualifying check needs the translations to determine qualifying — so the shape is shared
      and the exclusion is tested instead.) Verified with unit tests covering: disagreement among
      qualifying responses flags; `cannot_evaluate` alongside qualifying responses does not flag;
      two distinct corrections flag even when evaluations agree; identical corrections do not
      flag; whitespace-only correction differences do not flag; case differences flag
      (conservative direction, thesis-team call to change).
- [x] 1.2 Can-fire: each predicate proved red by breaking it (raw-evaluation counting, case
      folding, translation reads — each naming its test), with green controls and byte-identical
      restores. One probe defect found and repaired: the first R3 mutant nested its translation
      read inside the correction-present branch, so the behavioural test passed while the
      structural one fired; the corrected mutant reads unconditionally.

## 2. Bulk validator reads

- [x] 2.1 `ValidatorsRepository.listByIds(ids)` interface plus Supabase implementation with `.in()`,
      returning profiles in caller-asked order with unknown ids omitted (mirroring the entries
      `listByIds`, so the order is deterministic rather than the wire's). Verified with unit tests
      against the recording fake (argument shape, row mapping) and integration tests from the
      production migration directory (round trip, empty-list behavior stated explicitly).
- [x] 2.2 Can-fire: the `.in()` call proved against a wrong-column variant going red.

## 3. Dashboard data service (server-only)

- [x] 3.1 A server-only module that assembles the overview from repository reads: active entries,
      validations for those entries, validator profiles for responding validators; computes the
      eleven figures with the domain functions; returns per-entry review flags. No credential, no
      client component import. Verified with unit tests over fakes (figures on a hand-built dataset
      with known bucket counts, disagreement cases, and non-qualifying rows contributing zero).
      Implemented as `src/lib/admin/dashboard.ts` with injected `Pick<>` repository contracts
      (marker-free, so fakes need no `server-only` stub) plus `nonQualifyingReason` in a new
      `src/lib/domain/review-reasons.ts` — separate from `review-flags.ts` because naming a missing
      translation requires reading translation presence, which the flag module is structurally
      forbidden from doing.
- [x] 3.2 Per-entry assembly for the review route: entry plus every stored response with validator
      proficiency and per-response qualifying status plus reason. Verified with unit tests over fakes
      including an unknown id (null, not an exception shape the page could mistake for data).

## 4. Overview page

- [x] 4.1 `(protected)/page.tsx` renders the eleven figures from the service, with the coverage
      denominator labeled next to the percentage. Soft neo-brutalism, mobile-first, no placeholder
      numbers. Verified with rendered-markup unit tests (every figure label present, values from an
      injected service) and page-level wiring tests (mocked factory proving the page reads its
      repositories). CORRECTION: no dom tests — the dashboard ships zero client JavaScript (plain
      anchors, no handlers, no state), so there is no click behavior for `happy-dom` to observe
      that markup assertions do not already cover. A dom test asserting an href exists would prove
      nothing beyond the markup test beside it.
- [x] 4.2 Review list: flagged entries link to their review routes; bucket counts link to nothing
      that does not exist (no dead links). Verified with markup tests asserting exact link targets.

## 5. Per-entry review page

- [x] 5.1 `(protected)/entries/[id]/page.tsx` renders source fields plus every response separately:
      proficiency as stored, evaluation, correction, both translations, qualifying status with
      reason. Unknown id renders not-found. Verified with rendered-markup unit tests (all fields
      present per response, unmerged) and a test asserting translations of one validator never
      appear under another.
- [x] 5.2 Read-only scan: no dashboard module under `src/app/researcher/` performs a repository
      write call or defines a Server Action. Verified with a source-text unit test (write-call
      patterns plus directive scan, comments stripped) with can-fire controls pointed at real
      production writers (a `.insert(` caller and a `"use server"` module), plus a P-WRITE probe
      smuggling `.insert()` into the dashboard page going red by name.

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
