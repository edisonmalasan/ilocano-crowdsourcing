# Spec Delta

## REMOVED Requirements

### Requirement: Evaluation, correction, and bilingual translation integrity rules

> **Why this requirement is removed rather than modified.** Rule 5 and three
> of its scenarios require both translations together for every evaluable
> response. Under per-response language choice a single-translation response
> is legitimate, so those cannot survive as written while the evaluation set,
> the correction rules, the `cannot_evaluate` exclusions, and the no-discriminator
> rule are unchanged. Recorded **in full, verbatim**, replaced below.

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

> **Why this requirement is removed rather than modified.** The per-response
> qualifying package — evaluation plus required correction plus both
> translations — no longer exists: translations are chosen per response, so
> coverage is entry-level and pooled. The no-validator-target clauses and the
> single-definition property are unchanged and still hold. Recorded **in full,
> verbatim**, replaced below.

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

## ADDED Requirements

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
