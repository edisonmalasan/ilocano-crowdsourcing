# Spec Delta

## REMOVED Requirements

### Requirement: The merged source is parsed into validated canonical records

> **Why this requirement is removed rather than modified.** Every scenario assumes minted zero-padded ids over 5x600. The revised source carries verbatim unpadded canonical ids over 5x800 with suffix derivation, prefix agreement, and category-purpose checks — so the shape, the identifier, and the count scenarios cannot survive as written while purity, no-repair, and exact-mapping properties are unchanged. Recorded **in full, verbatim**, replaced below.


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

> **Why this requirement is removed rather than modified.** Keying, counts, and the provenance-freeze scenarios assume 3,000 rows keyed by minted ids with write-once provenance. The revised import keys 4,000 verbatim ids with converging provenance, so the count and keying scenarios cannot survive as written while idempotence, reporting, and instruction-immutability are unchanged. Recorded **in full, verbatim**, replaced below.


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

> **Why this requirement is removed rather than modified.** The count, distribution-blind, and source-identity scenarios assume 3,000 rows from one file with no transit distribution to prove. The revised verification asserts 4,000 rows, five per-category hundreds, exact canonical sets, and the intended mode distribution — so those scenarios cannot survive as written while engine-verification, default-path, and compare-against-source properties are unchanged. Recorded **in full, verbatim**, replaced below.


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

> **Why this requirement is removed rather than modified.** Its source-file scenario names 3,000 records. The command, privilege, reporting, and no-request-path properties are unchanged. Recorded **in full, verbatim**, replaced below.


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

> **Why this requirement is removed rather than modified.** The function scenarios assume the revision needs a new function. It does not: v2's integer provenance argument already supports 1..800, so this change preserves v2 and moves only the CHECK constraint — the scenarios cannot survive verbatim while statement-level enforcement, divergence refusal, engine discrimination, empty search path, and privilege revocation are unchanged. Recorded **in full, verbatim**, replaced below.


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

## ADDED Requirements

### Requirement: The revised source is parsed into validated verbatim records

Parsing SHALL be a pure function of the source value with no database, network, or clock
dependency. It SHALL accept exactly the revised shape: an object with one `categories` array of
exactly five blocks in `category_id` order, each block carrying its `category_id`,
`category_name`, and `entries`. Each block SHALL hold exactly 800 entries. Record ids SHALL be
read verbatim from the file — never reminted, never zero-padded, never renumbered — and SHALL
form exactly the per-category sets `D_1..D_800`, `DT_1..DT_800`, `OD_1..OD_800`,
`ODT_1..ODT_800`, `CPE_1..CPE_800`: no missing suffix, no duplicate suffix, no duplicate
canonical id, no wrong prefix, no suffix outside 1..800, no unknown category. `sourceEntryId`
SHALL be derived from the canonical id's numeric suffix, and the id's prefix SHALL agree with
the enclosing block's category, or parsing fails. It SHALL return 4,000 validated entries in
source order and SHALL reject any malformed record, block, or id set rather than skipping,
defaulting, or repairing it.

Category-purpose structure SHALL be enforced: Destination Only rows SHALL carry null origin and
null transit mode with non-null destination; Origin + Destination rows SHALL carry non-null
origin and destination with null transit mode; Destination + Transit Mode and Origin +
Destination + Transit Mode rows SHALL carry the mode-bearing shape with `transit_mode` in
`walking`, `jeepney`, `taxi`, `private_vehicle`; Complex/Preference rows SHALL carry a
destination, an origin only when the sentence supports one, and the same four-word mode
vocabulary. Instruction, origin, destination, and transit_mode values SHALL be preserved from
the source, and `source_payload` SHALL preserve the original source record unchanged.

#### Scenario: Five blocks of eight hundred parse to four thousand entries

- **WHEN** the revised source is parsed
- **THEN** 4,000 entries are produced, 800 per category, in source order, each satisfying the
  shared dataset entry schema

#### Scenario: Canonical ids are preserved verbatim, never reminted

- **WHEN** a source record carries `ODT_63`
- **THEN** the parsed entry id is `ODT_63` exactly — not zero-padded, not renumbered — with
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

- **WHEN** a category block names a category outside the five-row mapping table
- **THEN** parsing fails naming the block, and no entry is produced for it

#### Scenario: A malformed record is rejected, not repaired

- **WHEN** a source record has a missing or malformed id, or a missing or blank instruction
- **THEN** parsing fails and identifies the offending record and block, and no partial or
  defaulted entry is produced for it

#### Scenario: A mode in a null-mode category is refused

- **WHEN** a Destination Only or Origin + Destination record carries a non-null transit mode
- **THEN** parsing fails naming the block and the id rather than importing a row that
  violates its category's purpose

#### Scenario: Absent and blank optional fields mean the same thing

- **WHEN** a source record omits an optional field or supplies it as `null`
- **THEN** the resulting entry is identical, because `null` means the category has no such concept
  and an omitted key normalizes to the same value

### Requirement: Importing is idempotent over verbatim canonical ids and reports what it did

Importing SHALL key on the verbatim canonical dataset entry id so that running it again
updates the existing row rather than creating a second one. Importing SHALL return a report of
the counts it acted on against 4,000 records. A re-run SHALL NOT modify the stored
instruction, source payload, or creation timestamp of an existing row. Provenance
(`source_entry_id`, `category_name`) SHALL converge on a re-run.

#### Scenario: A second import does not duplicate entries

- **WHEN** the same revised dataset is imported twice
- **THEN** the stored entry count stays 4,000 and every canonical id resolves to exactly one row

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
set of applied files. All 4,000 parsed rows SHALL round-trip: per-category counts of 800,
exact canonical id sets, source-local ids exactly 1..800 per category, byte-identical
instruction, origin, destination, and transit mode per row, value-identical source payloads,
and the exact transit-mode distribution (`null` 1600 with 800 each in the two null-mode
categories; `walking`, `jeepney`, `taxi`, `private_vehicle` 200 each in the three
mode-bearing categories).

#### Scenario: All 4,000 source records are verified in a real database

- **WHEN** the revised import is verified against a real PostgreSQL engine
- **THEN** the stored record count is 4,000 with 800 per category, every canonical id set is
  exact, every field equals the source, and the transit distribution matches the intended
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
inserted, updated, and refused against 4,000 records, and SHALL exit with a non-zero status when any
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

No new import function SHALL be created for this revision: `dataset_entries_import_v2` already
carries provenance as an integer argument and its behavior already supports the new values. The
range change SHALL arrive only through the forward migration on the CHECK constraint. The
preserved function SHALL still refuse a diverging instruction by name, still report
inserted-or-updated from the engine's discriminator, still run with invoker security and a
pinned empty search path, and still grant EXECUTE only to the privileged server role — all
re-verified, not assumed from the previous change.

#### Scenario: The deployed signature is untouched

- **WHEN** the deployed function signatures are inspected
- **THEN** `dataset_entries_import_v2` still carries its ten provenance-capable arguments and
  no v3 function exists

#### Scenario: The preserved guarantees still hold

- **WHEN** the import writes, re-runs, and diverges against the revised corpus
- **THEN** instruction, payload, and timestamp immutability, named divergence refusal, and the
  privilege posture all behave exactly as specified, verified by the same engine-backed tests
  rather than inherited from the previous change's evidence
