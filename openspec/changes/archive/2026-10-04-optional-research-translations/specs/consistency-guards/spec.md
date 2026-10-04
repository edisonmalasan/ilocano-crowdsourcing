# Spec Delta

## REMOVED Requirements

### Requirement: Independent consumers of the qualifying rule agree on one corpus

> **Why this requirement is removed rather than modified.** Its counts are
> per-response qualifying validations ("the same qualifying total",
> "zero qualifying validations"). Under pooled coverage the agreement is
> over pooled entry coverage and per-response contributions, so those
> scenarios cannot survive as written while the compare-by-running,
> validated-covers-complete, and disagreement-detection properties are
> unchanged. Recorded **in full, verbatim**, replaced below.

Given a single corpus of stored responses, every consumer that reports coverage SHALL report the same
qualifying total, the same partition of entries into complete and incomplete, the same number of
entries that are complete, and the same set of entries requiring researcher review. The three
consumers are the dashboard overview, the raw-export summary, and the validated dataset. Consumers
SHALL be compared by running them over the same inputs and asserting the results are equal, not by
asserting that they share a helper — two modules can call the same predicate and still disagree about
which responses to include, which side of the completion rule to place an entry on, or how to total
them. The validated dataset joins the comparison as a consumer: it SHALL cover exactly the entries
the other two call complete, no more and no fewer.

#### Scenario: Dashboard and export agree on the qualifying total

- **WHEN** the dashboard overview, the raw-export summary, and the validated dataset are computed
  from the same corpus
- **THEN** all three report the same total number of qualifying validations, and the validated
  dataset holds one record per complete entry

#### Scenario: Dashboard and export agree on the coverage-bucket distribution

- **WHEN** the dashboard overview, the raw-export summary, and the validated dataset are computed
  from the same corpus
- **THEN** the number of entries each places on the complete side and on the incomplete side is
  identical, the validated record count equals the complete count, and every figure is derived
  from the export's per-entry counts

#### Scenario: Dashboard and export agree on which entries need review

- **WHEN** the dashboard overview, the raw-export summary, and the validated dataset are computed
  from the same corpus
- **THEN** the set of entry identifiers each reports as requiring researcher review is identical,
  the validated records for those entries carry the review flag, and the number each reports as
  complete is identical

#### Scenario: Disagreement is detected, not assumed away

- **WHEN** one consumer's figures are altered so that it no longer matches the others
- **THEN** the consistency check fails, naming the figure that differs

#### Scenario: A corpus with no responses still agrees

- **WHEN** all three consumers are computed from a corpus holding no stored responses
- **THEN** all three report zero qualifying validations, no complete entries, no validated records,
  and no review flags

## ADDED Requirements

### Requirement: Independent consumers of the pooled rule agree on one corpus

Given a single corpus of stored responses, every consumer that reports coverage SHALL report the
same contribution counts, the same partition of entries into complete and incomplete, the same
number of entries that are complete, and the same set of entries requiring researcher review. The
three consumers are the dashboard overview, the raw-export summary, and the validated dataset.
Consumers SHALL be compared by running them over the same inputs and asserting the results are
equal, not by asserting that they share a helper — two modules can call the same predicate and
still disagree about which responses to include, which side of the completion rule to place an
entry on, or how to total them. The validated dataset joins the comparison as a consumer: it SHALL
cover exactly the entries the other two call complete, no more and no fewer.

#### Scenario: Dashboard and export agree on the contribution counts

- **WHEN** the dashboard overview, the raw-export summary, and the validated dataset are computed
  from the same corpus
- **THEN** all three report the same per-response contribution counts, and the validated
  dataset holds one record per complete entry

#### Scenario: Dashboard and export agree on the coverage-bucket distribution

- **WHEN** the dashboard overview, the raw-export summary, and the validated dataset are computed
  from the same corpus
- **THEN** the number of entries each places on the complete side and on the incomplete side is
  identical, the validated record count equals the complete count, and every figure is derived
  from the export's per-entry counts

#### Scenario: Dashboard and export agree on which entries need review

- **WHEN** the dashboard overview, the raw-export summary, and the validated dataset are computed
  from the same corpus
- **THEN** the set of entry identifiers each reports as requiring researcher review is identical,
  the validated records for those entries carry the review flag, and the number each reports as
  complete is identical

#### Scenario: Disagreement is detected, not assumed away

- **WHEN** one consumer's figures are altered so that it no longer matches the others
- **THEN** the consistency check fails, naming the figure that differs

#### Scenario: A corpus with no responses still agrees

- **WHEN** all three consumers are computed from a corpus holding no stored responses
- **THEN** all three report zero contributions, no complete entries, no validated records,
  and no review flags
