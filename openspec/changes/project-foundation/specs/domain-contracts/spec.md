# Spec Delta

## Purpose

Defines the shared, category-agnostic domain vocabulary and validation contracts for the
platform — dataset entries, anonymous validator identity, Ilocano proficiency, the four
validation evaluations, conditional corrections, optional translations, and batch requests —
together with the pure integrity rules that the user interface and the server both obey.

## ADDED Requirements

### Requirement: Category-agnostic dataset entry contract

A dataset entry SHALL be identified by a stable, externally meaningful source ID (for example
`OD_0001`), a category, the synthetic instruction, and the intended information for that
category. The contract SHALL support categories beyond the first Origin + Destination category
without requiring a schema or code change, and the source synthetic instruction SHALL be
immutable.

#### Scenario: Origin + Destination entry is accepted

- **WHEN** a record with ID `OD_0001`, category `origin_destination`, an instruction, an origin,
  and a destination is validated
- **THEN** validation succeeds and yields a dataset entry preserving the exact source ID

#### Scenario: Instruction is required and non-empty

- **WHEN** a record is supplied with an empty or whitespace-only instruction
- **THEN** validation fails and identifies `instruction` as invalid

#### Scenario: Category is required

- **WHEN** a record is supplied without a category
- **THEN** validation fails and identifies `category` as required

#### Scenario: Unknown category is still representable

- **WHEN** a record is supplied with a category identifier that the platform has not seen
  before
- **THEN** validation succeeds, so importing a new category does not require a code change

#### Scenario: Optional fields accept an explicit null

- **WHEN** a record is supplied with an absent or `null` transit mode
- **THEN** validation succeeds and the entry represents "no transit mode" rather than
  rejecting the record

### Requirement: Source dataset is not mutated by validation

Submitting a correction SHALL NOT alter the imported synthetic instruction. A correction is
stored as separate response data attributed to a specific validator and entry.

#### Scenario: Correction is stored separately

- **WHEN** a validator submits a corrected Ilocano sentence for an entry
- **THEN** the dataset entry's instruction is unchanged and the correction is recorded as
  response data associated with that validator and entry

### Requirement: Ilocano proficiency screening contract

The platform SHALL offer exactly the approved screening question, "How comfortable are you
with Ilocano?", with the supporting copy "This helps us understand the background of our
validators.", and exactly these five choices: `Native / first-language speaker`, `Fluent`,
`Conversational`, `Basic`, and `Not confident`.

Proficiency SHALL be stored as self-reported research metadata. The platform SHALL NOT derive a
quality score, weight, or eligibility decision from proficiency, and SHALL NOT expose a
proficiency-derived score anywhere in the public experience.

#### Scenario: All five choices are valid

- **WHEN** each of the five screening choices is submitted
- **THEN** each is accepted as a valid proficiency value and maps to a stable machine-readable
  identifier

#### Scenario: Only approved choices are accepted

- **WHEN** a proficiency value outside the five approved choices is submitted
- **THEN** validation fails

#### Scenario: No derived score is produced

- **WHEN** a validator profile is produced from a screening answer
- **THEN** the profile contains no numeric score, rank, weight, or eligibility flag derived
  from proficiency

### Requirement: Evaluation, correction, and translation integrity rules

A validation response SHALL consist of an evaluation, an optional corrected Ilocano sentence,
and an optional translation. The following rules SHALL be enforced by shared, pure domain logic
that the user interface and the server both apply:

1. The allowed evaluations are exactly `correct_natural`, `correct_unnatural`, `incorrect`,
   and `cannot_evaluate`.
2. `correct_unnatural` and `incorrect` SHALL require a non-empty corrected Ilocano sentence.
3. `correct_natural` SHALL NOT carry a correction.
4. `cannot_evaluate` SHALL NOT carry a correction and SHALL NOT carry a translation.
5. A translation, when present, SHALL have a language of exactly `english` or `filipino`, and
   SHALL be accompanied by non-empty translation text.
6. A translation SHALL be accepted only for evaluations other than `cannot_evaluate`.
7. Any other value outside the four allowed evaluations SHALL be rejected.

#### Scenario: Unnatural rating without a correction is rejected

- **WHEN** a response with evaluation `correct_unnatural` and no corrected sentence is
  submitted
- **THEN** validation fails and identifies the missing correction

#### Scenario: Incorrect rating requires a correction

- **WHEN** a response with evaluation `incorrect` and a whitespace-only corrected sentence is
  submitted
- **THEN** validation fails and identifies the correction as invalid

#### Scenario: Cannot-evaluate skips correction and translation

- **WHEN** a response with evaluation `cannot_evaluate` is submitted with a corrected sentence
  or with a translation
- **THEN** validation fails, and the same evaluation with neither field is accepted

#### Scenario: Translation is optional

- **WHEN** a response for evaluation `correct_natural` is submitted with no translation
- **THEN** validation succeeds

#### Scenario: Unsupported translation language is rejected

- **WHEN** a response supplies a translation language of `spanish`
- **THEN** validation fails and identifies the language as invalid

#### Scenario: Translation language requires text

- **WHEN** a response supplies a translation language of `english` with empty translation text
- **THEN** validation fails and identifies the translation text as required

#### Scenario: Unrecognized evaluation is rejected

- **WHEN** a response supplies an evaluation value that is not one of the four allowed values
- **THEN** validation fails and identifies the evaluation as invalid

### Requirement: Validator must not validate the same entry twice

The platform SHALL guarantee at the data layer that a single anonymous validator holds at most
one validation for a given dataset entry, expressed as a uniqueness constraint over the pair of
validator and dataset entry.

#### Scenario: Duplicate validation is rejected by the data layer

- **WHEN** a second validation is attempted for the same validator and the same dataset entry
- **THEN** the attempt is rejected by the uniqueness constraint, independently of application
  code

#### Scenario: Different validators may validate the same entry

- **WHEN** two different anonymous validators each submit a validation for the same dataset
  entry
- **THEN** both validations are accepted

### Requirement: Batch request contract

A batch request SHALL identify the anonymous validator and request up to the configured batch
size of entries. The batch size SHALL be configurable and SHALL default to 10.

#### Scenario: Default batch size

- **WHEN** no batch size is configured
- **THEN** the effective batch size is 10

#### Scenario: Requested size is capped at the configured maximum

- **WHEN** a batch request asks for more entries than the configured maximum
- **THEN** the effective batch size is reduced to the configured maximum rather than accepted

#### Scenario: Non-positive or over-maximum configuration is rejected

- **WHEN** the configured batch size is zero, negative, or exceeds the hard upper bound
- **THEN** configuration validation fails and names the setting as invalid

### Requirement: Anonymous validator identity carries no personal data

An anonymous validator identifier SHALL be a non-identifying opaque token. The validator
profile contract SHALL NOT provide a field for full name, email address, student ID, phone
number, address, or social-media account.

#### Scenario: Profile has no identifying field

- **WHEN** the anonymous validator profile is inspected
- **THEN** it exposes an identifier, the self-reported proficiency, and activity timestamps,
  and exposes no personally identifying field

#### Scenario: Identifier format is opaque

- **WHEN** an anonymous validator identifier is generated
- **THEN** it is an opaque token derived from cryptographic randomness and contains no
  personally meaningful component
