# Proposal

## Why

The start orchestration already returns everything needed to present the first entry (batch id plus exactly one entry, position, total), but `StartBatch` discards the entry and navigates to the session route, which re-resolves the same first entry behind a second skeleton-only loading boundary. The participant sees Validating + skeleton, then a skeleton with no header, then Validating + Question 1, and the server does the first-entry resolution twice.

## What Changes

- The normal start handoff renders `ValidationSessionRunner` directly from the start orchestration result in the same mounted shell; no second session-open read before first render.
- The browser URL still becomes `/validate/[batchId]` via a history update that does not re-trigger the session-open path; refresh, deep link, and copy/paste keep working through the unchanged server-authoritative session route.
- One shared Validating page shell (container, heading, description, content slot) is used by `/validate` start loading, `/validate/[batchId]` loading fallback, and the presenting session route so they cannot drift.
- `/validate/[batchId]/loading.tsx` renders the shared shell (heading + description + skeleton), never a skeleton alone.
- The start result is extended minimally only if the runner genuinely needs it (`completedCount`: 0 for fresh starts, authoritative count for resumed batches); no full batch, no future entries, no coverage or researcher data.
- Resumed batches use the already-returned next entry directly under the same rule.
- Batch size 5, no X-of-Y, no counters, no progress bar, no routine Saving/Saved copy, the 1500ms entry transition, background save at submit, hidden next entry during transition, finished-card checkpoint, same validator across batches, and ENG/FIL parity are unchanged. Allocation, persistence, recovery, and methodology semantics are unchanged.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `validation-start`: the normal handoff presents the first entry from the orchestration result in place instead of navigating into a second session resolution; the result carries the minimal runner-construction fields; direct/refresh entry still resolves server-side.
- `validation-transition`: the session-route loading fallback uses the same shared Validating shell (heading + description + skeleton) with the same geometry, so the normal flow has one loading phase and the fallback never renders a skeleton-only state.

## Impact

- `src/app/validate/start-batch.tsx`, `src/app/validate/page.tsx`, `src/app/validate/[batchId]/page.tsx`, `src/app/validate/[batchId]/loading.tsx`, one new shared shell component, `src/lib/validation/start-validation-core.ts` (only if `completedCount` genuinely required), `ValidationSessionRunner` initial-state construction.
- Tests: unit (start-handoff decision, result-shape pin), DOM (shell stability, no second loading phase, heading/description persistence, resumed flow, error replacement), integration unchanged unless the start result gains a field (then core-level coverage for the derived count).
- No migration changes. No allocation, persistence, recovery, batch, or methodology semantic changes. No 1500ms behavior change.
