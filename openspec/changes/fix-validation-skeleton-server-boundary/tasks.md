# Tasks

## 1. Shared server-safe styles module

- [ ] 1.1 Create `src/components/validation/answer-option-styles.ts` holding `AnswerOptionClassesOptions`, the selected/unselected token constants, and `answerOptionClasses` (moved verbatim, importing only `@/lib/styles/cn`), with no `"use client"` directive and no client-only imports; verify `pnpm run typecheck` passes.
- [ ] 1.2 Rewire `answer-option.tsx` to import the helper from `./answer-option-styles` (keeping the research-integrity contract comment at the component call site, with a pointer comment at the moved tokens) and rewire `validation-skeleton.tsx` to import it from `@/components/validation/answer-option-styles`; verify no file under `src/` imports `answerOptionClasses` from the `answer-option` client module (grep) and `pnpm run lint` passes.

## 2. Server-boundary regression guard

- [ ] 2.1 Add a unit regression suite proving: the shared styles module carries no `"use client"` directive and no client-only imports; `validation-skeleton.tsx` imports the helper from the shared module and imports no callable export from any `"use client"` module; `answer-option.tsx` uses the same shared helper; skeleton option geometry still equals `answerOptionClasses({ selected: false })` from the shared module; verify the new suite passes and fails on the pre-fix import (can-fire probe with byte-identical restore).
- [ ] 2.2 Extend the DOM skeleton suite so the K-9 geometry pin and the `loading.tsx` render resolve the helper from the shared module path, and render the real `ValidateBatchLoading` boundary; verify `pnpm run test:dom` passes.

## 3. Full verification and independent review

- [ ] 3.1 Run the full verification matrix (`format:check`, `lint`, `typecheck`, unit, DOM, integration, `build`, dataset guard, `openspec validate --strict` on the change) and record actual counts; verify every command passes with no methodology, allocation, persistence, batch, migration, or dataset change.
- [ ] 3.2 Obtain an independent verification pass over the implementation against this change's proposal/design/tasks (root orchestrator reviews; worker diffs accepted only after review); verify no CRITICAL findings remain open and record the verdict in this file before merge.
- [ ] 3.3 After Apply merge and Vercel deployment, verify the deployment is READY, `/validate` renders, a real `/validate/[batchId]` path renders without the `answerOptionClasses() from the server` runtime error, error digest `4202103721` no longer appears on the new deployment, and no new Server/Client boundary errors appear; use safe read/render paths only and create no research responses. Record deployment ID, route results, and YES/NO answers in this file.
