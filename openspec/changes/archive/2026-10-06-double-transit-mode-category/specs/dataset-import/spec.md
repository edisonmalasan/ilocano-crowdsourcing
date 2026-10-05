# Spec Delta

## MODIFIED Requirements

### Requirement: The revised source is parsed into validated verbatim records

Parsing SHALL be a pure function of the source value with no database, network, or clock
dependency. It SHALL accept exactly the revised shape: an object with one `categories` array of
exactly six blocks in `category_id` order, each block carrying its `category_id`,
`category_name`, and `entries`. Each block SHALL hold exactly 800 entries. Record ids SHALL be
read verbatim from the file — never reminted, never zero-padded, never renumbered — and SHALL
form exactly the per-category sets `D_1..D_800`, `DT_1..DT_800`, `OD_1..OD_800`,
`ODT_1..ODT_800`, `CPE_1..CPE_800`, `DTM_1..DTM_800`: no missing suffix, no duplicate suffix, no duplicate
canonical id, no wrong prefix, no suffix outside 1..800, no unknown category. `sourceEntryId`
SHALL be derived from the canonical id's numeric suffix, and the id's prefix SHALL agree with
the enclosing block's category, or parsing fails. It SHALL return 4,800 validated entries in
source order and SHALL reject any malformed record, block, or id set rather than skipping,
defaulting, or repairing it.

Category-purpose structure SHALL be enforced: Destination Only rows SHALL carry null origin and
null transit mode with non-null destination; Origin + Destination rows SHALL carry non-null
origin and destination with null transit mode; Destination + Transit Mode, Origin +
Destination + Transit Mode, and Complex/Preference rows SHALL carry the mode-bearing shape with scalar `transit_mode` in
`walking`, `jeepney`, `taxi`, `private_vehicle`; Double Transit Mode rows SHALL carry null origin, non-null destination, and a `transit_mode` pair of exactly two distinct values from the same four-word vocabulary with order preserved. Instruction, origin, destination, and transit-mode values SHALL be preserved from
the source, and `source_payload` SHALL preserve the original source record unchanged.

#### Scenario: Five blocks of eight hundred parse to four thousand entries

- **WHEN** the revised source is parsed
- **THEN** 4,800 entries are produced, 800 per category across six categories, in source order, each satisfying the
  shared dataset entry schema

#### Scenario: Canonical ids are preserved verbatim, never reminted

- **WHEN** a source record carries `DTM_63`
- **THEN** the parsed entry id is `DTM_63` exactly — not zero-padded, not renumbered — with
  `sourceEntryId` 63

#### Scenario: A duplicated or missing suffix fails loudly

- **WHEN** one category block holds a duplicated suffix or fewer than 800 entries
- **THEN** parsing fails naming the block and the id or the received count, and no partial
  entry set is produced

#### Scenario: A misplaced prefix fails loudly

- **WHEN** a Destination Only block holds `DT_12`
- **THEN** parsing fails naming the block and the id, because the prefix disagrees with the
  enclosing category

#### Scenario: An unknown category name fails rather than defaults

- **WHEN** a category block names a category outside the six-row mapping table
- **THEN** parsing fails naming the block, and no entry is produced for it

#### Scenario: A malformed record is rejected, not repaired

- **WHEN** a source record has a missing or malformed id, or a missing or blank instruction
- **THEN** parsing fails and identifies the offending record and block, and no partial or
  defaulted entry is produced for it

#### Scenario: A mode in a null-mode category is refused

- **WHEN** a Destination Only or Origin + Destination record carries a non-null transit mode
- **THEN** parsing fails naming the block and the id rather than importing a row that
  violates its category's purpose

#### Scenario: A malformed Double Transit Mode pair is refused

- **WHEN** a Double Transit Mode record carries a non-array transit mode, fewer or more than two modes, two identical modes, or a mode outside the four-word vocabulary, or a non-null origin, or a null destination
- **THEN** parsing fails naming the block and the id rather than importing a row that
  violates its category's purpose

#### Scenario: Absent and blank optional fields mean the same thing

- **WHEN** a source record omits an optional field or supplies it as `null`
- **THEN** the resulting entry is identical, because `null` means the category has no such concept
  and an omitted key normalizes to the same value

### Requirement: Importing is idempotent over verbatim canonical ids and reports what it did

Importing SHALL key on the verbatim canonical dataset entry id so that running it again
updates the existing row rather than creating a second one. Importing SHALL return a report of
the counts it acted on against 4,800 records. A re-run SHALL NOT modify the stored
instruction, source payload, or creation timestamp of an existing row. Provenance
(`source_entry_id`, `category_name`) SHALL converge on a re-run.

