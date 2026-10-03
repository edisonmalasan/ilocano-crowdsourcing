# Proposal

## Why

The completion methodology recorded twice in `AGENTS.md` was corrected, and the code, the in-force
specs, and the dashboard/export figures still implement the superseded rule: a dataset entry is
finished by **three qualifying completed validations from three distinct validators**. Nothing in
the repository can produce that method today, because one complete bilingual package — a
`validated_ilocano` plus a non-empty English and a non-empty Filipino research translation — is
already the research unit the thesis approved. Counting to three measures how many attempts the
platform collected, not how much of the dataset a human judged.

That is not a wording problem. The number `3` is live in `src/schemas/batch.ts:43`
(`INDEPENDENT_VALIDATION_TARGET_DEFAULT`), it decides when allocation retires an entry
(`src/lib/domain/allocation.ts:200`), it defines the `coverage_complete` field the export writes
(`src/lib/export/records.ts:202`), and it is the boundary the dashboard's 0/1/2/3 ladder is built
around (`src/lib/admin/dashboard.ts:174-185`). Until it is removed, an entry the methodology calls
complete stays in the allocation pool, the dashboard reports it as three-quarters done, and the
export ships a `coverage_target: 3` a consumer is invited to check records against. **An unsatisfiable
export scenario is already in force** — `research-export` requires an exported entry marked
coverage-complete to carry the target it was computed against, which under the corrected rule can
never be anything but a constant nobody should be comparing against.

This change replaces the count with the approved predicate and deletes the arithmetic that
supported it. It does **not** build the dashboard figures or the two export documents; those are the
separate `completion-metrics-and-export` change, and the boundary is stated below rather than
assumed.

## What Changes

- **BREAKING** — The completion model becomes a **predicate, not a count**. A dataset entry is
  complete when **one** validation establishes the complete package: an evaluable evaluation, any
  required Ilocano correction present, a non-empty English research translation, and a non-empty
  Filipino research translation, with every integrity check satisfied. `complete` and `incomplete`
  replace every 0/1/2/3 coverage level.
- **BREAKING** — The `independentValidationTarget` research parameter is **removed**, along with its
  hard maximum, its schema key, and every call site that passes or reads it. There is no longer a
  number to configure, so `batch-allocation`'s "the coverage target is configuration rather than a
  fixed constant" scenario is **retired rather than reworded**: the premise it defends no longer
  exists.
- **BREAKING** — The per-entry export field `coverage_target` is removed, and with it the in-force
  scenario *The coverage target travels with the data*. `coverage_complete` is retained as a name and
  re-specified against the single-package rule, so the flag stays interpretable without carrying a
  number it can no longer vary against.
- **BREAKING** — Allocation retires an entry the moment **any** qualifying validation exists for it.
  Entries whose only responses are `cannot_evaluate`, partial, or missing a translation never retire
  and stay in the pool indefinitely, which is the intended behaviour and not a defect.
- **BREAKING** — The dashboard's coverage-bucket ladder (`zero` / `one` / `two` / `complete`) and the
  `coverageTarget` field on the overview are removed. **The remaining approved figures — totals,
  completion percentage, evaluation distribution, proficiency breakdown, review flags — are
  specified here but the new figure list is implemented by the `completion-metrics-and-export`
  change**, so this change removes the false figure and does not yet install its replacement.
- The `cannot_evaluate` case is stated as a first-class rule rather than a side effect: it carries
  neither translation, therefore never completes an entry, therefore never retires it from allocation.
- The `research-schema` scenario *Different validators may validate the same entry* keeps its
  database behaviour and loses only the reason clause *"because coverage depends on independent
  validators"*, which is the superseded rationale. The unique constraint over
  `(validator_id, dataset_entry_id)` is untouched: one attempt never answers one entry twice, and
  separate attempts remain independent of each other.
- **No migration is added.** Measured, not assumed: no file under `supabase/migrations/` encodes the
  three-validator target, so there is no stored state to correct and a no-op migration would be an
  artefact shaped like evidence of work.

## Capabilities

### New Capabilities

- `entry-completion`: the single-package completion rule — what makes a dataset entry complete, what
  leaves it incomplete, that the rule is stated once and shared, that completion is a property of the
  entry rather than a count of attempts, and that no consumer may reconstruct it from raw rows.

### Modified Capabilities

