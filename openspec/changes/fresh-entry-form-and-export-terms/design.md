# Design

## Context

See proposal.md - Why. `ValidationForm` (`src/app/validate/[batchId]/validation-form.tsx`) initializes `useState(EMPTY_ENTRY_FORM_INPUT)` once per mount; advancing via `router.push` to the next position reuses the component instance, so entry 1's state survives into entry 2. The export builders (`records.ts`, `validated.ts`) already receive `ExportSourceWithQualifying` rows carrying `entry`, `response`, and `proficiency`, so judgment metadata needs no new read.

## Goals / Non-Goals

**Goals:**

- Entry change resets form state before paint, proven by a DOM test that fills, submits, advances, and asserts emptiness.
- Validated records carry judgment metadata; both exports use response/attempt terms consistently.

**Non-Goals:**

- Changing pooled derivation, `needs_review` rules, database columns, or identifier values.
- Touching copy, visual design, or batch/advance mechanics.

## Decisions

**D1: Render-phase state adjustment on `datasetEntryId` inside `ValidationForm`, not a page-level `key` and not a `useEffect` reset.**

When the rendered entry id differs from the one the state was built for, set all entry-scoped state back to empty during render (React's endorsed adjust-during-render pattern). A page-level `key` would also remount, but the guarantee would live in an untestable server page while the leak lives in the island; a `useEffect` reset paints one frame of stale answers first. The render-phase form cannot flash stale content by construction, and the DOM suite drives exactly the leak scenario. Attempt identity, batch progress, and transition state are untouched — only entry-scoped fields reset, and only when the entry actually changed (same entry re-rendered is not a reset).

**D2: Judgment metadata rides the existing `FieldSuppliers` in `validated.ts`.**

`category` from the entry, `evaluation`/`source_response_id`/`source_attempt_id` from the judgment response, `self_reported_proficiency` from the judgment source's `proficiency` (null when unrecorded). No new repository read, no join, no adjudication-adjacent choice. CSV appends the same leaves flat in key order; the closed key-set tests pin both orders.

**D3: Pure label renames at the export boundary (`records.ts`, `validated.ts`, key arrays, row builders).**

`validation_id` → `response_id`, `validator_id` → `attempt_id`, `source_validation_id` → `source_response_id`. Database columns, repository mappings, domain types, and stored values are byte-identical; the rename stops at the serializers. Raw diagnostic flags stay raw-only.

## Risks / Trade-offs

- [Risk] Render-phase setState loops if the guard compares wrong → Mitigation: guard compares stored entry id against the prop and only resets on difference; covered by the regression test plus the existing suite.
- [Risk] CSV consumers parsing positionally → Mitigation: header row carries the new names; key order pinned by test; documented in the change.