#### Scenario: A second import does not duplicate entries

- **WHEN** the same revised dataset is imported twice
- **THEN** the stored entry count stays 4,800 and every canonical id resolves to exactly one row

#### Scenario: A re-run reports what it changed

- **WHEN** an import completes
- **THEN** it reports the number of records parsed, inserted, and updated, so a run that silently
  did nothing is distinguishable from a run that succeeded

#### Scenario: A re-run cannot rewrite an instruction

- **WHEN** an import runs against an existing row
- **THEN** the row's instruction is not overwritten, so a later edit to the source file cannot
  retroactively alter what a validator was shown

### Requirement: The 4000-row import is verifiable without a hosted database

The parsed records and the migrations SHALL be verifiable against a real PostgreSQL engine. The
verification SHALL apply the migration set from its default location and SHALL assert the exact
set of applied files. All 4,800 parsed rows SHALL round-trip: per-category counts of 800,
exact canonical id sets, source-local ids exactly 1..800 per category, byte-identical
instruction, origin, destination, and transit mode per row, value-identical source payloads,
and the exact transit-mode distribution (`null` 1600 with 800 each in the two null-mode
categories; `walking`, `jeepney`, `taxi`, `private_vehicle` scalars in the three scalar
mode-bearing categories; 800 ordered distinct pairs in Double Transit Mode).

#### Scenario: All 4,000 source records are verified in a real database

- **WHEN** the revised import is verified against a real PostgreSQL engine
- **THEN** the stored record count is 4,800 with 800 per category, every canonical id set is
  exact, every field equals the source, every DTM pair is ordered and distinct, and the transit distribution matches the intended
  table exactly

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
- **THEN** the comparison reads `data/merged-ilocano-synthetic-data.json` itself, so the check
  cannot pass by comparing the import against another derived artifact

### Requirement: The canonical dataset is populated by an operator-run import of the revised source

The platform SHALL populate and refresh `dataset_entries` only through a command that an operator
runs, and SHALL NOT expose any request-reachable path that writes a dataset entry. The command SHALL
read `data/merged-ilocano-synthetic-data.json` itself, SHALL report the number of records parsed,
inserted, updated, and refused against 4,800 records, and SHALL exit with a non-zero status when any
record was refused, so a partially completed run is distinguishable from a successful one. Running
the command SHALL require the privileged server credential, and the command SHALL NOT accept a
dataset, an entry, or any other value from an HTTP request.

#### Scenario: No request path can write a dataset entry

- **WHEN** the dataset entries repository is examined for write capability
- **THEN** it exposes no write method, so a request handler has no repository operation that would
  create, update, or deactivate an imported entry

#### Scenario: The import runs as an operator command, not as a page

- **WHEN** the populated dataset is produced
- **THEN** it is produced by an operator-run command that reads the privileged credential from the
  server environment, and no HTTP route, Server Action, or page performs the write

#### Scenario: The command reads the immutable revised source file itself

- **WHEN** the command runs
- **THEN** it reads `data/merged-ilocano-synthetic-data.json` directly rather than any artifact derived
  from it, and it holds no code path that opens the source file for writing

#### Scenario: The command reports what it actually did

- **WHEN** a command run completes
- **THEN** it reports the number of records parsed, inserted, updated, and refused, so a run that
  silently did nothing is distinguishable from a run that succeeded

#### Scenario: A refused record fails the run

- **WHEN** any record is refused during a command run
- **THEN** the command exits with a non-zero status and names the refused record, and a run that
  wrote some records before the refusal is not reported as a success

### Requirement: The versioned import function is preserved unchanged

`dataset_entries_import_v2` SHALL stay deployed unchanged with its ten provenance-capable arguments. The Double Transit Mode pair SHALL arrive only through the new versioned function `dataset_entries_import_v3`, which carries the pair argument with the same security posture (invoker, empty search path), the same immutability philosophy (instruction, source payload, and creation timestamp absent from the update list), and the same divergence refusal. The range CHECK SHALL NOT be re-migrated for this change. Every guarantee SHALL be re-verified against the engine, not assumed from the previous change.

#### Scenario: The deployed signature is untouched

- **WHEN** the deployed function signatures are inspected
- **THEN** `dataset_entries_import_v2` still carries its ten provenance-capable arguments and `dataset_entries_import_v3` carries the pair argument beside it

#### Scenario: The preserved guarantees still hold

- **WHEN** the import writes, re-runs, and diverges against the revised corpus
- **THEN** instruction, payload, and timestamp immutability, named divergence refusal, and the
  privilege posture all behave exactly as specified for both versioned functions, verified by the same engine-backed tests
  rather than inherited from the previous change's evidence
