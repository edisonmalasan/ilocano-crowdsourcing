# Spec Delta

## ADDED Requirements

### Requirement: Dataset entries carry source-local and category-name provenance

Each `dataset_entries` row SHALL carry `source_entry_id` (the source-local id, 1..600 within its
category) and `category_name` (the human-readable source category name) alongside the canonical
id, slug, instruction, origin, destination, transit mode, source payload, and activity flags.
`source_entry_id` values outside 1..600 SHALL be rejected by the database; a blank
`category_name` SHALL be rejected by the database. The original `source_payload` SHALL preserve
the source record unchanged.

#### Scenario: Provenance columns reject out-of-range values

- **WHEN** a row is written with a `source_entry_id` outside 1..600 or a blank `category_name`
- **THEN** the database rejects the write

#### Scenario: Source payload stays verbatim

- **WHEN** an entry is stored
- **THEN** its `source_payload` equals the original source record, unchanged by the import
