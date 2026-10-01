# Proposal

## Why

Roadmap Phase 6's sixth task is *restore interrupted active batches where practical*. It is the only
outstanding Phase 6 work, and it is unimplemented.

A validator allocates a batch of ten, answers three, and closes the tab. The batch is on the server with
seven entries unaccounted for. Nothing in the platform can find it again: the only handle was the URL
`/validate/<batchId>`, and every route back in — `/`, `/start`, `/ready`, `/validate` — ends at a control
labelled *Start a batch*, which mints a **new** batch. The seven-entry batch becomes unreachable for good.

## This is not a data-loss problem, and describing it as one would be wrong

The obvious framing is that abandonment strands research data and this change rescues it. **Measured, that
is false**, and the measurement is the reason this proposal is written the way it is.

`selectBatchEntries` filters a candidate out on exactly two conditions:

```text
if (answeredEntryIds.has(candidate.id)) continue;
if (coverage >= independentValidationTarget) continue;
```

An abandoned batch's un**answered** entries satisfy neither. They stay in the pool, for any validator
including the same one. So:

- **No coverage is destroyed** by abandoning a batch. The seven entries remain allocatable.
- **No response is lost.** The three answers are persisted, are excluded from future allocation, and are
  protected from being re-asked by `UNIQUE (validator_id, dataset_entry_id)`.
- **The orphaned batch is inert**, not broken: its `batch_entries` rows feed nothing, because coverage is
  counted from `validations`, not from assignments.

What is actually lost is the participant's **continuity**. Someone who did three of ten is told, by the
only screen offered to them, that they have not started — and is handed ten sentences they have never seen
while the seven they were in the middle of become unreachable. That is a bad experience and a misleading
one, and it is the whole of the case. A feature justified by a data-loss story it does not have would be
justified wrongly, and the requirement text would inherit the wrong story.

## The resume mechanism already exists; what is missing is discovery

This is the second measured finding, and it keeps this change small. `/validate/[batchId]` **already
resumes correctly**. `resolveSessionEntry` is handed the completed entry ids and, with no position
requested, returns the first placement that is not among them — so reloading a batch URL lands on the first
unanswered entry, and the finished screen already recognises a batch with no unanswered entries as finished.

So no resume logic, no resume flag, and no batch lifecycle state need to be built. What does not exist is
any way to **learn which batch is yours**. That is a read plus an affordance, and this change is that read
and that affordance.

## Why now

Phase 6's first slice is archived and its capability in force. This is the remaining task, and it is
blocked on nothing: it needs no Supabase project to be specified, and — as recorded below — no migration
that would be hard to reverse.

## What Changes

Make an interrupted batch discoverable to its owner and resumable in place:

- recognise it from work remaining, never from a stored flag;
- offer the most recently created one, on the existing start screen, alongside the existing new-batch
  control rather than instead of it;
- resume by navigating to the batch's own address, writing nothing on the way in;
- add the one column this needs, `validation_batches.created_at`, by forward migration.

This change adds **one capability, `batch-recovery`, and modifies zero.** That is a claim, and it was
checked rather than assumed:

- `openspec/specs/` was searched for anything specifying batch interruption, resumption, or a batch's age.
  **Nothing** specifies them. The nearest in-force requirement is `research-schema`'s *"batch status,
  completion timestamps, and assignment timestamps remain undefined until the changes that own them add
  them"* — which is a forward permission naming this change as its owner, not a prohibition it breaks.
- `batch-completion` requires the finished screen to recognise a finished batch *"from the absence of work,
  never from an assertion"*. This change recognises an **interrupted** batch from the *presence* of work.
  These are complements of one derivation, not competing authorities, so the requirement is satisfied by
  extension and needs no MODIFIED block.
- `interface-localization` already requires localization to cover interface copy. This change **satisfies**
  that requirement for one more screen rather than altering it.

## Scope

**In:** discovering an interrupted batch for its owner, offering it with remaining and total counts on
`/validate`, resuming it by navigation, `validation_batches.created_at`, and both interface languages.

**Deliberately out:**

- **Any change to the landing page.** Offering "continue where you left off" on `/` is a plausible
  improvement, and it is not this change: it puts a database read on the first screen a participant sees,
  and it duplicates an affordance that already exists one step later. Recorded as a possible later
  refinement, not promised here.
- **Recovering, expiring, or deleting older abandoned batches.** They are inert, and deleting research rows
  is not on the table.
- **A lifecycle column.** `research-schema` defers it, `batch-completion`'s D4 declined it, and nothing
  here needs it. See the design's D1.
- **Making a new batch conditional on having no interrupted batch.** See D5 — refusing is worse than
  allowing.

## Why not simply add a batch status column

It is the obvious move and this change adds the column `research-schema` names — but not that one.
`status` would be a second authority that can disagree with the entries, which is the shape
`batch-completion`'s D4 already rejected and which `validation_batches` carries no trace of today.

Recognition needs no stored state at all: a batch with unanswered entries is interrupted, and the platform
can count that from rows it already stores. The single column this change *does* add is `created_at`, which
is not a lifecycle flag — it is the batch's own age, and it exists solely to make "the most recently
created" a total order rather than an inference from an identifier's shape. See the design's D2.
