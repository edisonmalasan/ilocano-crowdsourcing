# batch-allocation Specification

## Purpose
Decides which dataset entries a validator is asked to judge next. Covers the server-authoritative
choice of a batch, the coverage metric that drives it, the randomization that keeps it fair, how
the choice is recorded, and how an exhausted pool is reported.

## Requirements

### Requirement: Batch entries are chosen on the server by entry completeness

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
the attempt's interrupted batches. A separate attempt's batches SHALL NOT exclude anything:
attempts share the pool with no cross-attempt exclusion, and overlap between attempts is expected
collection, never prevented.

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
  or not
- **THEN** that entry remains eligible for the requesting validator, and no cross-attempt
  exclusion is applied

### Requirement: Eligible entries are offered in a randomized order

Among eligible entries the platform SHALL randomize the candidates, so that no entry is
systematically preferred over another. The batch SHALL be taken from the randomized order, and
SHALL be short only when the eligible pool cannot fill the requested size. The platform SHALL NOT
draw randomness from an ambient process-wide source inside the selection rule.

The ordering rule no longer sorts candidates by ascending qualifying coverage. Under the corrected
completion model every eligible entry is incomplete, so a least-covered-first ordering would sort a
single group and could not prefer anything over anything else. The randomization it also required is
retained, because that part was doing real work independently of the superseded target.

#### Scenario: Eligible entries are offered in a randomized order

- **WHEN** several eligible entries exist
- **THEN** the order among them is randomized rather than fixed, so that one entry is not
  repeatedly served first

#### Scenario: Randomization does not come from an ambient source

- **WHEN** the selection rule draws randomness
- **THEN** it uses the source the caller supplied, so the caller — and therefore a test — chooses
  where that randomness comes from

#### Scenario: The same inputs and the same supplied randomness produce the same order

- **WHEN** the same pool, configuration, and source of randomness are presented twice
- **THEN** the selected order is identical on both occasions

#### Scenario: The batch is short only when the eligible pool is exhausted

- **WHEN** fewer eligible entries remain than the requested batch size
- **THEN** the batch contains all of the remaining eligible entries and no others

### Requirement: A completed allocation is recorded as a batch with a server-derived order

A successful allocation SHALL persist a batch belonging to the requesting validator, and SHALL
record every selected entry against that batch with a 1-based position reflecting the order the
server selected. Positions SHALL be derived by the server from that order and SHALL NOT be accepted
from a client. An entry SHALL NOT be recorded more than once within a single batch. A batch the
platform reports SHALL contain at least one entry.

The data returned for an allocated batch SHALL be limited to what the requesting validator needs to
render it, and SHALL NOT include another validator's responses, another validator's screening
answer, or internal coverage figures.

#### Scenario: An allocation persists the batch and its entries

- **WHEN** an allocation selects entries for a validator
- **THEN** a batch belonging to that validator is persisted and each selected entry is recorded
  against it

#### Scenario: Entry position reflects the server-selected order

- **WHEN** an allocation persists its selected entries
- **THEN** each entry is recorded at the 1-based position it occupies in the order the server
  selected

#### Scenario: A client cannot dictate the batch order

- **WHEN** a client submits entry positions with a batch request
- **THEN** the persisted positions are the server-derived ones and the submitted positions are
  ignored

#### Scenario: No entry is recorded twice in one batch

- **WHEN** a batch is persisted
- **THEN** each dataset entry appears at most once among that batch's entries

#### Scenario: A failed allocation yields no batch

- **WHEN** persisting the allocation fails
- **THEN** the caller is not given a batch, and the failure is reported as a persistence failure
  rather than as an empty successful batch

#### Scenario: The batch result carries only what the validator needs

- **WHEN** an allocated batch is returned to the requesting validator
- **THEN** it carries the ordered entries and the fields needed to render them, and carries no other
  validator's response or screening answer and no internal coverage figures

### Requirement: An exhausted allocation pool is reported honestly

When no eligible entry remains for the requesting validator — because every remaining entry was
already answered by that validator, is already complete, or is assigned to that validator's own
earlier batches — the request SHALL be reported as exhausted with no batch. Exhaustion SHALL be
an outcome distinct both from a successful allocation and from a persistence failure, and SHALL
NOT be reported as a successful batch containing no entries.

An attempt whose every remaining entry is assigned-but-unanswered has exhausted *new* allocation:
the honest outcome is exhaustion with the interrupted batch resumable, not a fresh batch of
duplicates.

#### Scenario: Allocation never reports a batch with no entries

- **WHEN** an allocation completes successfully
- **THEN** the batch it reports contains at least one entry

#### Scenario: A validator who has exhausted the pool is told so

- **WHEN** a validator requests a batch and no eligible entry remains for them
- **THEN** the result reports an exhausted outcome and no batch

#### Scenario: Exhaustion is not reported as a persistence failure

- **WHEN** an allocation returns an exhausted outcome
- **THEN** the caller can distinguish it from a persistence failure, and from a successful
  allocation

#### Scenario: An attempt holding only its own remainders is exhausted, not duplicated

- **WHEN** a validator requests a batch and every incomplete, unanswered entry is already
  assigned to that validator's own earlier batches
- **THEN** the result reports an exhausted outcome and no batch, and the earlier batches remain
  resumable
