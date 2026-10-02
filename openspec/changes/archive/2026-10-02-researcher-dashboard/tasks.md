# Tasks

## 1. Review-flag domain logic

- [x] 1.1 `src/lib/domain/review-flags.ts`: `evaluationsDisagree` and `correctionsDiverge` as pure
      functions over the shared `QualifyingResponseShape`, reusing `isQualifyingValidation`.
      Translations are excluded by TEST, not by the signature: a behavioural test proves rows
      differing only in translation wording do not flag (name-independent, so it survives a rename),
      and a source-text test proves the module's comment-stripped code contains no translation
      FIELD ACCESS in any casing (anchored on today's field names, so weaker than a type-level
      guarantee — recorded as such rather than overstated). (An earlier draft used a narrower
      translation-free local shape; it was unworkable — the qualifying check needs the translations
      to determine qualifying — so the shape is shared and the exclusion is tested instead.
      `design.md` D3 originally claimed the signature forbade comparing them and was corrected.)
      Verified with unit tests covering: disagreement among qualifying responses flags;
      `cannot_evaluate` alongside qualifying responses does not flag;
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

## 3. Dashboard data service (marker-free, dependency-injected)

- [x] 3.1 A module that assembles the overview from repository reads: active entries,
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
      repositories). CORRECTION: no dom tests — the dashboard routes add no NEW client component.
      They render `SignOutButton`, which IS a `"use client"` island (the first draft of this task
      claimed "zero client JavaScript"; that was false and is corrected here), and its behaviour is
      already covered by `tests/dom/researcher-sign-in.test.tsx` ("the sign-out control"). The
      dashboard's own navigation is plain anchors with no handler and no state, so there is nothing
      left for `happy-dom` to observe that the markup assertions do not already cover.
- [x] 4.2 Review list: flagged entries link to their review routes; bucket counts link to nothing
      that does not exist (no dead links). Verified with markup tests asserting exact link targets.

## 5. Per-entry review page

- [x] 5.1 `(protected)/entries/[id]/page.tsx` renders source fields plus every response separately:
      proficiency as stored, evaluation, correction, both translations, qualifying status with
      reason. Unknown id renders not-found. Verified with rendered-markup unit tests (all fields
      present per response, unmerged) and a test asserting translations of one validator never
      appear under another — including the region BEFORE the first response card, which an earlier
      draft of that test never examined. The ROUTE itself (params id → service → `notFound()`) is
      rendered by `tests/unit/entry-review-page.test.tsx`; the view tests alone could not prove it.
- [x] 5.2 Read-only scan: no dashboard module under `src/app/researcher/` performs a repository
      write call or defines a Server Action. Verified with a source-text unit test (write-call
      patterns plus directive scan, comments stripped) with can-fire controls pointed at real
      production writers (a `.insert(` caller and a `"use server"` module), plus a P-WRITE probe
      smuggling `.insert()` into the dashboard page going red by name.

## 6. Close out

- [x] 6.1 `pnpm run lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`,
      `build` — all run, all reported with the figures they actually produced. Final tree: lint 0,
      format 0, typecheck 0, unit **63/1521**, dom 7/87, integration 12/197, build compiled with
      `/researcher` and `/researcher/entries/[id]` routes present. The unit figure is the
      POST-REPAIR one, re-measured rather than incremented (62/1514 → 63/1521).
- [x] 6.2 Gate: signed in on the local dev server with the operator credential (real
      `runResearcherSignIn` comparison: real credential accepted, wrong one refused) and read the
      dashboard (HTTP 200, every figure label) and one entry review (HTTP 200, source fields) off
      rendered HTML; unknown entry 404, unsessioned dashboard 403. Measured with a temporary gate
      probe, deleted afterward — never committed, never part of the suite. The browser-to-server
      Server Action flight protocol was not exercised (no browser exists to speak it); the form
      submission path is covered by `tests/dom/researcher-sign-in.test.tsx`. No desktop browser
      has rendered these screens (residual stands).
- [x] 6.3 `openspec change validate researcher-dashboard --strict` exits 0.
- [x] 6.4 Update `docs/ROADMAP.md` `## Project Status`: change state, figures, residuals.
- [x] 6.5 Independent verification pass. Verdict **PASS-WITH-FINDINGS**: all 14 scenarios have named
      tests and every measured figure matched the ledger. Three CRITICALs and thirteen warnings were
      repaired, none waived. The three CRITICALs were false CLAIMS about enforcement (the
      zero-client-JavaScript claim in three files, `design.md`'s signature guarantee, and the page's
      destructuring claim), each re-confirmed by measurement before repair rather than taken on the
      verifier's word. The first also exposed a DEFEATABLE guard: the read-only scan passed
      `validators.create(...)`, a reachable production write. Five measured escapes are now closed
      (E-CREATE, E-OPTIONAL, E-NEWLINE, E-TOUCH, E-DIRECTIVE), each RED by name with green controls
      and byte-identical restores. Warnings repaired rather than deferred: the permutation-invariant
      figure assertion, the unexamined segment in the per-validator scoping test, an assertion
      satisfied by an attribute rather than by the UI, three of four untested disqualify reasons,
      the hardcoded coverage threshold, and the missing per-entry ROUTE test.
- [x] 6.6 Merge with a merge commit only after 6.1–6.5 are green. Apply merged as **PR #64**,
      merge commit `f7f02cb`; Sync merged as **PR #65**, merge commit `1938c3f`. Both CI runs read
      back from their logs by step name (unit 63/1521, dom 7/87, integration 12/197, dataset guard
      1/7) with full step lists present (16 real steps, none non-success).
