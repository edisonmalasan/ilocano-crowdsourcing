# Design

Technical decisions for `od-dataset-schema-and-import`. Each decision records the alternatives
that were rejected and why, because several of them look wrong until you know the constraint that
forced them.

## D1 — Anonymous identity means the schema never references `auth.uid()`

**Decision.** Primary keys are domain identifiers, not `uuid`s: `dataset_entries.id` is the source
id (`OD_0001`), `validators.id` is `VAL_` + 8 hex, and `validations`/`validation_batches`/
`validation_sessions` use opaque non-empty text. No table has a `uuid` surrogate key, and no
constraint, index, or default references `auth.users`.

**Why.** The PGlite harness stubs `auth.uid()` as `uuid | NULL` and provides no `auth.users`
table at all. The obvious workaround — give `validators` a `uuid` primary key that equals
`auth.uid()` and write a row-scoped policy — is the pattern the existing harness fixture uses
(`tests/integration/fixtures/0001_harness_probe.sql`). It does not apply here.

Validators in this platform are **anonymous**. There is no Supabase Auth session for a validator,
so `auth.uid()` is `NULL` on every validator-facing request. A policy of the form
`validator_id = auth.uid()` would not "protect" the validator's rows; it would make every one of
them permanently invisible, because the left side is a `VAL_…` text value and the right side is
`NULL`.

**Rejected.** `uuid` surrogate primary keys plus a `VAL_…` unique column. Rejected because it buys
nothing — nothing in the domain ever joins on `auth.uid()` — while adding a second identity per
row, a translation step at every boundary, and a mapping bug class that is silent and hard to see.

**Consequence.** The harness's uuid-shaped `auth.uid()` imposes no constraint on this schema, so
the migrations stay plain PostgreSQL and CI can apply them verbatim. See D2 for what RLS becomes.

## D2 — Row Level Security is enabled everywhere and granted to nobody

**Decision.** All six tables run `alter table … enable row level security` and declare **no
policies** for `anon` or `authenticated`. Every application read and write goes through a
server-side boundary holding the service-role credential, which bypasses RLS.

**Why.** In this architecture the browser holds no meaningful authority: a validator is anonymous
and has no session, and no client component is permitted to touch persistence at all (the ESLint
rule `sadino/no-privileged-imports` already blocks the import path). A permissive RLS policy would
therefore grant access that no legitimate caller needs, while a *missing* `enable row level
security` would leave every table readable by anything that obtained the public anon key.

Deny-by-default is the honest posture: it asserts "no public key can read research data" as a
property of the schema, and it is directly testable in PGlite — as `anon`, a `select` is refused;
as `service_role`, the same statement succeeds.

**What this honestly costs.** Application correctness rests on the server boundary, not on the
database. RLS is a backstop against a future mistake, not the primary control. Stated here rather
than implied: a reviewer who believes RLS is doing the authorization work would be wrong.

**Consequence for Phase 7.** When researcher authentication lands, admin-scoped `select` policies
for `authenticated` are added in that change. This change leaves the door closed, not ajar.

## D3 — `validation_sessions` and `batch_entries` are created structurally only

**Decision.** The roadmap's Phase 2 task list names six tables, so all six are created. But only
`dataset_entries`, `validators`, and `validations` get columns dictated by an existing domain
contract. `validation_batches`, `batch_entries`, and `validation_sessions` are created with the
minimum columns needed for the foreign keys to be real, and **this change writes no rows to them
and implements no behavior for them**.

**Why.** `validations.batch_id` is a required field in `ValidationResponse`, so
`validation_batches` must exist or the foreign key is fiction. But there is no `ValidationBatch`
Zod schema and no `ValidationBatchRepository` in the repository — `validation.ts` explicitly says
the batch lifecycle "is owned by the allocation change". Creating a richly-modelled batch table
here would mean inventing column semantics that Phase 4 has to live with or undo.

**Consequence.** These three tables are expected to gain columns via later `alter table`
migrations. That is a normal cost of shipping schema before behavior, and it is cheaper than
guessing the batch lifecycle in a phase that does not own it.

## D4 — A correction is a column on `validations`; the dataset entry is never written

**Decision.** `validations.corrected_instruction` holds the validator's corrected Ilocano. There
is no trigger, rule, or view that updates `dataset_entries.instruction`, and the importer's
conflict-resolution update path deliberately excludes `instruction` from what a re-run may change.

**Why.** `AGENTS.md` and the durable product constraints both state that the imported synthetic
instruction must never be overwritten by a validator correction. Corrections and translations are
separate response data. Making this a *structural* property — the write path simply does not
exist — is stronger than relying on every future caller to remember.

**How it is proven.** A PGlite test inserts a validation carrying a correction, then asserts the
`dataset_entries.instruction` for that entry is byte-identical to the source JSON. The negative
case (an `update` that tries) is not simulated; the point is that no code path performs one.

## D5 — The original source record is stored verbatim in `source_payload`

**Decision.** `dataset_entries.source_payload jsonb not null` holds the source JSON object for that
entry, unmodified. The importer is **non-strict**: unrecognized top-level and `output` keys are
preserved there rather than rejected or discarded, and the import report lists them by name.

