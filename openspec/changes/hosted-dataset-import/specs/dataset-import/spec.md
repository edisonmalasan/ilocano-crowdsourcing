# dataset-import Delta

## ADDED Requirements

### Requirement: The canonical dataset is populated by an operator-run import

The platform SHALL populate and refresh `dataset_entries` only through a command that an operator
runs, and SHALL NOT expose any request-reachable path that writes a dataset entry. The command SHALL
read the immutable source dataset file itself, SHALL report the number of records parsed, inserted,
updated, and refused, and SHALL exit with a non-zero status when any record was refused, so a
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

#### Scenario: The command reads the immutable source file itself

- **WHEN** the command runs
- **THEN** it reads `data/ilocano-synthetic-data.json` directly rather than any artifact derived
  from it, and it holds no code path that opens the source file for writing

#### Scenario: The command reports what it actually did

- **WHEN** a command run completes
- **THEN** it reports the number of records parsed, inserted, updated, and refused, so a run that
  silently did nothing is distinguishable from a run that succeeded

#### Scenario: A refused record fails the run

- **WHEN** any record is refused during a command run
- **THEN** the command exits with a non-zero status and names the refused record, and a run that
  wrote some records before the refusal is not reported as a success

### Requirement: The import's immutability guarantee is enforced by the database

The entry upsert SHALL be performed by a database function rather than assembled by application code.
The function SHALL NOT modify the stored instruction, source payload, or creation timestamp of an
existing row. The function SHALL refuse, by naming the entry, when an existing row's stored
instruction differs from the instruction being imported. The function SHALL report whether it
inserted or updated, using the database engine's own discriminator rather than a prior read. The
function SHALL run with invoker security and a pinned empty search path, and EXECUTE on it SHALL be
revoked from `PUBLIC` and granted only to the privileged server role.

#### Scenario: A re-run cannot rewrite an instruction

- **WHEN** the import is run against a row that already exists
- **THEN** the stored instruction, source payload, and creation timestamp are unchanged, and this
  holds because the database function's update list omits those columns rather than because a caller
  chose not to send them

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

- **WHEN** EXECUTE privileges on the function are inspected
- **THEN** they are revoked from `PUBLIC` and granted to the privileged server role, and an anonymous
  or authenticated caller is refused by the real gateway rather than merely finding the function
  absent
