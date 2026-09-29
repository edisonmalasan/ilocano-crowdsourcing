# dataset-import Specification

## Purpose
Defines how the immutable synthetic dataset becomes canonical `dataset_entries` rows: parsing the
source file into validated domain records without losing or altering research text, importing
those records idempotently, and proving that all records survive the round trip.

The source dataset is read-only research material. Nothing in this capability writes to it, and
nothing in it may be adjusted to make an import succeed.

## Requirements

### Requirement: The source dataset is parsed into validated domain records

Parsing SHALL be a pure function of the source value with no database, network, or clock
dependency. It SHALL return one validated dataset entry input per source record, in source order,
and SHALL reject a record whose id, category, or required instruction fails the shared domain
schema rather than repairing it.

#### Scenario: Every source record becomes a validated entry

- **WHEN** the synthetic dataset is parsed
- **THEN** one entry is produced per source record, in source order, and every produced entry
  satisfies the shared dataset entry schema

#### Scenario: A malformed record is rejected, not repaired

- **WHEN** a source record has a missing or malformed id, or a missing or blank instruction
- **THEN** parsing fails and identifies the offending record, and no partial or defaulted entry is
  produced for it

#### Scenario: Identifier mapping is exact

- **WHEN** a source record is parsed
- **THEN** the source id is carried through unchanged, so the externally meaningful identifier
  survives, and the source `output.transit_mode` field is mapped to the domain's transit mode
  field by an explicit named mapping rather than by convention

#### Scenario: Absent and blank optional fields mean the same thing

- **WHEN** a source record omits an optional field or supplies it as `null`
- **THEN** the resulting entry is identical, because `null` means the category has no such concept
  and an omitted key normalizes to the same value

### Requirement: Importing is idempotent and reports what it did

Importing SHALL key on the source dataset entry id so that running it again updates the existing
row rather than creating a second one. Importing SHALL return a report of the counts it acted on.
A re-run SHALL NOT modify the stored instruction of an existing row, because the imported
instruction is immutable research material.

#### Scenario: A second import does not duplicate entries

- **WHEN** the same dataset is imported twice
- **THEN** the stored entry count is unchanged and every source id resolves to exactly one row

#### Scenario: A re-run reports what it changed

- **WHEN** an import completes
- **THEN** it reports the number of records parsed, inserted, and updated, so a run that silently
  did nothing is distinguishable from a run that succeeded

#### Scenario: A re-run cannot rewrite an instruction

- **WHEN** an import runs against an existing row
- **THEN** the row's instruction is not overwritten, so a later edit to the source file cannot
  retroactively alter what a validator was shown

### Requirement: The import is verifiable without a hosted database

The parsed records and the migrations SHALL be verifiable against a real PostgreSQL engine, so
that the import is proven before a hosted project exists. The verification SHALL apply the
migration set from its default location and SHALL assert the exact set of applied files.

#### Scenario: All source records are verified in a real database

- **WHEN** the import is verified against a real PostgreSQL engine
- **THEN** the stored record count equals the source record count, the stored id set equals the
  source id set, and each stored instruction equals the source instruction exactly

#### Scenario: The default migration path is exercised

- **WHEN** the verification runs
- **THEN** it applies migrations from the production migration directory rather than a test
  fixture directory, so the directory the platform actually ships from is the one under test

#### Scenario: An empty migration directory cannot pass silently

- **WHEN** the migration directory is empty, missing, or misresolved
- **THEN** the verification fails, because an assertion on the exact applied filename list is
  required rather than a check that merely tolerates zero applied files

#### Scenario: Verification compares against the immutable source, not a copy

- **WHEN** stored records are compared to the source
- **THEN** the comparison reads the source dataset file itself, so the check cannot pass by
  comparing the import against another derived artifact
