# domain-contracts Specification

## Purpose
Defines the shared, category-agnostic domain vocabulary and validation contracts for the
platform — dataset entries, anonymous validator identity, Ilocano proficiency, the four
validation evaluations, conditional corrections, optional translations, and batch requests —
together with the pure integrity rules that the user interface and the server both obey.

## Requirements

### Requirement: Category-agnostic dataset entry contract

A dataset entry SHALL be identified by a stable, externally meaningful canonical
source ID, a category, the synthetic instruction, and the intended information
for that category. The canonical ID SHALL have the strict form
`{prefix}_{suffix}` where the prefix is one of `D`, `DT`, `OD`, `ODT`, `CPE`
and the suffix is an integer 1..800 with no zero-padding and no global
renumbering: `D_1`, `DT_800`, `OD_124`, `ODT_63`, `CPE_700` are valid, while
`DO_0001`, `D_0001`, `D_0`, `D_801`, `DT_900`, `ODT_9999`, `XYZ_12`, and
`CPE_-1` are not. Parsing and validation SHALL share one canonical-ID helper
rather than scattering the rule across regexes, and research-facing order SHALL
be numeric by category then suffix rather than lexical. The contract SHALL
support categories beyond these five without requiring a schema or code change,
and the source synthetic instruction SHALL be immutable.

#### Scenario: Origin + Destination entry is accepted

- **WHEN** a record with ID `OD_124`, category `origin_destination`, an instruction, an origin,
  and a destination is validated
- **THEN** validation succeeds and yields a dataset entry preserving the exact source ID

#### Scenario: A zero-padded legacy id is rejected

- **WHEN** a record carries ID `OD_0001` or `D_0001`
- **THEN** validation fails, because canonical ids are never zero-padded and the previous
  revision's minted form is not a valid identity in this one

#### Scenario: An out-of-range suffix is rejected

- **WHEN** a record carries ID `D_0`, `D_801`, or `DT_900`
- **THEN** validation fails and identifies the id as invalid

#### Scenario: An unknown prefix is rejected

- **WHEN** a record carries ID `XYZ_12`
- **THEN** validation fails rather than inventing a category for it

#### Scenario: Numeric ordering beats lexical ordering

- **WHEN** canonical ids are ordered for research-facing output
- **THEN** `D_2` precedes `D_10`, because the suffix compares numerically rather than
  lexically

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

### Requirement: Evaluation, correction, and translation-choice integrity rules

A validation response SHALL consist of an evaluation, an optional corrected Ilocano sentence, an
optional English translation, and an optional Filipino translation. Which translations are
supplied SHALL be the validator's per-response choice — English, Filipino, both, or neither —
rather than determined by the evaluation. The following rules SHALL be enforced by shared, pure
domain logic that the user interface and the server both apply:

1. The allowed evaluations are exactly `correct_natural`, `correct_unnatural`, `incorrect`,
   and `cannot_evaluate`.
2. `correct_unnatural` and `incorrect` SHALL require a non-empty corrected Ilocano sentence.
3. `correct_natural` SHALL NOT carry a correction, and the original synthetic Ilocano instruction
   SHALL be the validated Ilocano sentence for that response.
4. `cannot_evaluate` SHALL NOT carry a correction, an English translation, or a Filipino
   translation, and SHALL NOT be offered a language choice.
5. Every translation a validator supplies SHALL be non-empty. A whitespace-only value is not a
   translation: it SHALL be refused, never stored as an empty translation, and never counted as
   covering its language.
6. A response SHALL NOT carry a translation-language discriminator. The languages are named by the
   fields that hold them, so a request naming an unsupported language is structurally
   unrepresentable rather than rejected at runtime.
7. Where a correction is present, each supplied translation SHALL be understood as a translation
   of the **corrected** sentence. A response is not required to state this, and no supplied
   translation SHALL be rejected merely for differing from the pre-correction wording.
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

#### Scenario: An evaluable response with a single chosen translation is accepted

- **WHEN** a response for evaluation `correct_natural` is submitted with a non-empty English
  translation and no Filipino translation, the validator having chosen English only
- **THEN** validation succeeds, and the response covers English for its entry

#### Scenario: An evaluable response with neither translation is accepted

- **WHEN** a response for evaluation `correct_natural` is submitted with no translations, the
  validator having chosen skip
- **THEN** validation succeeds, and the response contributes its judgment without covering
  either language

#### Scenario: A blank translation is rejected

- **WHEN** a response supplies a whitespace-only English translation or a whitespace-only Filipino
  translation
- **THEN** validation fails and identifies that translation as refused, because a present-but-blank
  value is not a translation

#### Scenario: A correction is never accepted where none is allowed

- **WHEN** a response with evaluation `correct_natural` is submitted with a corrected sentence
- **THEN** validation fails and identifies the correction as not accepted for that evaluation

#### Scenario: An incorrect rating with a correction and chosen translations is accepted

- **WHEN** a response supplies evaluation `incorrect`, a non-empty corrected sentence, and
  whatever translations its language choice supplies, each non-empty
- **THEN** validation succeeds

#### Scenario: An unrecognized evaluation is rejected

- **WHEN** a response supplies an evaluation value that is not one of the four allowed values
- **THEN** validation fails and identifies the evaluation as invalid

### Requirement: Pooled entry coverage is defined once and used everywhere

The platform SHALL define entry coverage over an entry's stored responses as three pooled facts:
whether at least one response is a **valid judgment** (an evaluable evaluation with any required
Ilocano correction present), whether at least one response carries a **covering English
translation** (non-blank), and whether at least one response carries a **covering Filipino
translation** (non-blank). A response whose evaluation is `cannot_evaluate` SHALL contribute
nothing toward any of the three.

This definition SHALL be expressed once, as pure functions over the domain response types, and
SHALL be the only definition used by allocation, coverage reporting, and export. The raw count of
stored validation rows SHALL NOT be used as a proxy for coverage.

Whether pooled coverage completes an entry is answered by `entry-completion` rather than here.
Distinctness is still enforced structurally, by the uniqueness constraint over
`(validator_id, dataset_entry_id)`; it is a property of the attempt, not of coverage.

#### Scenario: A valid judgment without translations contributes judgment only

- **WHEN** a response has an evaluable evaluation with any required correction and no translations
- **THEN** it counts as a valid judgment for its entry and covers neither language

#### Scenario: A cannot-evaluate response contributes nothing

- **WHEN** a response has evaluation `cannot_evaluate` with no correction and no translations
- **THEN** it contributes no judgment and no language coverage

#### Scenario: Three raw responses are not coverage of three pillars

- **WHEN** an entry has three stored responses of which one is a valid judgment, one carries a
  covering English translation, and one carries a covering Filipino translation
- **THEN** the entry's pooled coverage holds all three pillars, however the rows are counted

#### Scenario: Coverage is not the raw row count

- **WHEN** coverage for an entry is computed
- **THEN** it is computed from valid judgments and covering translations, and a raw row count is
  never substituted for it, and no figure derived from it decides whether the entry is complete

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
