# domain-contracts delta

## REMOVED Requirements

### Requirement: Evaluation, correction, and translation integrity rules

> **Why this requirement is removed rather than modified.** Three of its seven scenarios state
> behaviour the approved requirements reverse: `Translation is optional`, `Unsupported translation
> language is rejected`, and `Translation language requires text`. None can survive as written.
>
> A MODIFIED block replaces the requirement wholesale, and OpenSpec refuses an archive that would
> silently drop a scenario. The only tool-supported way to drop one is to remove the requirement
> that holds it. So the superseded requirement is recorded here **in full, verbatim**, and a
> replacement is added below. Nothing is rewritten as though the old requirement never existed: this
> block is the historical record of what it said, and the archive diff will show it being removed.

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

## ADDED Requirements

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
translation is non-empty; every domain, server, and database integrity check succeeds; and it
belongs to a distinct anonymous validator.

A response whose evaluation is `cannot_evaluate` SHALL NOT qualify. A partial response SHALL NOT
qualify. A stored response that predates the bilingual requirement and is missing either required
translation SHALL NOT qualify.

This definition SHALL be expressed once, as a pure function over the domain response type, and
SHALL be the only definition used by allocation, coverage reporting, and export. The raw count of
stored validation rows SHALL NOT be used as a proxy for coverage.

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
- **THEN** the entry has two qualifying completed validations, not three, and remains eligible for
  another validator

#### Scenario: Coverage is not the raw row count

- **WHEN** coverage for an entry is computed
- **THEN** it is computed from qualifying completed validations belonging to distinct validators,
  and a raw row count is never substituted for it
