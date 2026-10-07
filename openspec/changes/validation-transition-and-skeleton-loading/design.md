# Design

## Context

See `proposal.md` (Why). Current state, measured on this repository:

- `ValidationSessionRunner` (`src/app/validate/[batchId]/validation-session.tsx`) enqueues the validated payload and swaps in the prefetched entry in the same task; `ValidationForm` (`validation-form.tsx`) remounts per entry via `key={view.entry.id}` and disables only on its brief `isPending` transition.
- `/validate` renders `StartBatch` (`src/app/validate/start-batch.tsx`), whose `working` phase shows a spinner dot plus `validateStart.working` ("Preparing your sentences…"). There is no `loading.tsx` under `src/app/validate/` (measured: glob finds none).
- The finished card's Continue navigates to the new batch address; the session route (`[batchId]/page.tsx`) is an SSR Server Component doing genuine async work (session open over repositories).
- Routine Saving/Saved indicators are already removed; no sentence X-of-Y, counters, or progress bars exist.

## Goals / Non-Goals

- Goals: settling interval as pure presentation above the queue; skeleton replacing the start working card; route-level skeletons for genuine waits; failure/error paths unchanged; accessibility and reduced-motion compliance.
- Non-Goals: any persistence, allocation, recovery, reservation, completion, export, or schema change; new RPCs; new migrations; fake delays; minimum skeleton display times; countdowns; progress/gamification UI.

## Decisions

- **Settling state lives in the session runner, keyed by presented entry id.** A `settlingEntryId: string | null` plus a `useEffect` on `view.entry.id`: on every presented entry (including the first mount) set the id and start a 2000ms timer clearing it; cleanup clears the timer on entry change and unmount. Timer identity is checked on expiry (`cur === view.entry.id`) so a stale timer can never enable a newer entry early. Locale is not a dependency (no locale value is read), so language switches neither restart the timer nor touch the queue. The runner passes `settling: settlingEntryId === view.entry.id` into `ValidationForm`, which ORs it with its existing `isPending` for every control's `disabled` (real disabled semantics) while keeping the submit label unchanged — no countdown, no "please wait".
- **The form stays remount-per-entry.** `key={view.entry.id}` already resets answers; settling adds no reset and shares no state with the queue, so a save confirming early cannot shorten the interval and a save confirming late cannot extend it. Double-submit protection (single-flight latch + queue idempotency) is untouched and stays asserted.
- **Final entry takes no settling path.** The runner transitions in place to the finished card with its existing checkpoint; no sixth-entry timer is created.
- **One skeleton component (`ValidationSkeleton`) resembling the session layout** (sentence card block, evaluation options block, save-control block): neutral geometric blocks, `aria-hidden` on visual pieces, container `aria-busy`, page/route heading context preserved outside it, no sentence-like text, calm styling with `@media (prefers-reduced-motion: reduce)` disabling any animation. No new copy keys: the loading container needs no visible text.
- **Framework-native boundaries:** `loading.tsx` on the session route covers genuine SSR waits (initial open, next-batch navigation to a not-yet-ready session); the `/validate` working phase renders the skeleton component instead of the spinner card. If data is already available, the real UI renders — no artificial delay, no minimum display. Failure outcomes keep rendering the existing error states, replacing any skeleton.
- **Copy cleanup only by proof.** `validateStart.working` / `validateStart.working.ariaLabel` / `validate.finished.continue.working` stay unless the implementation leaves zero legitimate call sites (the finished-card in-button pending label and the start retry pending label are legitimate candidates to keep). Any removal deletes ENG and FIL together and updates the copy guards; no em-dash reintroduction.
- **Skeleton placement audit (decision rule: genuine wait + predictable layout + prevents blank/shift):** ADD on `/validate` working phase and session-route loading boundary. DELIBERATELY NOT on button-level submits (too quick), validation errors, confirmations, or unknown-shape states.

## Risks / Trade-offs

- [Risk] A participant could perceive the 2s lock as breakage. Mitigation: subtle disabled styling consistent with soft neo-brutalism, sentence fully readable, no spinner over content; visual review on mobile/desktop, ENG/FIL, keyboard, reduced motion.
- [Risk] Next.js may flash `loading.tsx` on fast navigations. Mitigation: skeleton is layout-stable and calm; no minimum-time logic added to "fix" flashing (that would trade one annoyance for real slowness).
- [Risk] Timer tests could sleep real seconds. Mitigation: fake timers throughout; assert durations, never wall-clock waits.

## Migration Plan

Code-only, no migration. Rollback is a revert; no stored state changes shape. Old working-card copy stays or goes per the dead-key proof, decided inside Apply.

## Open Questions

None. Copy removal, if any, is a measured Apply outcome, not a design fork.
