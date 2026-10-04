# Spec Delta

## REMOVED Requirements

### Requirement: Qualifying and non-qualifying responses are reported distinctly

> **Why this requirement is removed rather than modified.** Its counts are
> per-response qualifying judgments, and a response missing either
> translation counts as non-qualifying. Under per-response language choice a
> single-translation response is legitimate coverage, so those scenarios
> cannot survive as written while separate-rows, no-merge, and diagnostics
> properties are unchanged. Recorded **in full, verbatim**, replaced below.

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

> **Why this requirement is removed rather than modified.** Its incomplete-entry
> scenario is written in per-response qualifying language ("all
> non-qualifying"). Under pooled coverage the same property holds in pooled
> terms, so the scenario cannot survive verbatim while the shared-rule and
> no-target properties are unchanged. Recorded **in full, verbatim**, replaced
> below.

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

### Requirement: A validated record is derived from the earliest qualifying package

> **Why this requirement is removed rather than modified.** Every scenario
> derives the record from one earliest qualifying response carrying the whole
> package. Under pooled coverage the package is assembled across responses, so
> no scenario survives as written while the no-merge, no-vote, and
> derivation-stated-openly properties are unchanged. Recorded **in full,
> verbatim**, replaced below.

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

## ADDED Requirements

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
