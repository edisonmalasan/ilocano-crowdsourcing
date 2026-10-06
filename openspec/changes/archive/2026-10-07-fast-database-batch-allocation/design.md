# Design

## Context

`allocateBatch` reads the whole pool (4800 full rows, 5 paged requests), the whole pool's
responses (24 chunked requests), the attempt's answers, and the attempt's batches, reduces
completion in TS, shuffles, claims via RPC (up to 3 rounds), creates the batch in two
untransacted writes, and reads it back: ~37 round trips before navigation. The reads exist to
answer one question — which 10 entries are eligible — that Postgres can answer locally.

## Goals

- ~4 round trips per allocation with identical methodology and outcome contract.
- Single-transaction select + claim + persist (stronger than today's propose/dispose split
  across requests, and it removes the two-write partial batch).
- No second methodology: SQL pillars centralized in one function, proven equal to TS.

## Non-goals

- No completion-semantics change, no flow restructure, no caching layer, no index changes,
  no security-hardening program (separate, runs after archiving per owner order).

## Decisions

### D1: One RPC does select + claim + persist; TS keeps gating and read-back

`allocate_validation_batch_v1(p_validator_id, p_batch_id, p_batch_size, p_ttl_seconds,
p_created_at)` returns placements `(entry_id, position)` or nothing. Validator existence and
proficiency stay in TS (exact `unknown_validator`/`screening_required` reasons, one point
read). Batch identity stays TS-minted (id scheme + one-instant pairing preserved). TS reads
the batch back via `findById` and projects the 10 entries as today. The client contract
(`AllocationOutcome`, strictObject intent, size cap) is unchanged.

Rejected: (C) RPC-returns-bits + TS-decides — still ~6 requests and splits selection from
claim, keeping today's cross-request race. (B) maintained summary — a new write path plus
invalidation discipline for the same numbers. (D) bigger chunks — the same inefficiency,
less of it.

### D2: Pillars in SQL, in exactly one place, with exhaustive parity

Per entry: `has_judgment` = EXISTS evaluable evaluation with required correction present
(non-blank via `btrim`); `has_english`/`has_filipino` = EXISTS eligible evaluation with the
translation present (non-blank). Complete = all three. Ineligible = answered-by-attempt OR
assigned-to-attempt OR complete OR actively-reserved-by-other. Candidates ordered by
`random()`, limited, claimed with the existing PK-arbitration INSERT...ON CONFLICT pattern,
backfilled in-function up to 3 rounds past denied ids, then batch + entries inserted with
`row_number()` positions.

Parity: PGlite test builds the full response matrix (4 evaluations ×
correction absent/present/blank × english absent/present × filipino absent/present = 96
single-response cells, plus pooled multi-response cases: judgment-only + english-only +
filipino-only across rows, cannot_evaluate-only, correction-missing judgment with covering
translation) and asserts the SQL classification equals TS `isEntryComplete` on every cell.
Any future evaluation value breaks both sides loudly (TS switch is total; SQL uses explicit
value lists, and a parity probe with an unknown value must fail rather than fall through —
enforced by a CHECK-constraint-anchored test).

### D3: Concurrency inside one transaction

Selection, claim, and persistence share one function call (one transaction). Two concurrent
allocators serialize on the reservation PK exactly as the existing claim does; the loser
backfills within its own call. Bounded (3 rounds), then short batch — honest exhaustion,
never unbounded retry. PGlite concurrency tests: simultaneous allocations grant disjoint
sets, no same-entry-twice, no deadlock (statement timeout guard in tests).

### D4: Randomization stays `ORDER BY random()`

4800 rows is small; `random()` costs single-digit ms (measured on hosted EXPLAIN during
Apply). Fisher–Yates determinism for tests stays in TS for the fallback path; the RPC path
is covered by distribution tests (no low-ID bias, all six categories reachable, DTM
included) rather than seed reproducibility.

### D5: No new index; no flow change

Hosted EXPLAIN: pool scan via PK index, all point lookups via existing btree indexes,
small-table seq scans only. Adding an index without plan evidence is forbidden by §9, and
the evidence says none is needed. `/validate` keeps recovery-first; the loading state
remains as fallback.

### D6: Security posture identical to the claim/release precedent

SECURITY INVOKER, `SET search_path = ''`, revoke-all-from-PUBLIC + grant-to-service_role,
server-only invocation through the repository layer. Post-deploy: anon/authenticated
EXECUTE refused, service_role executes (PGlite grant tests + hosted probe).

## Risks / trade-offs

- SQL now encodes pillar conditions: mitigated by centralization (one function) + the
  parity matrix, which fails on any drift in either direction (TS or SQL change breaks it).
- `ORDER BY random()` sorts 4800 rows per allocation: measured, single-digit ms; revisit
  only with plan evidence.
- The two-write partial batch disappears (atomic persist) — an improvement, documented in
  the migration and the spec delta, not a silent change.

## Open questions

- None blocking. Remaining measurements (EXPLAIN of the RPC body, concurrency timings) land
  during Apply against PGlite and hosted read-only probes.
