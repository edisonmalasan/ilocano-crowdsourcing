# batch-allocation Specification

## Purpose
Decides which dataset entries a validator is asked to judge next. Covers the server-authoritative
choice of a batch, the coverage metric that drives it, the randomization that keeps it fair, how
the choice is recorded, and how an exhausted pool is reported.

## Requirements

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
already answered by that validator, is already complete, is assigned to that validator's own
earlier batches, or is reserved by another attempt — the request SHALL be reported as exhausted
with no batch. Exhaustion SHALL be an outcome distinct both from a successful allocation and
from a persistence failure, and SHALL NOT be reported as a successful batch containing no
entries.

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

### Requirement: Allocation requires a recorded proficiency answer

A batch SHALL NOT be allocated to a validator whose profile records no
Ilocano proficiency answer. When the requesting validator exists but the
profile carries no answer, allocation SHALL report `{status: "failed",
reason: "screening_required"}` — after the validator-exists check and before
any pool read — with no batch persisted, no entry reserved, and no response
row touched. The refusal is a methodology enforcement, not a fault, and SHALL
NOT be reported as `exhausted` (the pool is not empty) or as `persistence`
(nothing failed).

Profiles without an answer are rows created before proficiency became
required. They remain valid rows: the refusal fabricates no value for them,
backfills nothing, and imposes no retroactive constraint. Batches allocated
to such attempts before this rule existed drain normally — responses already
submitted are research data, and refusing them would destroy it.

#### Scenario: A requester with no recorded answer is refused without reading the pool

- **WHEN** a validator whose profile records no proficiency requests a batch
- **THEN** the outcome is `failed` with reason `screening_required`, and the
  only repository read performed is the validator-profile read

#### Scenario: The refusal persists and reserves nothing

- **WHEN** allocation refuses for a missing proficiency answer
- **THEN** no batch row, no batch-entry row, and no reservation row is created
  for the request

#### Scenario: A requester with any approved answer is unaffected

- **WHEN** a validator whose profile records one of the five approved choices
  requests a batch
- **THEN** allocation proceeds exactly as without this requirement, and the
  answer's value influences nothing about which entries are offered

#### Scenario: Batches allocated before the rule drain normally

- **WHEN** a validator works through a batch allocated before this requirement
  existed
- **THEN** per-entry submission proceeds under the rules in force for those
  responses, and the gate applies only to new allocation

### Requirement: Allocation draws from one shared pool across all active categories

Allocation SHALL consider every active entry regardless of category, with all existing
guarantees intact: completed entries excluded, no same canonical entry twice to one attempt,
active reservations exclusive with TTL reclaim, `cannot_evaluate` never completing, and honest
short batches. Two entries sharing a source-local id under different categories SHALL be two
distinct allocatable entries by canonical id and SHALL coexist safely.

#### Scenario: Same local id in two categories allocates independently

- **WHEN** the pool holds entries with the same source-local id under different categories
- **THEN** both are eligible by their canonical ids, assignment of one never blocks or answers
  the other, and the at-most-once rule applies per canonical id

### Requirement: Five same-suffix entries across categories allocate independently

`D_42`, `DT_42`, `OD_42`, `ODT_42`, and `CPE_42` SHALL be five distinct allocatable
entries by canonical id. Assignment of one SHALL never block or answer another, and the
at-most-once rule SHALL apply per canonical id. All existing guarantees — completed
entries excluded, active reservations exclusive with TTL reclaim, `cannot_evaluate`
never completing, honest short batches — SHALL hold unchanged over all 4,000 entries.

#### Scenario: Same numeric suffix in five categories allocates independently

- **WHEN** the pool holds the five `*_42` entries and one attempt answers `OD_42`
- **THEN** a later allocation may still offer the other four, and never offers `OD_42`
  again to that attempt

### Requirement: Allocation-scale reads hold at 4000 entries

Whole-pool and id-filtered reads SHALL serve the 4,000-entry corpus through the same
bounded mechanisms proven at 3,000: paged whole-pool reads past the per-request cap
with per-page count agreement, and id filters chunked rather than issued as one giant
`.in()`. Growing the corpus SHALL NOT reintroduce truncation or refusal failures.

#### Scenario: A corpus larger than the response cap still allocates

- **WHEN** allocation reads a pool larger than one PostgREST response
- **THEN** every active entry is considered exactly once, or the read refuses loudly
  rather than serving a short pool
