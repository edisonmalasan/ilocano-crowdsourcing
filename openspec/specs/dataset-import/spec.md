# dataset-import Specification

## Purpose
Defines how the immutable synthetic dataset becomes canonical `dataset_entries` rows: parsing the
source file into validated domain records without losing or altering research text, importing
those records idempotently, and proving that all records survive the round trip.

The source dataset is read-only research material. Nothing in this capability writes to it, and
nothing in it may be adjusted to make an import succeed.

## Requirements

### Requirement: The merged source is parsed into validated canonical records

Parsing SHALL be a pure function of the source value with no database, network, or clock
dependency. It SHALL accept exactly the merged shape: an object with one `categories` array of
exactly five blocks, each block carrying its `category_id`, `category_name`, and `entries`; each
block SHALL hold exactly 600 entries with source-local ids exactly 1 through 600, no gaps and no
duplicates, or parsing fails naming the block and the offending id. It SHALL return 3,000
validated entries in source order (blocks in file order, entries in file order within each
block), and SHALL reject any malformed record, block, or id set rather than skipping,
defaulting, or repairing it.

Category names SHALL map to slugs by one explicit table: `Destination Only` →
`destination_only`, `Destination + Transit Mode` → `destination_transit_mode`,
`Origin + Destination` → `origin_destination`, `Origin + Destination + Transit Mode` →
`origin_destination_transit_mode`, `Complex/Preference Expressions` →
`complex_preference_expressions`. An unknown category name SHALL fail parsing, never default.

Canonical ids SHALL be minted deterministically as `{prefix}_{local:04d}` with prefixes `DO`,
`DT`, `OD`, `ODT`, `CPE` in the same table order — never a global 1..3000 renumbering, and the
source file's ids SHALL NOT be rewritten. Instruction, origin, destination, and transit_mode
values SHALL be preserved from the source, with `transit_mode` taken from the file and never
randomized. `source_payload` SHALL preserve the original source record unchanged.

#### Scenario: Five blocks of six hundred parse to three thousand entries

- **WHEN** the merged source is parsed
- **THEN** 3,000 entries are produced, 600 per category, in source order, each satisfying the
  shared dataset entry schema

#### Scenario: A duplicated local id fails loudly

- **WHEN** one category block holds a duplicated source-local id
- **THEN** parsing fails naming the block and the id, and no partial entry set is produced

#### Scenario: A short block fails loudly rather than importing partially

- **WHEN** one category block holds fewer than 600 entries
- **THEN** parsing fails naming the block and the received count, and no partial entry set is
  produced

#### Scenario: An unknown category name fails rather than defaults

- **WHEN** a category block names a category outside the five-row mapping table
- **THEN** parsing fails naming the block, and no entry is produced for it

#### Scenario: Canonical ids are deterministic across runs

- **WHEN** the same source is parsed twice
- **THEN** every canonical id is byte-identical, and the set holds 3,000 unique ids with the
  documented prefixes

#### Scenario: A malformed record is rejected, not repaired

- **WHEN** a source record has a missing or malformed id, or a missing or blank instruction
- **THEN** parsing fails and identifies the offending record and block, and no partial or
  defaulted entry is produced for it

#### Scenario: Absent and blank optional fields mean the same thing

- **WHEN** a source record omits an optional field or supplies it as `null`
- **THEN** the resulting entry is identical, because `null` means the category has no such concept
  and an omitted key normalizes to the same value

### Requirement: Importing is idempotent over canonical ids and reports what it did

Importing SHALL key on the canonical dataset entry id so that running it again updates the
existing row rather than creating a second one. Importing SHALL return a report of the counts it
acted on. A re-run SHALL NOT modify the stored instruction, source payload, or creation
timestamp of an existing row.

#### Scenario: A second import does not duplicate entries

- **WHEN** the same merged dataset is imported twice
- **THEN** the stored entry count stays 3,000 and every canonical id resolves to exactly one row

#### Scenario: A re-run reports what it changed

- **WHEN** an import completes
- **THEN** it reports the number of records parsed, inserted, and updated, so a run that silently
  did nothing is distinguishable from a run that succeeded

#### Scenario: A re-run cannot rewrite an instruction

