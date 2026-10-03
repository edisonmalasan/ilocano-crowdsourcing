# Proposal

## Why

Measured in the owner-witnessed real-flow run: under contention one allocation
persisted **9** `batch_entries` rows with contiguous positions 1..9 (batch 6 of
the streak; stored draws 79 unique of 79; `positions=[1..9]` contiguous). A
script that then requested `?position=1..10` without completing anything
observed the first entry (`OD_0305`) at both position 1 and position 10. The
page header at `?position=10` reads `SENTENCE 1 OF 9` — the total is already
derived from the persisted batch, not from the configured size of 10 — so the
report of `10 OF 10` does not reproduce on current `main`. What the run did
prove is the gap: **no regression test pins any of this**. The totals, the
no-padding rule, and the short-batch progress path are correct by inspection
today and unguarded against tomorrow.

A contention-short batch is acceptable; duplicated presentation is not. The
requirements for this change are the owner's verbatim: the UI derives total
batch size from the actual persisted entries; a 9-entry batch displays
1 of 9 ... 9 of 9; no entry is repeated merely to satisfy the configured size
of 10; completion and progress counts use the actual persisted size;
exclusive reservation semantics are preserved; allocation never waits
indefinitely for exactly 10; regression coverage exists for the
contention-short batch.

## What Changes

- **Spec**: one ADDED `validation-experience` requirement — a contention-short
  batch presents its actual size, with scenarios for totals, positions,
  progress counts, no padding, and completion against the actual size.
- **Tests**: short-batch regression coverage at the narrowest layers that can
  see it — `resolveSessionEntry` over a 9-placement batch (totals, positions,
  completed/remaining counts, finished-after-9, out-of-range fallback
  documented) and `allocateBatch` under a denying claim arbiter (9 granted,
  9 persisted, positions 1..9 contiguous, no duplicate id, reservation seam
  untouched, bounded rounds unchanged).
- **No migration, no reservation change, no waiting change**: `MAX_CLAIM_ROUNDS`
  stays 3; the claim-then-backfill loop and the PK-arbitrated RPC are untouched.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `validation-experience`: ADDED requirement on contention-short batch
  presentation (actual-size totals, positions, progress, no padding).

## Impact

- Test files only (expected): one extended unit suite plus allocation-service
  short-batch cases. No `src/` change is expected; if the Apply measures a
  padding path, it is fixed there rather than by widening this change.
- The out-of-range fallback (`?position=10` in a 9-entry batch presents the
  first remaining entry with header `1 OF 9`) is **documented, not changed**:
  changing it would risk the false-finished statement the fallback exists to
  prevent. A view of one uncompleted entry through two URLs is not a repeated
  validation — the completed-set filter plus `UNIQUE (validator_id,
  dataset_entry_id)` prevents a second response — and the design records that
  distinction so a reviewer can reject it explicitly rather than inherit it.
- Deferred: any visual rework of the progress component beyond the numbers it
  already receives; any change to TTLs, round caps, or reservation rows.
