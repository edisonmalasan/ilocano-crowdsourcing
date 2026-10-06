# Proposal

## Why

First-batch allocation takes ~15–20s of "Preparing your sentences...". Measured against the
hosted project (service-role REST, read-only): the read path alone is ~32 requests and ~7s
(pool read 1416ms/5 requests/4800 full rows; coverage read 4959ms/24 chunked requests; plus
validator/recovery reads), before the claim RPC, batch create/read-back, navigation, and the
session re-read. The work transferred to choose 10 entries is the whole 4,800-row corpus plus
thousands of response rows.

## What changes

- New versioned RPC `allocate_validation_batch_v1` (one forward migration, SECURITY INVOKER,
  `search_path = ''`, EXECUTE revoked from PUBLIC / granted to `service_role` only): in one
  transaction it computes eligible entries with the pooled-completion pillars, excludes the
  attempt's answered/assigned entries and actively-reserved others', randomizes, claims up to
  the requested size with bounded in-function backfill, persists the batch + 1-based
  `batch_entries`, and returns only the granted placements.
- The TypeScript service keeps: validator/profile gating (`unknown_validator`,
  `screening_required`), batch-id minting, read-back via `findById` (never echo), projection
  to `AllocatedEntry`, and the exact `AllocationOutcome` contract. Request count per
  allocation drops from ~37 to 4 (profile read, RPC, batch read-back, 10-entry projection).
- Pooled-completion pillars live in exactly one SQL place inside the new function; exhaustive
  parity tests on PGlite prove SQL and the existing TypeScript predicates classify every
  evaluation/correction/translation combination (single- and multi-response) identically.
- No new index: hosted EXPLAIN shows index scans on every allocation-relevant path already.
- No flow restructure: `/validate` keeps recovery-first orchestration; speed removes the pain.
- No reset/reseed: hosted holds real Phase 11 data (4800 entries, 7 attempts, 13 validations);
  the migration is additive-only and preserves every row.

## Capabilities

### New capabilities

(none — this moves the allocation read behind an existing capability)

### Modified capabilities

- `batch-allocation`: allocation may be served by the versioned RPC with identical semantics;
  round-trip budget, parity requirement, and privilege posture stated.

## Impact

- One new migration, `BatchesRepository` + service changes behind the same outcome contract,
  PGlite parity/concurrency tests, `batch-allocation` spec update. Dashboard, export,
  validation-experience (prefetch/save-queue untouched), completion semantics, and the
  immutable dataset untouched.
- Success criterion: normal first-batch allocation in a few seconds with ~4 round trips; the
  4,800-row pool transfer and the 200-ID chunk loops gone from the critical path.
