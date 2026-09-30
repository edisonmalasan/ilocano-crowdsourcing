# Design

## Context

See `proposal.md` — *Why* for the motivation. What follows is only the current state and the
constraints that actually shaped the approach.

Three things already exist and are treated as fixed inputs:

- `@/lib/domain/validation-response.ts` exports `isQualifyingValidation` (per response) and
  `countQualifyingValidations` (over a set), imports nothing, and is in force under
  `domain-contracts`. The in-force spec says the definition "SHALL be expressed once, as a pure
  function over the domain response type, and SHALL be the only definition used by allocation,
  coverage reporting, and export."
- `@/schemas/batch.ts` already provides `allocationConfigSchema` (`batchSize` default 10, hard max
  50; `independentValidationTarget` default 3, hard max 100), `batchRequestSchema`, and
  `resolveBatchSize`. The last of these already documents the expectation that a caller "is
  responsible for returning fewer than the effective size when the candidate pool is smaller."
- `validation_batches` and `batch_entries` exist with only `id` + `validator_id` and
  `batch_id` + `dataset_entry_id`. The base migration's own comment says `requested_size` and
  `assigned_at` "were written here first and removed during review" and "can be re-added, with the
  allocation behavior it belongs to," and the `research-schema` spec's structural-table scenario
  says no behavior is defined for these tables "until the allocation change owns their lifecycle."

Two hard constraints from the surrounding architecture:

- **No Supabase project exists.** `SUPABASE_URL` and both keys are absent, `getServerEnv()` throws
  on every real request, and no Supabase client has ever been constructed. Everything verifiable
  here runs against PGlite or against fakes.
- **The client may never dictate authoritative state.** `data-access-boundary` already requires that
  a client which needs to "request a batch" call the server-side service boundary.

## Goals / Non-Goals

**Goals:**

- One selection rule, pure, over plain data, with every branch reachable by an injected random
  source.
- Coverage computed by the one in-force definition, applied in the application.
- A selection that cannot silently fall back to a raw row count.
- A persisted record of the choice, with an order the server derived.

**Non-Goals:**

- Any UI. Phase 5 owns the validation screens; the `/ready` page is untouched.
- Batch lifecycle: status, completion, resume, abandonment. Later phases.
- Concurrency control on allocation. Two simultaneous requests for the same validator could in
  principle receive overlapping batches. This is recorded under Risks rather than solved with
  locking, because a validator requesting two batches simultaneously is not a flow the product
  offers, and the uniqueness guarantee that matters — one response per validator per entry — is
  already enforced by the database.

## Decisions

### D1. Coverage is counted in the application, not in SQL

`allocateBatch` reads the candidate pool's stored responses once and reduces them with
`countQualifyingValidations`. The query is a plain `.in("dataset_entry_id", pool)` on
`validations`, which `validations_dataset_entry_id_idx` already supports.

**Alternative considered and rejected: compute qualifying coverage in SQL** — a `where` clause
mirroring the rule, with `count(distinct validator_id) group by dataset_entry_id`, optionally behind
a partial index. It is faster, and at scale it is the right answer. It is rejected here for one
decisive reason: the rule would then exist in TypeScript *and* in SQL, and nothing would keep them
in agreement. The in-force spec explicitly requires a single definition expressed once, and the
previous change already found and removed a second predicate (`isTranslatableContent`) for being
byte-identical to the first — a second *SQL* copy of the same rule is a much larger surface for the
same failure, because a drifted SQL predicate would quietly produce wrong coverage with no test able
to see it.

**Cost, stated honestly.** This ships response rows to the server to count them. At the current
scale — 600 entries × 3 validators = at most 1800 rows, and fewer in practice because only
under-covered entries are queried — that is small. If a future dataset reaches six figures, this
decision should be revisited, and the right revisit is a SQL-side projection of *only the columns
the predicate reads*, not a re-implementation of the predicate. Recording the threshold rather than
pretending the current approach scales indefinitely.

