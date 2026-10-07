# Design

## Context

See proposal.md for motivation. Current state (all on main, measured by the explore pass):

- Screening Continue lands on `/validate`, whose page renders an `h1` from `validateStart.meta.title` ("Start validating") plus the `StartBatch` island. The island auto-orchestrates once on mount and, while working, renders `ValidationSkeleton` — so the participant sees a "Start validating" waiting page before the Validating experience.
- The session runner owns `ENTRY_SETTLING_MS = 2000` and a `settlingEntryId` state: after submit the prefetched next entry renders at once with every control disabled for ~2s via the form's `settling` flag.
- `ValidationSkeleton` is hand-drawn `div`/`span` blocks sharing no primitives with the real UI; it mirrors card chrome, padding, and `h-12` heights by hand. It carries no animation classes and no text.
- Real layout primitives: route shell `main.mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-12`; `Card` (`rounded-card border-2 border-ink`, `bg-paper-raised shadow-brutal-md`, `padding=lg` → `p-6 sm:p-8`); `EntryCard` section with inner `px-5 py-4 sm:px-6 sm:py-5`, label `p` + `p[lang=ilo] font-display text-xl leading-relaxed font-bold`; `AnswerGroup` options (`rounded-control border-2 px-4 py-4`, `flex flex-col gap-3`); `Button size=lg` (`min-h-13 px-7 py-3.5`).
- No text-measurement helper exists in `src/`; the sentence-length-to-lines approximation is new, small, and pure.
- Copy keys `validateStart.working` / `validate.finished.continue.working` are genuine button pending labels and stay; `validateStart.meta.title` ("Start validating") becomes dead when the page goes and must be removed ENG+FIL with guard updates.

## Goals / Non-Goals

**Goals:**

- Remove the "Start validating" waiting page; screening Continue opens directly into the Validating shell.
- Replace disabled-entry settling with a 1500ms layout-matched skeleton transition; the revealed entry is immediately interactive.
- Rebuild the skeleton on shared primitives so geometry cannot drift; adapt sentence lines deterministically to the known upcoming sentence.
- Keep every server behavior (orchestration, allocation, prefetch, queue, reservations, completion, export) byte-for-behavior identical.

**Non-Goals:**

- No change to batch size, prefetch depth, queue bounds, retry policy, reservation TTL, completion rules, or export derivations.
- No new dependencies, migrations, RPCs, or routes. The `/ready` route is untouched (nothing links to it).
- No pixel-perfect text measurement; the line approximation is deliberately coarse.

## Decisions

- **D1 — Transition state lives in the runner, not the form.** The runner already owns view identity, prefetch, and the queue. On valid submit it enqueues synchronously (unchanged), then sets a `transitioningTo` entry id with a 1500ms bare-global timer (fake-timer controllable, as before). While set, the runner renders the skeleton instead of any entry; on expiry it reveals the already-resolved next entry. The form's `settling` flag is deleted, not repurposed — no real control is ever transition-disabled again. Alternative (keep `settling` and add skeleton) rejected: two mechanisms for one interval invites them to disagree about when the entry is usable.
- **D2 — 1500ms constant replaces 2000ms.** `ENTRY_SETTLING_MS` is superseded by an `ENTRY_TRANSITION_MS = 1500` export in the runner (naming is Apply's choice; the spec pins the number, tests assert against the export, never a retyped copy).
- **D3 — Skeleton reuses the real cards.** The sentence skeleton renders inside the real `EntryCard` chrome path and the form skeleton inside the real `Card padding=lg` path — either by composing the actual `Card`/`EntryCard` shells with masked bodies or by extracting shared shell primitives both import. Exact factoring is Apply's call; the contract is geometric: same classes at the same breakpoints, asserted by tests comparing skeleton and real markup geometry (class sets + responsive variants), not by eyeballing.
- **D4 — Length-to-lines is a pure deterministic function.** `linesForSentence(text): { lines, lastLineWidth }` (name illustrative) maps character count to 1–N lines with a fixed chars-per-line constant tuned once against the real card width at both breakpoints. It reads only `length`, never content; no canvas, no DOM measurement, no randomness. Unknown upcoming sentence (initial load, prefetch miss) → stable generic shape. The prefetched sentence text is never rendered early — only its length shapes neutral blocks.
- **D5 — `/validate` becomes the Validating shell.** The page renders the same header (`validate.meta.title` + `validate.meta.description`) and shell classes as the session route, with the skeleton while orchestrating, then `router.push` as today. The `validateStart.meta.title` key is deleted ENG+FIL with the copy-guard key sets updated; `validateStart.meta.lead` is audited for liveness and deleted under the same rule if dead. Failure/exhausted/screening-required/no-identity states keep their existing cards and copy.
- **D6 — Prefetch-miss fallback keeps the skeleton, never invents content.** If the next entry is unresolved when the 1500ms fires, the skeleton stays (generic sentence shape) until the existing prefetch resolution/retry path delivers or fails; failure replaces it with the existing error state. No fake entry, no extra copy.
- **D7 — Final entry shows no transition skeleton.** Submit on entry 5 follows the existing finished-card checkpoint path unchanged; the checkpoint's own genuine-wait presentation is reused as-is.

## Risks / Trade-offs

- [Shared-shell refactor touches EntryCard import surface] → Mitigation: EntryCard's research-material contract (sentence only, no ids/endpoints) is pinned by existing tests; the refactor changes chrome composition, not props, and the full DOM suite re-verifies.
- [Chars-per-line constant drifts from real wrapping] → Mitigation: the constant is intentionally coarse (line-count bands, not exact wraps); tests assert bands for short/long fixtures plus the generic fallback, so drift degrades to a slightly-off block count, never a wrong sentence.
- [Deleting copy keys breaks the copy-guard key sets] → Mitigation: dead-key proof task removes keys ENG+FIL together and updates guards in the same commit; the guard suite itself proves the removal.
- [Old settling tests assert disabled-then-enabled] → Mitigation: those suites are reworked to the new contract in their own group (reveal-after-skeleton, immediately-enabled), with can-fire probes proving the new guards fire.

## Migration Plan

No migration. No stored state changes. Rollback is a revert; the runner, skeleton, and `/validate` page change together with their tests.

## Open Questions

None — the user fixed the interval (1500ms), the fallback (stable generic skeleton), the measurement approach (deterministic approximation), and the copy rule (no extra copy). All are recorded in the specs above.
