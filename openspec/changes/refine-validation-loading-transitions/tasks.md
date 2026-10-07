# Tasks

## 1. Runner transition state (replaces settling)

- [ ] 1.1 Replace `ENTRY_SETTLING_MS`/settling state with a 1500ms transition: on valid submit enqueue synchronously (unchanged), show the skeleton for `ENTRY_TRANSITION_MS`, then reveal the already-resolved next entry immediately interactive; verified by DOM tests with fake timers against the exported constant (enqueue at submit with save gate open; no real entry rendered during the interval; reveal at MS with controls enabled).
- [ ] 1.2 Prove save-independence both ways with saves held open past the interval (early resolve does not shorten, late resolve does not extend); verified by DOM tests holding the save gate across the transition.
- [ ] 1.3 Prove timer ownership (fresh interval per transition, stale timer reveals nothing, same-entry re-render and locale switch do not restart, unmount cancels, double-submit still single-flight); verified by DOM tests.
- [ ] 1.4 Delete the form `settling` flag and all settling-disabled wiring; the revealed form is never transition-disabled; verified by DOM tests asserting enabled controls at reveal and by `typecheck`/`lint` showing no remaining `settling` references in `src/`.
- [ ] 1.5 Preserve the final-entry path (no sixth-entry transition; finished-card checkpoint unchanged); verified by DOM tests submitting entry 5.

## 2. Shared-geometry skeleton with adaptive sentence lines

- [ ] 2.1 Add the pure deterministic length-to-lines helper (fixed chars-per-line bands, generic fallback for unknown) with unit tests covering short, medium, long, and empty/unknown inputs; verified by unit tests asserting exact bands, determinism (same input twice), and content-independence.
- [ ] 2.2 Rebuild `ValidationSkeleton` on shared primitives with the real UI (sentence card chrome via the EntryCard shell path, form card via the real `Card` path, option-height and button-height blocks from the same dimensions), still zero text, aria-hidden pieces, aria-busy container, reduced-motion-safe; verified by DOM tests (geometry parity assertions against real markup classes at both breakpoints, zero-text/AT-hiding, no animation classes).
- [ ] 2.3 Wire the transition skeleton to the prefetched upcoming sentence length (short vs long line shapes) with generic fallback when unknown; verified by DOM tests driving short and long prefetched sentences plus the unknown case, asserting the sentence text itself never appears early.
- [ ] 2.4 Audit other genuine loading states (recovery/resume, next-batch) and apply the same skeleton only where real async work meets predictable layout; record every added location and every deliberately-skipped area in the change record; verified by DOM tests for each added location and failure-replaces-skeleton for each.

## 3. Start route opens into the Validating shell

- [ ] 3.1 Render the Validating shell (same header, container, and skeleton as the session route) on `/validate` while orchestrating; remove the "Start validating" page; keep all failure/exhausted/screening-required/no-identity states and every server behavior unchanged; verified by DOM tests (Continue lands in the Validating shell, skeleton shown while working, navigation to the session on resolve, each failure state intact).
- [ ] 3.2 Dead-key proof for removed copy (ENG+FIL together, copy-guard key sets updated, no em-dash regression); verified by copy-guard suites. `validateStart.working` and `validate.finished.continue.working` stay as genuine button pending labels unless proven dead by the same rule.

## 4. Test rework, accessibility, and visual review

- [ ] 4.1 Rework the old settling suites to the new contract (reveal-after-skeleton, immediately-enabled, save-independence) with can-fire probes proving each new guard fires (settling restored / skeleton removed / real entry rendered early each turn the suite red, restored byte-identical green); verified by the probes themselves plus the full DOM project green.
- [ ] 4.2 Accessibility checks: skeleton blocks hidden from AT, aria-busy on the loading region, no focus moved by the timer, revealed controls immediately usable with no stale disabled state, reduced-motion static; verified by DOM assertions.
- [ ] 4.3 Visual review: mobile narrow/tall, desktop, ENG/FIL; skeleton-to-real reveal shows no major layout jump; transition reads as intentional. Record method honestly (human eye vs proxy); verified by the recorded review.

## 5. Verification and record

- [ ] 5.1 Full matrix green (`lint`, `format:check`, `typecheck`, unit, DOM, integration, build) with real counts recorded; no persistence/allocation/recovery/completion/export test weakened; verified by command outputs.
- [ ] 5.2 Timing expectations recorded: click-to-skeleton immediate; reveal ~1500ms after submit; save starts at click, never after the interval; verified by the transition tests.
- [ ] 5.3 Run `openspec validate refine-validation-loading-transitions --strict`, independent verification pass (every delta scenario named with its test), hosted read-only probes only (no resets, reseeds, or research writes); record real counts.
