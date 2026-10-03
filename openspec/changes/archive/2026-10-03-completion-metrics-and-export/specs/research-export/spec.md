# Spec Delta

## ADDED Requirements

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

### Requirement: A validated record is derived from the earliest qualifying package

For each complete entry the export SHALL derive exactly one validated record with exactly these
fields: `id` (the source entry id), `validated_ilocano` (the correction where the supplying
response required one, otherwise the source instruction), `english_translation` and
`filipino_translation` (both from the supplying response), `output` (the entry's `origin`,
`destination`, and `transit_mode`), `source_validation_id` (the supplying response's id, the
provenance link back to the raw record), and `needs_review` (the shared review flag for the
entry). The supplying response SHALL be the entry's earliest qualifying response by server-minted
`createdAt`.

No vote SHALL be taken, no responses SHALL be merged, and no preferred validator SHALL be
selected: earliest-by-server-clock is a mechanical rule, stated in the open, and not a judgment
about which response is best. Equal `createdAt` values among an entry's qualifying responses, and
more than one distinct correction or evaluation behind a complete entry, SHALL force
`needs_review` true; the emitted record is then still deterministic (smallest validation id wins
the tie, stated as arbitrary and carrying no meaning), and the flag says a human must decide.
The validated document SHALL state its derivation rule in its own header or accompanying summary
field, so no reader mistakes a derived record for an adjudicated one.

The record SHALL NOT carry a validator or attempt identifier. Authorship is preserved per record
in the raw document; re-exporting attempt ids into the validated artifact would invite reading
them as endorsements by persons.

#### Scenario: The validated sentence is the correction where one was required

- **WHEN** the earliest qualifying response carries evaluation `incorrect` with a corrected
  sentence
- **THEN** `validated_ilocano` is that correction, and the translations are that response's own
  translations of it

#### Scenario: The validated sentence is the source instruction where none was required

- **WHEN** the earliest qualifying response carries evaluation `correct_natural` with no
  correction
- **THEN** `validated_ilocano` is the entry's source instruction, byte-identical, and the source
  entry is unchanged

#### Scenario: A later qualifying response does not displace the earliest

- **WHEN** an entry holds two qualifying responses and the later one differs in wording
- **THEN** the validated record derives from the earlier one, both responses remain in the raw
  document, and the entry is flagged for review rather than resolved

#### Scenario: A timestamp tie is flagged and decided arbitrarily in the open

- **WHEN** an entry's qualifying responses share the same server-minted `createdAt`
- **THEN** `needs_review` is true, the record derives from the smallest validation id, and the
  derivation rule states that the tie-break carries no meaning

#### Scenario: Both validated forms describe the same records

- **WHEN** the JSON and CSV validated documents are compared
- **THEN** they contain the same records with the same values, quoted so that translations
  containing commas, quotes, or newlines round-trip unchanged
