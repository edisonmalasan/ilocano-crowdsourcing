# Design

## Context

See `proposal.md` — Why. The mechanism is already correct; the subtlety is
entirely in what the tests pin and what they honestly cannot.

## Goals / Non-Goals

**Goals**

- A 9-entry persisted batch presents as 9: totals, positions 1..9,
  completed/remaining counts, and finished-after-9 all derive from the
  persisted placements.
- No entry is persisted twice to reach 10, and no completed entry is
  re-presented for validation.
- Allocation still collapses to a short batch (or `exhausted` on zero grants)
  within its existing bounded rounds, with the reservation seam untouched.

**Non-Goals**

- Changing the claim loop, round cap, TTLs, RPC bodies, RLS, or any caller:
  exclusive reservation semantics are preserved by not touching them.
- Changing the out-of-range fallback. `?position=10` in a 9-entry batch
  presenting the first remaining entry with header `1 OF 9` is the documented
  stale-link safety (`session.ts` header: a URL must never declare work
  finished). The Apply does not "fix" it into a refusal or a null.
- Making allocation wait for 10. Bounded collapse is the requirement, and
  indefinite retry would be its violation.

## Decisions

### D1 — Pin the derivation, do not add a second one

**Chosen:** regression tests assert `total === ordered.length` over a
9-placement batch at the `resolveSessionEntry` layer and through
`openValidationSession`'s finished figures (`completedCount`/`total` from
`batch.entries.length`).

**Why.** The route, service, and progress component already thread one number
from one place. A second computation of "the size" anywhere — a config
constant read in the UI, a `requested_size` echo — would be the drift this
change exists to prevent. Tests pin the single derivation rather than adding
a parallel one.

### D2 — No-padding is asserted on stored ids and positions, not on prose

**Chosen:** allocation test under a denying arbiter asserts 9 granted of 10
requested, 9 persisted rows, positions exactly `[1..9]`, 9 unique ids, and the
denied id absent rather than duplicated.

**Why.** "Never repeat an entry to satisfy 10" is a property of persisted
rows, not of a comment. Prose can claim it while a backfill re-selects a
denied id; positions plus uniqueness cannot.

### D3 — Reservation semantics are preserved by exclusion

**Chosen:** no file under `src/lib/repositories/`, `supabase/migrations/`, or
the claim loop is touched. The short-batch test uses the existing
`claimReservations` seam with a denying fake — the same seam production uses —
so the test exercises contention without weakening exclusivity.

**Why.** The requirement names preservation explicitly. The strongest evidence
is a diff that does not contain the files it promises not to touch.

### D4 — The out-of-range view is documented as a view, not a repeat validation

**Chosen:** the 9-batch suite asserts the fallback (`requestedPosition=10`
with nothing completed presents placement position 1 with `total=9`) AND
asserts the response-level non-duplication separately (completed ids are
filtered; the database refuses a second response by name).

**Why this is honest about its limits.** Two URLs can view one uncompleted
entry. That is inherent to any fallback that refuses to declare work finished
from a URL, and removing it trades a confusing view for a false completion
statement — the worse failure by the module's own header. The guarantee that
matters is that no entry is *validated* twice to fill 10, and that is what
the completed-set filter plus the named UNIQUE constraint enforce. A reviewer
who wants URL-uniqueness instead should reject this decision explicitly; it
is recorded here so it cannot be inherited silently.

## Risks / Trade-offs

- **[The "10 OF 10" report does not reproduce.]** Mitigation: the proposal
  states the measurement (`1 OF 9` at `?position=10`) rather than claiming the
  reported rendering. If a reviewer reproduces `10 OF 10` on a path this
  change did not measure, that measurement supersedes this design.
- **[A future padding path.]** Mitigation: the positions-plus-uniqueness test
  fails on any backfill that duplicates rather than excludes.
- **[A sixth batch-size reader.]** Mitigation: totals come from placements in
  every test; a UI that read the config constant would have to bypass the
  session figures the route test asserts.

## Migration Plan

None. No migration file is added or modified.

## Open Questions

None.
