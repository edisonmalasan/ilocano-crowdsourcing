# researcher-dashboard Specification

## Purpose

Lets the research team monitor validation coverage and inspect per-entry responses from the
protected researcher area, using exactly the figures the thesis team approved.

## Requirements


### Requirement: Protected overview shows the approved figures

The protected researcher area SHALL show an overview with exactly the figures the thesis team
approved: total dataset entries, entries complete, entries incomplete, overall completion percentage,
total qualifying validations, total stored responses, cannot-evaluate responses, total attempts with
responses, evaluation distribution, proficiency breakdown, entries requiring researcher review,
entries holding more than one qualifying package, and late-arrival responses. The overview SHALL NOT
show placeholder figures: a number on the dashboard is a measurement over stored research data.

The interim list this requirement previously specified — totals, the partition, the percentage, and
the retained breakdowns without first-class abstention, raw, overlap, or lateness figures — is
replaced by the list above. An entry with one qualifying validation and an entry with forty are
still both complete and the platform still ranks neither; the new figures count responses and
packages, never levels of completeness for one entry.

#### Scenario: Overview shows every approved figure

- **WHEN** a researcher with a verified session opens the researcher area
- **THEN** the overview shows all thirteen approved figures, each computed from stored data

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

#### Scenario: Abstention and raw volume are first-class figures

- **WHEN** the overview is shown over a corpus holding cannot-evaluate responses among other rows
- **THEN** the cannot-evaluate figure equals the stored rows with that evaluation, and the raw
  figure equals all stored rows, and neither is derived from the other

### Requirement: Attempt counts are never person counts

Every figure that counts validators — total attempts with responses, the proficiency breakdown —
SHALL count distinct validator identifiers holding stored rows, and SHALL be defined as attempts,
never as people. No figure, label, hint, or export field SHALL present an attempt count as a
number of distinct human beings, and no screen SHALL tell a researcher how many people
participated.

#### Scenario: The headcount counts attempts with responses

- **WHEN** one attempt holds three stored responses and a second attempt holds one
- **THEN** the attempts figure is two, and the raw figure is four, and neither is labelled as
  persons

#### Scenario: No figure claims distinct humans

- **WHEN** the overview and its labels are examined
- **THEN** no figure is titled, hinted, or described as a count of people, participants, or
  distinct humans

### Requirement: Overlap and late arrivals are reported as diagnostics, not errors

The overview SHALL report the number of entries holding more than one qualifying package, and the
number of responses recorded after their entry's first qualifying response, each with the entry
identifiers behind it. An extra package is overlap from distinct attempts — the uniqueness
constraint makes same-attempt duplication impossible, so every extra package is a different
attempt's work. A late arrival is a response whose server-minted `createdAt` is after its entry's
first qualifying response — evidence of concurrent validation races, not of a fault.

Neither figure SHALL be presented as an error, a violation, or a quality score. Both SHALL be
computed by pure functions over stored rows, and both SHALL be zero — not absent — over a corpus
with no overlap or no late arrivals.

#### Scenario: Overlap names the entries holding extra packages

- **WHEN** an entry holds two qualifying packages from two attempts and the overview is shown
- **THEN** the overlap figure counts that entry once, and the entry is identified, and the entry
  is still reported complete rather than demoted

#### Scenario: Late arrivals are ordered by the server clock, not the client

- **WHEN** a response is stored after its entry already held a qualifying response
- **THEN** it counts as late exactly when its server-minted `createdAt` is after the entry's
  first qualifying response, regardless of when any client claims to have acted

#### Scenario: No overlap means zero, not an empty state that hides the figure

- **WHEN** no entry holds more than one qualifying package
- **THEN** the overlap figure reads zero and still names no entry, rather than the figure being
  withheld

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

### Requirement: Each entry can be inspected in full

For each dataset entry, a researcher SHALL be able to inspect the original Ilocano instruction,
origin, destination, transit mode, and every stored response with the validator's proficiency,
evaluation, correction, English translation, Filipino translation, and whether the response
qualifies toward coverage. A Double Transit Mode pair SHALL render as both modes (for example `jeepney + walking`), never as `[object Object]` and never as one mode. Corrections and translations SHALL be shown per validator, side by
side, and SHALL NOT be merged, voted, or collapsed. Proficiency SHALL be shown as stored
self-reported metadata, never as a score.

#### Scenario: Entry inspection shows source and every response

- **WHEN** a researcher opens an entry's review view
- **THEN** the original instruction, origin, destination, and transit mode are shown together
  with every stored response for that entry

#### Scenario: A Double Transit Mode pair renders both modes

- **WHEN** a researcher opens `DTM_1` carrying `["jeepney", "walking"]`
- **THEN** the transit-mode field shows both modes and discards neither

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

### Requirement: The dashboard offers the research export download

The authenticated researcher dashboard SHALL offer an "Export research data" action that starts the researcher export download for the current corpus. The action SHALL be visible only to signed researchers, inside the protected area, beside the coverage figures it summarizes.

#### Scenario: Signed researcher sees the export action

- **WHEN** an authenticated researcher views the dashboard
- **THEN** the export action is present, labelled as a download of the current research data

#### Scenario: The action starts a download, not a navigation

- **WHEN** the researcher invokes the export action
- **THEN** the browser receives the dated ZIP as a file download rather than a new page

### Requirement: Dashboard figures cover all active categories

Dashboard totals SHALL be derived over every active dataset entry regardless of category, and
completion SHALL be summarizable per category: total entries, per-category totals, per-category
completion, and the overall percentage. Responses SHALL be traceable to their category and
source-local id, and review links SHALL use globally unique canonical ids so entry 1 of one
category can never be confused with entry 1 of another. Per-category summaries SHALL include all six categories with 800 entries each.

#### Scenario: Totals reflect the full corpus

- **WHEN** the corpus holds 4,800 active entries across six categories with no responses
- **THEN** the dashboard derives 4,800 entries, 0 responses, 0 complete, 4,800 incomplete, and 0%

#### Scenario: Completion is summarized per category

- **WHEN** coverage exists in some categories and not others
- **THEN** each category reports its own total and complete count from the same shared rule, including Double Transit Mode

### Requirement: Dashboard figures cover the 4800-entry corpus

Dashboard totals SHALL be derived over all 4,800 active entries regardless of category:
4,800 entries, 0 responses, 0 complete, 4,800 incomplete, and 0% at pristine zero state.
Per-category totals SHALL be 800 each wherever per-category summaries are displayed, across all six categories.
Review links SHALL use globally unique canonical ids so `D_42` can never be confused with
`OD_42` or `DTM_42`.

#### Scenario: Totals reflect the full revised corpus

- **WHEN** the corpus holds 4,800 active entries across six categories with no responses
- **THEN** the dashboard derives 4,800 entries, 0 responses, 0 complete, 4,800 incomplete, and 0%
