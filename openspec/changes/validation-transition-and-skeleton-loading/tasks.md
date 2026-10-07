# Tasks

## 1. Entry-settling interval (presentation only)

- [x] 1.1 Runner owns a per-presented-entry 2s settling timer (keyed by entry id, cleanup on change/unmount, stale-timer guard, locale-independent); verified by DOM tests with fake timers.
- [x] 1.2 Form accepts a settling flag ORing with `isPending` for all interactive controls with real disabled semantics; sentence stays readable, no countdown, no wait copy; verified by DOM tests.
- [x] 1.3 Save-timing independence: enqueue still synchronous on submit; early save confirmation does not shorten, late confirmation does not extend; verified by DOM tests with saves held open past the interval.
- [x] 1.4 Final entry transitions to the finished card with no sixth-entry timer; verified by DOM test.
- [x] 1.5 Double-submit single-flight and queue idempotency unchanged; verified by existing + new DOM tests.

## 2. Skeletons and loading boundaries

- [x] 2.1 New `ValidationSkeleton` component (neutral blocks, aria-hidden pieces, aria-busy container, reduced-motion-safe, no fake sentences); verified by DOM tests.
- [x] 2.2 `/validate` working phase renders the skeleton instead of the "Preparing your sentences…" card; failure/no-identity/exhausted states unchanged; verified by DOM tests.
- [x] 2.3 Session-route `loading.tsx` for genuine SSR waits (initial open, next-batch navigation); verified by render tests and by failure-still-shows-error (skeleton never masks failure).
- [x] 2.4 Skeleton audit recorded: every added location justified, every deliberately-skipped area named; verified in the change record.

## 3. Copy, accessibility, visual review

- [x] 3.1 Dead-key proof for any removed copy (ENG+FIL together, guards updated, no em-dash regression); verified by copy-guard suites. OUTCOME: zero keys removed — `validateStart.working` stays as the retry control's pending label and `validate.finished.continue.working` stays as Continue's pending label (both genuine button states, not normal-flow cards), so both catalogs are untouched.
- [x] 3.2 Accessibility checks: disabled semantics, aria-hidden/aria-busy, sentence readability, no focus trap, no forced focus moves; verified by DOM assertions.
- [x] 3.3 Visual review: mobile narrow/tall, desktop, ENG/FIL, keyboard, reduced motion; skeleton causes no major layout jump; settling state reads as intentional. DONE BY PROXY: dev-server smoke (`/` and `/validate` both 200), skeleton reuses the route's own card/container structure so no layout jump is constructed, K-3 proves zero animation classes, keyboard/focus behavior rests on native disabled semantics with no focus code added. LIMIT (stated, not hidden): no human eye and no real browser viewport were involved — a reviewer should still look at the skeleton and the settling state on a phone and a desktop before crowdsourcing.

## 4. Regression and measurement

- [x] 4.1 Full matrix green (`lint`, `format:check`, `typecheck`, unit, DOM, integration, build) with real counts recorded; no persistence/allocation/recovery test weakened. MEASURED on the Apply tip: lint exit 0, format exit 0, typecheck exit 0, unit 91 files / 1929 tests, DOM 11 files / 120 tests, integration 17 files / 279 tests, `pnpm run build` success with `/validate` and `/validate/[batchId]` routes. Three pre-existing runner tests needed settling-aware waits (real-timer 2150ms after each advance); no assertion weakened, only waits added. Can-fire probes: settling disabled → T-suite 4 failed/6 passed; spinner card restored → K-6 + AO-10 fail; correction textarea unwired → VF-6 fails; all restored byte-identical and green.
- [x] 4.2 Timing expectations recorded: click-to-next-visible still immediate when prefetched; enable ~2000ms after presentation; save starts at click, not after the interval. PROVEN: T-1 (advance with save open), T-3 (enable at ENTRY_SETTLING_MS-1 still disabled / +1 enabled, save unresolved throughout), T-4/T-5 (early/late confirmation does not move the interval).

## 5. Proposal verification

- [x] 5.1 Run `openspec change validate validation-transition-and-skeleton-loading --strict`, independent verification pass (every delta scenario named with its test), hosted read-only probes only (no resets, reseeds, or research writes); record real counts. VALIDATE: strict exit valid. VERIFIER: no CRITICAL, no WARNING, 4 NOTEs — 3 closed since (VF-6 added for the correction-input scenario with its own can-fire probe; first-mount-no-settle indirectly proven by every settling test answering entry 1 with no wait; resolve/next-batch halves documented as harness limits). REMAINING NOTE: stale-timer identity guard is inspection-only (unreachable through UI by construction). HOSTED: no hosted writes performed; no probes needed — the change touches no query, RPC, migration, or dataset path (`git diff HEAD -- src/lib src/schemas supabase openspec/specs` empty; dataset hash untouched).
