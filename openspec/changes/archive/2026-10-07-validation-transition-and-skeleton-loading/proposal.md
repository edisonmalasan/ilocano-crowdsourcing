# Proposal

## Why

Two participant-facing moments in the validation flow currently work against careful validation:

1. **The optimistic entry transition can be too fast.** After pressing Save and continue, the next sentence can appear so instantly that a participant may not register the sentence changed, and may begin answering entry N+1 while still mentally on entry N.
2. **The start of validation feels like visiting a page about starting.** Screening Continue lands on a "Preparing your sentences…" working card (and a Start Validating heading), an intermediate orchestration state that adds no information before the first sentence appears.

Both are presentation problems. Persistence (independent background queue), allocation (server-authoritative, pooled completion), and the background-save architecture stay exactly as approved.

## What Changes

- Adds a **2-second entry-settling interval**: purely presentational, owned by the presented entry. The save still starts immediately in the background and the prefetched next entry still renders immediately; only the new entry's interactive controls stay disabled for ~2 seconds so the participant reads the new sentence first. The timer never gates, delays, or observes persistence.
- Adds a **validation-layout skeleton** (neutral geometric blocks, no fake research content) that replaces the "Preparing your sentences…" working card on `/validate`, backed by a `loading.tsx` boundary on the session route so genuine server waits (initial session resolution, next-batch navigation) show layout-stable placeholders instead of a blank screen or a spinner card.
- Keeps the next-batch flow skeleton-only-when-pending: navigation to an already-resolving session shows the route skeleton; no artificial minimum display time anywhere.
- Failure states keep their existing error presentation; a skeleton never stands in for a failure.
- Accessibility: real disabled semantics on settling controls, readable sentence throughout, skeleton blocks hidden from assistive technology, `aria-busy` on loading containers, `prefers-reduced-motion` respected, no forced focus moves, no countdowns.
- **BREAKING**: none. No migration, no dataset change, no RPC change, no allocation change, no persistence-architecture change, no methodology change.

## Capabilities

### New Capabilities

- `validation-transition`: the 2-second entry-settling interval (ownership, reset, cleanup, independence from persistence) and the validation skeleton family (where skeletons appear, what they must not do, failure/accessibility/reduced-motion rules).

### Modified Capabilities

- `validation-experience`: the per-entry flow gains the settling presentation rule and the skeleton-backed start/next-batch loading presentation; all judgment, correction, translation, persistence, and completion semantics unchanged.

(No `batch-allocation`, `batch-recovery`, `data-access-boundary`, `response-persistence`, or copy-catalog capability changes: allocation, recovery, persistence transport, and queue semantics are untouched. Copy keys are removed only if the implementation proves zero remaining call sites, in both catalogs together.)

## Impact

- Affected code: `src/app/validate/start-batch.tsx`, `src/app/validate/[batchId]/validation-session.tsx`, `src/app/validate/[batchId]/validation-form.tsx`, one new skeleton component, `loading.tsx` boundaries, locale copy only if a key becomes provably dead.
- No migration, no dataset change, no export change, no RPC change.
- Tests: DOM (settling timer behavior under fake timers; skeleton render/replace/failure paths), unit (pure settling helpers if extracted; copy-guard updates if keys die), full matrix green.
