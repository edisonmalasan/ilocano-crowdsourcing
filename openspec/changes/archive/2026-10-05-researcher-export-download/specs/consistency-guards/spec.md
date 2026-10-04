# Spec Delta

## REMOVED Requirements

### Requirement: Independent consumers of the pooled rule agree on one corpus

> **Why this requirement is removed rather than modified.** Its consumer list
> and two scenarios name exactly three consumers. The web export joins as a
> fourth reader of the same builders, so the count and the named scenarios
> cannot survive as written while compare-by-running, validated-covers-complete,
> and disagreement-detection are unchanged. Recorded **in full, verbatim**,
> replaced below.

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

## ADDED Requirements

### Requirement: Independent consumers of the pooled rule agree on one corpus, web export included

Given a single corpus of stored responses, every consumer that reports coverage SHALL report the
same contribution counts, the same partition of entries into complete and incomplete, the same
number of entries that are complete, and the same set of entries requiring researcher review. The
four consumers are the dashboard overview, the raw-export summary, the validated dataset, and the
web export download. Consumers SHALL be compared by running them over the same inputs and
asserting the results are equal, not by asserting that they share a helper — two modules can
call the same predicate and still disagree about which responses to include, which side of the
completion rule to place an entry on, or how to total them. The validated dataset joins the
comparison as a consumer: it SHALL cover exactly the entries the other two call complete, no
more and no fewer. The web export joins as a reader, not a fifth definition: it SHALL reuse the
same builders, so its agreement is by construction and its test asserts byte-equivalence with
the operator documents.

#### Scenario: Dashboard and export agree on the contribution counts, web included

- **WHEN** the dashboard overview, the raw-export summary, the validated dataset, and the web
  export are computed from the same corpus
- **THEN** all four agree on the per-response contribution counts, and the validated
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

- **WHEN** all four consumers are computed from a corpus holding no stored responses
- **THEN** all four report zero contributions, no complete entries, no validated records,
  and no review flags
