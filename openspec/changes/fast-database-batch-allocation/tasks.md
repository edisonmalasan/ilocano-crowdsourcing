# Tasks

## 1. Migration + RPC

- [ ] 1.1 New forward migration with `allocate_validation_batch_v1` (pillars, exclusions,
  randomize, claim, persist, return placements); SECURITY INVOKER, empty search_path,
  revoke/grant; additive-only, no existing object touched.
- [ ] 1.2 Repository seam: new `BatchesRepository` (or narrow allocation) method calling the
  RPC; operation name + union + bidirectional test lists updated.
- [ ] 1.3 Service switch: `allocateBatch` uses pre-check + RPC + read-back + projection;
  outcome contract and failure reasons unchanged; old pool-transfer path removed only after
  the RPC path proves parity (no parallel implementations shipped).

## 2. Parity + regression tests

- [ ] 2.1 Exhaustive SQL↔TS completion parity matrix on PGlite (96 single-response cells +
  pooled multi-response cases + unknown-value probe).
- [ ] 2.2 Full §17 regression list against the RPC path (fresh/unknown/screening-gated,
  completed/cannot_evaluate-only/answered/assigned/reserved/expired exclusions, short batch,
  six-category pool, DTM, 1-based positions, client cannot steer).
- [ ] 2.3 Concurrency tests: simultaneous allocations disjoint, no same-entry-twice, no
  deadlock, bounded rounds, latency sane.

## 3. Privilege + plan evidence

- [ ] 3.1 PGlite grant tests (anon/authenticated refused, service_role executes); hosted
  read-only probes post-migration; EXPLAIN of the RPC body recorded.
- [ ] 3.2 before/after measurement (round trips + wall latency); no hosted reset/reseed;
  real rows preserved and recounted.

## 4. Verification + lifecycle

- [ ] 4.1 Full matrix with counts from logs; independent verification before Apply merge;
  CI + Vercel green on every PR; optimistic-entry-progression behavior intact.
- [ ] 4.2 Sync `batch-allocation`; Archive.
