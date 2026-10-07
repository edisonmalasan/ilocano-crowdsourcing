# Tasks

## 1. Entry-settling interval (presentation only)

- [ ] 1.1 Runner owns a per-presented-entry 2s settling timer (keyed by entry id, cleanup on change/unmount, stale-timer guard, locale-independent); verified by DOM tests with fake timers.
- [ ] 1.2 Form accepts a settling flag ORing with `isPending` for all interactive controls with real disabled semantics; sentence stays readable, no countdown, no wait copy; verified by DOM tests.
- [ ] 1.3 Save-timing independence: enqueue still synchronous on submit; early save confirmation does not shorten, late confirmation does not extend; verified by DOM tests with saves held open past the interval.
- [ ] 1.4 Final entry transitions to the finished card with no sixth-entry timer; verified by DOM test.
- [ ] 1.5 Double-submit single-flight and queue idempotency unchanged; verified by existing + new DOM tests.

## 2. Skeletons and loading boundaries

- [ ] 2.1 New `ValidationSkeleton` component (neutral blocks, aria-hidden pieces, aria-busy container, reduced-motion-safe, no fake sentences); verified by DOM tests.
- [ ] 2.2 `/validate` working phase renders the skeleton instead of the "Preparing your sentences…" card; failure/no-identity/exhausted states unchanged; verified by DOM tests.
- [ ] 2.3 Session-route `loading.tsx` for genuine SSR waits (initial open, next-batch navigation); verified by render tests and by failure-still-shows-error (skeleton never masks failure).
- [ ] 2.4 Skeleton audit recorded: every added location justified, every deliberately-skipped area named; verified in the change record.

## 3. Copy, accessibility, visual review

- [ ] 3.1 Dead-key proof for any removed copy (ENG+FIL together, guards updated, no em-dash regression); verified by copy-guard suites.
- [ ] 3.2 Accessibility checks: disabled semantics, aria-hidden/aria-busy, sentence readability, no focus trap, no forced focus moves; verified by DOM assertions.
- [ ] 3.3 Visual review: mobile narrow/tall, desktop, ENG/FIL, keyboard, reduced motion; skeleton causes no major layout jump; settling state reads as intentional.

## 4. Regression and measurement

- [ ] 4.1 Full matrix green (`lint`, `format:check`, `typecheck`, unit, DOM, integration, build) with real counts recorded; no persistence/allocation/recovery test weakened.
- [ ] 4.2 Timing expectations recorded: click-to-next-visible still immediate when prefetched; enable ~2000ms after presentation; save starts at click, not after the interval.

## 5. Proposal verification

- [ ] 5.1 Run `openspec change validate validation-transition-and-skeleton-loading --strict`, independent verification pass (every delta scenario named with its test), hosted read-only probes only (no resets, reseeds, or research writes); record real counts.