- **WHEN** an import runs against an existing row
- **THEN** the row's instruction is not overwritten, so a later edit to the source file cannot
  retroactively alter what a validator was shown

### Requirement: The merged import is verifiable without a hosted database

The parsed records and the migrations SHALL be verifiable against a real PostgreSQL engine. The
verification SHALL apply the migration set from its default location and SHALL assert the exact
set of applied files. All 3,000 parsed rows SHALL round-trip: per-category counts of 600,
local ids exactly 1..600 per category, canonical-id uniqueness, and byte-identical instruction,
origin, destination, transit_mode, and source payload per row.

#### Scenario: All 3,000 source records are verified in a real database

- **WHEN** the merged import is verified against a real PostgreSQL engine
- **THEN** the stored record count is 3,000 with 600 per category, the canonical id set is
  unique, local ids per category are exactly 1..600, and each stored field equals the source
  exactly

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

### Requirement: The canonical dataset is populated by an operator-run import of the merged source

The platform SHALL populate and refresh `dataset_entries` only through a command that an operator
runs, and SHALL NOT expose any request-reachable path that writes a dataset entry. The command SHALL
read `data/merged-ilocano-synthetic-data.json` itself, SHALL report the number of records parsed,
inserted, updated, and refused, and SHALL exit with a non-zero status when any record was refused, so a
partially completed run is distinguishable from a successful one. Running the command SHALL require
the privileged server credential, and the command SHALL NOT accept a dataset, an entry, or any other
value from an HTTP request.

#### Scenario: No request path can write a dataset entry

- **WHEN** the dataset entries repository is examined for write capability
- **THEN** it exposes no write method, so a request handler has no repository operation that would
  create, update, or deactivate an imported entry

#### Scenario: The import runs as an operator command, not as a page

- **WHEN** the populated dataset is produced
- **THEN** it is produced by an operator-run command that reads the privileged credential from the
  server environment, and no HTTP route, Server Action, or page performs the write

#### Scenario: The command reads the immutable merged source file itself

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

### Requirement: Provenance columns travel through a versioned import function with the same guarantees

The entry upsert SHALL be performed by a database function rather than assembled by application code.
A new function version SHALL carry the provenance arguments (`source_entry_id`,
`category_name`) while the deployed version stays in place; no applied migration SHALL be
modified to change it. The versioned function SHALL NOT modify the stored instruction, source
payload, or creation timestamp of an existing row. Provenance (`source_entry_id`,
`category_name`) SHALL converge on a re-run rather than freezing a first-write value beside a
corrected file. The function SHALL refuse, by naming the entry, when an existing row's stored
instruction differs from the instruction being imported. It SHALL report inserted-or-updated
from the engine's own discriminator, run with invoker security and a pinned empty search path,
and have EXECUTE revoked from `PUBLIC` and granted only to the privileged server role.

#### Scenario: A re-run cannot rewrite an instruction, payload, or timestamp

- **WHEN** the import runs against a row that already exists
- **THEN** the stored instruction, source payload, and creation timestamp are unchanged, and
  this holds because the database function's update list omits those columns rather than
  because a caller chose not to send them

#### Scenario: A differing instruction is refused by name, not silently kept

- **WHEN** the import supplies an instruction that differs from the one stored for an existing entry
- **THEN** the database refuses the write, names the entry, and leaves the stored row untouched, so
  a divergence between the source file and the research database cannot pass unnoticed

#### Scenario: The inserted-or-updated outcome comes from the engine

- **WHEN** the import writes one entry
- **THEN** whether it inserted or updated is decided by the database in the same statement that wrote
  the row, and is not inferred from a read that happened before the write

#### Scenario: The function cannot resolve names through a writable schema

- **WHEN** the function is defined
- **THEN** it runs with an empty, pinned `search_path` and with invoker rather than definer security,
  so it cannot inherit a bypass of row-level security and cannot resolve a name a caller controls

#### Scenario: Only the privileged role may execute the function

- **WHEN** EXECUTE privileges on every import function version are inspected
- **THEN** they are revoked from `PUBLIC` and granted to the privileged server role, and an anonymous
  or authenticated caller is refused by the real gateway rather than merely finding the function
  absent
