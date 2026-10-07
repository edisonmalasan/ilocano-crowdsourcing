# Proposal

## Why

The previous change made entry pacing humane but introduced two participant-visible problems. First, screening Continue lands on a separate "Start validating" page that is pure overhead: the participant asked for sentences once and is then shown a waiting room before the Validating experience. Second, the settling interval shows the next entry's real sentence and form but disabled for two seconds, which reads as a broken or teasing interface rather than a calm transition. The skeleton also drifts from the real layout because it is hand-drawn boxes rather than shared geometry. This change removes the waiting room, replaces disabled-entry settling with a layout-matched skeleton transition, and shortens the interval to 1500ms, all without touching methodology, allocation, persistence, or batch semantics.

## What Changes

- The `/validate` route no longer presents a "Start validating" page. While the single start orchestration runs, it renders the Validating page shell (same container, same header) with a layout-matched validation skeleton, then navigates to the allocated session. All server-side allocation, recovery, reservation, and authorization work underneath is unchanged.
- The per-entry settling model is replaced by a skeleton transition: on submit the response save starts immediately in the background, a layout-matched transition skeleton shows for 1500ms, and only then is the next entry revealed, immediately interactive. The next entry's real sentence and form are never rendered (disabled or otherwise) during the interval.
- The transition interval changes from 2000ms to 1500ms (`ENTRY_SETTLING_MS` becomes `ENTRY_TRANSITION_MS = 1500` or equivalent; exact naming is an Apply detail).
- The skeleton is rebuilt on shared layout primitives with the real UI (same cards, padding, borders, radius, shadow, spacing, option and button heights) so it cannot drift from the form in the future.
- The sentence-card skeleton adapts to the prefetched upcoming sentence: a deterministic length-based line approximation (no text shown early, no pixel-perfect measurement). When the upcoming entry is not yet known, a stable generic sentence skeleton is used. Server knowledge is never invented.
- No extra loading copy is added anywhere (`Preparing your sentences…`, `Loading next sentence…`, `Please wait…`, countdowns, routine `Saving…`/`Saved`). Errors still show real error messages and a failed request never leaves a standing skeleton.
- The final entry keeps the approved finished-batch checkpoint with no fake sixth-entry transition.
- Other genuine loading states (recovery/resume, next-batch navigation) are audited and receive the same layout-matched skeleton only where real async work with a predictable layout exists.

## Capabilities

### New Capabilities

(none — this change reworks behavior already covered by existing capabilities)

### Modified Capabilities

- `validation-transition`: the settling-disabled-entry requirement is replaced by the skeleton-transition requirement at 1500ms; the skeleton requirement is extended with shared-geometry construction, sentence-adaptive lines, and the no-extra-copy rule.
- `validation-start`: the start route presents the Validating shell with a skeleton while orchestrating instead of a separate "Start validating" page.
- `validation-experience`: the correction-input-settling scenario (disabled during settling) is corrected to the new model — no control is ever presented disabled by a transition.

## Impact

- Affected code: `src/app/validate/page.tsx`, `src/app/validate/start-batch.tsx`, `src/app/validate/[batchId]/validation-session.tsx`, `src/app/validate/[batchId]/validation-form.tsx` (settling flag removed), `src/components/validation/validation-skeleton.tsx` (rebuild), possibly `src/components/validation/entry-card.tsx` (shared geometry only, no behavior), copy catalog only if a key becomes dead (ENG+FIL together with guard updates).
- Untouched by rule: `src/lib/validation/*` orchestration/allocation/recovery cores, save queue, migrations, schemas, dataset, exports, dashboard, completion rules, batch size 5, prefetch and reservation architecture.
- Tests: new/updated DOM suites for initial flow, transition, geometry, final entry, and failure; existing settling suites reworked to the new contract; full matrix re-verified.
