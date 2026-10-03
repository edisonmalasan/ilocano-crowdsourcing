# Spec Delta

## REMOVED Requirements

### Requirement: Coverage and review status are exported per entry

> **Why this requirement is removed rather than modified.** One of its two scenarios — *The coverage
> target travels with the data* — **cannot be satisfied** under the corrected methodology rather than
> merely describing it badly. It requires that an entry marked coverage-complete carry the target that
> figure was computed against, but there is no target: completeness is a predicate, so the field
> could only ever carry a constant, and a consumer invited to check its records against a constant is
> being invited to conclude something false. A `MODIFIED` block cannot delete that scenario — the
> validator refuses a `MODIFIED` requirement that omits a scenario the current spec still has,
> measured on this change rather than assumed — so the whole requirement is recorded here verbatim
> and replaced below.
>
> Nothing else is lost. Its second scenario, *Review status matches the review rule*, is carried into
> the replacement unchanged in substance, because that rule is untouched by this change.

For each dataset entry the export SHALL include whether its coverage is complete against the
configured coverage target, the target itself, whether the entry requires researcher review, and the
counts of distinct validators behind those figures. The coverage-complete flag SHALL be computed
against the same configured target allocation uses, not against a number written into the export.

#### Scenario: The coverage target travels with the data

- **WHEN** an exported entry is marked coverage-complete
- **THEN** the export also carries the coverage target that figure was computed against

#### Scenario: Review status matches the review rule

- **WHEN** an entry is marked as requiring researcher review
- **THEN** it is flagged by the same rule the dashboard uses — evaluation disagreement among
  qualifying responses or more than one distinct correction — and never for translation wording

## MODIFIED Requirements

### Requirement: Qualifying and non-qualifying responses are reported distinctly

The export SHALL state, per dataset entry and in aggregate, how many stored responses qualify, how
many do not, and how many responses are stored in total. A qualifying count SHALL be computed by the
single shared domain definition of qualifying, never by a second rule written for the export, and a
`cannot_evaluate` response, a partial response, and a response missing either required translation
SHALL each count as non-qualifying. Every exported response SHALL carry its own
qualifying-toward-completion flag so the counts can be recomputed from the export itself.

These counts are **diagnostics, not progress toward a target**. The export SHALL NOT present a
qualifying count as a fraction of a goal, and SHALL NOT imply that a higher qualifying count is a
more complete entry.

#### Scenario: Qualifying counts use the shared definition

- **WHEN** an entry's responses are summarised
- **THEN** the qualifying count equals the count produced by the shared qualifying rule, and no
  export-specific rule decides it

#### Scenario: A non-qualifying response is marked as such

- **WHEN** a stored response does not qualify
- **THEN** that response's record carries a qualifying-toward-completion flag of false, and the
  entry's summary counts it in the non-qualifying total rather than the qualifying total

#### Scenario: Counts are recomputable from the export

- **WHEN** the per-entry totals in the summary are compared with the records in the validations
  export
- **THEN** every summary total equals the count of exported records that produce it

## ADDED Requirements

### Requirement: Completion and review status are exported per entry

For each dataset entry the export SHALL include whether the entry is complete, as decided by
`entry-completion`, and whether the entry requires researcher review. The complete flag SHALL be
computed from the same shared rule allocation and the dashboard use, not from a rule written for the
export and not from a count compared against a number.

The export SHALL NOT carry a coverage target, a required validator count, or any other figure
against which a consumer is invited to compare the complete flag.

#### Scenario: Completion is computed from the shared rule

- **WHEN** an entry's complete flag is exported
- **THEN** it equals what the shared completion rule returns for that entry's stored responses, and
  the export writes no comparison against any target

#### Scenario: A complete entry carries no target to be checked against

- **WHEN** an exported entry is marked complete
- **THEN** no field in the export states a target, a required validator count, or a threshold the
  flag was computed against

#### Scenario: Review status matches the review rule

- **WHEN** an entry is marked as requiring researcher review
- **THEN** it is flagged by the same rule the dashboard uses — evaluation disagreement among
  qualifying responses or more than one distinct correction — and never for translation wording

#### Scenario: An incomplete entry with many responses is still incomplete

- **WHEN** an entry whose stored responses are all non-qualifying is exported
- **THEN** it is marked incomplete, and the number of responses it holds does not appear as progress
  toward completion