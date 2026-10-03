# Design

## Context

See `proposal.md` — Why for the motivation and the deltas under `specs/` for the requirements.
What an implementer needs and cannot read off those two: the exact claim SQL, why it is shaped
that way under concurrency, where the service loop lives, and what is honestly NOT proven by the
tests that will exercise it.

The read the service needs already exists: `BatchesRepository.listForRecovery(validatorId)`
returns the attempt's batches with entry ids. What does NOT exist is any arbitration between
attempts — allocation today is pure read-then-write, and two simultaneous requests can select,
persist, and return the same entry.

## Goals / Non-Goals

**Goals**

- Two simultaneous requests never share an incomplete entry, decided by PostgreSQL.
- Expiry and reclaim with no watcher, no cron, no background worker.
- `already_recorded` stays the backstop; recovery stays untouched.

**Non-Goals**

- Moving eligibility (completeness, answered, own-assigned) into SQL: the bilingual-package
  rule duplicated in a second language is the drift this codebase explicitly rejects.
- Adjudication, deployment, real-flow verification.
- Fairness or priority between contending attempts beyond deterministic arbitration.

## Decisions

### D1 — Claim by PK arbitration, not row locking

**Chosen:** one transaction: `DELETE` expired rows over the candidate ids, then `INSERT ...
ON CONFLICT (entry_id) DO NOTHING`, `RETURNING` the granted ids.

**Why this is the equivalent design the requirement asks for.** `SKIP LOCKED` presumes rows to
lock; unclaimed entries have no row, so there is nothing to select-for-update. The primary key
is the lock: two concurrent inserts for one entry serialize on the unique index, the loser
skips the row. No application logic runs between the conflict check and the claim — that
interval is where read-then-write loses, and here it does not exist.

**Honest limit, stated rather than implied.** What PostgreSQL guarantees is that exactly one
claimant wins each entry. It does not guarantee both requests a full batch: the loser backfills
from remaining candidates (at most two extra rounds) or reports short/exhausted. Contention
collapse is a documented outcome, not a failure mode discovered later.

### D2 — No batch_id on the reservation row

**Chosen:** `(entry_id PK, validator_id, reserved_at, expires_at)`; holder is the attempt.

**Why.** Release happens on submit (entry + attempt known) and abandonment decays by TTL
(entry + time known); neither needs the batch. A `batch_id` FK would force claiming after
batch persistence and entangle reconciliation on shortfall. The batch row remains the assignment
record; the reservation row is the exclusivity record. Two tables, two jobs.

### D3 — The claim RPC takes candidates; the app keeps selection

**Chosen:** `claim_entry_reservations(p_validator_id, p_entry_ids, p_ttl_seconds)`; the service
passes its ordered selections and records grants.

**Why.** Completeness, answered, own-assigned, shuffle order, and batch-size caps all stay in
the tested application path. The RPC knows nothing about eligibility — it arbitrates claims
over ids it is handed. An RPC that re-derived eligibility would need the bilingual rule in SQL.

### D4 — TTL is configuration with a stated default

**Chosen:** `reservationTtlSeconds`, default 1800 (30 minutes), validated like `batchSize`
with a hard maximum.

**Why 30 minutes.** A batch is ten entries with two translations each: careful work takes
tens of minutes, and a TTL far below that expires mid-batch (legitimate but churny), while a
TTL far above it parks abandoned entries for hours. Thirty minutes is an operational starting
point pending observation during production monitoring — stated as tunable, not derived.

### D5 — Release is best-effort after insert, never before it

**Chosen:** `releaseReservation(validatorId, entryId)` runs after a successful validation
insert; failure is logged, the submit still reports recorded.

**Why after.** Releasing before the insert would open a window where the entry is neither
reserved nor answered — claimable by another attempt while this submit is in flight. Why
failure-swallowed: a stuck row decays by TTL, while a failed submit told as success corrupts
the validator's trust. The asymmetry is deliberate and is the same one the persistence-failure
rule already encodes.

### D6 — The race test forces interleaving at the seam, not on the wire

**Chosen:** a barrier-controlled fake repository (`claimReservations` blocks attempt A until
attempt B's claim starts) asserting no entry is granted twice, plus PGlite integration tests of
the RPC's conflict/expiry/reclaim semantics run sequentially.

**Why not a true wire race.** CI cannot schedule two PostgREST requests to overlap
deterministically; a test that usually races is a flake with a green habit. The forced
interleaving proves the SERVICE never double-grants under adversarial ordering, and the
integration tests prove the RPC arbitrates conflicts — while the claim that PostgreSQL
serializes concurrent unique inserts rests on engine semantics, stated as assumed rather than
smuggled in as proven. That sentence belongs in the test file, not just here.

## Risks / Trade-offs

- **[Starvation under sustained contention.]** Bounded backfill (two extra rounds) then
  short/exhausted. Mitigation: at crowdsourcing scale contention is nil; the outcome is
  documented, and monitoring (overlap diagnostics exist) would show it.
- **[Reservation table growth.]** Rows die on submit-release and lazy expiry-delete, but a
  never-answered never-reclaimed row lingers until touched. Mitigation: every claim touches
  only its candidates; a periodic cleanup is deliberately NOT added (it would be the watcher
  the spec forbids). Abandoned rows are inert — completeness filtering ignores them.
- **[TTL wrong in either direction.]** Mitigation: configuration, documented as tunable from
  production observation; the overlap + late-arrival diagnostics are exactly the instruments
  that will show it.
- **[PGlite is not Supabase.]** The RPC runs under PGlite's engine; PostgREST argument passing,
  RLS-as-gateway, and true wire concurrency are unobserved. Mitigation: the repository seam
  keeps PostgREST mapping in one tested place, and the design states what each layer proves.

## Migration Plan

One file, `20261004130000_entry_reservations.sql`: table, FKs with `ON DELETE CASCADE`,
`expires_at` index, validator index, RLS enable with no public policies, the claim function.
Plain PostgreSQL only (no Supabase-only extension, no `auth.users`, no transaction control) so
PGlite applies it in CI. Rollback is `DROP FUNCTION` + `DROP TABLE` in a later migration if the
model is ever retired; there is no data to preserve because reservations are ephemeral by
definition. The migration history is never rewritten.

## Open Questions

None that would change the specs, the approach, or the tasks. The production test-data
strategy (live project, owner-decided) belongs to real-flow verification; the TTL default
belongs to production observation.
