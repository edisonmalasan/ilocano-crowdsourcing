# Proposal

## Why

Two migrations in this repository refuse to run rather than fabricate research data, and both
refusals are specified only in **SQL comments and test names**. The behaviour works, is tested, and
is not written down anywhere in `openspec/specs/`. A requirement is a claim about the system; a
claim nobody can read is not a guarantee, and the gap is worst for the two migrations that exist
specifically to protect research integrity.

The two gaps are the same class of defect and were found together.

**Gap 1 — a stated SHALL with no scenario.** The `research-schema` requirement *"The bilingual
representation replaces the single optional translation"* ends with:

> The check SHALL therefore run **before** the columns are removed, and that ordering SHALL NOT be
> reversed.

`SHALL NOT be reversed` occurs **exactly once in the entire in-force spec**, and **no scenario in
any requirement names ordering**. The requirement's four scenarios cover refusing, applying cleanly,
proving the refusal, and leaving history alone. A reader who implements from the spec has no stated
observable behaviour to implement for the sentence that the migration's safety rests on.

The behaviour *is* enforced and *is* tested. This was re-derived by probe rather than inherited: the
`do $$ ... end $$;` precondition block was moved to after the `drop column` statement — spliced with
`slice`, never a string replacement, because the block contains `$$` and JavaScript expands `$$` in a
string replacement to a literal `$` — and the suite went **RED, 7 failed | 6 passed (13)** against a
**13 passed (13)** control, with the mutation asserted well-formed before the result was believed.
So this is a **specification gap, not a missing guard**, and the fix is a scenario.

**Gap 2 — an entire column's database guarantees are unspecified.** `batch_entries.position` was
added by the archived `coverage-aware-allocation` change with 13 integration tests, and **not one
scenario in any in-force spec states any of it.** Specifically, the requirement *"The database
independently enforces research-integrity rules"* opens by enumerating what the database enforces —
the `(validator_id, dataset_entry_id)` uniqueness, the evaluation and proficiency vocabularies, the
non-blank translations, the correction rule, the cross-column consistency pairs — and `position` is
**absent from that enumeration and from every one of its eleven scenarios**. The requirement *"Six
research tables exist with the documented shape"* states the column exists and nothing more.

Nothing in the in-force spec says that the database rejects a missing, zero, or negative position;
that two entries of one batch cannot share a position; that the position migration refuses over
pre-existing `batch_entries` rows because a row's order is recorded nowhere and every backfill
fabricates; that it refuses by name when the column already exists; or that a refusal leaves no
trace, so the database can be resolved and reapplied. The domain-level rule is in `batch-allocation`
(*"Entry position reflects the server-selected order"*), but the database-level enforcement of it —
which is this capability's entire subject — is not stated anywhere.

**Gap 2 is a defect in the change that shipped five minutes ago.** It is recorded here explicitly
rather than folded in quietly: this proposal names both gaps, so the scope is visible and reviewable
at the point where it is decided, which is the only honest place to decide it. `AGENTS.md` asks that
discovered work be recorded or reported rather than silently absorbed; the ledger, the design, and
the pull request all name it.

The cost of leaving it is concrete. The next person to touch a migration that changes `position` —
or to reason about whether a batch order is trustworthy — reads a spec that says the column exists
and stops. A rule that is enforced but unstated will eventually be "simplified" away by someone who
believes it was never a rule.

## What Changes

- **Add a scenario to the bilingual requirement** naming the ordering guarantee that its own text
  already states, worded to match exactly what the existing test proves: the precondition refuses
  **by name**, stating the required order, when the superseded columns are already absent.
- **Extend the bilingual requirement's text** to say *where* that guarantee lives, because it is
  enforced in the migration's own SQL rather than by transaction rollback. A reader who assumes
  rollback defends the order is wrong, and the migration comment already had to retract that exact
  claim once.
- **Extend *"The database independently enforces research-integrity rules"*** to enumerate the
  `position` guarantees alongside the ones it already lists, and add scenarios for each: a missing
  position, a non-positive position, and two entries of one batch sharing a position are all
  rejected by the database itself, while position 1 and a position reused across two *different*
  batches are accepted, so the constraints are proven not vacuous.
- **Add a requirement for the position migration**, *"The batch-entry order is recorded by a forward
  migration that refuses rather than invents it"*, mirroring the shape the bilingual change already
  gave its own migration. It refuses over pre-existing `batch_entries` rows because a row's order is
  recorded nowhere and every backfill fabricates; it refuses by name when the column already exists,
  so a reapplied file cannot half-run; and a refusal leaves the schema and the pre-existing rows
  untouched so the conflict can be resolved in the data and the migration reapplied.
- **Nothing in `src/` changes.** Every scenario added is backed by a test that already exists and
  already passes. This change makes the specification say what the code, the SQL, and the tests have
  been saying.

## Impact

- Affected specs: **`research-schema`** — 2 requirements **modified** (21 scenario headings kept
  verbatim, 0 renamed) and 1 requirement **added**, for **10 new scenarios** in total.
- Affected code: **none**. No `src/`, no `supabase/migrations/`, no test change.
- New tests: **none needed** — and this is the load-bearing claim, so it is measured rather than
  asserted. Each of the ten scenarios names behaviour an existing test already pins; `design.md` §D1
  is the scenario-to-test table, and a row that could not have been filled would have stopped the
  change. §Verification records the probe that established the one guarantee with **no** scenario is
  red-on-reversal, which is precisely the one that could not be assumed.
- Risk: **low, and the risk is in the spec text rather than the code.** A scenario that overstates
  what the tests prove would be worse than no scenario, so each one is traced to a named test before
  it is written, and the design records that trace.
- Explicitly **not** changed: no migration file, no archived change, and no existing scenario
  heading. Renaming a scenario reads to `openspec`'s delta validator as a deletion, so every existing
  heading is preserved verbatim and the new scenarios are added alongside them.
