# Proposal

## Why

`project-foundation` delivered the domain contracts, the repository *interfaces*, the Supabase
client boundary, and a PGlite harness that boots a real PostgreSQL engine. It deliberately
delivered **no schema and no importer**, so three things the rest of the platform depends on do
not exist yet:

1. **The at-most-once rule is unenforced.** `domain-contracts` states that one validator holds at
   most one validation per entry, and records plainly that the database constraint is *not yet
   implemented* and that the platform is not compliant until it is. Today that rule is a
   convention in a comment. Until the constraint exists in the database, a bug anywhere in the
   write path silently inflates coverage counts — and coverage is the axis the entire allocation
   engine is built on.
2. **The dataset is not in the database.** The 600 `OD_*` records exist only as an immutable JSON
   file. The Phase 2 deliverable — a database containing the Origin + Destination dataset — has
   not been started.
3. **The repository seam has no implementation.** `src/lib/repositories` exports interfaces and
   nothing else, so `data-access-boundary`'s "unknown fields are not silently dropped" rule is
   documented but has no code that could honour it.

This change closes all three, and it carries the four items the archived `project-foundation`
`tasks.md` explicitly deferred to it.

## What Changes

- Add real PostgreSQL migrations under `supabase/migrations/`, authored as **plain PostgreSQL** so
  the existing PGlite harness can apply them verbatim in CI. The directory currently contains only
  a README; the default migration-applier code path has never actually run.
- Create the six tables the roadmap names: `dataset_entries`, `validators`,
  `validation_sessions`, `validation_batches`, `batch_entries`, `validations`.
- Add the constraints the domain contracts already depend on, most importantly
  **`UNIQUE (validator_id, dataset_entry_id)` on `validations`**, which retires the
  "not yet implemented" caveat in `domain-contracts`.
- Add the indexes coverage-aware allocation and the admin dashboard will need, and Row Level
  Security on every table, configured **deny-by-default** for `anon` and `authenticated`.
- Preserve every field of the source JSON in a `source_payload` column so an unmodelled field can
  never be lost — the first implementation of the `data-access-boundary` preservation rule.
- Implement the Supabase-backed repository classes under `src/lib/repositories/supabase/`, the
  path the ESLint boundary rule already reserves.
- Add a pure dataset parser and an idempotent importer, and verify all 600 records are imported
  without loss against a real PostgreSQL engine.

**BREAKING** (pre-release): `domain-contracts` → "Validator must not validate the same entry
twice" changes from *documented but unimplemented* to *enforced by the database*. That is the
intent of the requirement, not a new obligation, but the caveat paragraph is removed.

## Capabilities

### New: `research-schema`

The persistent shape of the research data: the six tables, their constraints, their indexes, and
the Row Level Security posture. The capability is deliberately category-agnostic — nothing in it
specializes on `OD_*`, so a later dataset category is a data import, not a schema rewrite.

### New: `dataset-import`

Turning the immutable synthetic dataset into canonical `dataset_entries` rows, and proving that
all 600 records survive the trip. Covers parsing, field preservation, idempotency, and
verification.

### Modified: `domain-contracts`

"Validator must not validate the same entry twice" — the paragraph declaring the constraint
unimplemented is replaced with the constraint actually existing, named, and asserted in the PGlite
harness. Its scenarios are otherwise unchanged.

## Non-goals

- **Any user-facing route or component.** No landing page, screening UI, or validation screen.
- **Allocation.** Choosing which entries a validator gets is Phase 4. `batch_entries` and
  `validation_batches` are created *structurally* so the foreign keys are real; no row is ever
  written to them by this change and no allocation logic is added.
- **The admin area and researcher authentication.** Row Level Security is deny-all for
  `anon`/`authenticated` here. When admin authentication lands, policies are added in that change.
- **Export.** Phase 8.
- **Supabase-managed features.** No Auth, Storage, or Realtime. Nothing here depends on
  `auth.users`, which the PGlite harness does not provide.
- **Editing the source dataset.** `data/ilocano-synthetic-data.json` is read-only input and is not
  touched.

## Dependencies and blockers

- Depends on `project-foundation` (merged, PR #3): schemas, repository interfaces, PGlite harness.
- **Blocked for hosted verification only:** no Supabase project credentials exist. The schema, the
  import, and the 600-record verification are proven against a real PostgreSQL engine via
  PGlite, so this change is not blocked. Applying the same migrations to a hosted Supabase project
  is the remaining step and is recorded in `docs/ROADMAP.md`.

## Carried over from `project-foundation`

From the archived `tasks.md` → "Deferred — not delivered by this change":

| Deferred item | Where it lands |
| --- | --- |
| `UNIQUE (validator_id, dataset_entry_id)` + PGlite proof | `research-schema` |
| Repository implementations `src/lib/repositories/supabase/**` | `data-access-boundary` (satisfies existing requirements) |
| "Unknown fields are preserved and surfaced" | `research-schema` + `dataset-import` |
| Default `supabase/migrations/` applier path exercised end to end | `dataset-import` (integration test) |
