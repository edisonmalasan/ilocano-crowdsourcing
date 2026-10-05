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

The export SHALL record the category of every dataset entry it includes, and
the summary SHALL be grouped by category, so that a consumer can select one
category's data without inferring it. Every category reference SHALL carry the
numeric `category_id` (1..6 in file order) alongside the slug and the
human-readable name. Research-facing record order SHALL be numeric: by
`category_id`, then by the canonical id's numeric suffix — never lexical, so
`D_2` precedes `D_10` and `DTM_2` precedes `DTM_10`. The export SHALL NOT assume a single category, and
SHALL NOT treat a category's absent optional fields as a defect.

#### Scenario: Records carry their category

- **WHEN** entries from more than one category are exported
- **THEN** every record names its category triple and the summary reports per-category totals

#### Scenario: Records sort numerically within their category

- **WHEN** a category's records are listed in JSON or CSV
- **THEN** they appear ordered by numeric suffix, so `D_2` precedes `D_10` and `DTM_2` precedes `DTM_10`

### Requirement: JSON and CSV forms are both produced and both round-trip

The export SHALL produce JSON documents grouped by category and flat CSV
renderings. `validations.json` SHALL group responses under their six
categories in `category_id` order; `validated-dataset.json` SHALL group
validated records the same way beneath its derivation block, with Double Transit Mode `output.transit_mode` carried as an ordered two-element JSON array. Grouped JSON
records SHALL NOT repeat the enclosing category triple. The CSV SHALL quote
any field containing a comma, a double quote, or a newline, and escape an
embedded double quote, so that a translation containing punctuation or a line
break survives the round trip unchanged. A Double Transit Mode validated CSV cell SHALL carry the compact JSON form `["jeepney","walking"]` (order-preserved; never `jeepney, walking` or `jeepney / walking`), scalars stay bare labels, and parsing the CSV SHALL reconstruct the exact ordered pair. The grouped and flat forms SHALL
carry equivalent research information: every JSON record's fields appear as
CSV cells under the same names plus the enclosing group's category triple,
and no field SHALL be dropped from the CSV to make quoting easier.

#### Scenario: A translation containing commas and quotes round-trips

- **WHEN** a validator's text contains a comma, a double quote, and a newline
- **THEN** the CSV field is quoted, the embedded quote is doubled, and parsing the CSV returns the
  original text unchanged

#### Scenario: Both forms describe the same records

- **WHEN** the JSON and CSV exports are compared
- **THEN** they contain the same number of records and the same per-record values, with the
  category triple recovered from the enclosing JSON group

#### Scenario: A Double Transit Mode pair round-trips through CSV

- **WHEN** a validated DTM record with `["jeepney", "walking"]` is serialized to CSV and parsed back
- **THEN** the pair is exactly `["jeepney", "walking"]` in order, never a single mode and never an ambiguous split

#### Scenario: All six categories appear even when empty

- **WHEN** the export runs over a corpus with no responses
- **THEN** both JSON documents still carry all six category groups in `category_id` order,
  with empty record arrays

### Requirement: The export runs as an operator command and as one authenticated download, and performs no research-data write

The export SHALL run as an operator command, and SHALL additionally be downloadable through exactly
one authenticated request path: the researcher export download, available only to a signed
researcher session. No public route, no Server Action, and no validator-facing page SHALL invoke
the export. It SHALL NOT write, update, or delete any dataset entry, validation, validator, or
other research record; it reads the corpus and emits only its own artifacts. Its command
destination SHALL be supplied by the operator, and a refusal to write SHALL be reported rather
than silently producing a partial artifact.

#### Scenario: Exactly one request path serves the export

- **WHEN** the application's routes, Server Actions, and pages are examined
- **THEN** the researcher export download is the only one that serves export content, and the
  export otherwise exists only as a command

#### Scenario: The export writes no research row on either path

- **WHEN** the export runs, by command or by authenticated download
- **THEN** it performs no insert, update, or delete against a research table, and its only
  emissions are its own artifacts

#### Scenario: An unwritable destination is reported

- **WHEN** the export cannot write its output
- **THEN** it reports the failure with the destination it was given, and does not report success

### Requirement: The export run produces the raw and validated documents