**Why.** This is the first implementation of the `data-access-boundary` rule "unknown fields are
not silently dropped", and the rule's own rationale is that a dropped field is an unrecoverable
research record. The current 600 records happen to have exactly three top-level keys and three
`output` keys, so a strict parser would pass every test today and still be one dataset revision
away from destroying data. `source_payload` means the failure mode is "an extra column we have not
surfaced yet", which is recoverable, rather than "a field we deleted", which is not.

**Consequence.** `source_payload` is the archival copy; the typed columns are a query-friendly
projection of it. A disagreement between them is itself a signal worth investigating, so the
verification step compares them.

## D6 — Import is a pure parse plus a thin idempotent write

**Decision.** Two separable halves:

- `parseSyntheticDataset(raw: unknown)` — pure, no I/O, no database. Returns validated
  `DatasetEntryInput` records plus a report of preserved-but-unmodelled fields.
- `importDatasetEntries(entries, sink)` — takes a writer and is **idempotent**, upserting on the
  source id so a re-run corrects rows rather than duplicating them.

**Why.** The parse half is where every research-integrity risk lives (field loss, text
normalization, ID corruption) and it is fully unit-testable with no database at all. Keeping it
separate means the PGlite integration test and the hosted Supabase import exercise *the same
parsed records*, so a passing test says something about the real import.

**Rejected.** Having the importer talk to Supabase directly. Rejected because then nothing about
the import could be verified until a Supabase project exists, and the Phase 2 deliverable would be
stuck behind credentials. **This is the decision that keeps the change unblocked.**

## D7 — Verification runs against the real migrations in PGlite

**Decision.** An integration test calls `applyMigrations(db)` with **no directory argument** —
the default `supabase/migrations/` path that has never been exercised — then inserts all 600
parsed records and asserts record count, the exact `OD_0001`–`OD_0600` id set, per-record
instruction equality against the source file, and `source_payload` fidelity. It separately asserts
the `UNIQUE (validator_id, dataset_entry_id)` constraint rejects a duplicate and accepts a
different validator, and that RLS refuses `anon` while permitting `service_role`.

**Why.** PGlite is PostgreSQL compiled to WebAssembly. It evaluates the *same* SQL engine for
constraints, foreign keys, and RLS policies. That converts "we have no database, so we cannot
check anything" into "we can check the schema, and only the hosted deployment is unverified."

**What this explicitly does not prove.** It does not prove Supabase Auth, Storage, Realtime,
PostgREST behaviour, or RLS *as enforced by the Supabase API gateway* rather than by the database
engine. It does not prove the migrations have been applied to a real project. The hosted import
remains blocked on credentials and is recorded as such.

**One test-shape detail that is load-bearing.** `applyMigrations` wraps each file in a
transaction, so a migration **cannot** use `CREATE INDEX CONCURRENTLY` or contain its own
`begin;`/`commit;`. `tests/integration/pglite-harness.test.ts` asserts the applied filename list
with `toEqual([...])` rather than a length check, precisely so a broken glob or path cannot pass
silently. The new test keeps that discipline.

## D8 — Repository implementations live at the path the lint rule already reserves

**Decision.** `src/lib/repositories/supabase/` holds one class per interface. Each file imports
`"server-only"` as its first import, translating rows to domain types and raising
`RepositoryError` with an operation name from the existing `RepositoryOperation` union.

**Why.** `eslint.config.mjs` already lists `@/lib/repositories/supabase` in
`PRIVILEGED_SPECIFIERS` for a directory that does not exist. Using that exact path means the
boundary is enforced the moment the code lands, with no lint configuration change and no window in
which an implementation could be imported from a client component unnoticed.

**Note for the implementer.** The union in `errors.ts` and the interface method names are not
linked by a type-level assertion, and they do not currently agree on one name
(`RepositoryOperation` says `"validators.insert"`; the interface method is `create`). Whoever
implements this should decide which name is authoritative and make the mismatch impossible rather
than leaving it to a reader.

## Verification strategy summary

| Claim | How it is checked | Strength |
| --- | --- | --- |
| 600 records import without loss | PGlite + real migrations + real parser, per-record comparison | Real engine, real SQL |
| `UNIQUE (validator_id, dataset_entry_id)` holds | PGlite: duplicate rejected, different validator accepted | Real engine |
| Correction never mutates the entry | PGlite: insert validation, assert instruction unchanged | Real engine |
| Unknown fields survive | PGlite: a record with an extra key round-trips into `source_payload` | Real engine |
| Public keys cannot read research data | PGlite as `anon` (refused) and `service_role` (permitted) | Real engine, **not** the Supabase gateway |
| Parsed records match the source | Unit test over the real 600-record file, byte comparison | No DB needed |
| Migrations apply cleanly in order | Integration test asserting the exact applied filename list | Real engine |
| Repositories stay server-only | ESLint `sadino/no-privileged-imports` | Static |
| **Migrations applied to a real Supabase project** | — | **Not verified. Blocked on credentials.** |
