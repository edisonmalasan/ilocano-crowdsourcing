# research-schema delta

## MODIFIED Requirements

### Requirement: The database independently enforces research-integrity rules

The database SHALL enforce, by constraint rather than by application convention, that one
validator holds at most one validation for a given dataset entry; that every stored evaluation is
one of the four approved values; that every stored proficiency is one of the five approved values
or absent; that each stored translation is either present and non-blank or absent; and that a
stored correction is either present-and-non-empty or absent.

A stored response SHALL also be internally consistent, which a per-column constraint cannot
express. The database SHALL reject a response whose correction does not match its evaluation, and
SHALL reject a response whose English and Filipino translations are not both present-and-non-blank
for an evaluable evaluation or both absent for `cannot_evaluate`. These SHALL be enforced by
constraints written to match the domain integrity rules exactly — neither wider, which would refuse
a legitimate response, nor narrower, which would be dead weight that looks like a guarantee.

A constraint violation SHALL be surfaced to the caller as a typed error naming the failed
operation, and SHALL NOT be swallowed as a successful no-op.

#### Scenario: A second validation for the same pair is rejected by the database

- **WHEN** a second validation is inserted for the same validator and the same dataset entry
- **THEN** the database rejects the insert on the uniqueness constraint, independently of any
  application check, and the caller receives a typed error rather than a success

#### Scenario: Different validators may validate the same entry

- **WHEN** two different anonymous validators each insert a validation for the same dataset entry
- **THEN** both inserts succeed, because coverage depends on independent validators

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
- **THEN** the database rejects it, because a response that cannot be counted toward coverage must
  never be stored as though it could

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

## ADDED Requirements

### Requirement: The bilingual representation replaces the single optional translation

The `validations` table SHALL store an English translation and a Filipino translation in two
explicit columns, and SHALL NOT store a translation-language discriminator. The previous
`translation_language` and `translation_text` columns SHALL be removed by a **forward** migration.
No existing migration file SHALL be modified, and no archived specification SHALL be rewritten as
though the previous requirement had never existed.

The forward migration SHALL first verify that no pre-existing evaluable validation exists, and
SHALL refuse to apply with a raised exception naming the reason if one does. It SHALL NOT delete or
quarantine those rows, SHALL NOT fabricate translations to satisfy the new constraints, and SHALL
NOT weaken the new constraints to accommodate them.

When the check passes, every pre-existing row is a `cannot_evaluate` row, which under the previous
schema carried no translation data, so removing the superseded columns discards nothing. The check
SHALL therefore run **before** the columns are removed, and that ordering SHALL NOT be reversed.

#### Scenario: The migration refuses to apply over pre-existing evaluable rows

- **WHEN** the forward migration is applied to a database holding a validation whose evaluation is
  not `cannot_evaluate`
- **THEN** the migration fails with a raised exception that names the conflict, and no column is
  added, removed, or weakened

#### Scenario: The migration applies cleanly to an empty or cannot-evaluate-only table

- **WHEN** the forward migration is applied to a database whose only validations, if any, have
  evaluation `cannot_evaluate`
- **THEN** the migration succeeds, the two translation columns exist, and the superseded columns no
  longer exist

#### Scenario: The refusal is proven, not assumed

- **WHEN** a violating row is seeded and the migration set is applied
- **THEN** the integration harness observes the failure on the named precondition, so the
  migration's safety claim is exercised rather than merely documented

#### Scenario: Migration history is not rewritten

- **WHEN** the change is reviewed
- **THEN** the existing research-schema migration file is byte-identical to its state before this
  change, and the new behaviour is carried by a newly added forward migration