One operator run SHALL write five files into the operator's destination: `validations.json` and
`validations.csv` (every stored response as its own record, grouped shape in JSON and flat
rows in CSV), `summary.json` (per-entry and aggregate counts, unchanged shape, now over
4,800 entries), plus `validated-dataset.json` and `validated-dataset.csv` (one record per
complete entry, derived, grouped in JSON and flat in CSV). Incomplete entries appear in
the raw documents and are absent from the validated ones; at pristine zero state the summary
SHALL report 4,800 entries, 0 responses, 0 complete, 4,800 incomplete, and
`omitted_incomplete_entries` SHALL be 4,800. The run SHALL refuse an unwritable
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

#### Scenario: Zero state reports 4800 omitted, not 0

- **WHEN** the export runs over a corpus with no responses at all
- **THEN** `omitted_incomplete_entries` is 4,800 and both validated files carry no records

#### Scenario: A partial write is refused, not completed

- **WHEN** the destination cannot receive all five files
- **THEN** the run reports the destination and does not report success

### Requirement: A validated record carries its judgment metadata under response/attempt terminology

For each complete entry the export SHALL derive exactly one validated record with exactly these
fields: `id` (the verbatim canonical id, e.g. `DTM_1`), `source_entry_id` (the numeric
suffix), `validated_ilocano` (the correction from the earliest valid judgment that required one,
otherwise the source instruction), `evaluation` (that same judgment's evaluation),
`self_reported_proficiency` (the self-reported proficiency attached to that judgment's attempt,
or null when unrecorded), `english_translation` (the earliest non-blank English translation on
the entry's responses), `filipino_translation` (the earliest non-blank Filipino translation on
the entry's responses), `output` (the entry's `origin`, `destination`, and `transit_mode` —
scalar label, ordered two-element array for Double Transit Mode including `private_vehicle` pairs where supplied),
`source_response_id` (the response id that
supplied `validated_ilocano` and `evaluation`, the provenance link back to the raw record),
`source_attempt_id` (the anonymous attempt that submitted that judgment response), and
`needs_review` (the shared review flag for the entry, additionally true whenever the record's
fields come from more than one response). The enclosing JSON category group establishes
`category_id`, `category`, and `category_name`; the flat CSV row repeats them as cells.
Earliest SHALL mean by server-minted `createdAt`, ties broken by smallest response id and
stated as arbitrary and carrying no meaning.

`evaluation`, `self_reported_proficiency`, `source_response_id`, and `source_attempt_id` SHALL
describe the judgment supplier only: on a multi-source record they MUST NOT be read as authoring
every translation, and `source_attempt_id` MUST NOT be read as a unique human being — one attempt
may own many responses, and one person may hold many attempts. Existing pooled derivation,
`needs_review` rules, and non-adjudication are unchanged. The source transit-mode pair is metadata; validators never vote on which of the two modes wins.

No vote SHALL be taken, no responses SHALL be merged into consensus wording, and no preferred
response SHALL be selected beyond the mechanical earliest rule: earliest-per-field-by-server-clock
is stated in the open, and not a judgment about which response is best. The final adjudication
rule belongs to the thesis team; the export assembles and flags, never resolves. The validated
document SHALL state its derivation rule in its own header or accompanying summary field, so no
reader mistakes a derived record for an adjudicated one.

The per-response diagnostic flags (`qualifies_toward_completion`, `contributes_judgment`,
`covers_english`, `covers_filipino`) and the raw `corrected_instruction` SHALL NOT be copied
onto validated records: the booleans describe one raw response and mislead on a pooled record,
and a supplied correction is already represented by `validated_ilocano`.

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
- **THEN** `needs_review` is true, the record derives from the smallest response id among the
  tied suppliers, and the derivation rule states that the tie-break carries no meaning

#### Scenario: Both validated forms describe the same records

- **WHEN** the JSON and CSV validated documents are compared
- **THEN** they contain the same records with the same values, quoted so that translations
  containing commas, quotes, or newlines round-trip unchanged

#### Scenario: The validated record names its judgment and its attempt

- **WHEN** a complete entry's earliest valid judgment comes from one response
- **THEN** the record carries that response's id as `source_response_id`, its attempt as
  `source_attempt_id`, its evaluation as `evaluation`, and its author's proficiency as
  `self_reported_proficiency`

#### Scenario: Judgment metadata stays with the judgment supplier on multi-source records

- **WHEN** the validated sentence comes from one response and the English translation from another
- **THEN** `evaluation` and `self_reported_proficiency` still describe the judgment supplier, the
  record is flagged `needs_review`, and no field implies one attempt authored every translation

#### Scenario: Both validated forms describe the same records under the same names

- **WHEN** the JSON and CSV validated documents are compared
- **THEN** they contain the same records with the same values under the same field names
  (`response_id` terminology in prose, `source_response_id` / `source_attempt_id` as fields),
  quoted so that translations containing commas, quotes, or newlines round-trip unchanged

#### Scenario: A private_vehicle record survives both serializations

- **WHEN** a complete entry's output carries `transit_mode` `private_vehicle`
- **THEN** both the JSON record and the CSV row carry the exact label `private_vehicle`,
  never `private`, `car`, or another invented synonym

#### Scenario: A Double Transit Mode pair survives both serializations

- **WHEN** a complete DTM entry's output carries `transit_mode` `["jeepney", "walking"]`
- **THEN** the JSON record carries the ordered array and the CSV row carries `["jeepney","walking"]`, never one mode and never an ambiguous join
### Requirement: Raw export identifiers use response/attempt terminology

Raw validation records SHALL name their response `response_id` and their attempt `attempt_id`
instead of `validation_id` and `validator_id`, in both JSON and CSV. Identifier values and
prefixes SHALL NOT change: `RSP_…` still identifies one stored response, `VAL_…` still identifies
one anonymous attempt, and one attempt may own many responses. No database column, primary key,
or stored value SHALL change for this rename; it is an export-label change only.

#### Scenario: Raw records carry the new names with the old values

- **WHEN** a stored response is exported
- **THEN** its record names `response_id` for the `RSP_…` id and `attempt_id` for the `VAL_…` id,
  with values identical to the stored ones

#### Scenario: Attempt counts are never person counts, under either name

- **WHEN** export consumers read `attempt_id`
- **THEN** nothing in the export presents it as a unique human being; the same person may hold
  many attempts

### Requirement: Raw records carry category and source provenance under response/attempt terms

Raw validation records SHALL use `response_id` for the stored response and `attempt_id` for the
submitting anonymous attempt, with values and prefixes unchanged. Each raw record SHALL also
carry `dataset_entry_id` (the verbatim canonical id), `source_entry_id` (the source-local id
1..800), and the enclosing group's `category_id`, `category`, and `category_name` in CSV rows;
grouped JSON responses SHALL carry the entry and response fields with the category triple
established by the enclosing group. JSON and CSV SHALL carry equivalent information. Response
diagnostic flags stay raw-only.

#### Scenario: Raw records name response, attempt, and provenance together

- **WHEN** a stored response is exported
- **THEN** its record carries `response_id`, `attempt_id`, `dataset_entry_id`, and
  `source_entry_id` with values identical to the stored rows, inside the correct category group

#### Scenario: JSON and CSV carry equivalent provenance

- **WHEN** the raw JSON and CSV documents are compared
- **THEN** they contain the same records with the same provenance values under the same names,
  the JSON group supplying what the CSV row repeats

### Requirement: Validated records carry judgment metadata and source provenance

Validated records SHALL carry `category`, `evaluation`, `self_reported_proficiency`,
`source_entry_id`, `category_name`, `source_response_id`, and `source_attempt_id` as specified
in the request: judgment fields describe the judgment supplier only, `source_attempt_id` is
never a unique human, pooled derivation and `needs_review` rules are unchanged, and no
adjudication is performed. Raw diagnostic flags SHALL NOT be copied onto validated records.

#### Scenario: Validated records attribute the judgment supplier

- **WHEN** a complete entry derives its validated record
- **THEN** `evaluation` and `self_reported_proficiency` describe the judgment supplier,
  `source_response_id` names its response, and `source_attempt_id` names its attempt

#### Scenario: Provenance survives both serializations

- **WHEN** the validated JSON and CSV documents are compared
- **THEN** they contain the same records with the same provenance values under the same names