### D2. "Prioritize the lowest count, then randomize" means a tiered fill, not a lowest-tier-only batch

The roadmap's allocation rules 4, 5, and 6 say, in order: prioritize the lowest qualifying count;
randomize within the lowest-qualifying-count candidate pool; return **up to** 10 entries. Read
strictly in sequence, that yields a batch drawn only from the single lowest-count group — so a
dataset with 4 uncovered entries out of 600 would serve batches of 4.

That reading is rejected, for a reason internal to the roadmap rather than a preference. Section 6.4
opens with "Each batch contains: 10 dataset entries," and the existing `resolveBatchSize`
documentation already states the expectation that "a validator at the end of the dataset with only
three eligible entries will still be served three entries." Rules 4 and 5 describe *prioritizing* and
*randomizing*; neither says "stop at the first group."

**The implemented rule:** group eligible entries by qualifying count, iterate the groups in ascending
count, shuffle within each group, concatenate, take the effective batch size. Lower coverage is
therefore always preferred, and a higher-coverage entry is reached only when the groups below cannot
fill the batch. Rule 5 is still honoured in the sense that matters: within any one coverage level,
nothing is preferred.

This is a methodology judgment, and it is recorded here as one the thesis team can overturn without a
code change — the alternative is a one-line difference in the selection function. It is *not*
recorded as an open question, because leaving it undecided would mean implementing the batch-size
behavior by accident.

### D3. The selection is grouped, not sorted

Grouping by count into a `Map<number, Entry[]>` and iterating the keys ascending avoids relying on
`Array.prototype.sort` stability to keep equal-coverage entries contiguous. It is also directly the
data structure the rule needs: "shuffle within each group, groups in ascending order." A test can
assert the group structure without re-deriving a comparator.

### D4. Randomness is injected as `() => number`, and the shuffle is Fisher–Yates

`selectBatchEntries(…, random: () => number)` performs a standard inside-out Fisher–Yates. Rejected
alternatives: `Math.random()` read inside the domain (untestable, and the process-wide mutable state
the architecture rules exclude); a seeded PRNG held in module scope (shared mutable global state —
the same exclusion); `crypto.getRandomValues` (a better entropy source but the same untestability
problem, since it is not a parameter).

The spec scenario "the same inputs and the same supplied randomness produce the same order" is
testable only because of this decision, and it is the guard against a future edit reintroducing
ambient randomness into a rule that must stay verifiable.

### D5. A new `BatchesRepository`, and the validations seam gains two read methods

A batch is its own aggregate with its own identity, so it gets its own repository rather than
becoming a method on `ValidationsRepository`. This is enforced rather than merely intended: each
repository's operation map is `satisfies Record<keyof Interface, RepositoryOperation>`, so adding
`create` to the interface without adding its operation is a compile error.

`ValidationsRepository` gains:

- `listForEntries(entryIds)` — every stored response for the candidate pool, for D1. It returns
  `ValidationResponse[]` and deliberately does **not** filter: filtering is the domain predicate's
  job, and a repository that pre-filtered would be a second implementation of the rule.
- `listEntryIdsForValidator(validatorId)` — the entries a validator has already answered, so
  allocation can exclude them. Ids only, because that is all the rule reads.

`countForEntry` and `countForValidator` are left exactly as they are. They are raw, distinct-validator
diagnostics for the admin dashboard, which roadmap section 9 explicitly calls "diagnostic only; NOT
the coverage number." Their existing doc comment is accurate and stays. The risk this creates is a
future author reaching for the convenient count; the mitigation is naming and a spec scenario that
requires the qualifying path, not removing a method the admin needs.

### D6. The Supabase implementations select whole rows, and the nullability decision is recorded

