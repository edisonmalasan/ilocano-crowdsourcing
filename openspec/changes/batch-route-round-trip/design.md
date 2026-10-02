# Design

## Context

See `proposal.md` for why. What shapes the approach is four facts, three of them measured in this
repository rather than assumed:

1. **`defaultBatchId` (`src/lib/allocation/allocate-batch.ts:168`) embeds an ISO instant**, so a stored
   identifier is `VAL_xxxxxxxx-<ISO>` and always contains colons. The identifier scheme is load-bearing
   for review and logs and is **not** changed here; the existing five production batches keep their
   current identifiers.
2. **Next.js 16.3.6 percent-encodes the dynamic route parameter before the page sees it**, whatever the
   request path said. Verified on this repository's own route by reading `params.batchId` back out of the
   rendered flight payload; the router state `c` array preserves the raw segment while `params` does not.
3. **Three of the four producers also call `encodeURIComponent`**, so the transport encodes an already
   encoded identifier.
4. **The route is the only consumer.** `src/app/validate/[batchId]/page.tsx` reads `params.batchId` once
   and passes it to `openValidationSession`, which hands it to `batches.findById`. There is exactly one
   place to fix on the read side, which is why the requirement can name "the one consumer" and mean it.

## Goals / Non-Goals

**Goals:**

- One module, in one place, owning both directions of the mapping, with no server-only import so all four
  client producers and the Server Component can share it.
- A round trip that is **provable with no network and no browser**: `parseBatchRoute(batchRoute(id))` is
  equal to `id` for the real production-shaped identifier, and that identity is asserted rather than
  described.
- A closed enumeration of producers, so the fourth site cannot be added without a decision.

**Non-Goals:**

- Changing the identifier scheme. Colons in an identifier are legal text and legal in a URL path once the
  contract exists; the scheme is not the defect.
- Introducing a slug, a surrogate key, or a lookup table. A batch is found by its own identifier today and
  will be found by its own identifier after this change.
- Encoding, decoding, or otherwise normalising an identifier **before** it is stored. Storage is already
  correct.
- Deciding anything about the completion model, attempt identity, or allocation. Those are separate
  changes and this one must not touch them.

## Decisions

### D1. Producers emit the raw identifier; the consumer decodes exactly once

The alternative — producers pre-encode and the consumer does not decode — is the shape the code has
today, and it is the shape that produced the defect. It is rejected for a reason that is mechanical rather
than aesthetic: it requires the two sides to hold complementary knowledge, and there is no way to
enforce the discipline locally. The shape chosen here requires the producer to know nothing about
encoding and the consumer to know nothing about producing, which is why a forgotten producer fails loudly
(a batch address containing a raw colon) rather than silently (an address that no longer resolves).

**A subtlety worth stating because it is the reason raw emission is safe.** The consumer cannot know
whether Next.js encoded the segment for it. With raw emission, `params.batchId` is the once-encoded form
and one decode recovers the stored value; with an identifier that needs no encoding, one decode is the
identity. Both are the same expression, so there is no branch and no case where the consumer has to
guess whether it is looking at an encoded segment or a literal one.

### D2. The contract is a module, not a schema, and it has no dependency

`src/lib/validation/batch-route.ts` is pure and imports nothing. It is deliberately **not** a Zod schema
at the route boundary, for the reason `src/lib/domain/allocation.ts` records: the one function that must
never grow a dependency cannot import a schema module. A schema at this boundary would also be the wrong
tool: the question is not "is this a well-formed batch identifier" but "is this the stored identifier,
decoded once" — and the only thing that can answer the second question is the single decoding step.

The module exposes exactly three functions and no type that could be widened: `batchRoutePath(id)`,
`batchRouteHref(id, position?)`, and `parseBatchRouteParam(segment)`. `parseBatchRouteParam` returns a
**discriminated result** rather than `string | null`, so a caller that forgets to branch is a type error
rather than a lookup against `null`.

### D3. Malformed input is refused, and refusal is total rather than partial

`parseBatchRouteParam` catches the `URIError` `decodeURIComponent` throws on a malformed segment and
returns the same "not a usable identifier" result it returns for a well-formed segment that names nothing.
**There is deliberately no second decoding attempt and no fallback that strips `%` by hand.** A
hand-written fallback would be the only code in the path that could resolve a doubly encoded segment to a
real batch, and it would do so without any requirement ever having asked for it.

The cost of refusing is stated rather than hidden: a doubly encoded address stops working. That is the
correct trade, because a doubly encoded address has exactly one legitimate meaning — a client that encoded
twice — and this platform does not ship one.

### D4. The producers keep their existing shape and only change one call

`resumeHref` already exists as a named function precisely so its value can be asserted, and it stays. The
three `router.push` sites each become `router.push(batchRouteHref(id))` (or `batchRouteHref(id,
position + 1)`). Nothing else about them moves, so the change is four one-line edits plus one consumer
edit, and the existing DOM tests keep driving the same controls.

### D5. The acceptance witness is a round trip over a REAL stored identifier, plus a live check

The unit tests assert `parseBatchRouteParam(batchRouteSegmentOf(raw)) === raw` for
`VAL_720f59cd-2026-10-02T19:46:56.320Z` — a value copied from the live table, not invented — and the DOM
and route tests assert that what the real controls push and render is what the module produces. A URL
string test alone is explicitly **not** sufficient, and the reason is specific: the pre-fix code's own
tests asserted the correct-looking href and passed, because every one of them compared a literal against
a literal. The witness that can go red is the one that goes through the parse function and through the
route's own read.

The live check is separate and is recorded as a measurement rather than a test, because it needs a hosted
project: request the stored address against a running server and confirm the first sentence renders.

### D6. What is deliberately NOT changed, recorded so a later reader can tell a zero from an oversight

- `defaultBatchId` and therefore every stored identifier.
- `batchIdSchema` and `validationBatchIdSchema`, which validate a stored identifier and are correct.
- `openValidationSession`, `resolveSessionEntry`, and the repository layer. They receive the identifier and
  do their jobs; the identifier they received was the problem.
- Every migration. This change touches no column.

## Risks / Trade-offs

- **A fourth producer is added later and forgets the module** → the requirement's closed enumeration is a
  project-wide scan of every site that builds an address or reads the route parameter, and it fails on a
  new one. This is a structural guard, so its stated scope is what it can see: it proves a string is or
  is not built at a site, not that the site behaves as the string suggests.
- **Next.js changes how it delivers `params`** → the contract's assertion is about *our* two functions, and
  a change in Next's behaviour would show up as the live check failing rather than as a silently wrong
  decode, because the decode is applied to whatever arrives. Recorded rather than defended against.
- **A doubly encoded link stops resolving** → accepted; see D3.
- **The four existing assertions in the test suite change shape** → required by D1, and each is replaced by
  a stronger assertion rather than by a literal copied beside the implementation.

## Migration Plan

None. No schema change, no data change, no backfill. The five batches already in storage become openable
the moment the code is deployed, because the stored identifiers are what the new contract already expects.
Rollback is reverting the commit.

## Open Questions

None. Every decision that would change the requirement text was resolved while writing it.
