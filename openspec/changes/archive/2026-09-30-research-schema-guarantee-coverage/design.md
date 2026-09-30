# Design

## Context

Two migrations refuse to run rather than fabricate research data. Both refusals are implemented, both
are tested, and neither is written down in `openspec/specs/`. This change writes them down. It
changes no code.

The full derivation — including the probe that established which of the two gaps is a missing guard
and which is a missing scenario — is in `proposal.md` under **Why**. This document records the
decisions a reader would otherwise have to reverse-engineer.

## Goals / Non-Goals

**Goals**

- Every database-level guarantee about `batch_entries.position` is stated in a requirement.
- The migration-ordering guarantee that a requirement already asserts has a covering scenario.
- Every scenario added is traceable to a test that already passes.

**Non-Goals**

- No change to `src/`, `supabase/migrations/`, or any test.
- No new test. If a scenario cannot be traced to an existing test, that is a signal the scenario is
  wrong, not that a test is missing — and the scenario gets reworded or dropped.
- No rewrite of `20260930120000_research_schema.sql`, no edit to any archived change, and no rename
  of any existing scenario heading.

## Decisions

### D1 — Every scenario is traced to a named test before it is written

The risk in a spec-only change is stating something the code does not do. A scenario that overstates
what the tests prove is **worse than no scenario**, because it converts a known gap into a false
guarantee — and a false guarantee is more expensive to discover later than an absent one, since
every reader after the first trusts it.

So the trace is built first, and the spec is written from it:

| Scenario to add | Backed by (existing, passing) |
| --- | --- |
| precondition refuses by name when the columns are already absent | `migration-precondition.test.ts` › *"refuses by name if the superseded columns are already gone, closing the ordering hazard"* |
| a batch entry with no position is rejected | `allocation-migration.test.ts` › *"refuses a batch entry with no position at all"* |
| position 0 and a negative position are rejected by name | `allocation-migration.test.ts` › *"rejects position zero, matched by constraint name"*, *"rejects a negative position…"* |
| position 1 is accepted | `allocation-migration.test.ts` › *"accepts position 1, the first position, so the constraint is not vacuously refusing everything"* |
| two entries of one batch cannot share a position | `allocation-migration.test.ts` › *"rejects two entries of one batch sharing a position, matched by constraint name"* |
| one position may be reused across two different batches | `allocation-migration.test.ts` › *"accepts the same position in two DIFFERENT batches"* |
| the position migration refuses over pre-existing rows | `allocation-migration.test.ts` › *"refuses the allocation migration, naming the conflict rather than a mechanics failure"* |
| a refusal leaves no trace and no row is lost | `allocation-migration.test.ts` › *"leaves no trace of the refusal, so the database can be resolved and reapplied"* |
| the position migration refuses when the column already exists | `allocation-migration.test.ts` › *"refuses when the column already exists, so a re-applied file cannot half-run"* |

A row in that table that could not be filled would have stopped this change. None was empty, and none
was filled by a test that asserts something adjacent rather than the thing claimed.

### D2 — The ordering scenario claims a *named refusal*, not "the order is enforced"

The tempting scenario is *"WHEN the statements are reordered THEN the order is enforced"*. It is
**unfalsifiable as written**, and worse, it is false in the way that matters.

Measured, not reasoned: the PGlite harness applies each migration file inside **one transaction**, so
`raise exception` rolls the whole file back and a `drop` that already executed is undone with it. A
test written to detect the reversal by checking post-failure state **passed with the reversal in
place**, because there was nothing to detect. Inside a transaction, rollback erases the evidence of
everything before the failure.

So the guarantee is not "the order is enforced". It is: **the migration's own SQL refuses by name,
stating the required order, when it reaches the precondition after the columns are gone.** That is
observable, it is what the artefact actually does, and it survives a runner that executes statements
outside a transaction. The scenario says that, and nothing more.

The requirement text is extended in the same spirit, to say *where* the guarantee lives — in the
migration's SQL, not in rollback. A reader who assumes rollback defends the order is wrong, and the
bilingual migration's own header comment already had to retract exactly that claim once.

