# domain-contracts Specification

## Purpose
Defines the shared, category-agnostic domain vocabulary and validation contracts for the
platform — dataset entries, anonymous validator identity, Ilocano proficiency, the four
validation evaluations, conditional corrections, optional translations, and batch requests —
together with the pure integrity rules that the user interface and the server both obey.

## Requirements

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

### Requirement: Evaluation, correction, and bilingual translation integrity rules

A validation response SHALL consist of an evaluation, an optional corrected Ilocano sentence, an
optional English translation, and an optional Filipino translation. The presence of each translation
SHALL be determined by the evaluation rather than chosen freely. The following rules SHALL be
enforced by shared, pure domain logic that the user interface and the server both apply:

1. The allowed evaluations are exactly `correct_natural`, `correct_unnatural`, `incorrect`,
   and `cannot_evaluate`.
2. `correct_unnatural` and `incorrect` SHALL require a non-empty corrected Ilocano sentence.
3. `correct_natural` SHALL NOT carry a correction, and the original synthetic Ilocano instruction
   SHALL be the validated Ilocano sentence for that response.
4. `cannot_evaluate` SHALL NOT carry a correction, an English translation, or a Filipino
   translation.
5. Every evaluation other than `cannot_evaluate` SHALL carry a non-empty English translation and a
   non-empty Filipino translation. There SHALL be no way to submit an evaluable response with
   neither, with only one of them, or with a blank one.
6. A response SHALL NOT carry a translation-language discriminator. The languages are named by the
   fields that hold them, so a request naming an unsupported language is structurally
   unrepresentable rather than rejected at runtime.
7. Where a correction is present, both translations SHALL be understood as translations of the
   **corrected** sentence. A response is not required to state this, and neither translation SHALL
   be rejected merely for differing from the pre-correction wording.
8. Any other value outside the four allowed evaluations SHALL be rejected.

#### Scenario: Unnatural rating without a correction is rejected

- **WHEN** a response with evaluation `correct_unnatural` and no corrected sentence is
  submitted
- **THEN** validation fails and identifies the missing correction

#### Scenario: Incorrect rating requires a correction

- **WHEN** a response with evaluation `incorrect` and a whitespace-only corrected sentence is
  submitted
- **THEN** validation fails and identifies the correction as invalid

#### Scenario: Cannot-evaluate skips correction and both translations

- **WHEN** a response with evaluation `cannot_evaluate` is submitted with a corrected sentence, an
  English translation, or a Filipino translation
- **THEN** validation fails and identifies the offending field, and the same evaluation with none
  of the three is accepted

#### Scenario: An evaluable response without translations is rejected

- **WHEN** a response for evaluation `correct_natural` is submitted with no English translation and
  no Filipino translation
- **THEN** validation fails and identifies both translations as required, because an evaluable
  response is not submittable without them

#### Scenario: An evaluable response with only one translation is rejected

- **WHEN** a response for evaluation `correct_natural` is submitted with an English translation and
  no Filipino translation
- **THEN** validation fails and identifies the Filipino translation as required, because the pair is
  required together and neither is optional

#### Scenario: A blank translation is rejected

- **WHEN** a response supplies a whitespace-only English translation or a whitespace-only Filipino
  translation
- **THEN** validation fails and identifies that translation as required, because a present-but-blank
  value is not a translation

#### Scenario: A correction is never accepted where none is allowed

- **WHEN** a response with evaluation `correct_natural` is submitted with a corrected sentence
- **THEN** validation fails and identifies the correction as not accepted for that evaluation

#### Scenario: An incorrect rating with a correction and both translations is accepted

- **WHEN** a response supplies evaluation `incorrect`, a non-empty corrected sentence, and non-empty
  English and Filipino translations
- **THEN** validation succeeds

#### Scenario: An unrecognized evaluation is rejected

- **WHEN** a response supplies an evaluation value that is not one of the four allowed values
- **THEN** validation fails and identifies the evaluation as invalid

### Requirement: A qualifying completed validation is defined once and used everywhere

The platform SHALL define a **qualifying completed validation** as a stored response that satisfies
all of the following: its evaluation is `correct_natural`, `correct_unnatural`, or `incorrect`; any
required Ilocano correction is present; its English translation is non-empty; its Filipino
translation is non-empty; and every domain, server, and database integrity check succeeds.

