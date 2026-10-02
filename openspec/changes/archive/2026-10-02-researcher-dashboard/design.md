# Design

## Context

See `proposal.md` for why. The facts constraining the how:

- The `(protected)` layout already refuses every unverified request with 403 before any page
  renders, so pages beneath it read as an authorized researcher without re-checking.
- The repositories already expose the reads a dashboard needs: `listActive` / `listByIds` on
  entries, `listForEntries` (paginated, exact-count driven) on validations, `findById` on
  validators. What is missing is bulk validator-profile reads.
- The meaning of "qualifying" has exactly one definition
  (`isQualifyingValidation` / `countQualifyingValidations` in
  `src/lib/domain/validation-response.ts`), deliberately dependency-free so UI, actions, and
  tests share it. The review flag must reuse it, not restate it.
- Scale: 600 entries × ~3 responses ≈ 1800 validation rows. No pagination, caching, or
  aggregation layer is needed; a full read per page load is trivial and keeps every figure a
  direct computation over current rows rather than a cached value that can disagree with them.

## Goals / Non-Goals

- Goals: the eleven approved figures from live reads; per-entry inspection; review flags from a
  pure rule; read-only throughout.
- Non-Goals: search, filters, sorting controls, export (Phase 8), adjudication writes, any schema
  change. A useful filter discovered during implementation is recorded as follow-up, not added.

## Decisions

### D1 — Figures are computed in application code, not in SQL

No views, no aggregate functions, no new migration. A SQL coverage count would be a second,
independent implementation of the qualifying rule in another language, and the two would drift —
`validation-response.ts` already records why that drift is silent and research-corrupting. The
dashboard reads rows through the existing repositories and computes with the domain functions, so
there is exactly one definition from allocation to dashboard to (later) export.

### D2 — One new repository method: `ValidatorsRepository.listByIds`

The dashboard needs profiles for every validator appearing in the response set (breakdown,
per-response proficiency) plus the total count. `findById` in a loop is N+1 against PostgREST;
`listByIds(ids)` with `.in()` is one round trip and mirrors `listForEntries` / `listByIds` on the
other repositories. No other repository change: entries and validations already page correctly.

### D3 — Review flags live in a new pure domain module

New `src/lib/domain/review-flags.ts` beside `validation-response.ts`, importing nothing, reusing
`isQualifyingValidation`. Two predicates:

- `evaluationsDisagree(responses)`: distinct evaluation values among the QUALIFYING responses are
  more than one. Non-qualifying responses cannot disagree — a `cannot_evaluate` is an abstention,
  not an opinion, and counting it as disagreement would flag entries for having been attempted.
- `correctionsDiverge(responses)`: distinct corrected instructions among responses that carry
  one, compared after trimming surrounding whitespace and otherwise exact. No case folding, no
  punctuation normalization: normalization hides real differences, and the safe direction for a
  review flag is over-flagging to a human, never silent agreement.

Translations are never READ as inputs to either predicate — the spec forbids it, and that is
enforced by TEST rather than by the signature, which is a correction to what this decision
originally claimed. Both predicates take `readonly QualifyingResponseShape[]`, and that shape
DOES carry `englishTranslation` and `filipinoTranslation`: determining *whether a response
qualifies* requires reading them, so a translation-free parameter type is not available. A
narrower local shape was written first and discarded as unworkable for exactly that reason.

The enforcement that replaced the type-layer claim is two halves, because neither alone is
enough:

- BEHAVIOURAL — a test passes rows whose evaluations and corrections agree and whose translations
  differ, and asserts no flag. This half is independent of field names, so it survives a rename.
- STRUCTURAL — a test reads this module's comment-stripped source and asserts it contains no
  translation FIELD ACCESS in any casing. Weaker than the type layer and honest about it: it is
  anchored on today's field names, so a coordinated rename could defeat it. A whole-object
  comparison (`JSON.stringify(response)`) would also slip past it — the behavioural half is what
  covers that case.

Because naming a *missing* translation requires reading translation presence, that logic lives in
a separate `review-reasons.ts`. One module cannot both be forbidden from reading translations and
be asked to say which one is missing.

### D4 — Two routes under the existing guard, both Server Components

- `(protected)/page.tsx` becomes the overview (replacing the placeholder the access change left
  deliberately). It reads after the layout's authorization; no second check, per the layout's
  documented rule.
- `(protected)/entries/[id]/page.tsx` is per-entry inspection. Unknown ids render the
  established not-found path rather than an empty dashboard; a refusal and an absence must stay
  distinguishable per the access spec, and the layout already refuses before the page runs.

### D5 — Coverage percentage denominator is total dataset entries

The approval lists "overall coverage percentage" without a formula. Definition used here:
coverage-complete entries ÷ total dataset entries. The alternative (÷ entries with any response)
would report 100% while untouched entries exist, which is the silent-wrong-answer direction. The
dashboard labels the denominator next to the figure so the definition is on the screen, not just
in this file.

### D6 — Research text is data, interface locale is chrome

The dashboard shows Ilocano instruction, correction, English, and Filipino texts as stored
research data — always all present texts, regardless of interface locale. Proficiency is shown as
the stored self-reported value, never scored or ranked. Interface chrome follows the existing
locale mechanism; nothing on the page implies a research attribute from the locale.

## Risks / Trade-offs

- [Risk] Full-table reads on every dashboard load grow with collection. Mitigation: none needed
  at 600×3 rows; the reads reuse the paginating repository methods, so a larger future dataset
  pages rather than truncates. If load ever matters, the fix is caching with a stated staleness,
  not a second definition of qualifying.
- [Risk] A researcher misreads "entries with 2" as "almost done, skip". Mitigation: the review
  list surfaces flagged entries first regardless of bucket, and bucket labels state their
  meaning ("2 of 3 qualifying").
- [Risk] Over-flagging from exact correction comparison fatigues reviewers. Mitigation: accepted
  deliberately (D3) — a missed disagreement corrupts research, an extra review costs minutes.
  If reviewers report noise, normalization is a methodology decision for the thesis team, not an
  engineering tweak.

## Migration Plan

None. No schema change, no RLS change, no backfill. Deploy is the application alone; rollback is
the previous deployment, with research data untouched by either direction.

## Open Questions

None that change specs, approach, or tasks. Copy wording for figures goes through the normal
review on the implementation PR.
