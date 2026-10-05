# Spec Delta

## REMOVED Requirements

### Requirement: A validated record is assembled per field from the earliest covering sources

> **Why this requirement is removed rather than modified.** Its field list names
> `source_validation_id` and forbids every validator/attempt identifier on the
> record, and three scenarios pin that shape. The approved terminology calls the
> supplier a response owned by an attempt, and the record additionally carries
> the judgment's evaluation and the author's self-reported proficiency — so the
> field list, the identifier ban, and the wording scenarios cannot survive as
> written while pooled assembly, no-merge, no-vote, and stated-derivation are
> unchanged. Recorded **in full, verbatim**, replaced below.

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

## ADDED Requirements

### Requirement: A validated record carries its judgment metadata under response/attempt terminology

For each complete entry the export SHALL derive exactly one validated record with exactly these
fields: `id` (the source entry id), `category` (the entry's dataset category), `validated_ilocano`
(the correction from the earliest valid judgment that required one, otherwise the source
instruction), `evaluation` (that same judgment's evaluation), `self_reported_proficiency` (the
self-reported proficiency attached to that judgment's attempt, or null when unrecorded),
`english_translation` (the earliest non-blank English translation on the entry's responses),
`filipino_translation` (the earliest non-blank Filipino translation on the entry's responses),
`output` (the entry's `origin`, `destination`, and `transit_mode`), `source_response_id` (the
response id that supplied `validated_ilocano` and `evaluation`, the provenance link back to the
raw record), `source_attempt_id` (the anonymous attempt that submitted that judgment response),
and `needs_review` (the shared review flag for the entry, additionally true whenever the record's
fields come from more than one response). Earliest SHALL mean by server-minted `createdAt`, ties
broken by smallest response id and stated as arbitrary and carrying no meaning.

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
