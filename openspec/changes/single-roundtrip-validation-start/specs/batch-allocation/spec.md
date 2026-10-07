# Spec Delta

## MODIFIED Requirements

### Requirement: Batch entries are chosen on the server by pooled entry completeness

The platform SHALL determine a validator's batch entries on the server. Eligibility SHALL be derived
from each candidate entry's **completeness**, as defined by `entry-completion`: an entry is
eligible while its stored responses do not yet collectively cover the package. The raw count of
stored validation rows SHALL NOT be used as a proxy for that determination, and no per-response
count behind an entry SHALL decide eligibility. A client SHALL NOT supply the
entry list, the per-entry coverage, the ordering, or the effective batch size; any such value
submitted by a client SHALL be ignored.

The configured batch size is 5. Allocation SHALL return at most 5 entries per batch; a shorter
batch under honest exhaustion or contention is reported with its actual persisted size. The
configured size lives in the allocation configuration default (`BATCH_SIZE_DEFAULT = 5`) and
nowhere else.

The eligibility computation SHALL run inside the database in a versioned allocation function,
so the ordinary allocation path transfers neither the 4,800-entry pool nor the pool's response
rows to the application server. The pooled-completeness pillars SHALL exist in exactly one SQL
place inside that function, and SHALL be proven equal to the TypeScript definition by
exhaustive parity tests over every evaluation/correction/translation combination, single- and
multi-response: a fast allocator that classifies any entry differently is a failed allocator.

There SHALL be no coverage target, no independent-validation target, and no such setting in the
platform's configuration.

Eligibility is additionally scoped to the requesting attempt: an entry assigned to any existing
batch of the SAME attempt SHALL be excluded from a new batch for that attempt, whether or not a
response has been submitted for it. Assigned-but-unanswered entries are exactly the remainders of
the attempt's interrupted batches. A separate attempt's batches SHALL NOT exclude anything **by
themselves** — but an entry another attempt currently holds under an unexpired reservation SHALL
be excluded from everyone else's batches until that reservation expires or releases. Reservation
is exclusive, time-boxed, and arbitrated by the database; overlap between attempts without a
reservation is expected collection, never prevented.

A batch is completely allocated only when its entries are reserved: selection, batch persistence,
and reservation claims SHALL commit as one atomic unit from the requester's point of view, so a
second simultaneous request cannot observe or claim the same incomplete entry. The versioned
allocation function performs selection, claim (with bounded in-function backfill past denied
ids), and persistence in one transaction, which is what makes the atomicity real rather than
aspirational. When a claim round grants fewer entries than requested, selection SHALL run again
excluding granted ids, for at most two extra rounds; persistent contention SHALL collapse to
`exhausted` rather than to an empty batch.

Answering another batch after a passed checkpoint keeps the SAME attempt identity: no new
validator is minted because another batch was requested.

On the validation-start path defined in `validation-start`, the server SHALL return the batch
identifier plus the first entry to present, and SHALL NOT transfer the whole allocated entry
list to the client. Allocation still persists and reserves the full batch server-side; only the
start response is narrowed. The per-position next-entry path is unchanged and remains the way
later entries are reached.

> **The batch size of 10 is SUPERSEDED by this change, recorded rather than silently edited.**
> The earlier configuration allocated 10 entries per batch. The rule is otherwise unchanged;
> only the number moves from 10 to 5.

#### Scenario: A client cannot choose which entries it receives

- **WHEN** a client requests a batch and submits an entry list or an order
- **THEN** the batch returned is the one the server selected, and none of the submitted values
  influences which entries are in it or in what order

#### Scenario: A client cannot supply a coverage target

- **WHEN** a client requests a batch and submits a coverage or independent-validation target
- **THEN** the submitted value is rejected as an unrecognised input or ignored outright, and no
  allocation decision is derived from it, because no such setting exists

#### Scenario: An entry whose responses contribute no coverage stays in the pool

- **WHEN** an entry has three stored responses and none of them contributes a valid judgment or
  a covering translation
- **THEN** the entry remains eligible for allocation, and it is not treated as covered

#### Scenario: Pooled coverage retires the entry from allocation

- **WHEN** an entry's stored responses collectively cover the package
- **THEN** the entry is complete and normal allocation does not offer it again

#### Scenario: Further responses do not bring a retired entry back

- **WHEN** an entry that has already been offered to other attempts receives additional responses
- **THEN** it stays complete and stays out of the allocation pool

#### Scenario: An entry the validator already answered is not offered again

- **WHEN** a validator requests a batch and has already submitted a response for an entry
- **THEN** that entry is excluded from the batch offered to them

#### Scenario: An entry assigned to the attempt's own earlier batch is not offered again

- **WHEN** a validator requests a batch and an entry sits unanswered in an earlier batch of the
  SAME attempt
- **THEN** that entry is excluded from the new batch, and the earlier batch remains resumable
  through the recovery path rather than duplicated

#### Scenario: Another attempt's batches exclude nothing

- **WHEN** a validator requests a batch and an entry sits in another attempt's batch, answered
  or not, with no unexpired reservation behind it
- **THEN** that entry remains eligible for the requesting validator, and no cross-attempt
  exclusion is applied on account of the other batch alone

#### Scenario: Two simultaneous requests never share an incomplete entry

- **WHEN** two attempts request batches at the same time over a pool whose eligible entries
  overlap
- **THEN** no dataset entry appears in both granted batches, and the arbitration is performed
  by the database rather than by application read-then-write

#### Scenario: Contention shortens or exhausts honestly

- **WHEN** a claim round grants fewer entries than requested and bounded backfill still leaves
  the batch short
- **THEN** the requester receives the granted entries, or `exhausted` when none could be
  granted, and neither outcome is reported as a persistence failure

#### Scenario: Ordinary allocation transfers neither the pool nor its responses

- **WHEN** a validator requests a batch under normal conditions
- **THEN** the application server issues a bounded number of database round trips (profile
  read, allocation call, batch read-back, granted-entry projection) and does not read the
  4,800-entry pool or chunk the pool's responses through the application

#### Scenario: SQL and application completion never disagree

- **WHEN** any stored response combination is classified by both the allocation function and
  the TypeScript completion definition
- **THEN** both report the same complete/incomplete answer, as proven by the exhaustive
  parity suite rather than by inspection

#### Scenario: Allocation returns at most five entries

- **WHEN** a validator with no blocking state requests a batch from a healthy pool
- **THEN** the allocated batch holds at most 5 entries

#### Scenario: A short batch under exhaustion is honest

- **WHEN** the eligible pool holds fewer than 5 entries
- **THEN** the batch reports its actual persisted size and does not repeat entries to reach 5

#### Scenario: Same-attempt entries are never re-assigned

- **WHEN** an attempt that already answered or was assigned an entry requests another batch
- **THEN** that entry is excluded from the new batch

#### Scenario: Answering another batch keeps the same attempt

- **WHEN** a validator requests another batch after a passed checkpoint
- **THEN** the same attempt identity is used and no new validator is minted

#### Scenario: The start response carries one entry, not the batch

- **WHEN** a validator starts validation through the orchestration defined in `validation-start`
- **THEN** the response names the batch identifier and exactly one entry to present, and no
  second allocated entry's sentence, identifier, or position is transferred

#### Scenario: The narrowed start response changes nothing stored

- **WHEN** a batch is allocated through the orchestration
- **THEN** the persisted batch, its entries, and its reservations are identical to a batch
  allocated through the standalone allocation path