A response whose evaluation is `cannot_evaluate` SHALL NOT qualify. A partial response SHALL NOT
qualify. A stored response that predates the bilingual requirement and is missing either required
translation SHALL NOT qualify.

This definition SHALL be expressed once, as a pure function over the domain response type, and
SHALL be the only definition used by allocation, coverage reporting, and export. The raw count of
stored validation rows SHALL NOT be used as a proxy for coverage.

Whether a **single** qualifying validation completes an entry is a separate question, and it is
answered by `entry-completion` rather than here. The clause this requirement previously carried —
that a qualifying validation "belongs to a distinct anonymous validator" — is **removed**, because
it described a property of a *count of validators* and the corrected methodology has no
validator-count target for it to serve. Distinctness is still enforced structurally, by the
uniqueness constraint over `(validator_id, dataset_entry_id)` recorded in the requirement below; it
is a property of the attempt, not of whether a response qualifies.

#### Scenario: A complete bilingual response qualifies

- **WHEN** a response has an evaluable evaluation, any required correction, and non-empty English
  and Filipino translations
- **THEN** it is a qualifying completed validation

#### Scenario: A cannot-evaluate response does not qualify

- **WHEN** a response has evaluation `cannot_evaluate` with no correction and no translations
- **THEN** it is stored as a research response where appropriate, and it is **not** a qualifying
  completed validation, and it does not advance coverage

#### Scenario: A response missing one translation does not qualify

- **WHEN** a stored response has an evaluable evaluation but is missing either required
  translation, as a legacy or incomplete record can be
- **THEN** it is not a qualifying completed validation, and it does not advance coverage

#### Scenario: Three raw responses are not three qualifying validations

- **WHEN** an entry has three stored responses of which only two are complete bilingual pairs
- **THEN** the entry has two qualifying completed validations, not three

> **The trailing clause "and remains eligible for another validator" is retracted by this change, and
> the retraction is a consequence rather than an edit of convenience.** Under the corrected rule an
> entry carrying a qualifying validation is complete, so an entry with two of them is complete and
> leaves the allocation pool. The clause was true only under the superseded target of three, where
> two was one short. Everything it asserted about the *count* — that three stored responses of which
> two qualify are two qualifying validations — is unchanged.

#### Scenario: Coverage is not the raw row count

- **WHEN** coverage for an entry is computed
- **THEN** it is computed from qualifying completed validations, and a raw row count is never
  substituted for it, and no figure derived from it decides whether the entry is complete

### Requirement: Validator must not validate the same entry twice

The platform SHALL treat "one anonymous validator holds at most one validation for a given dataset
entry" as a repository-level contract: a second insert for the same pair SHALL be surfaced as a
typed error naming the failed operation, and SHALL NOT be silently swallowed as a no-op, because
"already validated" is a meaningful outcome the service must be able to report to the validator.

The data-layer guarantee for this rule is a uniqueness constraint over the pair of validator and
dataset entry, enforced by the database independently of application code. That constraint exists:
`validations` carries a named uniqueness constraint over `(validator_id, dataset_entry_id)`, and
the constraint is exercised against a real PostgreSQL engine so a duplicate is rejected by the
database and not merely by an application check. The repository seam described above is what the
constraint sits behind, and a repository implementation surfaces a violation as a typed error
rather than absorbing it.

#### Scenario: A duplicate insert is surfaced as a named error, not a silent success

- **WHEN** a second validation is submitted for the same validator and the same dataset entry
- **THEN** the repository raises a typed error naming the insert operation, and the caller can
  distinguish that outcome from a transport failure and from a successful first insert

#### Scenario: Different validators may validate the same entry

- **WHEN** two different anonymous validators each submit a validation for the same dataset
  entry
- **THEN** neither insert is rejected as a duplicate of the other

#### Scenario: The at-most-once rule is not left to application code alone

- **WHEN** the uniqueness constraint over `(validator_id, dataset_entry_id)` is exercised against
  the database
- **THEN** a duplicate insert is rejected by the constraint itself, so the rule still holds if
  application code is bypassed, and the rejection is asserted in the PostgreSQL integration
  harness rather than only in an application test

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
