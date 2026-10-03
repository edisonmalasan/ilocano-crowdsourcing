# Spec Delta

## MODIFIED Requirements

### Requirement: Independent consumers of the qualifying rule agree on one corpus

Given a single corpus of stored responses, every consumer that reports coverage SHALL report the same
qualifying total, the same partition of entries into complete and incomplete, the same number of
entries that are complete, and the same set of entries requiring researcher review. Consumers SHALL
be compared by running them over the same inputs and asserting the results are equal, not by asserting
that they share a helper — two modules can call the same predicate and still disagree about which
responses to include, which side of the completion rule to place an entry on, or how to total them.

#### Scenario: Dashboard and export agree on the qualifying total

- **WHEN** the dashboard overview and the export summary are computed from the same corpus
- **THEN** they report the same total number of qualifying validations

#### Scenario: Dashboard and export agree on the coverage-bucket distribution

- **WHEN** the dashboard overview and the export summary are computed from the same corpus
- **THEN** the number of entries each places on the complete side and on the incomplete side is
  identical, derived from the export's per-entry counts

#### Scenario: Dashboard and export agree on which entries need review

- **WHEN** the dashboard overview and the export summary are computed from the same corpus
- **THEN** the set of entry identifiers each reports as requiring researcher review is identical, and
  the number each reports as complete is identical

#### Scenario: Disagreement is detected, not assumed away

- **WHEN** one consumer's figures are altered so that it no longer matches the other
- **THEN** the consistency check fails, naming the figure that differs

#### Scenario: A corpus with no responses still agrees

- **WHEN** both consumers are computed from a corpus holding no stored responses
- **THEN** both report zero qualifying validations, no complete entries, and no review flags