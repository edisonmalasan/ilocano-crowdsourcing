# Tasks

## 0. Preconditions

- [ ] 0.1 Re-measure, from source and not from `design.md`, that exactly four sites build a
      `/validate/<id>` address and exactly one reads the dynamic route parameter, and that all four
      producers currently apply `encodeURIComponent`. Verify by enumerating every occurrence of
      `encodeURIComponent` and `/validate/` under `src/`. **If a fifth producer or a second reader exists
      that this change does not name, `proposal.md` is wrong and that is a finding to report, not a
      licence to widen the scope silently.**
- [ ] 0.2 Re-measure against the running development server that a stored batch's own address currently
      renders the route's not-found state, and that the same identifier resolves when asked of the
      repository over the real wire. Both halves, because "the route is broken" and "the identifier is not
      stored" produce the same participant-facing sentence. Record the status code and the literal
      identifier used.

## 1. The contract

- [ ] 1.1 Add `src/lib/validation/batch-route.ts` exporting `batchRoutePath`, `batchRouteHref`, and
      `parseBatchRouteParam`, with no imports at all. Verify `pnpm run typecheck` is green and
      `pnpm run lint` reports nothing for the new file.
- [ ] 1.2 `parseBatchRouteParam` SHALL apply `decodeURIComponent` exactly once, SHALL catch the
      `URIError` a malformed segment throws, and SHALL have no second attempt, no `%`-stripping fallback,
      and no trimming. Verify with `pnpm exec vitest run --project unit tests/unit/batch-route.test.ts`
      green after the file exists.

## 2. Witnesses for the contract

- [ ] 2.1 Assert the round trip over the **production-shaped identifier measured from the live table**,
      `VAL_720f59cd-2026-10-02T19:46:56.320Z`: building an address and parsing the segment the framework
      would deliver returns exactly that string, character for character. Assert the equality rather than
      a substring, so a partial fix fails.
- [ ] 2.2 Assert the same identity for an identifier with no reserved characters, so the round trip is
      not accidentally true only for the encoding case.
- [ ] 2.3 Assert a **doubly encoded** segment and a **malformed** segment both report "not a usable
      identifier", and assert that no decoding beyond the single step was attempted — by seeding the
      fixture so a second decode WOULD have produced a resolvable identifier, which is what makes this a
      test rather than a restatement of the code.
- [ ] 2.4 **CAN FIRE.** A companion test that drives the same assertions through a deliberately
      pre-encoding producer — one that emits `encodeURIComponent(id)` — and expects the round trip to
      fail. Without it, every assertion above is a claim nothing contradicts.

## 3. Producers

- [ ] 3.1 Replace all four producer sites with the module: `resumeHref` and the allocation `router.push`
      in `src/app/validate/start-batch.tsx`, the post-submit `router.push` in
      `src/app/validate/[batchId]/validation-form.tsx`, and the continue `router.push` in
      `src/app/validate/[batchId]/finished-batch.tsx`. Verify no `encodeURIComponent` remains under
      `src/app/` by enumeration.
- [ ] 3.2 Point each existing DOM assertion at the module's output instead of an
      `encodeURIComponent`-built literal, in `tests/dom/start-batch.test.tsx`,
      `tests/dom/validation-form.test.tsx`, and `tests/dom/finished-batch.test.tsx`. **Each replaced
      assertion must be strictly stronger than the literal it replaces** — a round trip through the real
      parse function, not a copy of the implementation beside it — and the change is recorded here so a
      reviewer can check that rather than take it on trust.
- [ ] 3.3 Add the closed enumeration required by the second requirement: a whole-project scan that every
      site building a batch address or reading the dynamic route parameter is either the module or a
      caller of it. The scan SHALL also assert it found a NON-EMPTY set of such sites, because a scan that
      matched nothing would otherwise report the property it is not providing.

## 4. Consumer

- [ ] 4.1 Change `src/app/validate/[batchId]/page.tsx` to recover the identifier through
      `parseBatchRouteParam` and to report the route's existing not-found or invalid-address state when it
      does not parse. Verify `pnpm exec vitest run --project unit tests/unit/validation-routes.test.tsx`
      is green, and that the not-found state is still rendered rather than thrown.
- [ ] 4.2 Add a route-level assertion that the value handed to the batch lookup is character-for-character
      the stored identifier, driven through the real `openValidationSession` against a recording fake —
      not by asserting a parameter was passed.

## 5. Close out

- [ ] 5.1 `pnpm run lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`,
      `build` — all run, with the figures they actually produced. **Re-derived, never incremented.**
- [ ] 5.2 `openspec change validate batch-route-round-trip --strict` exits 0, and
      `openspec validate --specs --strict` is expected to remain **16**: this delta is not synced until
      the Sync stage, and a figure that has risen here would mean the delta was written to the wrong
      place.
- [ ] 5.3 Independent verification pass. No CRITICAL may survive and no WARNING may be silently waived.
- [ ] 5.4 Merge with a merge commit after 5.1-5.3 are green. **Ticked in the Archive stage, not before the
      merge** — a ticked "merged" box on an unmerged branch claims a fact that does not yet exist.
