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

### Requirement: Coverage contributions are reported distinctly per response

The export SHALL state, per dataset entry and in aggregate, how many stored responses contribute
a valid judgment, how many carry a covering English translation, how many carry a covering
Filipino translation, and how many responses are stored in total. Each count SHALL be computed by
the single shared pooled-coverage definition, never by a second rule written for the export, and
a `cannot_evaluate` response SHALL contribute to none of the three. Every exported response SHALL
carry its own contribution flags so the counts can be recomputed from the export itself.

These counts are **diagnostics, not progress toward a target**. The export SHALL NOT present a
coverage count as a fraction of a goal, and SHALL NOT imply that higher coverage counts are a
more complete entry.

#### Scenario: Coverage counts use the shared definition

- **WHEN** an entry's responses are summarised
- **THEN** each count equals the count produced by the shared pooled-coverage rule, and no
  export-specific rule decides it

#### Scenario: A non-contributing response is marked as such

- **WHEN** a stored response contributes no judgment and no covering translation
- **THEN** that response's record carries contribution flags of false, and the entry's summary
  counts it outside the covering totals rather than inside them

#### Scenario: Counts are recomputable from the export

- **WHEN** the per-entry totals in the summary are compared with the records in the validations
  export
- **THEN** every summary total equals the count of exported records that produce it

### Requirement: Pooled completion and review status are exported per entry

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
- **THEN** it is flagged by the same rule the dashboard uses — evaluation disagreement among the
  entry's valid judgments or more than one distinct correction — and never for translation wording

#### Scenario: An incomplete entry with many responses is still incomplete

- **WHEN** an entry whose stored responses contribute no pooled coverage is exported
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

### Requirement: The export run produces the raw and validated documents

One operator run SHALL write five files into the operator's destination: `validations.json` and
`validations.csv` (every stored response as its own record, unchanged shape), `summary.json`
(per-entry and aggregate counts, unchanged shape), plus `validated-dataset.json` and
`validated-dataset.csv` (one record per complete entry, derived). Incomplete entries appear in
the raw documents and are absent from the validated ones. The run SHALL refuse an unwritable
destination rather than producing a partial set, and SHALL report all five file names on success
so a missing document is noticed rather than assumed.

The two documents answer different questions and SHALL be labelled as such: the raw document is
what validators said, disagreements preserved; the validated document is the mechanical
derivation defined below, pending thesis-approved adjudication. Neither SHALL present the other
as redundant, and no consumer SHALL be told the validated document is adjudicated.

#### Scenario: One run writes all five files

- **WHEN** the export runs over a corpus with complete and incomplete entries
- **THEN** the destination holds all five named files, the raw pair describes every stored
  response, and the validated pair describes exactly the complete entries

#### Scenario: Incomplete entries are absent from the validated document, not zero-filled

- **WHEN** an entry holds no qualifying response
- **THEN** no record for it appears in either validated file, and the summary states how many
  entries were omitted for that reason

#### Scenario: A partial write is refused, not completed

- **WHEN** the destination cannot receive all five files
- **THEN** the run reports the destination and does not report success

### Requirement: A validated record is assembled per field from the earliest covering sources

For each complete entry the export SHALL derive exactly one validated record with exactly these
fields: `id` (the source entry id), `validated_ilocano` (the correction from the earliest valid
judgment that required one, otherwise the source instruction), `english_translation` (the earliest
non-blank English translation on the entry's responses), `filipino_translation` (the earliest
non-blank Filipino translation on the entry's responses), `output` (the entry's `origin`,
`destination`, and `transit_mode`), `source_validation_id` (the response id that supplied
`validated_ilocano`, the provenance link back to the raw record), and `needs_review` (the shared
review flag for the entry, additionally true whenever the record's fields come from more than one
response). Earliest SHALL mean by server-minted `createdAt`, ties broken by smallest validation
id and stated as arbitrary and carrying no meaning.

No vote SHALL be taken, no responses SHALL be merged into consensus wording, and no preferred
validator SHALL be selected: earliest-per-field-by-server-clock is a mechanical rule, stated in
the open, and not a judgment about which response is best. The final adjudication rule belongs to
the thesis team; the export assembles and flags, never resolves. The validated document SHALL
state its derivation rule in its own header or accompanying summary field, so no reader mistakes
a derived record for an adjudicated one.

The record SHALL NOT carry a validator or attempt identifier. Authorship is preserved per record
in the raw document; re-exporting attempt ids into the validated artifact would invite reading
them as endorsements by persons.

#### Scenario: The validated sentence is the correction where one was required

- **WHEN** the earliest valid judgment carries evaluation `incorrect` with a corrected sentence
- **THEN** `validated_ilocano` is that correction

#### Scenario: The validated sentence is the source instruction where none was required

- **WHEN** the earliest valid judgment carries evaluation `correct_natural` with no correction
- **THEN** `validated_ilocano` is the entry's source instruction, byte-identical, and the source
  entry is unchanged

#### Scenario: Translations come from their earliest suppliers

- **WHEN** the earliest English translation sits on a later response than the validated-Ilocano
  supplier
- **THEN** the record carries that later response's English text, the record's fields name more
  than one source, and `needs_review` is true

#### Scenario: A timestamp tie is flagged and decided arbitrarily in the open

- **WHEN** an entry's covering sources share the same server-minted `createdAt`
- **THEN** `needs_review` is true, the record derives from the smallest validation id among the
  tied suppliers, and the derivation rule states that the tie-break carries no meaning

#### Scenario: Both validated forms describe the same records

- **WHEN** the JSON and CSV validated documents are compared
- **THEN** they contain the same records with the same values, quoted so that translations
  containing commas, quotes, or newlines round-trip unchanged
