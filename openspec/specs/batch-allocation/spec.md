# batch-allocation Specification

## Purpose
Decides which dataset entries a validator is asked to judge next. Covers the server-authoritative
choice of a batch, the coverage metric that drives it, the randomization that keeps it fair, how
the choice is recorded, and how an exhausted pool is reported.

## Requirements

### Requirement: Batch entries are chosen on the server by qualifying coverage

The platform SHALL determine a validator's batch entries on the server. Eligibility and priority
SHALL be derived from each candidate entry's count of **qualifying completed validations** from
**distinct** validators, as defined by the platform's single qualifying-validation definition. The
raw count of stored validation rows SHALL NOT be used as a proxy for that number. A client SHALL
NOT supply the entry list, the per-entry coverage, the ordering, the coverage target, or the
effective batch size; any such value submitted by a client SHALL be ignored.

#### Scenario: A client cannot choose which entries it receives

- **WHEN** a client requests a batch and submits an entry list, an order, or a coverage target
- **THEN** the batch returned is the one the server selected, and none of the submitted values
  influences which entries are in it or in what order

#### Scenario: An entry whose responses are all non-qualifying stays in the pool

- **WHEN** an entry has three stored responses and none of them is a qualifying completed
  validation
- **THEN** the entry's coverage is zero, it remains eligible for allocation, and it is not treated
  as covered

#### Scenario: Repeated qualifying responses from one validator count once

- **WHEN** an entry's stored responses include qualifying validations attributable to fewer
  distinct validators than there are response rows
- **THEN** the entry's coverage is the number of distinct validators behind those qualifying
  responses, not the number of qualifying rows

#### Scenario: An entry at the coverage target leaves the allocation pool

- **WHEN** an entry's qualifying coverage has reached the configured independent-validation target
- **THEN** normal allocation does not offer that entry again

#### Scenario: The coverage target is configuration rather than a fixed constant

- **WHEN** the configured independent-validation target differs from its default
- **THEN** allocation compares coverage against the configured value, and no research parameter is
  hard-coded in the selection rule

#### Scenario: An entry the validator already answered is not offered again

- **WHEN** a validator requests a batch and has already submitted a response for an entry
- **THEN** that entry is excluded from the batch offered to them

### Requirement: The least-covered entries are offered first, and equal coverage is randomized

Among eligible entries the platform SHALL order candidates by ascending qualifying coverage, and
SHALL randomize candidates **within each group of entries sharing the same qualifying count**, so
that no entry is systematically preferred over another entry of identical coverage. The batch
SHALL be taken in that order, and SHALL reach past the lowest-coverage group only when the lower
groups cannot fill the requested size. The platform SHALL NOT draw randomness from an ambient
process-wide source inside the selection rule.

#### Scenario: The least-covered eligible entries are offered first

- **WHEN** eligible entries exist at several different coverage levels and the requested size is
  larger than the number at the lowest level
- **THEN** every entry at the lowest coverage level is included before any entry at a higher level

#### Scenario: Entries with identical coverage are offered in a randomized order

- **WHEN** several eligible entries share the same qualifying coverage
- **THEN** the order among them is randomized rather than fixed, so that one entry of that coverage
  is not repeatedly served first

#### Scenario: A partially filled lowest-coverage group does not shorten the batch

- **WHEN** fewer entries are at the lowest coverage level than the requested batch size, and further
  eligible entries exist at higher coverage levels
- **THEN** the batch is filled from the higher coverage levels to the requested size

#### Scenario: The batch is short only when the eligible pool is exhausted

- **WHEN** fewer eligible entries remain than the requested batch size
- **THEN** the batch contains all of the remaining eligible entries and no others

#### Scenario: The same inputs and the same supplied randomness produce the same order

- **WHEN** the same pool, coverage, configuration, and source of randomness are presented twice
- **THEN** the selected order is identical on both occasions

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
already answered by that validator or has reached the coverage target — the request SHALL be
reported as exhausted with no batch. Exhaustion SHALL be an outcome distinct both from a successful
allocation and from a persistence failure, and SHALL NOT be reported as a successful batch
containing no entries.

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
