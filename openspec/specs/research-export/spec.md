# researcher-dashboard Specification

## Purpose

Lets the research team take the collected validation data out of the platform as research-ready
documents, with every validator's own words preserved separately and no disagreement silently
resolved.

## Requirements


### Requirement: Each validator's research text is exported separately and unmerged

The export SHALL include every stored validation response as its own record. For each record the
English translation and the Filipino translation SHALL appear as two distinct fields, each holding
the text that validator submitted, alongside the evaluation, the corrected Ilocano when one was
supplied, the dataset entry, and the validator's self-reported Ilocano proficiency. The export
SHALL NOT combine validators' translations, corrections, or evaluations into a single merged or
consensus value, SHALL NOT majority-vote, and SHALL NOT select a preferred response on the research
team's behalf.

#### Scenario: Each validator's translations are separate fields

- **WHEN** three validators answer the same entry, each with their own English and Filipino text
- **THEN** the export contains three records, and each record's English and Filipino fields hold that
  validator's own submission

#### Scenario: No field merges validators' text

- **WHEN** the export is examined
- **THEN** no field anywhere in it contains text contributed by more than one validator

#### Scenario: Disagreement is exported, not resolved

- **WHEN** the validators' evaluations or corrections differ for one entry
- **THEN** every differing response appears in the export and none is chosen over another

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

### Requirement: Dataset categories are preserved

The export SHALL record the category of every dataset entry it includes, and the summary SHALL be
grouped by category, so that a consumer can select one category's data without inferring it. The
export SHALL NOT assume a single category, and SHALL NOT treat a category's absent optional fields as
a defect.

#### Scenario: Records carry their category

- **WHEN** entries from more than one category are exported
- **THEN** every record names its category and the summary reports per-category totals

### Requirement: JSON and CSV forms are both produced and both round-trip

The export SHALL produce a JSON document and a CSV rendering of the validations. The CSV SHALL quote
any field containing a comma, a double quote, or a newline, and escape an embedded double quote, so
that a translation containing punctuation or a line break survives the round trip unchanged. The two
forms SHALL describe the same records, and no field SHALL be dropped from the CSV to make quoting
easier.

#### Scenario: A translation containing commas and quotes round-trips

- **WHEN** a validator's text contains a comma, a double quote, and a newline
- **THEN** the CSV field is quoted, the embedded quote is doubled, and parsing the CSV returns the
  original text unchanged

#### Scenario: Both forms describe the same records

- **WHEN** the JSON and CSV exports are compared
- **THEN** they contain the same number of records and the same per-record values

### Requirement: The export is an operator command and performs no research-data write

The export SHALL run as an operator command and SHALL NOT be reachable from an HTTP route, a Server
Action, or a page. It SHALL NOT write, update, or delete any dataset entry, validation, validator, or
other research record; it reads the corpus and writes only its own output files. Its destination
SHALL be supplied by the operator, and a refusal to write SHALL be reported rather than silently
producing a partial artifact.

#### Scenario: No request path can trigger an export

- **WHEN** the application's routes, Server Actions, and pages are examined
- **THEN** none of them invokes the export, and the export exists only as a command

#### Scenario: The export writes no research row

- **WHEN** the export runs
- **THEN** it performs no insert, update, or delete against a research table, and its only writes
  are its own output files

#### Scenario: An unwritable destination is reported

- **WHEN** the export cannot write its output
- **THEN** it reports the failure with the destination it was given, and does not report success