`listForEntries` selects the same ten columns as `findByEntry` and maps through the same row ⇄
domain translation, so the NULL ⇄ absent rules for `corrected_instruction` and the two translation
columns are applied by code that already exists and is already tested. A narrowed projection was
considered and rejected: the predicate reads `evaluation`, `corrected_instruction`,
`english_translation`, `filipino_translation`, and `validator_id`, and `ValidationResponse` also
carries `batch_id`, `createdAt`, and `updatedAt`. Selecting a subset would mean either fabricating
those three values or introducing a second domain type with its own nullability rules — a second
place to get the bilingual rules wrong, for the sake of a few hundred bytes. Correctness wins; see
D1 for the scale at which that trade is revisited.

`listEntryIdsForValidator` genuinely does select one column, because it maps to
`DatasetEntryId[]` and nothing else. A count already has that shape in the existing
`countForValidator`.

### D7. The batch result carries a narrowed entry, not the whole `DatasetEntry`

`DatasetEntry` includes `source_payload` — the entire unmodified source JSON record. The
validation screen needs an id, a category, the instruction, the origin, the destination, and the
transit mode. It does not need the raw source record, the import timestamp, or the active flag.

So the service returns an `AllocatedEntry` — a narrow structural type carrying exactly the renderable
fields — rather than a `DatasetEntry`. This is the concrete form of the boundary requirement that
allocation "receives only the data needed to render", and it is a real minimization rather than a
cosmetic one: `source_payload` is the one field that carries whatever an unmodelled source field
happened to contain, and the thesis dataset may gain categories with fields this platform has never
heard of.

### D8. Outcomes are a closed union, and exhaustion is a normal result

```text
{ status: "allocated", batchId, entries }   — at least one entry, by construction
{ status: "exhausted" }                    — no eligible entry remained
{ status: "failed", reason }               — invalid | unknown_validator | persistence | not_configured
```

`exhausted` is separated from `failed` for the same reason `RepositoryError` exists: "nothing was
left for you" and "the database was unreachable" are opposite conditions, and collapsing them either
strands a validator with a silent error or reports a database fault that did not happen. Because the
repository raises on failure, `exhausted` is computed only from data that was actually read — it can
never be the result of a failed query.

The service verifies the validator exists before allocating. The `validation_batches.validator_id`
foreign key would reject an unknown id anyway, but a caller that can allocate batches against
identifiers that name nobody is a defect regardless of whether the database catches it.

### D9. `position` arrives by forward migration, guarded by a refusal rather than a backfill

New migration adds `batch_entries.position integer`, then:

1. raises if any `batch_entries` row already exists, naming the conflict and stating that the
   existing order is not recoverable and will not be invented;
2. sets the column `not null` with a `> 0` check and a unique constraint on `(batch_id, position)`.

**Why refuse instead of backfill.** There is no correct value to backfill: a pre-existing row's
position would be a fabrication, and this project's migrations have a settled precedent of refusing
rather than discarding, backfilling, or assuming an empty table.

**What this guard is and is not worth — CORRECTED after measurement.** An earlier version of this
section claimed that, unlike the bilingual-translation precondition, this one had "no second guard
behind it" and that deleting it was therefore what made it worth having. **That claim was false and is
withdrawn.** `alter column position set not null` does refuse on a non-empty table, exactly as
`ADD CONSTRAINT ... CHECK` refuses against pre-existing rows, so transaction rollback and `set not
null` are what make the migration *safe*. The `do` block makes the refusal *legible*, and that is the
entire value of it.

Deleting the block is nonetheless **observable**, and the two claims are independent rather than
contradictory. Measured, with a `13 passed (13)` control in both cases:

- removing the whole `do $$ … end $$;` block → `Tests 2 failed | 11 passed (13)`, both refusal tests,
  and the two received messages are `column "position" of relation "batch_entries" contains null
  values` and `column "position" of relation "batch_entries" already exists`;
- removing **only** the emptiness precondition, leaving the re-application guard in place →
  `Tests 1 failed | 12 passed (13)`, the emptiness refusal test alone.

