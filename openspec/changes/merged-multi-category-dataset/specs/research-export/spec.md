# Spec Delta

## ADDED Requirements

### Requirement: Raw records carry category and source provenance under response/attempt terms

Raw validation records SHALL use `response_id` for the stored response and `attempt_id` for the
submitting anonymous attempt, with values and prefixes unchanged. Each raw record SHALL also
carry `source_entry_id` (the source-local id 1..600), `category` (the stable slug), and
`category_name` (the human-readable source category name) of its dataset entry, in both JSON
and CSV with equivalent information. Response diagnostic flags stay raw-only.

#### Scenario: Raw records name response, attempt, and provenance together

- **WHEN** a stored response is exported
- **THEN** its record carries `response_id`, `attempt_id`, `dataset_entry_id`, `source_entry_id`,
  `category`, and `category_name` with values identical to the stored rows

#### Scenario: JSON and CSV carry equivalent provenance

- **WHEN** the raw JSON and CSV documents are compared
- **THEN** they contain the same records with the same provenance values under the same names

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
