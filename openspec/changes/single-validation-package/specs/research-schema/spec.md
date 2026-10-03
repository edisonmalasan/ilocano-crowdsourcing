# Spec Delta

## MODIFIED Requirements

### Requirement: The database independently enforces research-integrity rules

The database SHALL enforce, by constraint rather than by application convention, that one
validator holds at most one validation for a given dataset entry; that every stored evaluation is
one of the four approved values; that every stored proficiency is one of the five approved values
or absent; that each stored translation is either present and non-blank or absent; and that a
stored correction is either present-and-non-empty or absent.

The database SHALL also enforce, on `batch_entries`, that a stored position is present and
greater than zero, and that no two entries of one batch share a position, so that a batch
order is total and no position is written twice. A position MAY be reused across two
different batches, because positions are scoped to a batch rather than being a global
sequence.

A stored response SHALL also be internally consistent, which a per-column constraint cannot
express. The database SHALL reject a response whose correction does not match its evaluation, and
SHALL reject a response whose English and Filipino translations are not both present-and-non-blank
for an evaluable evaluation or both absent for `cannot_evaluate`. These SHALL be enforced by
constraints written to match the domain integrity rules exactly — neither wider, which would refuse
a legitimate response, nor narrower, which would be dead weight that looks like a guarantee.

A constraint violation SHALL be surfaced to the caller as a typed error naming the failed
operation, and SHALL NOT be swallowed as a successful no-op.

**No migration is added by the corrected completion methodology.** Nothing in this requirement, and
nothing in the schema, encodes a number of validators or attempts that completes an entry, so there is
no stored state to correct and no constraint to relax. That was verified by reading every file under
`supabase/migrations/` rather than assumed, and the absence is recorded here so a later reader does
not go looking for a migration this change should have shipped.

#### Scenario: A second validation for the same pair is rejected by the database

- **WHEN** a second validation is inserted for the same validator and the same dataset entry
- **THEN** the database rejects the insert on the uniqueness constraint, independently of any
  application check, and the caller receives a typed error rather than a success

#### Scenario: Different validators may validate the same entry

- **WHEN** two different anonymous validators each insert a validation for the same dataset entry
- **THEN** both inserts succeed, because each attempt is independent and the platform preserves
  overlapping research responses for review

#### Scenario: The uniqueness constraint is asserted against a real database engine

- **WHEN** the migration set is applied and the constraint is exercised
- **THEN** a duplicate insert is rejected and a different validator's insert is accepted, proven
  by the PostgreSQL integration harness rather than only by an application test

#### Scenario: Only approved vocabulary is stored

- **WHEN** a validation or validator row is written with a value outside the approved vocabulary
- **THEN** the database rejects it, so an unapproved evaluation or proficiency label cannot enter
  the research record even if application validation is bypassed

#### Scenario: A correction is never written onto the dataset entry

- **WHEN** a validation carrying a corrected Ilocano version is stored
- **THEN** the corrected text is stored on the validation record, and the dataset entry's
  instruction is unchanged, because the imported synthetic instruction is immutable research
  material

#### Scenario: An evaluable response missing a translation is rejected

- **WHEN** a response with an evaluable evaluation is stored with no English translation, or with
  no Filipino translation
- **THEN** the database rejects it, because a response that cannot establish a completed package
  must never be stored as though it could

#### Scenario: A blank translation is rejected

- **WHEN** a response is stored with a whitespace-only English translation or a whitespace-only
  Filipino translation
- **THEN** the database rejects it, because a present-but-empty value satisfies a not-null check
  while carrying no translation

#### Scenario: A cannot-evaluate response carrying a translation is rejected

- **WHEN** a response with evaluation `cannot_evaluate` is stored with an English translation, a
  Filipino translation, or both
- **THEN** the database rejects it, because that response is not translatable and must not appear
  to carry research translations it does not have

#### Scenario: A correction where none is allowed is rejected

- **WHEN** a response with evaluation `correct_natural` is stored with a corrected sentence
- **THEN** the database rejects it, because the original instruction is the validated sentence for
  that response and a correction would contradict the stored evaluation

#### Scenario: A response that no column constraint can catch is still rejected

- **WHEN** a response supplies a correction where the evaluation does not take one, omits the
  correction where the evaluation requires one, or supplies only one of the two required
  translations
- **THEN** the database rejects it, because each of those combinations satisfies every per-column
  check and is still a record the domain schema refuses

#### Scenario: The consistency constraints do not refuse a legitimate response

- **WHEN** a response supplies a correction for an evaluation that requires one together with both
  translations, or supplies no correction and no translations for `cannot_evaluate`
- **THEN** the database accepts it, because a constraint stricter than the domain's rules would
  destroy real research responses, which is the worse of the two failure directions

#### Scenario: A batch entry with no position is rejected

- **WHEN** a `batch_entries` row is written with no position
- **THEN** the database rejects it, because an entry with no recorded position has no place in
  the order the server selected and the batch could not be replayed as the validator worked
  through it

#### Scenario: A position that is not positive is rejected

- **WHEN** a `batch_entries` row is written with position `0` or with a negative position
- **THEN** the database rejects it on `batch_entries_position_positive`, because positions are
  1-based and a zero or negative position cannot denote a place in a batch

#### Scenario: Position 1 is accepted, so the position constraint is not vacuous

- **WHEN** a `batch_entries` row is written with position `1`
- **THEN** the database accepts it, because a constraint that refused the first position would
  refuse every position and would look like a guarantee while enforcing nothing

#### Scenario: Two entries of one batch cannot share a position

- **WHEN** two `batch_entries` rows of the same batch are written carrying the same position
- **THEN** the database rejects the second on `batch_entries_batch_position_unique`, because a
  batch order that is not total is not an order

#### Scenario: One position may be reused across two different batches

- **WHEN** two `batch_entries` rows in two different batches are written carrying the same
  position
- **THEN** the database accepts both, because the constraint that protects one batch's order
  must not refuse two unrelated batches that happen to use the same number

#### Scenario: The position constraints are asserted against a real database engine

- **WHEN** the migration set is applied and each position constraint is exercised by name
- **THEN** a missing, zero, negative, or duplicated-within-a-batch position is rejected on the
  constraint that owns it, and position `1` and a position reused across two batches are
  accepted, proven by the PostgreSQL integration harness rather than only by an application
  test

### Requirement: The coverage and review queries the platform depends on are indexed

The schema SHALL provide the indexes that coverage-aware allocation and research review require:
per-entry and per-validator validation lookups, per-batch and per-entry assignment lookups, and
active entries by category. Indexes SHALL be created as part of a migration rather than
concurrently, because migrations run inside a transaction.

#### Scenario: Coverage counting for an entry is index-supported

- **WHEN** the qualifying responses for a dataset entry are read
- **THEN** the query is supported by an index on the entry reference, because the per-entry
  aggregate is recomputed for every candidate on every allocation request

#### Scenario: Entries eligible for allocation are index-supported

- **WHEN** the pool of active entries in a category is selected
- **THEN** the query is supported by a partial index restricted to active entries, so retired
  entries do not enlarge the pool