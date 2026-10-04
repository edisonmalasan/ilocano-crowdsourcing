# Design

## Context

See `proposal.md` — Why. The trace measured 16 validators, 0 null-proficiency
rows: the hole is real in code, empty in data, and unopenable through the
product. The fix is a choke-point guard, not incident response.

## Goals / Non-Goals

**Goals**

- No attempt without a recorded proficiency can be allocated sentences,
  enforced where batches are minted rather than only where answers are typed.
- A refused participant always has exactly one honest onward action and is
  never told something is broken.
- Legacy null rows and in-flight legacy batches are left intact by
  construction, not by discipline.

**Non-Goals**

- Filling the absence on resume (a write on the resume path; breaks the
  no-overwrite rule the data depends on).
- Refusing validation submits for in-flight legacy batches (destroys
  submitted research data).
- Retroactive `NOT NULL`, backfills, or any migration.

## Decisions

### D1 — Gate at allocation, not at intake (again) or at submit

**Chosen:** `allocateBatch` refuses after the validator-exists check, before
any pool read.

**Why.** Intake already refuses; the gap is everything intake cannot see.
Submit-time refusal would destroy in-flight work. Allocation is the single
point every new sentence passes through, it already holds the profile, and
the refusal costs one comparison. The test asserts the only repository call
is the profile read — no pool read, no batch persisted, no claim attempted.

### D2 — A fifth closed reason, not a boolean or an `exhausted`

**Chosen:** `"screening_required"` joins `AllocationFailureReason`.

**Why.** `exhausted` would lie about the pool; a boolean would be a second
vocabulary. The union is closed, so every consumer fails to compile until it
handles the reason — the handling cannot be silently skipped. `decideStartBatch`
gains a `screening_required` decision kind (it needs distinct UI: restart,
no retry); `decideContinueBatch` maps it to a dedicated error message (the
existing Finish control already retires there).

### D3 — Restart retires locally, exactly like Finish

**Chosen:** the restart control calls `clearStoredValidatorId()` and
navigates to `/start`. Zero server writes.

**Why.** The attempt ends the way Finish ends it — browser-side retirement —
so no server path, no new action, and nothing the anonymity invariant must
newly bless. Retry is deliberately absent: re-requesting a deterministic
refusal is a button that can never succeed.

### D4 — The refusal message names the history, not a fault

**Chosen:** "created before the Ilocano question became required … nothing
already submitted is affected", in both languages.

**Why.** It must not read as breakage (nothing is broken), must not promise
screening will fix THIS attempt (it cannot — the answer would be discarded on
resume), and must state submitted work is safe (or the participant will fear
retrying anything). The finished-screen variant points at Finish-then-restart
because that screen already owns the retire control.

### D5 — Legacy drains, documented in spec

**Chosen:** batches allocated before the correction complete normally; only
new allocation is gated. Stated as a spec scenario so a later reader cannot
"fix" it into retroactive refusal.

**Why.** The alternative destroys submitted responses to enforce a rule that
postdates them. Forward-only correction is the pattern this project already
uses for legacy null rows; this extends it to legacy batches.

## Risks / Trade-offs

- **[A null-holder mid-batch never sees the gate.]** Accepted and specified:
  only new allocation is gated. The population is zero today and
  unopenable; the scenario pins the drain rule.
- **[Filipino mirrors are the author's seconds.]** Same standing caveat as
  the parent change: thesis-team review before crowdsourcing.
- **[A sixth allocation consumer misses the reason.]** Mitigation: the closed
  union fails typecheck until handled; the enumeration test names producers.

## Migration Plan

None. No migration file is added or modified.

## Open Questions

None.
