# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
