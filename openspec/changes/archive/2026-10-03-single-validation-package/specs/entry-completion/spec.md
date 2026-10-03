# Spec Delta

## Purpose

States when a dataset entry is finished: one validation that establishes the complete bilingual
package completes it, nothing else does, and no consumer may reconstruct that from a raw count of
stored rows.

## ADDED Requirements

### Requirement: A dataset entry is complete when one validation establishes the package

A dataset entry SHALL be complete when **at least one** of its stored validation responses
establishes the complete package. A response establishes that package when all of the following
hold:

1. its evaluation is `correct_natural`, `correct_unnatural`, or `incorrect`;
2. any Ilocano correction its evaluation requires is present and non-blank;
3. its English research translation is present and non-blank;
4. its Filipino research translation is present and non-blank;
5. every domain, server, and database integrity check on the stored response succeeds.

Completion SHALL be a property of the **entry**, not of a count of attempts, and SHALL NOT be a
level on a scale. The platform SHALL report an entry as either complete or incomplete and SHALL NOT
report a fraction, a percentage, or a level of completeness for a single entry.

There SHALL be no three-validator target, no three-attempt target, and no configurable
independent-validation target. The number of qualifying validations behind a complete entry is a
diagnostic, not the definition of completion: an entry with one qualifying validation and an entry
with fifty are both complete.

#### Scenario: One qualifying response completes an entry

- **WHEN** an entry has one stored response whose evaluation is evaluable, whose required correction
  is present, and whose English and Filipino research translations are both non-blank
- **THEN** the entry is complete

#### Scenario: A second qualifying response does not make a complete entry less complete

- **WHEN** a complete entry receives further qualifying responses from other attempts
- **THEN** it remains complete, and no figure reports it as more complete than another entry with a
  single qualifying response

#### Scenario: There is no target to reach

- **WHEN** completion is computed for an entry
- **THEN** no comparison against a configured or fixed number of validators or attempts takes place,
  and the platform holds no independent-validation target setting

#### Scenario: An entry with no stored response is incomplete

- **WHEN** an entry has no stored validation response
- **THEN** it is incomplete

### Requirement: A cannot-evaluate response never completes an entry

A `cannot_evaluate` response SHALL NOT establish the complete package, because it carries neither
research translation. An entry SHALL NOT be completed by a `cannot_evaluate` response, and SHALL NOT
be completed by any number of them.

An entry whose only stored responses are `cannot_evaluate` SHALL remain incomplete and SHALL remain
eligible for assignment, however many responses it has received. The same SHALL hold for an entry
whose only responses are partial or are missing either required translation.

#### Scenario: A cannot-evaluate response leaves the entry incomplete

- **WHEN** an entry's only stored response has evaluation `cannot_evaluate`
- **THEN** the entry is incomplete

#### Scenario: Many cannot-evaluate responses still leave the entry incomplete

- **WHEN** an entry has several stored `cannot_evaluate` responses and none that establishes the
  package
- **THEN** the entry is still incomplete, and the number of responses received is not a reason to
  treat it otherwise

#### Scenario: An incomplete entry stays available for validation

- **WHEN** an entry is incomplete, however many non-qualifying responses it already holds
- **THEN** it remains eligible to be assigned for validation

#### Scenario: A partial response is not a completed package

- **WHEN** an entry's responses include one that is missing either required translation, or is
  missing a correction its evaluation requires
- **THEN** the entry is incomplete

### Requirement: Completion is derived from the shared qualifying rule and never from a raw count

The complete-or-incomplete determination SHALL be derived from the platform's single shared
qualifying-validation definition, applied to an entry's stored responses. The number of stored
validation rows for an entry SHALL NOT be used as a proxy for completion, and no consumer SHALL
report an entry as complete or incomplete by counting rows.

Every consumer that reports completion — allocation eligibility, dashboard figures, and export
status — SHALL agree about which entries are complete for the same corpus. They SHALL be compared by
running each over the same stored responses and asserting the results are equal, not by asserting
that they share a helper, because two modules can call the same predicate and still disagree about
which responses to include.

#### Scenario: A raw row count never decides completion

- **WHEN** an entry has many stored responses and none of them qualifies
- **THEN** the entry is incomplete, and the count of rows has no part in that determination

#### Scenario: One qualifying row among many completes the entry

- **WHEN** an entry's stored responses include one qualifying response and several non-qualifying
  ones
- **THEN** the entry is complete, and the non-qualifying responses neither delay nor reduce that

#### Scenario: Every consumer agrees on the same corpus

- **WHEN** allocation, the dashboard, and the export each classify the same entries from the same
  stored responses
- **THEN** each reports the same complete entries and the same incomplete entries