# Proposal

## Why

**The validation route cannot open any batch, against the real hosted project.** Allocation succeeds,
`validation_batches` and `batch_entries` are written, and `/validate/[batchId]` then renders *"We could
not find that batch"* for every stored batch, so no validation response can ever be recorded. Measured
through the Supabase REST API with the service-role key on 2026-10-03: `dataset_entries` **600**,
`validators` **1**, `validation_batches` **5**, `batch_entries` **50**, `validations` **0**.

**The root cause is measured, and it is not only the client-side pre-encoding.** A stored identifier is
`VAL_720f59cd-2026-10-02T19:46:56.320Z` — `defaultBatchId` deliberately embeds an ISO instant, and that
instant contains colons. Next.js 16.3.6 hands a Server Component the dynamic segment **percent-encoded
regardless of how the request path spelled it**:

| Request path | `params.batchId` the page received | `findById` result |
| --- | --- | --- |
| `/validate/VAL_720f59cd-2026-10-02T19:46:56.320Z` (literal colons) | `VAL_720f59cd-2026-10-02T19%3A46%3A56.320Z` | no row |
| `/validate/VAL_720f59cd-2026-10-02T19%3A46%3A56.320Z` | `VAL_720f59cd-2026-10-02T19%3A46%3A56.320Z` | no row |
| `/validate/VAL_720f59cd-2026-10-02T19%253A46%253A56.320Z` | `VAL_720f59cd-2026-10-02T19%253A46%253A56.320Z` | no row |

`validation_batches?id=eq.VAL_720f59cd-2026-10-02T19:46:56.320Z` returns the row over the real wire, so
the identifier is stored correctly and the **only** thing wrong is the hop through the URL.

Three of the four producers make it worse by encoding a second time before handing the identifier to
`router.push` or `Link`, which is how `%3A` becomes `%253A`. **Patching the one caller observed in
production would leave the other three broken**, and the remaining three are reached by exactly the flows
the acceptance criteria exercise: allocation, resume, submit-and-advance, and continue.

This is the defect that blocks the approved methodology work. Every later change — session-scoped attempt
identity, the single-complete-package completion model, allocation, dashboard, export — is unverifiable
while a validator cannot reach the first sentence of a batch.

## What Changes

- **One canonical route serialization and parsing contract.** A single pure module owns turning a stored
  batch identifier into a path and recovering the stored identifier from the dynamic route parameter. It
  is the only place either operation happens.
- **Producers stop encoding.** The identifier enters the URL exactly as it is stored, and the transport
  is left to encode it. The four producers are `resumeHref` and the allocation `router.push` in
  `src/app/validate/start-batch.tsx`, the submit-and-advance `router.push` in
  `src/app/validate/[batchId]/validation-form.tsx`, and the continue `router.push` in
  `src/app/validate/[batchId]/finished-batch.tsx`.
- **The consumer decodes exactly once.** `src/app/validate/[batchId]/page.tsx` recovers the stored
  identifier from `params.batchId` before anything reads it, so the repository's `findById` receives a
  value byte-identical to the stored one.
- **A malformed or over-encoded segment is refused rather than guessed.** A segment that is not a single
  valid percent-decoding of a real identifier produces the route's existing "not found / invalid address"
  state; it is never repaired by repeated decoding, because guessing an identifier is how a research
  record gets attached to the wrong batch.
- **No stored data changes.** No migration, no schema change, and the five existing production batches
  stay usable, because the contract covers identifiers both with and without reserved characters.

## Capabilities

### New Capabilities

- `batch-routing`: how a stored batch identifier travels into a URL and back out of it unchanged — the
  single serialization and parsing contract, the producers and the consumer that must use it, and what
  happens to a segment that cannot be decoded.

### Modified Capabilities

(none)

## Impact

- **New:** `src/lib/validation/batch-route.ts` — pure, no server-only import, usable from client islands
  and from the Server Component.
- **Changed:** the four producer call sites and the one consumer named above. All four currently call
  `encodeURIComponent`, and none of them shares code with the others.
- **Tests:** a unit file for the contract itself, plus updates to the existing assertions in
  `tests/dom/start-batch.test.tsx`, `tests/dom/validation-form.test.tsx`,
  `tests/dom/finished-batch.test.tsx`, which currently pin
  the double-encoding shape rather than a round trip. **These assertions change deliberately, and the
  requirement supports the change** — but each is replaced by a stronger assertion (a round trip through
  the real parse function with a production-shaped identifier), not by a literal copied beside the
  implementation.

  `tests/unit/validation-routes.test.tsx` is listed here too, and **it was not changed during the
  Apply** — so the list above was inaccurate when the verification pass read it, and is corrected
  rather than quietly dropped. It turned out to need no change, because it contains no assertion of
  the address a producer builds. One assertion in it did become permanently satisfied as a *result* of
  this change: it asserted the ready screen does not link to `/validate/${encodeURIComponent(…)}`, a
  spelling no producer may now emit, so the string became unreachable by construction. That assertion
  was rewritten rather than left standing — a guard that can no longer fail reports coverage it is not
  providing. Recorded in `tasks.md` 5.3 because the mismatch was the finding, not the repair.
- **Not affected:** `data/ilocano-synthetic-data.json`, every migration, the repository layer, and the
  allocation rule. The stored identifier is correct today; only the URL hop is wrong.
