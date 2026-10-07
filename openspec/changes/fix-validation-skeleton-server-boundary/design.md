# Design

## Context

See proposal.md (Why) for motivation. Current state, measured on `main`:

- `src/components/validation/answer-option.tsx` starts with `"use client"` (it owns interactive state: roving tabindex, focus refs, keyboard handling) and exports both the `AnswerGroup` component and the pure helper `answerOptionClasses`.
- `src/components/validation/validation-skeleton.tsx` has no directive (a Server Component) and calls `answerOptionClasses({ selected: false })` imported from the client module.
- `src/app/validate/[batchId]/loading.tsx` is a server route boundary rendering `ValidationSkeleton`. Runtime path: Server Component → skeleton → call into `"use client"` module → production crash (digest `4202103721`).
- The helper itself is pure: it closes over two frozen token constants and `cn()` from `@/lib/styles/cn`, which is already server-safe (no directive, no client APIs). Only its *module address* is client-tainted.
- Other skeleton imports are already server-safe: `entry-card.tsx` and `ui/card.tsx` carry no directive; `sentence-skeleton.ts` is a pure lib module.
- AGENTS.md architecture rules require explicit transport/domain/presentation boundaries and forbid bypassing an established abstraction; the established abstraction here is "shared geometry via one helper", which must be kept, not duplicated.

## Goals / Non-Goals

**Goals:**

- Make `ValidationSkeleton` server-renderable while keeping one authoritative option-geometry helper used by both the real options and the skeleton placeholders.
- Add a regression guard that fails if a server-rendered module ever again imports a callable export from a `"use client"` module.

**Non-Goals:**

- No change to option visuals, skeleton layout, transition timing, or any approved requirement (see proposal.md Modified Capabilities: none).
- No new ESLint plugin or CI job; the guard extends existing test conventions.
- No `"use client"` on the skeleton: that would force the route `loading.tsx` boundary into client rendering and concede the server-renderable skeleton the specs require at route resolution.

## Decisions

1. **New module `src/components/validation/answer-option-styles.ts`, no directive, exporting `AnswerOptionClassesOptions`, `answerOptionClasses`, and importing `cn` only.**
   Rationale: the smallest move that changes the helper's module address from client to server-safe without touching its output. Alternatives rejected:
   - *Duplicate the class string in the skeleton*: violates the no-duplication requirement and reintroduces drift the geometry suite was built to prevent.
   - *`"use client"` on the skeleton*: hides the boundary instead of fixing it; the `loading.tsx` server boundary would then render a client component tree where a server-renderable placeholder is specified, and every future server import of skeleton geometry would re-taint.
   - *Move the helper to `src/lib/`*: `cn` already lives in lib, but the tokens are presentation-specific to the answer option; co-locating under `components/validation/` keeps the existing import graph shape (`@/components/validation/...`) and keeps the research-integrity comment beside the tokens it governs.
2. **`answer-option.tsx` re-imports the helper; the research-integrity contract comment stays with the component and the token constants move with the helper, with a pointer comment in each direction.**
   Rationale: the structural-neutrality guarantee is about the component's call site, while the token definitions are what the helper needs. Splitting the comment would weaken it; duplicating it would drift. Keep the full contract where options are rendered, and a short pointer where tokens live.
3. **Regression guard as a unit test over module source + a DOM render of the real `loading.tsx`, extending the existing K-series skeleton suite rather than a new ESLint rule.**
   Rationale: the repo already proves boundary facts with source-level scans plus rendered-markup assertions (e.g. `locale-research-boundary`, `onboarding-routes`). A source scan asserting (a) no `"use client"` directive in the shared module, (b) no client-only imports there, (c) the skeleton imports the helper from the shared module and from no `"use client"` module, plus (d) a byte-equality check that skeleton option classes equal `answerOptionClasses({ selected: false })` computed from the shared module, plus (e) rendering `ValidateBatchLoading` — mirrors the proven pattern and fails precisely on the reintroduction of this bug. An ESLint import rule would be heavier machinery for a single known edge; if a second server/client import violation appears, promote to a rule then.

## Risks / Trade-offs

- [Risk] Other modules import `answerOptionClasses` from `answer-option.tsx` (unit suites do; check `src/` for production importers) → Mitigation: re-export is NOT added to the client module (a re-export would keep the client address importable and invite recurrence); all production importers are rewired and the old export path is asserted absent in `src/`.
- [Risk] A future helper added to the shared styles module could import client-only code, silently re-tainting it → Mitigation: the guard pins the shared module's import list to `cn` (plus types) and its first-statement directive to absent.
- [Risk] Test-only imports from the client path keep working (vitest has no RSC boundary), masking a production-only regression → Mitigation: the guard is source-text based, not import-behavior based, so it fires regardless of the test runtime's leniency.
