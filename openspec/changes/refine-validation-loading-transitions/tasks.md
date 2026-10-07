# Tasks

## 1. Runner transition state (replaces settling)

- [x] 1.1 Replace `ENTRY_SETTLING_MS`/settling state with a 1500ms transition: on valid submit enqueue synchronously (unchanged), show the skeleton for `ENTRY_TRANSITION_MS`, then reveal the already-resolved next entry immediately interactive; verified by DOM tests with fake timers against the exported constant (enqueue at submit with save gate open; no real entry rendered during the interval; reveal at MS with controls enabled).
- [x] 1.2 Prove save-independence both ways with saves held open past the interval (early resolve does not shorten, late resolve does not extend); verified by DOM tests holding the save gate across the transition.
- [x] 1.3 Prove timer ownership (fresh interval per transition, stale timer reveals nothing, same-entry re-render and locale switch do not restart, unmount cancels, double-submit still single-flight); verified by DOM tests.
- [x] 1.4 Delete the form `settling` flag and all settling-disabled wiring; the revealed form is never transition-disabled; verified by DOM tests asserting enabled controls at reveal and by `typecheck`/`lint` showing no remaining `settling` references in `src/`.
- [x] 1.5 Preserve the final-entry path (no sixth-entry transition; finished-card checkpoint unchanged); verified by DOM tests submitting entry 5.

## 2. Shared-geometry skeleton with adaptive sentence lines

- [x] 2.1 Add the pure deterministic length-to-lines helper (fixed chars-per-line bands, generic fallback for unknown) with unit tests covering short, medium, long, and empty/unknown inputs; verified by unit tests asserting exact bands, determinism (same input twice), and content-independence.
- [x] 2.2 Rebuild `ValidationSkeleton` on shared primitives with the real UI (sentence card chrome via the EntryCard shell path, form card via the real `Card` path, option-height and button-height blocks from the same dimensions), still zero text, aria-hidden pieces, aria-busy container, reduced-motion-safe; verified by DOM tests (geometry parity assertions against real markup classes at both breakpoints, zero-text/AT-hiding, no animation classes).
- [x] 2.3 Wire the transition skeleton to the prefetched upcoming sentence length (short vs long line shapes) with generic fallback when unknown; verified by DOM tests driving short and long prefetched sentences plus the unknown case, asserting the sentence text itself never appears early.
- [x] 2.4 Audit other genuine loading states (recovery/resume, next-batch) and apply the same skeleton only where real async work meets predictable layout; record every added location and every deliberately-skipped area in the change record; verified by DOM tests for each added location and failure-replaces-skeleton for each.

## 3. Start route opens into the Validating shell

- [x] 3.1 Render the Validating shell (same header, container, and skeleton as the session route) on `/validate` while orchestrating; remove the "Start validating" page; keep all failure/exhausted/screening-required/no-identity states and every server behavior unchanged; verified by DOM tests (Continue lands in the Validating shell, skeleton shown while working, navigation to the session on resolve, each failure state intact).
- [x] 3.2 Dead-key proof for removed copy (ENG+FIL together, copy-guard key sets updated, no em-dash regression); verified by copy-guard suites. `validateStart.working` and `validate.finished.continue.working` stay as genuine button pending labels unless proven dead by the same rule.

## 4. Test rework, accessibility, and visual review

- [x] 4.1 Rework the old settling suites to the new contract (reveal-after-skeleton, immediately-enabled, save-independence) with can-fire probes proving each new guard fires (settling restored / skeleton removed / real entry rendered early each turn the suite red, restored byte-identical green); verified by the probes themselves plus the full DOM project green.
- [x] 4.2 Accessibility checks: skeleton blocks hidden from AT, aria-busy on the loading region, no focus moved by the timer, revealed controls immediately usable with no stale disabled state, reduced-motion static; verified by DOM assertions.
- [x] 4.3 Visual review: mobile narrow/tall, desktop, ENG/FIL; skeleton-to-real reveal shows no major layout jump; transition reads as intentional. Record method honestly (human eye vs proxy); verified by the recorded review.

## 5. Verification and record

- [x] 5.1 Full matrix green (`lint`, `format:check`, `typecheck`, unit, DOM, integration, build) with real counts recorded; no persistence/allocation/recovery/completion/export test weakened; verified by command outputs.
- [x] 5.2 Timing expectations recorded: click-to-skeleton immediate; reveal ~1500ms after submit; save starts at click, never after the interval; verified by the transition tests.
- [x] 5.3 Run `openspec validate refine-validation-loading-transitions --strict`, independent verification pass (every delta scenario named with its test), hosted read-only probes only (no resets, reseeds, or research writes); record real counts.

## Verification record (2026-10-07, verification-hardening pass)

The independent verification of the Apply (PR #193, `cb0ce0d`) reported no
CRITICAL findings and four WARNINGs. This record closes them:

- **W1, stale-timer scenario untested.** The expiry decision is now the
  exported pure predicate `transitionTimerIsCurrent` in
  `validation-session.tsx`, used by the timer effect. Named unit tests live
  in `tests/unit/validation-transition-timer.test.ts` (5 tests: live timer
  expires, stale-older and stale-newer ids refused, null halves refused,
  identity by id value not reference/expiry). Can-fire probe: dropping the
  id check goes `2 failed / 3 passed (5)`, naming both stale directions;
  restored byte-identical (`git diff` shows only the intended addition).
- **W2, can-fire probes unrecorded (task 4.1).** Each with a green control
  immediately before and a byte-identical restore immediately after,
  measured on this branch:
  - P1, transition branch forced off (`if (false)`): settling suite
    `8 failed / 3 passed (11)` — proves the skeleton-during-interval guards.
  - P2, `ValidationSkeleton` returns null: skeleton + settling suites
    `15 failed / 8 passed (23)` — proves the skeleton-presence guards.
  - P3, interval doubled (`ENTRY_TRANSITION_MS * 2` at the call site; the
    export is unchanged so tests still assert against it): settling suite
    `6 failed / 5 passed (11)` — proves the boundary-timing guards.
- **W3, visual-review method unrecorded (task 4.3).** Proxy only, stated
  honestly: no human eye, no real browser viewport. The proxy is the
  geometry-parity suite (`validation-skeleton.test.tsx` K-9: real EntryCard
  shell classes, real option classes, real button size; K-1 zero text; K-3
  no animation classes, confirmed by grep for `animate-|transition-|motion-`
  over the skeleton with no matches; K-10 adaptive lines; K-5..K-8 route
  boundaries) in ENG and FIL. Skeleton-to-real reveal therefore cannot jump
  beyond what the shared constants allow at the class level; a human look
  at a real viewport is still owed before pilot crowdsourcing.
- **W4, integration worker RPC timeout.** Local full-parallel runs report
  `17 passed (17)` files / `279 passed (279)` tests plus one unhandled
  `[vitest-worker]: Timeout calling "onTaskUpdate"` (exit 1) — reproduced
  locally 3x with all tests passing, while CI run 37609567367 on the Apply
  commit reports `17 passed (17)` / `279 passed (279)` with no error. The
  change touches zero integration-covered files, so this is recorded as a
  pre-existing local-load flake, not a regression.
