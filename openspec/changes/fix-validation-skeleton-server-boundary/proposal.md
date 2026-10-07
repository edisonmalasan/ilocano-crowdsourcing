# Proposal

## Why

Production `/validate/[batchId]` crashes at runtime with `Attempted to call answerOptionClasses() from the server but answerOptionClasses is on the client` (error digest `4202103721`). `validation-skeleton.tsx` — rendered from the server-side `loading.tsx` route boundary — calls `answerOptionClasses()` imported from `answer-option.tsx`, which carries `"use client"`. Calling a client-module function from a Server Component is a hard Next.js runtime boundary violation, so the skeleton UX shipped by `refine-validation-loading-transitions` cannot render where it is most needed. Ordinary unit/DOM tests never reproduced it because they import modules without enforcing the Server Component boundary.

## What Changes

- Move the pure styling/geometry helper `answerOptionClasses` (plus its `AnswerOptionClassesOptions` type and the selected/unselected token constants it closes over) out of the Client Component module `src/components/validation/answer-option.tsx` into a new server-safe shared module `src/components/validation/answer-option-styles.ts` with no `"use client"` directive and no client-only imports.
- `answer-option.tsx` imports the helper from the shared module (single authoritative definition; no behavior change to the real options).
- `validation-skeleton.tsx` imports the helper from the shared module, keeping identical option-placeholder geometry without crossing the server/client boundary.
- Add regression coverage proving the boundary holds: the skeleton imports no callable export from a `"use client"` module, the shared helper module is server-safe, both consumers use it, skeleton option geometry still equals the real unselected option geometry, and the `loading.tsx` boundary renders without the previous runtime error.
- No UX change, no methodology change, no allocation/persistence/batch change, no migration change.

## Capabilities

### New Capabilities

(none — no new behavior is introduced)

### Modified Capabilities

(none — every approved skeleton/transition requirement already in force in `validation-transition`, `validation-start`, and `validation-experience` is preserved unchanged; this change only repairs the module boundary that prevented the already-specified skeleton from rendering on the server)

This change sets `skip_specs: true`: it is a pure boundary/runtime repair with zero requirement change.

## Impact

- Affected code: `src/components/validation/answer-option.tsx`, `src/components/validation/validation-skeleton.tsx` (import-source change only), new `src/components/validation/answer-option-styles.ts`.
- Affected tests: existing skeleton/geometry suites are updated only in their import source where they reference the helper; a new server-boundary regression suite is added.
- No API, dependency, migration, dataset, or hosted-data impact.
