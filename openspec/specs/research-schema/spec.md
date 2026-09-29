# research-schema Specification

## Purpose
Defines the persistent shape of the research data: the tables that hold dataset entries,
anonymous validators, and their validation responses; the constraints that make research-integrity
guarantees hold independently of application code; the indexes the coverage-aware allocation and
review paths depend on; and the Row Level Security posture that keeps research data unreadable
with a public key.

This capability is category-agnostic. Nothing in it specializes on a particular dataset category
or on the `OD_*` identifier convention, so a later category is a data import rather than a schema
change.

## Requirements

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

A stored response SHALL also be internally consistent, which a per-column constraint cannot
express. The database SHALL reject a response whose correction does not match its evaluation, a
translation whose language and text are not both present or both absent, and a translation attached
to an evaluation that carries nothing translatable. These SHALL be enforced by constraints written
to match the domain integrity rules exactly — neither wider, which would refuse a legitimate
response, nor narrower, which would be dead weight that looks like a guarantee.

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

#### Scenario: A response that no column constraint can catch is still rejected

- **WHEN** a response supplies a correction where the evaluation does not take one, omits the
  correction where the evaluation requires one, pairs a translation language with no text (or text
  with no language), or attaches a translation to an entry the validator could not evaluate
- **THEN** the database rejects it, because each of those combinations satisfies every per-column
  check and is still a record the domain schema refuses

#### Scenario: The consistency constraints do not refuse a legitimate response

- **WHEN** a response supplies a correction for an evaluation that requires one, a language and
  text together, and no translation at all for an entry that could not be evaluated
- **THEN** the database accepts it, because a constraint stricter than the domain's rules would
  destroy real research responses, which is the worse of the two failure directions

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

A refusal is not uniform across statement kinds, and the difference matters. Measured against a
real PostgreSQL engine, not assumed:

| Statement | Result as `anon` / `authenticated` |
| --- | --- |
| `select` | zero rows, **no error** |
| `update` | zero rows affected, **no error** |
| `delete` | zero rows affected, **no error** |
| `insert` | **rejected with** `new row violates row-level security policy` |

Only `insert` is loud. A denied `update` or `delete` is filtered by Row Level Security exactly as a
denied `select` is: the row is simply not visible to the statement, so the statement succeeds
against zero rows. Nothing was modified — the data is safe — but at the call site a successful
`update` that changed nothing is indistinguishable from one that changed something. That silent
half is why the repository contract forbids treating an empty result or an unremarkable write as
proof that a query did what it was asked to do, and why the server boundary, not this schema, is
what actually authorizes a request.

#### Scenario: A public credential sees no research data

- **WHEN** a `select` is attempted on any research table as `anon` or `authenticated`
- **THEN** it returns zero rows, because no policy grants those roles access

#### Scenario: A public credential cannot modify research data

- **WHEN** an `insert` is attempted on any research table as `anon` or `authenticated`
- **THEN** the database raises a Row Level Security error naming the table, so the attempt fails
  loudly rather than appearing to succeed

#### Scenario: A denied update or delete fails silently, and the schema does not pretend otherwise

- **WHEN** an `update` or `delete` is attempted on any research table as `anon` or `authenticated`
- **THEN** it completes without an error and affects zero rows, because Row Level Security filters
  the rows the statement may see rather than refusing the statement, and the specification does not
  claim a loudness this posture does not provide

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
- **THEN** every key, string, number, and null of the source record is stored with the value it
  has in the source, so capitalization, punctuation, and whitespace in Ilocano text are preserved
  exactly as authored, and the stored record is compared to the source as a value rather than as
  bytes, because `jsonb` does not preserve key order or insignificant whitespace and a byte
  comparison would assert a property the column type does not have

#### Scenario: Typed columns and the source record agree

- **WHEN** the import is verified
- **THEN** each typed column is compared against the corresponding field of the stored source
  record, so a divergence between the projection and the archival copy is detected rather than
  assumed away
