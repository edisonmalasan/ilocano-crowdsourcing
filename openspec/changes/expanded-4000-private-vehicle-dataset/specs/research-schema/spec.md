# Spec Delta

## ADDED Requirements

### Requirement: The source_entry_id range admits 1..800

A forward migration SHALL widen the `source_entry_id` range CHECK from 1..600
to 1..800, preserving nullable semantics: a value, when present, SHALL lie in
1..800, and a blank `category_name` SHALL still be rejected. No applied
migration SHALL be modified. No transit-mode CHECK or enum SHALL be invented:
no persistent transit-mode constraint exists, and the mode vocabulary is
enforced at parse time. `dataset_entries_import_v2` SHALL NOT be replaced,
because its integer provenance argument already supports the new values.

#### Scenario: A suffix of 800 is accepted

- **WHEN** a row is written with `source_entry_id` 800
- **THEN** the database accepts the write

#### Scenario: Suffixes outside 1..800 are refused by name

- **WHEN** a row is written with `source_entry_id` 0 or 801
- **THEN** the database rejects the write naming the range constraint
