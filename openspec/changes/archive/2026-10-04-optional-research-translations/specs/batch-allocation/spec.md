# Spec Delta

## REMOVED Requirements

### Requirement: Batch entries are chosen on the server by entry completeness

> **Why this requirement is removed rather than modified.** Its pool scenarios
> are written in per-response qualifying language ("three stored responses
> and none of them is a qualifying completed validation", "a stored response
> that establishes the complete bilingual package"). Under pooled coverage
> those wordings cannot survive as written while server-authoritative choice,
> attempt scoping, exclusive reservation, atomic claims, and bounded backfill
> are unchanged. Recorded **in full, verbatim**, replaced below.

The platform SHALL determine a validator's batch entries on the server. Eligibility SHALL be derived
from each candidate entry's **completeness**, as defined by `entry-completion`: an entry is
eligible when no stored response for it establishes the complete bilingual package. The raw count of
stored validation rows SHALL NOT be used as a proxy for that determination, and the number of
qualifying validations behind an entry SHALL NOT decide eligibility. A client SHALL NOT supply the
entry list, the per-entry coverage, the ordering, or the effective batch size; any such value
submitted by a client SHALL be ignored.

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
second simultaneous request cannot observe or claim the same incomplete entry. When a claim
round grants fewer entries than requested, selection SHALL run again excluding granted ids, for
at most two extra rounds; persistent contention SHALL collapse to `exhausted` rather than to an
empty batch.

#### Scenario: A client cannot choose which entries it receives

- **WHEN** a client requests a batch and submits an entry list or an order
- **THEN** the batch returned is the one the server selected, and none of the submitted values
  influences which entries are in it or in what order

#### Scenario: A client cannot supply a coverage target

- **WHEN** a client requests a batch and submits a coverage or independent-validation target
- **THEN** the submitted value is rejected as an unrecognised input or ignored outright, and no
  allocation decision is derived from it, because no such setting exists

#### Scenario: An entry whose responses are all non-qualifying stays in the pool

- **WHEN** an entry has three stored responses and none of them establishes the complete package
- **THEN** the entry is incomplete, it remains eligible for allocation, and it is not treated as
  finished

#### Scenario: One qualifying response retires the entry from allocation

- **WHEN** an entry has a stored response that establishes the complete bilingual package
- **THEN** the entry is complete and normal allocation does not offer it again

#### Scenario: Further qualifying responses do not bring a retired entry back

- **WHEN** an entry that has already been offered to other attempts receives additional qualifying
  responses
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

## ADDED Requirements

### Requirement: Batch entries are chosen on the server by pooled entry completeness

The platform SHALL determine a validator's batch entries on the server. Eligibility SHALL be derived
from each candidate entry's **completeness**, as defined by `entry-completion`: an entry is
eligible while its stored responses do not yet collectively cover the package. The raw count of
stored validation rows SHALL NOT be used as a proxy for that determination, and no per-response
count behind an entry SHALL decide eligibility. A client SHALL NOT supply the
entry list, the per-entry coverage, the ordering, or the effective batch size; any such value
submitted by a client SHALL be ignored.

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
second simultaneous request cannot observe or claim the same incomplete entry. When a claim
round grants fewer entries than requested, selection SHALL run again excluding granted ids, for
at most two extra rounds; persistent contention SHALL collapse to `exhausted` rather than to an
empty batch.

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
