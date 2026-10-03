# researcher-dashboard Specification

## Purpose

Lets the research team monitor validation coverage and inspect per-entry responses from the
protected researcher area, using exactly the figures the thesis team approved.

## Requirements


### Requirement: Protected overview shows the approved figures

The protected researcher area SHALL show an overview with exactly the figures the thesis team
approved: total dataset entries, entries complete, entries incomplete, overall completion percentage,
total qualifying validations, total validators, evaluation distribution, proficiency breakdown, and
entries requiring researcher review. The overview SHALL NOT show placeholder figures: a number on the
dashboard is a measurement over stored research data.

The 0/1/2/3 coverage ladder this requirement previously specified — "entries with 0 qualifying
validations, entries with 1, entries with 2, entries with 3 (coverage complete)" — is **removed**,
and so is the scenario asserting "all eleven approved figures". Under the corrected methodology every
eligible entry is incomplete and a single qualifying validation completes it, so a ladder whose rungs
are named by count has no rungs to name: an entry with one qualifying validation and an entry with
forty are both complete and the platform does not rank them.

The **remaining approved figure list** — total, complete, incomplete, percentage, plus the retained
figures — is installed by the separate `completion-metrics-and-export` change. This requirement
specifies the behaviour the figures must have; it does not add the duplicate and concurrency
diagnostics or the raw-response count that change owns.

#### Scenario: Overview shows every approved figure

- **WHEN** a researcher with a verified session opens the researcher area
- **THEN** the overview shows the approved figures, each computed from stored data

#### Scenario: No placeholders

- **WHEN** the underlying data for a figure is absent (for example zero validators so far)
- **THEN** the dashboard shows a real zero or an explicit empty state, never a sample value

#### Scenario: Overview is unreachable without a session

- **WHEN** the overview is requested without a verified session
- **THEN** the existing access-boundary refusal answers, and no figure is served

#### Scenario: No figure reports a level of completeness for one entry

- **WHEN** the overview reports an entry's standing
- **THEN** it reports that entry as complete or incomplete, and reports no fraction, percentage, or
  ladder position for it

### Requirement: Coverage figures are computed from qualifying validations

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

### Requirement: Each entry can be inspected in full

For each dataset entry, a researcher SHALL be able to inspect the original Ilocano instruction,
origin, destination, transit mode, and every stored response with the validator's proficiency,
evaluation, correction, English translation, Filipino translation, and whether the response
qualifies toward coverage. Corrections and translations SHALL be shown per validator, side by
side, and SHALL NOT be merged, voted, or collapsed. Proficiency SHALL be shown as stored
self-reported metadata, never as a score.

#### Scenario: Entry inspection shows source and every response

- **WHEN** a researcher opens an entry's review view
- **THEN** the original instruction, origin, destination, and transit mode are shown together
  with every stored response for that entry

#### Scenario: Each response shows its research content separately

- **WHEN** a response is shown
- **THEN** the validator's proficiency, evaluation, correction (when supplied), English
  translation, Filipino translation, and qualifying-toward-coverage status are each shown as
  that validator's own values

#### Scenario: Non-qualifying responses say why not

- **WHEN** a shown response does not qualify toward coverage
- **THEN** the view states that it does not qualify and why (unevaluable, missing correction,
  or missing translation)

### Requirement: The dashboard performs no writes

The dashboard SHALL be read-only. No dashboard route, component, or module SHALL write a dataset
entry, a validation, a validator, or any research record, and no dashboard module SHALL expose a
Server Action that mutates research data.

#### Scenario: Dashboard modules expose no research-data mutation

- **WHEN** the dashboard's modules are examined
- **THEN** none imports a repository write path for research data and none defines a Server
  Action that writes research records
