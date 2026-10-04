# Spec Delta

## REMOVED Requirements

### Requirement: Coverage figures are computed from qualifying validations

> **Why this requirement is removed rather than modified.** Every figure is
> defined over per-response qualifying validations, and two scenarios pin
> single-response qualification ("One qualifying response makes the entry
> complete", "many stored responses of which none qualifies"). Under pooled
> coverage no single response qualifies an entry, so those scenarios cannot
> survive as written while the no-raw-count property, the stated denominator,
> and the distribution breakdowns are unchanged. Recorded **in full, verbatim**,
> replaced below.

Every completion figure SHALL be computed from qualifying validations as defined by the shared
domain rule and combined by the rule in `entry-completion`, never from raw row counts. An entry
SHALL be counted complete when at least one of its stored responses establishes the complete
bilingual package, and SHALL be counted incomplete otherwise, however many responses it holds.

Overall completion percentage SHALL be the share of dataset entries that are complete out of all
dataset entries. A `cannot_evaluate` response, a partial response, and a response missing either
translation SHALL contribute zero toward completeness and SHALL leave their entry incomplete.

#### Scenario: Raw rows do not inflate coverage

- **WHEN** an entry holds many stored responses of which none qualifies
- **THEN** the entry is counted incomplete, and the overall percentage excludes it from the
  numerator, and the count of rows has no part in the determination

#### Scenario: One qualifying response makes the entry complete

- **WHEN** an entry holds exactly one qualifying response among several stored responses
- **THEN** the entry is counted complete, and the non-qualifying responses do not make it less
  complete

#### Scenario: Coverage percentage has a stated denominator

- **WHEN** the overall completion percentage is shown
- **THEN** it equals complete entries divided by total dataset entries

#### Scenario: Evaluation distribution counts responses, proficiency breakdown counts validators

- **WHEN** the distribution and breakdown are shown
- **THEN** the evaluation distribution counts stored responses by evaluation value, and the
  proficiency breakdown counts validators by self-reported proficiency, and neither is derived
  from the other

### Requirement: Entries requiring researcher review are flagged by rule

> **Why this requirement is removed rather than modified.** Its subject is
> "the qualifying validators" and "qualifying responses" — a per-response
> qualifying class that no longer exists. The flag rule itself (evaluation
> or correction disagreement flags; translation wording never does) is
> unchanged, so the replacement rewords the subject and keeps the rule.
> Recorded **in full, verbatim**, replaced below.

An entry SHALL be flagged as requiring researcher review when the qualifying validators do not
all give the same evaluation, or when more than one distinct corrected Ilocano version was
submitted among the responses. Differences in English or Filipino wording alone SHALL NEVER flag
an entry, because multiple natural translations may be valid. The flag SHALL be computed from
stored responses by a pure rule, not by majority vote and not by collapsing corrections or
translations.

#### Scenario: Evaluation disagreement flags the entry

- **WHEN** the qualifying responses for an entry carry different evaluation values
- **THEN** the entry is flagged as requiring researcher review

#### Scenario: Multiple distinct corrections flag the entry

- **WHEN** the responses for an entry submit more than one distinct corrected Ilocano version
- **THEN** the entry is flagged as requiring researcher review, even when all evaluations agree

#### Scenario: Translation wording alone never flags

- **WHEN** the qualifying responses agree on evaluation and correction (or need no correction)
  but differ in English or Filipino wording
- **THEN** the entry is not flagged on that account

#### Scenario: Agreement without correction does not flag

- **WHEN** all qualifying responses agree on evaluation and no correction was required or more
  than one submitted
- **THEN** the entry is not flagged

## ADDED Requirements

### Requirement: Coverage figures are computed from pooled coverage

Every completion figure SHALL be computed from pooled entry coverage as defined by the shared
domain rule and combined by the rule in `entry-completion`, never from raw row counts. An entry
SHALL be counted complete when its stored responses collectively cover the package, and SHALL be
counted incomplete otherwise, however many responses it holds.

Overall completion percentage SHALL be the share of dataset entries that are complete out of all
dataset entries. A `cannot_evaluate` response SHALL contribute zero toward completeness, and so
SHALL any response that contributes no judgment and no covering translation.

#### Scenario: Raw rows do not inflate coverage

- **WHEN** an entry holds many stored responses of which none contributes coverage
- **THEN** the entry is counted incomplete, and the overall percentage excludes it from the
  numerator, and the count of rows has no part in the determination

#### Scenario: Pooled coverage across responses makes the entry complete

- **WHEN** an entry holds stored responses that collectively cover the package
- **THEN** the entry is counted complete, and the non-contributing responses do not make it less
  complete

#### Scenario: Coverage percentage has a stated denominator

- **WHEN** the overall completion percentage is shown
- **THEN** it equals complete entries divided by total dataset entries

#### Scenario: Evaluation distribution counts responses, proficiency breakdown counts validators

- **WHEN** the distribution and breakdown are shown
- **THEN** the evaluation distribution counts stored responses by evaluation value, and the
  proficiency breakdown counts validators by self-reported proficiency, and neither is derived
  from the other

### Requirement: Entries are flagged for researcher review by disagreement among valid judgments

An entry SHALL be flagged as requiring researcher review when the entry's valid judgments do not
all give the same evaluation, or when more than one distinct corrected Ilocano version was
submitted among the responses. Differences in English or Filipino wording alone SHALL NEVER flag
an entry, because multiple natural translations may be valid. The flag SHALL be computed from
stored responses by a pure rule, not by majority vote and not by collapsing corrections or
translations.

#### Scenario: Evaluation disagreement flags the entry

- **WHEN** the valid judgments for an entry carry different evaluation values
- **THEN** the entry is flagged as requiring researcher review

#### Scenario: Multiple distinct corrections flag the entry

- **WHEN** the responses for an entry submit more than one distinct corrected Ilocano version
- **THEN** the entry is flagged as requiring researcher review, even when all evaluations agree

#### Scenario: Translation wording alone never flags

- **WHEN** the entry's valid judgments agree on evaluation and correction (or need no correction)
  but differ in English or Filipino wording
- **THEN** the entry is not flagged on that account

#### Scenario: Agreement without correction does not flag

- **WHEN** all valid judgments agree on evaluation and no correction was required
- **THEN** the entry is not flagged