### D3 — Each constraint gets an acceptance case as well as a rejection case

A constraint that rejects everything passes every rejection test. `check (position > 0)` on a column
where nothing can be written at all "rejects position 0" and is worthless.

The existing spec already models this — *"The consistency constraints do not refuse a legitimate
response"* exists precisely so the constraint pair cannot be satisfied by refusing all rows. This
change follows that pattern: every new constraint scenario is paired with a scenario asserting the
legitimate value is **accepted**. Two of these already exist in the test suite and are named in the
table above; they are given scenarios so the acceptance is stated, not merely tested.

### D4 — The scenarios name the constraints, so a failure is attributable

Every rejection test in this repository matches a **constraint name**, never the generic phrase
`check constraint`, because a generic pattern passes when the wrong constraint fires. The spec
therefore names `batch_entries_position_positive` and `batch_entries_batch_position_unique`, and
distinguishes the not-null refusal from the positive check — they are different failures with
different causes, and a reader debugging a live refusal needs to know which one they hit.

### D5 — No existing scenario heading is renamed

`openspec`'s delta validator treats a renamed scenario as a dropped one; this repository has already
been bitten by it. Every existing heading in both modified requirements is reproduced **verbatim**,
the new scenarios are added alongside them, and the sync step asserts the scenario-name set is a
**superset** of the original — never a different set, and never smaller.

This required relaxing one guard in the sync script used by the previous change, which refused to
add a scenario inside a `MODIFIED` block. That guard was right for what it was written for and wrong
here: adding a scenario to an existing requirement is a legitimate `MODIFIED` block, and the correct
rule is the one already in place — **an existing name must not disappear**. The relaxation is to
permit additions while keeping the loss guard absolute.

### D6 — Scope names both gaps rather than absorbing the second silently

Gap 2 was found while exploring gap 1, and it is a defect in the change merged immediately before
this one. `AGENTS.md` asks that discovered work be recorded or reported rather than silently
expanded.

It is absorbed here, but **visibly**: both gaps are named in `proposal.md`, in this document, in the
pull request, and in the status ledger. The scoping decision is made at proposal stage, which is the
only stage where it can be reviewed as a decision rather than discovered as drift. Splitting them
would produce two near-identical spec-only lifecycles for two halves of one defect class in one
capability.

## Risks / Trade-offs

- **The spec now asserts things a future migration must honour.** That is the point, and it is also a
  real cost: someone who later wants `position` to be nullable, or wants to re-add a legacy backfill,
  meets a stated requirement instead of an unstated accident. That is the correct way round.
- **A spec-only change carries no test delta**, so its correctness rests entirely on the trace in
  D1. This is why the trace is a table in the design rather than a claim in the pull request, and why
  the one guarantee that had **no** scenario was probed for red-on-reversal instead of assumed.
- **The sync step touches an in-force spec that four capabilities depend on.** Mitigated by the
  superset assertion and by `openspec validate --specs --strict` after the write.

## Migration Plan

None. No code changes, no data, no deployment step. The change moves from "the behaviour exists and
is tested" to "the behaviour is specified" — which is a documentation change to the specification,
and the tests it describes are already green on `main`.

## Open Questions

None requiring a decision. One observation is recorded rather than resolved, because resolving it
would be scope creep:

With the bilingual migration's statements **reversed and a pre-existing evaluable row present**, the
failure surfaces as `check constraint "validations_bilingual_pair_required_when_evaluable"` rather
than as this migration's named precondition — the constraint is added before the precondition is
reached. The named precondition refusal therefore holds for the clean and `cannot_evaluate`-only
cases, and the scenario is scoped to exactly those. A database in the reversed-plus-conflicting state
loses nothing, because the transaction rolls back, but the operator sees an opaque message. Widening
the migration's guard to cover that case would be a real change to a real migration and is **not**
proposed here; it is recorded so a future reader does not mistake the narrow scenario for an
oversight.
