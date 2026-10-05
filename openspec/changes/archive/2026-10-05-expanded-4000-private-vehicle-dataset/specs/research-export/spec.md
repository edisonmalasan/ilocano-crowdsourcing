# Spec Delta

## MODIFIED Requirements

### Requirement: Dataset categories are preserved

The export SHALL record the category of every dataset entry it includes, and
the summary SHALL be grouped by category, so that a consumer can select one
category's data without inferring it. Every category reference SHALL carry the
numeric `category_id` (1..5 in file order) alongside the slug and the
human-readable name. Research-facing record order SHALL be numeric: by
`category_id`, then by the canonical id's numeric suffix — never lexical, so
`D_2` precedes `D_10`. The export SHALL NOT assume a single category, and
SHALL NOT treat a category's absent optional fields as a defect.

#### Scenario: Records carry their category

- **WHEN** entries from more than one category are exported
- **THEN** every record names its category triple and the summary reports per-category totals

#### Scenario: Records sort numerically within their category

- **WHEN** a category's records are listed in JSON or CSV
- **THEN** they appear ordered by numeric suffix, so `D_2` precedes `D_10`

### Requirement: JSON and CSV forms are both produced and both round-trip

The export SHALL produce JSON documents grouped by category and flat CSV
renderings. `validations.json` SHALL group responses under their five
categories in `category_id` order; `validated-dataset.json` SHALL group
validated records the same way beneath its derivation block. Grouped JSON
records SHALL NOT repeat the enclosing category triple. The CSV SHALL quote
any field containing a comma, a double quote, or a newline, and escape an
embedded double quote, so that a translation containing punctuation or a line
break survives the round trip unchanged. The grouped and flat forms SHALL
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

#### Scenario: All five categories appear even when empty

- **WHEN** the export runs over a corpus with no responses
- **THEN** both JSON documents still carry all five category groups in `category_id` order,
  with empty record arrays

### Requirement: The export run produces the raw and validated documents

One operator run SHALL write five files into the operator's destination: `validations.json` and
`validations.csv` (every stored response as its own record, grouped shape in JSON and flat
rows in CSV), `summary.json` (per-entry and aggregate counts, unchanged shape, now over
4,000 entries), plus `validated-dataset.json` and `validated-dataset.csv` (one record per
complete entry, derived, grouped in JSON and flat in CSV). Incomplete entries appear in
the raw documents and are absent from the validated ones; at pristine zero state the summary
SHALL report 4,000 entries, 0 responses, 0 complete, 4,000 incomplete, and
`omitted_incomplete_entries` SHALL be 4,000. The run SHALL refuse an unwritable
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

#### Scenario: Zero state reports 4000 omitted, not 0

- **WHEN** the export runs over a corpus with no responses at all
- **THEN** `omitted_incomplete_entries` is 4,000 and both validated files carry no records

#### Scenario: A partial write is refused, not completed

- **WHEN** the destination cannot receive all five files
- **THEN** the run reports the destination and does not report success

### Requirement: A validated record carries its judgment metadata under response/attempt terminology

For each complete entry the export SHALL derive exactly one validated record with exactly these
fields: `id` (the verbatim canonical id, e.g. `ODT_63`), `source_entry_id` (the numeric
suffix), `validated_ilocano` (the correction from the earliest valid judgment that required one,
otherwise the source instruction), `evaluation` (that same judgment's evaluation),
`self_reported_proficiency` (the self-reported proficiency attached to that judgment's attempt,
or null when unrecorded), `english_translation` (the earliest non-blank English translation on
the entry's responses), `filipino_translation` (the earliest non-blank Filipino translation on
the entry's responses), `output` (the entry's `origin`, `destination`, and `transit_mode`,
including `private_vehicle` where supplied), `source_response_id` (the response id that
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
`needs_review` rules, and non-adjudication are unchanged.

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