- `domain-contracts`: the qualifying-validation definition loses the clause *"and it belongs to a
  distinct anonymous validator"* (distinctness is a property of the attempt, not of the response's
  qualification), and the scenario *Coverage is not the raw row count* is re-specified — completion is
  read off qualifying validations, and a raw row count is never substituted for it.
- `batch-allocation`: eligibility and priority are derived from **completeness** rather than from
  qualifying coverage against a target; *An entry at the coverage target leaves the allocation pool*
  becomes *a complete entry leaves the allocation pool*; *The coverage target is configuration rather
  than a fixed constant* is **removed**; the least-covered-first ordering becomes least-complete-first,
  which under a two-valued model is the incomplete pool; and the exhausted-pool requirement stops
  blaming "reached the coverage target".
- `researcher-dashboard`: the eleven-figure list and the 0/1/2/3 ladder are replaced by totals,
  completion percentage, and the retained figures; *Overall coverage percentage* is redefined as the
  share of entries whose single qualifying validation establishes the package.
- `research-export`: *Coverage and review status are exported per entry* drops the target and the
  *target travels with the data* scenario; *Qualifying and non-qualifying responses are reported
  distinctly* keeps its shared-definition rule and stops describing the count as progress toward a
  target.
- `consistency-guards`: the dashboard/export agreement requirement compares **complete/incomplete
  entries** rather than a four-bucket distribution, and still compares by running both consumers over
  the same corpus.
- `research-schema`: the index requirement's coverage-counting scenario no longer says coverage is
  *recomputed for many entries* toward a target — the index is still required, for the same per-entry
  aggregate, and the wording must not imply a multi-entry target.
- `validation-experience`: the amendment note claiming an unreachable entry "can still reach its
  coverage target" is corrected to name the validating package that completes it, since a
  reachable-but-unanswered entry is now available for one response rather than for a third one.

**One further capability is affected but gets no delta: `batch-recovery`.** Its Purpose paragraph
states that the only two conditions `selectBatchEntries` tests are that the validator has already
answered the entry and that it "has already reached the coverage target". That sentence becomes
false, and it is the only occurrence — every requirement in that capability is untouched. **OpenSpec
deltas cannot express a Purpose change**; the tool's own instruction is to edit
`openspec/specs/batch-recovery/spec.md` directly. That edit is carried as a task in this change
rather than as a delta file here, because an empty delta would be an artefact shaped like work while
specifying nothing.

## Impact

- **No database migration.** Verified by reading every file under `supabase/migrations/`; the target
  is absent from all of them.
- `src/schemas/batch.ts`: `INDEPENDENT_VALIDATION_TARGET_DEFAULT`, `INDEPENDENT_VALIDATION_TARGET_HARD_MAX`,
  the `independentValidationTarget` key of `allocationConfigSchema`, and the module header that
  describes both parameters as pending approval.
- `src/lib/domain/allocation.ts`: the retirement predicate at line 200, the `independentValidationTarget`
  parameter of `selectBatchEntries`, and the tiered-fill documentation at lines 159-161.
- `src/lib/allocation/allocate-batch.ts` and `src/lib/allocation/actions.ts`: the argument threaded
  from configuration into the selection rule.
- `src/lib/admin/dashboard.ts`: `CoverageBuckets`, the bucket ladder, `coverageTarget` on the
  overview and on the entry-review projection, and the default parameter.
- `src/lib/export/records.ts` and `scripts/export-research.ts`: `coverage_complete` against the
  predicate, the removed `coverage_target` fields, and `ExportSummary`'s `generated_from` block.
- `src/app/researcher/(protected)/overview.tsx` and `entries/[id]/entry-review.tsx`: the "N of N"
  coverage labels, which have no meaning once there is no N.
- **Unchanged on purpose**: `isQualifyingValidation` (`src/lib/domain/validation-response.ts:125`) —
  the corrected rule alters what a *count* is used for, not what *qualifies*. `countQualifyingValidations`
  keeps deduplicating by validator because it is still the honest per-entry aggregate; only the
  comparison against it changes.
- **Still unverified anywhere, and this change does not verify it**: that a real browser's
  `sessionStorage` is scoped to the browser session. `happy-dom`'s `Storage` is in-memory, so the
  property remains unobserved — recorded rather than implied.
- Deferred to later slices by design: the dashboard figure list and the RAW RESEARCH RESPONSES /
  FINAL VALIDATED DATASET export split (`completion-metrics-and-export`), attempt-scoped allocation
  (`attempt-scoped-allocation`), and the real-flow regression pass.