**A measurement of this guard was initially reported as falsified and was not.** The first pass here
spliced out only the emptiness precondition, got `1 failed`, and concluded that the migration's own
comment had misattributed its `2 failed | 11 passed` figure. It had not: the comment says "deleting
this `do` block", the whole-block removal reproduces `2 failed` exactly, and the narrower mutation was
simply a different experiment. The retraction is recorded in `AGENTS.md` because the failure mode —
**a confident wrong finding produced by a mutation narrower than the one the claim describes** — is
the same one that produced this section's original error, in the opposite direction. A probe that
cannot state which mutation it performed cannot be used to correct a claim about a different one.

`requested_size` is **not** re-added, despite the base migration inviting it. Re-adding it here would
reintroduce exactly the second authority for `BATCH_SIZE_HARD_MAX` that a reviewer already removed it
for, and the effective size is already observable as the number of rows in `batch_entries`. The
invitation in the comment is read as "the constant is now owned by Phase 4," not "re-add the column."

### D10. No new index, and the reason is different from last time

`validations_dataset_entry_id_idx` serves the coverage pass and
`dataset_entries_active_category_idx` serves the pool. No index can serve the *predicate*, because
the predicate is not expressed in SQL (D1) — this is the same omission recorded for the previous
change, reached for the same reason rather than inherited from it.

## Risks / Trade-offs

- **A later author uses `countForEntry` for allocation because it is the convenient method** → the
  raw-count trap this change exists to close. *Mitigation:* the qualifying path is a scenario
  (`An entry whose responses are all non-qualifying stays in the pool`) that fails loudly against a
  raw count; the existing doc comment on `countForEntry` already calls itself diagnostic; and the
  repository interface for dataset entries still forbids coverage methods, keeping the coverage rule
  owned in exactly one place.
- **D2's tiered fill is the wrong methodology choice.** → *Mitigation:* isolated in one function, the
  alternative is a one-line change, and the reasoning is recorded above rather than left implicit in
  the code.
- **Allocation is not concurrency-safe.** Two overlapping requests for one validator could produce
  overlapping batches. → *Mitigation:* the product offers no such flow; the guarantee that one
  validator produces at most one response per entry is enforced by
  `validations_validator_entry_unique` regardless. Recorded in Non-Goals rather than silently
  deferred.
- **D1 ships rows to count them.** → *Mitigation:* the scale threshold is stated, and the revisit path
  (narrow projection, not a duplicated predicate) is named.
- **The action remains unreachable from a page until Phase 5.** → *Mitigation:* the in-force
  `data-access-boundary` scenario already names "request a batch" as a service-boundary call, so this
  is finishing a requirement rather than adding a speculative surface; the core is fully unit-tested
  against fakes.
- **Nothing here can be verified against Supabase.** → *Mitigation:* recorded as a blocker, unchanged
  from every prior change. The migration is verified on PGlite, which proves SQL, constraints, and RLS
  as the *engine* evaluates them and proves nothing about PostgREST or the API gateway.

## Migration Plan

1. `supabase/migrations/<timestamp>_allocation_batch_positions.sql` — additive; guarded; no data
   rewrite. Applied after `20260930160000_required_bilingual_translations.sql` in filename order.
2. No backfill, no destructive step, and no change to `20260930120000_research_schema.sql`, which
   stays byte-identical and hash-guarded.
3. **Rollback is whole-change.** Dropping `position` would break the allocation service's insert, so
   reverting this change means reverting the service and the migration together. Nothing partial is
   safe to leave behind, which is worth knowing before deploying the migration on its own.

## Open Questions

None that change the specs, the approach, or the task breakdown. The pending adviser approval of the
target of 3 and the batch size of 10 is already modelled as configuration in `@/schemas/batch` and
is tracked in `docs/ROADMAP.md` → *Open Decisions*; approving either is a configuration change, not a
code change.
