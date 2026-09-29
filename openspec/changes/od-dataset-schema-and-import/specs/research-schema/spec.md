# Spec Delta

## Purpose

Defines the persistent shape of the research data: the tables that hold dataset entries,
anonymous validators, and their validation responses; the constraints that make research-integrity
guarantees hold independently of application code; the indexes the coverage-aware allocation and
review paths depend on; and the Row Level Security posture that keeps research data unreadable
with a public key.

This capability is category-agnostic. Nothing in it specializes on a particular dataset category
or on the `OD_*` identifier convention, so a later category is a data import rather than a schema
change.

## ADDED Requirements

### Requirement: Research data is stored in a versioned migration set

The research schema SHALL be defined by plain PostgreSQL migration files under
`supabase/migrations/`, applied in lexical filename order, one transaction per file. A migration
SHALL NOT depend on a Supabase-managed extension, and SHALL NOT contain its own transaction
control statements.

#### Scenario: Migrations apply in a deterministic order

- **WHEN** the migration files in `supabase/migrations/` are read
- **THEN** they are ordered lexically by filename, and the ordering is stable across runs

#### Scenario: A migration is applied atomically

- **WHEN** applying a migration file fails partway through
- **THEN** that file's changes are rolled back in full and no half-applied state is left behind

#### Scenario: A migration runs inside a real PostgreSQL engine in CI

- **WHEN** the migration set is applied by the integration test harness
- **THEN** it is applied without modification, and the harness asserts the exact list of filenames
  that were applied rather than only a count

#### Scenario: A migration does not depend on an unavailable Supabase feature

- **WHEN** a migration references the `auth` schema
- **THEN** it references only `auth.uid()` and `auth.role()` inside Row Level Security policies,
  because the test harness provides no other Supabase-managed object

### Requirement: Six research tables exist with the documented shape

The platform SHALL provide `dataset_entries`, `validators`, `validation_sessions`,
`validation_batches`, `batch_entries`, and `validations`. Primary keys SHALL be the domain
identifiers defined by the domain contracts — the source dataset entry id, the anonymous validator
id, and opaque non-empty text elsewhere — and SHALL NOT be surrogate `uuid` values, because no
validator in this platform is a Supabase authenticated user and nothing in the domain joins on an
authentication subject.

#### Scenario: A dataset entry is keyed by its source identifier

- **WHEN** a dataset entry is stored
- **THEN** its primary key is the source dataset entry id, so the externally meaningful
  identifier is preserved rather than replaced by an internal one

#### Scenario: A validator is keyed by its anonymous identifier

- **WHEN** an anonymous validator profile is stored
- **THEN** its primary key is the anonymous validator id and no column exists for a name, email
  address, student id, phone number, or address

#### Scenario: The schema does not couple identity to an authentication subject

- **WHEN** the schema is inspected
- **THEN** no primary key, foreign key, index, or default value references `auth.users` or
  `auth.uid()`, because an anonymous validator has no authentication subject

#### Scenario: Structural tables carry no invented behavior

- **WHEN** `validation_sessions`, `validation_batches`, and `batch_entries` are created
- **THEN** they exist so that foreign keys from `validations` are real, they carry only the
  columns those foreign keys and their own identity require, and no behavior is defined for them
  until the allocation change owns their lifecycle

### Requirement: The database independently enforces research-integrity rules

The database SHALL enforce, by constraint rather than by application convention, that one
validator holds at most one validation for a given dataset entry; that every stored evaluation is
one of the four approved values; that every stored proficiency is one of the five approved values
or absent; that every stored translation language is an approved target or absent; and that a
stored correction is either present-and-non-empty or absent.

A constraint violation SHALL be surfaced to the caller as a typed error naming the failed
operation, and SHALL NOT be swallowed as a successful no-op.

#### Scenario: A second validation for the same pair is rejected by the database

