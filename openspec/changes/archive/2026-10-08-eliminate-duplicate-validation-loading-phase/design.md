# Design

## Context

See proposal.md Why. Current code (measured on main): `StartBatch.orchestrate`
(`src/app/validate/start-batch.tsx:104-108`) awaits `requestStartValidationAction`,
which returns `{ batchId, entry, position, total }` (`start-validation-core.ts`),
then discards everything but `batchId` via `router.push(batchRoutePath(...))`.
The `[batchId]` Server Component (`src/app/validate/[batchId]/page.tsx:105-108`)
re-opens the session (`openValidationSession` → `findById` + `listEntryIdsForValidator`
+ `findById` + projection) and renders `ValidationSessionRunner` with
`initial { batchId, entry, position, total, completedCount }`. The route loading
boundary (`loading.tsx:12-18`) renders a bare `<ValidationSkeleton />` in its own
`<main>` with no heading — the skeleton-only phase. The runner needs
`completedCount`, which the start result does not carry.

## Goals / Non-Goals

**Goals:** one loading phase in the normal handoff; shared shell geometry across
all three states; zero second session reads before first render; direct/refresh
entry unchanged; minimal result-shape extension.

**Non-Goals:** cross-batch ("Answer another batch") in-place handoff — `FinishedBatch`
keeps navigating and the now-shared fallback covers it (see Decisions); any change
to allocation, persistence, recovery, batch, methodology, or 1500ms semantics;
any migration change.

## Decisions

### 1. Render the runner in place on `/validate`; `replaceState` the URL

`StartBatch` keeps the orchestration outcome in state. On `started`/`resumed` it
renders `ValidationSessionRunner` directly with the orchestration's entry instead
of `router.push`. The URL becomes the batch address via a single
`window.history.replaceState(batchRoutePath(batchId))` after first render —
a history update, not a navigation, so the session-open path never re-runs.

Alternatives considered: `router.replace` — rejected, it triggers the `[batchId]`
Server Component fetch, which is the duplicate work being removed. Shallow routing —
not supported by the App Router. Keeping `router.push` and pre-warming — keeps the
second resolution and the skeleton-only frame.

Trade-off recorded honestly: native `replaceState` moves the address bar without
informing the App Router's internal history state. Consequences measured at Apply:
refresh/deep-link/paste still server-render `[batchId]` (independent of router
state); the runner's own fallback navigations use `router.push` from the current
URL and are unaffected; Back skips the consumed `/validate` entry (which would
otherwise re-mount the auto-orchestrator and mint a second batch — skipping it is
the safer direction). If Apply measurement contradicts any of this, the design
changes rather than the observation.

### 2. `completedCount` comes from the orchestration, computed generally

`resolveFirstEntry` already loads the batch row and the completed-id set; it also
returns the count of the batch's placements present in that set. No fresh/resumed
special-casing: a just-allocated batch naturally counts zero through the same
expression (same-attempt exclusion), and a resumed batch counts its answered
placements. The runner's `initial` is then fully constructed from the result.
Nothing else is added to the shape (no entries list, payload, coverage, or
researcher data), keeping the one-entry wire pin intact.

### 3. One shared server-safe shell; `loading.tsx` uses it

New `ValidationPageShell` (no `"use client"`, server-safe like the skeleton fix):
owns `<main>` container, `h1`, description, spacing, and a content slot. Used by
`/validate` page, `[batchId]` page, and `[batchId]/loading.tsx` (shell + skeleton).
`StartBatch`'s working phase keeps returning the bare skeleton — the page supplies
the shell, so heading/description never unmount across working → runner.

### 4. Runner reuse without moving files

`ValidationSessionRunner` is route-agnostic (`locale` + `initial`). `StartBatch`
imports it from the `[batchId]` route module. No file move: moving the runner
would drag `validation-form`/`finished-batch` imports with it for no behavioral
gain. The import direction (start island → session runner) matches the new data
flow.

### 5. `FinishedBatch` next-batch path unchanged

"Answer another batch" still navigates; the fallback now renders the shared shell,
so the visual defect (skeleton-only jump) is fixed there without a cross-batch
runner-reset state machine (teardown of finished state, queue handover, URL swap
mid-session). Recorded as a follow-up candidate, not smuggled in.

## Risks / Trade-offs

- [Risk] `replaceState`/router-state divergence confuses a later navigation →
  Mitigation: DOM tests pin exactly one `replaceState` with the batch path and
  zero `router.push/replace` on the happy path; manual refresh/deep-link check
  on preview; honest UNVERIFIABLE note if the preview gate blocks it.
- [Risk] `completedCount` miscount on the resumed arm shows wrong internal
  figures → Mitigation: core unit tests with fakes (fresh counts 0, resumed
  counts answered placements, finished-batch edge); the figures are internal,
  never presented.
- [Risk] Shell refactor drifts one of the three states → Mitigation: DOM tests
  compare container/heading/description geometry across start, fallback, and
  presenting renders; type-level closed key set on the shell props.
- [Risk] StrictMode double-mount renders two runners → Mitigation: existing
  `started` ref single-flight is preserved; orchestration still runs once.

## Migration Plan

No migrations. No config changes. Rollback is a revert; the old navigate path is
fully replaced, not kept behind a flag. Deploy: merge Apply, verify CI + Vercel,
real-browser Continue → Question 1 observation (no Validating disappearance, no
skeleton jump, no second loading shell), record dispatch-to-render timings.

## Open Questions

None — the `replaceState` trade-off above is the smallest unknown and it is
answered by Apply measurement, not deferred.
