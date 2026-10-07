# Proposal

## Why

Measured on current main (`f064b98`):

- Anonymous attempt IDs are `VAL_` + 8 lowercase hex = 32 bits of CSPRNG
  (`src/lib/domain/anonymous-validator-id.ts:18,26`), minted server-side
  (`src/lib/validators/enrollment.ts:137`) with a fail-closed CSPRNG check and
  no `Math.random` fallback. 32 bits is enumerable.
- Batch IDs are `` `<validatorId>-<ISO>` `` with zero independent entropy
  (`src/lib/allocation/allocate-batch.ts:138-140`); the batch URL embeds the
  owner's validator ID plus a timestamp.
- `/validate/[batchId]` opens a batch on the batch ID alone
  (`src/app/validate/[batchId]/page.tsx:106-109` calling
  `openValidationSession({ batchId })`; the file's own comment at `:32-34`
  states the request carries no identity). Possession of the URL is
  authorization.
- `resumeValidator` (`src/lib/validators/enrollment.ts:172-183`) is an
  unauthenticated identifier→profile check returning `restored`/`absent` with
  no throttling.
- No `CHECK`/length/regex constraint on `validators.id` or
  `validation_batches.id` exists in any migration; both are `text` primary
  keys. Format is enforced in app schemas only.
- Hosted state is LIVE and must be preserved: `dataset_entries` 4800,
  `validators` 35, `validations` 93, `validation_batches` 39,
  `batch_entries` 275, `entry_reservations` 177 (measured 2026-10-08 over
  PostgREST with the service-role key; batch/entry-reservation counts via
  `select=*`). Stored IDs are all legacy format
  (`VAL_cd51105b`, `VAL_cd51105b-2026-10-06T11:13:44.651Z` samples).

Before Phase 11 public distribution, newly minted attempt IDs must carry at
least 128 bits of CSPRNG entropy, newly minted batch IDs must be independent
opaque random capabilities carrying neither the validator ID nor a timestamp,
and a batch URL alone must no longer grant access: the server must require the
batch identifier plus the browser's active attempt identity and return batch
content only on ownership match, redirecting every other case to `/` without
an existence oracle and without auto-creating validators.

## What Changes

- New attempt IDs mint as `VAL_` + 32 lowercase hex (16 CSPRNG bytes, 128
  bits), server-side, CSPRNG-only, fail-closed; no timestamp, counter,
  sequence, participant-derived, IP/device, or predictable input. `VAL_`
  prefix retained.
- New batch IDs mint as `BAT_` + 32 lowercase hex (16 CSPRNG bytes, 128 bits),
  server-side, independent of validator ID, `created_at`, entry IDs, and batch
  counters. `validatorId-timestamp` minting is retired for new batches.
- Legacy rows keep working: legacy `VAL_8hex` attempts remain acceptable where
  existing records require it; legacy batch rows remain readable only through
  the new ownership check. No primary-key/FK rewrite, no research-row deletion.
- Batch session open becomes ownership-gated: the server loads the batch,
  derives the stored owner, compares it to the supplied active attempt, and
  returns content only on match. Mismatch, unknown batch, malformed attempt, or
  absent attempt all produce one generic redirect-to-`/` outcome revealing no
  sentence, no metadata, no identity, and no existence distinction. The initial
  server render reveals no participant sentence before ownership is proven.
- Submission authorization continues to derive ownership from stored batch
  state, never from a browser-provided validatorId.
- The public resume path is throttled and stops being a high-speed
  valid/invalid oracle; malformed/unknown/throttled outcomes do not ease
  enumeration; no raw attempt IDs are logged unnecessarily and no
  request-origin data enters research tables.
- Attempt-not-person semantics, batch size 5, pooled completion, uniqueness,
  reservation concurrency, background save, finished-card checkpoint,
  one-entry-ahead prefetch, ENG/FIL behavior, and the 4,800-entry six-category
  corpus are unchanged.

## Capabilities

### New Capabilities

(none — this change modifies existing capabilities)

### Modified Capabilities

- `participation-attempt`: new attempt IDs carry 128-bit CSPRNG entropy in the
  `VAL_` + 32-hex shape; legacy 8-hex IDs remain acceptable for existing
  records but are never newly minted; CSPRNG failure fails closed.
- `batch-routing`: new batch IDs are opaque `BAT_` + 32-hex capabilities
  independent of validator ID and timestamp; legacy batch rows stay readable
  only through the ownership gate; the route contract still round-trips the
  stored identifier exactly once.
- `validation-start`: opening a batch session requires the batch identifier
  plus the browser's active attempt identity; content is returned only on
  stored-owner match; every unauthorized case redirects to `/` with no oracle
  and no validator auto-creation; legitimate direct refresh by the owning
  session keeps working.
- `validator-onboarding`: the public resume/ownership-check surface is
  throttled; unknown/malformed/throttled outcomes are indistinguishable to a
  prober; no request-origin information is persisted into research records.

## Impact

- `src/lib/domain/anonymous-validator-id.ts` (128-bit mint + legacy accept),
  `src/schemas/validator.ts` (pattern widening with mint pin), batch-ID mint
  module + `src/lib/allocation/allocate-batch.ts` (`BAT_` mint, remove
  `validatorId-timestamp` construction), `src/lib/validation/session-service.ts`
  / `session.ts` (ownership-gated open), `src/app/validate/[batchId]/page.tsx`
  (neutral shell + ownership gate), resume/enrollment throttling, one forward
  migration ONLY if a needed DB constraint requires it (never editing applied
  migrations), repository/RPC grants verified unchanged.
- Tests: unit (mint format/entropy, fail-closed RNG, legacy accept, BAT
  independence, ownership decision), DOM (no sentence before proof, unified
  redirect, no auto-create, locale preserved), integration (forward migration
  applies cleanly over seeded legacy rows, RLS/RPC posture unchanged, no
  request-origin columns in research tables).
- No corpus change, no reset/reseed, no research-row deletion. Live hosted rows
  (35 validators, 93 validations, 39 batches, 275 batch entries, 177
  reservations, measured 2026-10-08) are preserved by design; Apply re-measures
  before migrating.
