# Proposal

## Why

Allocation excludes entries the attempt has **answered** but never consults entries the attempt
has been **assigned**: `allocateBatch` reads `listEntryIdsForValidator` (submitted responses) and
no batch read at all, so every Continue mints a fresh batch that may re-offer entries sitting
unanswered in the attempt's own earlier batches. The database backstop (`UNIQUE
(validator_id, dataset_entry_id)`) keeps the data clean — the second submit refuses as
`already_recorded` and the session advances — but a validator is shown work they already hold,
answers it again, and is told it was already saved. That is confusion, not corruption, and it is
entirely within-attempt: separate attempts are independent and may overlap freely.

This is the surviving requirement of the superseded `allocation-overlap` (premise: three
validators per entry; superseded by the single-package methodology), re-proposed here framed as
WITHIN-attempt, as the supersede commit directed.

## What Changes

- **Allocation excludes entries assigned to the attempt's existing batches**, in addition to
  entries it answered. Assigned-but-unanswered entries are exactly the remainders of the
  attempt's interrupted batches, so the new exclusion reads as: an entry remaining in own
  interrupted batch is not offered in a new batch.
- **Resume is untouched.** The interrupted-batch offer, the recovery lookup, and the batch route
  keep working through their own path; excluding remainders from *new* allocations does not move,
  rename, or re-derive them.
- **Cross-attempt behavior is unchanged.** Separate attempts share the pool with no exclusion;
  overlap between attempts is expected collection, reported by the overlap diagnostics, never
  prevented.
- **The `already_recorded` path stays as the backstop**, not the mechanism: with prevention in
  place it should become unreachable through normal driving, and it remains the correct answer
  for hand-edited or replayed submits.

## Capabilities

### New Capabilities

(none — the rule refines an existing capability's eligibility)

### Modified Capabilities

- `batch-allocation`: eligibility gains the assigned-to-own-batches exclusion, defined against
  the attempt's existing batches; the exhausted-pool requirement accounts for it (an attempt
  whose every remaining entry is assigned-but-unanswered has exhausted *new* allocation and is
  told to resume, not served duplicates).

## Impact

- `src/lib/allocation/allocate-batch.ts`: one additional repository read (entry ids assigned to
  the attempt's batches — `listForRecovery` already returns them) folded into the exclusion set.
- `src/lib/domain/allocation.ts`: possibly a widened exclusion parameter, if the pure rule
  rather than the service owns the merge (design decision).
- `src/lib/domain/batch-recovery.ts`: untouched; recognition semantics must match the new
  exclusion exactly (a response in any own batch answers the entry for both).
- Tests: rule-level exclusion cases, service-level double-Continue cases with overlapping pools,
  and a can-fire probe deleting the new exclusion.
- No migration (reads only), no schema change, no new route or action.
- Deferred by design: production deployment (needs owner Vercel auth), real-flow verification
  (needs a test-data strategy decision — see design), adjudication (Phase 12).
