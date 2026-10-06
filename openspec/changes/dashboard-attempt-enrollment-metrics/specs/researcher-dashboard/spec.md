# Spec Delta

## MODIFIED Requirements

### Requirement: Protected overview shows the approved figures

The protected researcher area SHALL show an overview with exactly the figures the thesis team
approved: total dataset entries, entries complete, entries incomplete, overall completion percentage,
total qualifying validations, total stored responses, cannot-evaluate responses, enrolled attempts,
attempts with responses, zero-response attempts, evaluation distribution, proficiency breakdown,
entries requiring researcher review, entries holding more than one qualifying package, and
late-arrival responses. The overview SHALL NOT
show placeholder figures: a number on the dashboard is a measurement over stored research data.

The interim list this requirement previously specified — totals, the partition, the percentage, and
the retained breakdowns without first-class abstention, raw, overlap, or lateness figures — is
replaced by the list above. An entry with one qualifying validation and an entry with forty are
still both complete and the platform still ranks neither; the new figures count responses and
packages, never levels of completeness for one entry.

`attempts with responses` is the renamed `totalValidators`: distinct attempt identifiers holding
at least one stored response, identical value, clearer name. `enrolled attempts` counts every
stored attempt profile whether or not it ever responded. `zero-response attempts` counts enrolled
attempts with no stored response. The three satisfy `enrolled === withResponses + zeroResponse`,
derived from the stored row sets rather than from a counter.

#### Scenario: Overview shows every approved figure

- **WHEN** a researcher with a verified session opens the researcher area
- **THEN** the overview shows all fifteen approved figures, each computed from stored data

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

#### Scenario: Enrollment without a response is visible as a zero-response attempt

- **WHEN** one attempt profile exists and it has no validation response
- **THEN** enrolled attempts is 1, attempts with responses is 0, and zero-response attempts is 1

#### Scenario: Responding attempt leaves zero-response bucket

- **WHEN** two enrolled attempts exist and one of them has stored responses
- **THEN** enrolled attempts is 2, attempts with responses is 1, and zero-response attempts is 1

#### Scenario: Multiple responses count one attempt once

- **WHEN** one attempt owns five stored responses
- **THEN** attempts with responses is 1

#### Scenario: Partition invariant

- **WHEN** the three attempt figures are read together
- **THEN** enrolled attempts equals attempts with responses plus zero-response attempts

### Requirement: Attempt counts are never person counts

Every figure that counts validators — enrolled attempts, attempts with responses, zero-response
attempts, the proficiency breakdown —
SHALL count anonymous attempt identifiers, and SHALL be defined as attempts,
never as people. No figure, label, hint, or export field SHALL present an attempt count as a
number of distinct human beings, and no screen SHALL tell a researcher how many people
participated. The overview carries the subtle note "Attempts are anonymous study sessions, not
unique people." Zero-response attempts SHALL NOT be styled as an error: an enrolled attempt with
no response may simply have left before answering.

#### Scenario: The headcount counts attempts with responses

- **WHEN** one attempt holds three stored responses and a second attempt holds one
- **THEN** the attempts figure is two, and the raw figure is four, and neither is labelled as
  persons

#### Scenario: No figure claims distinct humans

- **WHEN** the overview and its labels are examined
- **THEN** no figure is titled, hinted, or described as a count of people, participants, unique
  users, unique validators, or distinct humans

#### Scenario: Attempt metrics are not person metrics

- **WHEN** the overview renders these figures
- **THEN** the copy uses attempt terminology and makes no claim about distinct humans