- **WHEN** a second validation is inserted for the same validator and the same dataset entry
- **THEN** the database rejects the insert on the uniqueness constraint, independently of any
  application check, and the caller receives a typed error rather than a success

#### Scenario: Different validators may validate the same entry

- **WHEN** two different anonymous validators each insert a validation for the same dataset entry
- **THEN** both inserts succeed, because coverage depends on independent validators

#### Scenario: The uniqueness constraint is asserted against a real database engine

- **WHEN** the migration set is applied and the constraint is exercised
- **THEN** a duplicate insert is rejected and a different validator's insert is accepted, proven
  by the PostgreSQL integration harness rather than only by an application test

#### Scenario: Only approved vocabulary is stored

- **WHEN** a validation or validator row is written with a value outside the approved vocabulary
- **THEN** the database rejects it, so an unapproved evaluation or proficiency label cannot enter
  the research record even if application validation is bypassed

#### Scenario: A correction is never written onto the dataset entry

- **WHEN** a validation carrying a corrected Ilocano version is stored
- **THEN** the corrected text is stored on the validation record, and the dataset entry's
  instruction is unchanged, because the imported synthetic instruction is immutable research
  material

### Requirement: The coverage and review queries the platform depends on are indexed

The schema SHALL provide the indexes that coverage-aware allocation and research review require:
per-entry and per-validator validation lookups, per-batch and per-entry assignment lookups, and
active entries by category. Indexes SHALL be created as part of a migration rather than
concurrently, because migrations run inside a transaction.

#### Scenario: Coverage counting for an entry is index-supported

- **WHEN** the number of independent validators for a dataset entry is counted
- **THEN** the query is supported by an index on the entry reference, because coverage is
  recomputed for many entries during allocation

#### Scenario: Entries eligible for allocation are index-supported

- **WHEN** the pool of active entries in a category is selected
- **THEN** the query is supported by a partial index restricted to active entries, so retired
  entries do not enlarge the pool

### Requirement: Research data is not readable with a public key

Row Level Security SHALL be enabled on every research table. No policy SHALL grant `anon` or
`authenticated` access to any research table, so a public or anon credential is refused by
default. Application access SHALL be server-side through the privileged path.

This is a backstop against a future mistake, not the primary authorization control: with no
validator session and no client-side persistence access, the server boundary is what authorizes
requests, and the database refuses everything else.

#### Scenario: A public credential is refused

- **WHEN** a `select` is attempted on any research table as `anon` or `authenticated`
- **THEN** the database returns no rows and raises a Row Level Security error, because no policy
  grants access to those roles

#### Scenario: Privileged server access still works

- **WHEN** the same `select` is attempted as the privileged role
- **THEN** it succeeds, so the deny-by-default posture does not block the platform's own
  server-side access

#### Scenario: The refusal is proven, not assumed

- **WHEN** the Row Level Security posture is verified
- **THEN** the check runs against a real PostgreSQL engine with the roles actually impersonated,
  and never uses the privileged role to demonstrate a refusal, because that role bypasses Row
  Level Security entirely

### Requirement: No source field is lost when an entry is imported

Each `dataset_entries` row SHALL retain the original source record verbatim in a JSON column, and
the importer SHALL preserve unrecognized source fields in that record rather than rejecting or
discarding them. The import SHALL report which fields were present in the source but are not
modelled by the current domain type.

#### Scenario: An unmodelled field survives the import

- **WHEN** a source record contains a field the current domain type does not model
- **THEN** the value is retained in the stored source record and named in the import report,
  rather than discarded

#### Scenario: The stored record is not silently normalized

- **WHEN** an entry is imported
- **THEN** the stored source record is byte-equivalent in content to the source record, so
  capitalization, punctuation, and whitespace in Ilocano text are preserved exactly as authored

#### Scenario: Typed columns and the source record agree

- **WHEN** the import is verified
- **THEN** each typed column is compared against the corresponding field of the stored source
  record, so a divergence between the projection and the archival copy is detected rather than
  assumed away
