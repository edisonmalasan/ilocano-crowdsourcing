# Proposal

## Why

The platform has a dataset, an anonymous-validator model, an approved screening flow, and a single
unambiguous definition of coverage — but no way to *use* any of it. A validator can enroll and then
has nothing to validate, because nothing chooses entries or records the choice. This is the
bottleneck the roadmap calls the allocation engine, and it is the last step before the core
validation experience can be built.

The defining constraint is that allocation must be **coverage-aware**, and coverage was redefined in
`required-bilingual-translations` to mean *qualifying* completed validations from distinct
validators, counted by the single pure predicate in `@/lib/domain/validation-response`. The obvious
implementation — count the rows in `validations` per entry and give the ten least-validated entries
to the next validator — is now **wrong by construction**. An entry with three `cannot_evaluate`
responses looks fully covered under a raw count and would be silently retired from the pool while
having received no evaluable judgment at all. That is precisely the failure the previous change
spent three verification rounds making impossible to express.

The repository is unblocked: `isQualifyingValidation` and `countQualifyingValidations` are in force,
the batch request contract and its configuration bounds already exist in `@/schemas/batch`, and the
structural `validation_batches` / `batch_entries` tables exist with a comment deferring their
lifecycle to exactly this change.

## What Changes

- Add a **pure selection function** over plain data that picks a batch from a candidate pool using
  qualifying coverage: exclude entries the requesting validator already answered, exclude entries
  whose qualifying count has reached the configured target, order the remainder by ascending
  qualifying count, randomize **within** each equal-count group, and take up to the effective batch
  size.
- Add a **server-authoritative allocation service** that composes the dataset-entries, validations,
  and a new batches repository, applies the single qualifying-coverage definition in the
  application, and persists the result as a batch with server-derived entry positions.
- Add a `BatchesRepository` to the persistence seam plus its Supabase implementation, and extend
  the validations seam with the coverage reads allocation needs (`listForEntries`, and the entry
  ids a validator has already answered).
- Add a **forward migration** giving `batch_entries` a `position` column — the randomized order the
  server chose — because `validation_batches` / `batch_entries` were deliberately created carrying
  only the columns their foreign keys require, with their lifecycle explicitly reserved for this
  change.
- Add the batch-request **Server Action** boundary (core + `use server` wrapper) so allocation is
  reachable through the only path a client may take, and a client can never dictate the entry list,
  the order, the coverage counts, or the target.
- Report **pool exhaustion** as a distinct, honest outcome rather than an empty batch, so "nothing
  was left for you" can never be confused with "the database is unreachable" — the same
  no-data-vs-failed distinction the repository error contract already enforces.
- No UI. The validation screens, the batch-completion flow, and interrupted-batch recovery are
  later phases and are deliberately not touched.

### Scope decisions recorded rather than deferred silently

- **`requested_size` is NOT re-added to `validation_batches`.** The base migration removed it
  because it would have been a second authority for `BATCH_SIZE_HARD_MAX`. Re-adding it in the very
  change that now owns the constant would reintroduce the duplication a reviewer already removed,
  and the roadmap's own suggested fields for the table do not include it. The effective size is
  already observable as `count(batch_entries)`.
- **`status`, `completed_at`, and `assigned_at` are NOT added.** They are batch-*lifecycle* state
  belonging to the batch-completion and interrupted-batch phases. Adding them now would define
  lifecycle behavior no code implements, which is the exact "structural table carries no invented
  behavior" rule this change is relaxing in one specific, named respect.
- **The Server Action is in scope.** The in-force `data-access-boundary` requirement already names
  "request a batch" as a service-boundary call, and the roadmap's deliverable is that a validator
  *receives* a batch. Without the action the engine would be reachable only from tests.

## Capabilities

### New Capabilities
- `batch-allocation`: how a validator's next batch is chosen — the qualifying-coverage-driven,
  randomized, server-authoritative selection rules, the persistence of that choice as a batch, and
  the honest reporting of an exhausted pool.

### Modified Capabilities
- `research-schema`: the `batch_entries` structural-table scenario currently requires that the
  structural tables "carry only the columns those foreign keys and their own identity require, and
  no behavior is defined for them until the allocation change owns their lifecycle." This change is
  that allocation change, so the requirement is narrowed to name precisely what it now owns — the
  server-derived `position` — and to keep the remaining lifecycle columns unowned.

## Impact

**New:** `src/lib/domain/allocation.ts`, `src/lib/repositories/batches-repository.ts`,
`src/lib/repositories/supabase/batches.ts`, `src/lib/allocation/allocate-batch.ts`,
`src/lib/allocation/allocation-actions-core.ts`, `src/lib/allocation/actions.ts`,
`supabase/migrations/<new>_allocation_batch_positions.sql`, and unit/integration tests for each.

**Modified:** `src/lib/repositories/{errors,operations,index,types}.ts` (new operations and the new
seam export), `src/lib/repositories/validations-repository.ts` and
`src/lib/repositories/supabase/{validations,factory,index}.ts` (coverage reads and wiring),
`src/schemas/batch.ts` (the allocation outcome contract), `docs/ROADMAP.md` project status.

**Explicitly unchanged:** `data/ilocano-synthetic-data.json` and every other immutable
research-source file; `supabase/migrations/20260930120000_research_schema.sql` (immutable base,
hash-guarded — this change adds a forward migration, it does not edit history); the dataset
`instruction` column; the anonymous identity model; the approved screening question and its
choices; the existing repository error contract; and every archived spec.

**Blocked as before:** no Supabase credentials exist, so the new Supabase implementations and the
new migration can only be verified against the PGlite engine, never against a real project.
