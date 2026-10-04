# entry-completion Specification

## Purpose

States when a dataset entry is finished: one validation that establishes the complete bilingual
package completes it, nothing else does, and no consumer may reconstruct that from a raw count of
stored rows.

## Requirements

### Requirement: An entry is complete when its stored responses collectively cover the package

An entry SHALL be complete when its stored responses **collectively** hold all three of the
following, possibly across different responses:

1. at least one valid judgment: a response whose evaluation is `correct_natural`,
   `correct_unnatural`, or `incorrect`, with any Ilocano correction its evaluation requires
   present and non-blank;
2. at least one covering English translation: a non-blank English translation on any response;
3. at least one covering Filipino translation: a non-blank Filipino translation on any response.

Completion SHALL be a property of the **entry**, not of a count of attempts, and SHALL NOT be a
level on a scale. The platform SHALL report an entry as either complete or incomplete and SHALL NOT
report a fraction, a percentage, or a level of completeness for a single entry.

There SHALL be no three-validator target, no three-attempt target, and no configurable
independent-validation target. How many responses the coverage came from is a diagnostic, not the
definition of completion: an entry covered by one response and an entry covered by three are both
complete.

#### Scenario: Pooled coverage across responses completes an entry

- **WHEN** an entry holds one evaluable response with no translations, one English-only
  translation response, and one Filipino-only translation response
- **THEN** the entry is complete

#### Scenario: Further coverage does not make a complete entry less complete

- **WHEN** a complete entry receives further responses from other attempts
- **THEN** it remains complete, and no figure reports it as more complete than another entry with
  minimal pooled coverage

#### Scenario: There is no target to reach

- **WHEN** completion is computed for an entry
- **THEN** no comparison against a configured or fixed number of validators or attempts takes place,
  and the platform holds no independent-validation target setting

#### Scenario: An entry with no stored response is incomplete

- **WHEN** an entry has no stored validation response
- **THEN** it is incomplete

#### Scenario: A missing pillar leaves the entry incomplete

- **WHEN** an entry holds evaluable responses but no non-blank English translation on any of them
- **THEN** the entry is incomplete, however many responses it holds

### Requirement: A cannot-evaluate response contributes nothing toward coverage

A `cannot_evaluate` response SHALL contribute nothing toward coverage, because it carries neither
research translation. An entry SHALL NOT be completed by a `cannot_evaluate` response, and SHALL NOT
be completed by any number of them.

An entry whose only stored responses are `cannot_evaluate` SHALL remain incomplete and SHALL remain
eligible for assignment, however many responses it has received.

#### Scenario: A cannot-evaluate response leaves the entry incomplete

- **WHEN** an entry's only stored response has evaluation `cannot_evaluate`
- **THEN** the entry is incomplete

#### Scenario: Many cannot-evaluate responses still leave the entry incomplete

- **WHEN** an entry has several stored `cannot_evaluate` responses and no pooled coverage
- **THEN** the entry is still incomplete, and the number of responses received is not a reason to
  treat it otherwise

#### Scenario: An incomplete entry stays available for validation

- **WHEN** an entry is incomplete, however many non-covering responses it already holds
- **THEN** it remains eligible to be assigned for validation

#### Scenario: A judgment missing its required correction contributes nothing

- **WHEN** an entry's responses include an evaluable evaluation missing a correction its
  evaluation requires
- **THEN** that response is not a valid judgment, and the entry is incomplete unless other
  responses supply the coverage

### Requirement: Completion is derived from the shared pooled rule and never from a raw count

The complete-or-incomplete determination SHALL be derived from the platform's single shared pooled
coverage rule, applied to an entry's stored responses. The number of stored validation rows for an
entry SHALL NOT be used as a proxy for completion, and no consumer SHALL report an entry as
complete or incomplete by counting rows.

Every consumer that reports completion — allocation eligibility, dashboard figures, and export
status — SHALL agree about which entries are complete for the same corpus. They SHALL be compared by
running each over the same stored responses and asserting the results are equal, not by asserting
that they share a helper, because two modules can call the same predicate and still disagree about
which responses to include.

#### Scenario: A raw row count never decides completion

- **WHEN** an entry has many stored responses and none of them contributes coverage
- **THEN** the entry is incomplete, and the count of rows has no part in that determination

#### Scenario: Pooled coverage among many rows completes the entry

- **WHEN** an entry's stored responses collectively hold a valid judgment, a covering English
  translation, and a covering Filipino translation, alongside several non-contributing ones
- **THEN** the entry is complete, and the non-contributing responses neither delay nor reduce that

#### Scenario: Every consumer agrees on the same corpus

- **WHEN** allocation, the dashboard, and the export each classify the same entries from the same
  stored responses
- **THEN** each reports the same complete entries and the same incomplete entries
