# Spec Delta

## REMOVED Requirements

### Requirement: Batch entries are chosen on the server by qualifying coverage

> **Why this requirement is removed rather than modified.** Three of its six scenarios cannot
> survive as written: *Repeated qualifying responses from one validator count once*, *An entry at the
> coverage target leaves the allocation pool*, and *The coverage target is configuration rather than
> a fixed constant*. The first states a distinctness rule that only existed to serve a count of
> validators, and the other two name a coverage target the corrected methodology does not have.
>
> A `MODIFIED` block replaces a requirement wholesale, and `openspec change validate --strict`
> **refuses** a MODIFIED block that omits a scenario the current spec still has — measured on this
> change rather than assumed, which is why this is a REMOVED/ADDED pair and not a MODIFIED with a
> comment. The removed requirement is therefore recorded here **in full, verbatim**, and its
> replacement is added below. Nothing is rewritten as though the old requirement never existed.

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

> **Why this requirement is removed rather than modified.** Three of its five scenarios assert
> behaviour the approved requirement reverses: *The least-covered eligible entries are offered first*,
> *Entries with identical coverage are offered in a randomized order*, and *A partially filled
> lowest-coverage group does not shorten the batch*. All three presuppose a multi-valued coverage
> ordering, and under the corrected model every eligible entry is incomplete — the ordering would
> sort a single group and could prefer nothing. Its randomization requirement was doing real work
> independently of the target, and that part is carried into the replacement below rather than lost.

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

## ADDED Requirements

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