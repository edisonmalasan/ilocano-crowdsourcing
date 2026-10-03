# Spec Delta

## MODIFIED Requirements

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