# Design

## Context

See `proposal.md` — Why for the motivation, and the deltas under `specs/` for the requirements. What
follows is only what an implementer needs and cannot read off those two: where the superseded number
lives today, what it drags with it, and which of three possible replacements is chosen.

The number `3` exists in exactly one place in the source tree:
`src/schemas/batch.ts:43` (`INDEPENDENT_VALIDATION_TARGET_DEFAULT`), bounded by
`INDEPENDENT_VALIDATION_TARGET_HARD_MAX` at line 49, validated by `allocationConfigSchema` at lines
56-75, and threaded from there through `src/lib/allocation/actions.ts:63` and
`src/lib/allocation/allocate-batch.ts:270` into `selectBatchEntries`
(`src/lib/domain/allocation.ts:187`), where it decides retirement at line 200. Two consumers read
the same constant as a default parameter without threading it — `loadDashboardOverview`
(`src/lib/admin/dashboard.ts:140`), `loadEntryReview` (line 245), and `buildExportSummary`
(`src/lib/export/records.ts:178`) — and four surfaces render it: `overview.tsx:54,60`,
`entry-review.tsx:54`, and the export's `coverage_complete` / `coverage_target` fields.

## Goals / Non-Goals

**Goals**

- One function decides whether an entry is complete, and every consumer calls it.
- The `independentValidationTarget` parameter, its hard maximum, its schema key, its default
  argument, and its four render sites are gone. Nothing is left that a later reader could mistake for
  a configurable target.
- `isQualifyingValidation` does not change. This is a change to what a *count* is used for.

**Non-Goals**

- The approved figure list and the two export documents. `completion-metrics-and-export` owns them;
  this change removes the figure that is now false and does not install a replacement.
- Attempt-scoped allocation. A completed entry leaves the pool for *everyone*, which is what
  `entry-completion` specifies and what `attempt-scoped-allocation` will re-propose as a surviving
  requirement.
- Any schema change. See "No migration" below.

## Decisions

### D1 — Completeness is one shared pure predicate, not a threshold applied at three call sites

**Chosen:** a single exported pure function over an entry's stored responses, living beside
`isQualifyingValidation` in `src/lib/domain/validation-response.ts`, returning a boolean.
Allocation, the dashboard, and the export each call it.

**Rejected — keep `countQualifyingValidations` and compare it to `1` at each call site.** Three
comparisons of the same threshold in three modules is the drift this repository already has a
capability (`consistency-guards`) built to detect *after* the fact. A single predicate makes
disagreement impossible rather than detectable.

**Rejected — pass a boolean `isComplete` into each service.** That pushes the decision to the caller
and gives the dashboard and the export each their own answer, which is precisely the failure mode the
consistency guard is a regression test for.

**Rejected — a SQL expression.** A second implementation of the same rule in another language; it
would drift invisibly, and a drifted completion flag retires entries the methodology calls incomplete.
The reasoning is the one already recorded on `isQualifyingValidation` and is not restated here.

### D2 — The selection rule drops its coverage grouping, and keeps its randomness

**Chosen:** `selectBatchEntries` takes the set of completed entry ids (or a per-entry completion map)
instead of a coverage map plus a target, filters out completed entries, shuffles what remains with the
caller's `random`, and truncates to `size`.

**Why the grouping goes.** It is not a simplification; the grouping is provably degenerate once
retirement is `coverage > 0`. Every entry that survives the filter is incomplete, so all survivors
land in one group at key `0`, and a `Map` with one key cannot order anything. Keeping the
`Map`-group-walk would leave code whose comment claims to sort entries that can no longer be sorted,
which is worse than deleting it.

**Why the randomness stays.** Randomization was a separate property with a separate reason — no entry
systematically served first — and it was doing real work independent of the target. Deleting it with
the sorting would be removing a guarantee nobody asked to lose. `random` also keeps its no-default
parameter so a caller cannot reach the rule without declaring where its randomness comes from.

### D3 — `countQualifyingValidations` keeps deduplicating by validator

**Chosen:** unchanged, including its `CoverageResponseShape` extension.

**Why.** It is still the honest per-entry aggregate, and it is still what the raw-response diagnostic
and the entry-review view report. Removing the dedupe would make a fixture that violates the schema's
unique constraint inflate a figure; keeping it costs nothing and is right by construction. What
changes is that nothing *decides* anything by comparing the result to a number.

### D4 — The `coverage_complete` field keeps its name and loses its sibling

**Chosen:** `coverage_complete` stays, re-specified as the output of the shared predicate.
`coverage_target` is deleted.

**Why keep the name.** It is in force, it is read by consumers, and the boolean it has always
described is now exactly what the field says. Renaming it would be a second breaking change with no
research benefit. **Why delete the sibling:** it can only ever carry a constant, and a consumer
comparing records against a constant will draw a false conclusion — which is why the in-force
requirement containing it had to be removed rather than reworded.

### D5 — No migration is added, and the absence is recorded rather than papered over

**Chosen:** no file under `supabase/migrations/` is created or edited.

**Measured, not assumed.** Every migration file was read and searched for the target. The number `3`
does not appear in any of them; the schema stores responses, batches, and positions, and nothing about
how many responses complete an entry. Adding a no-op migration would be an artefact shaped like
evidence of work, and the `research-schema` delta says so in the requirement itself so the next reader
does not go looking for it.

### D6 — The dashboard's `coverageTarget` field is deleted rather than defaulted

**Chosen:** remove `DashboardOverview.coverageTarget`, `EntryReview.coverageTarget`, the default
parameter on both loaders, and the "N of N" labels in both views.

**Why not keep it as `1`.** The field exists so a view can *label* a boundary instead of hard-coding
one. With the boundary fixed at 1 by the methodology there is nothing to label: "Coverage complete (1
of 1)" is a figure that can never change, and rendering it invites a reader to think a threshold is
configurable. The two views lose the label rather than gaining a new one; the
`completion-metrics-and-export` change decides what those surfaces say instead.

### D7 — The `research-export` requirement is REMOVED and re-ADDED rather than MODIFIED

**Chosen:** the same treatment `batch-allocation` gets, for the same reason.

**Why.** Its scenario *The coverage target travels with the data* is not badly worded, it is
**unsatisfiable** — and `openspec change validate --strict` refuses a `MODIFIED` block that omits a
scenario the current spec still has. That refusal was measured while writing this delta, not
anticipated, and it is the reason three of this change's eight deltas are REMOVED/ADDED pairs rather
than MODIFIED blocks. The verbatim original is carried in the REMOVED section so the archive diff
shows the removal instead of a silent edit.

## Risks / Trade-offs

- **[A consumer of the existing export breaks on `coverage_target`.]** Mitigation: the field is
  removed by an explicit spec requirement rather than quietly, the removal is in this change's
  proposal under BREAKING, and the replacement export shape is owned by
  `completion-metrics-and-export`. There is no external consumer in this repository — the export is an
  operator command that has never been run against a real corpus.
- **[An entry retired by its first qualifying response cannot be re-validated by anyone, so the
  review flag's disagreement rule has less to work with.]** Mitigation: accepted and specified. The
  review rule is unchanged, separate attempts remain independent, and overlapping responses are still
  stored; this change alters only whether a *second* response is solicited. Recorded because it is a
  real consequence, not a defect to be fixed here.
- **[The dashboard loses a figure and gains none this change.** Mitigation: stated in the delta and
  in `proposal.md` as the boundary with `completion-metrics-and-export`. The intermediate state has
  fewer figures than the thesis team approved, which is a known and temporary regression rather than
  an unacknowledged one.
- **[`attempt-storage-enumeration` and other guards reference `src/schemas/batch.ts`.]** Mitigation:
  the guard enumerates *browser storage APIs*, not schema fields; removing a schema key cannot break
  it. The full unit suite is the check, and it is run rather than assumed.
- **A stale "three" survives somewhere the search did not reach.** Mitigation: the implementation
  step includes a repository-wide search for the removed identifiers and the phrases "coverage
  target", "3 qualifying", and "independent validation target", with the result recorded in
  `tasks.md` rather than claimed.

## Migration Plan

None in the database sense. The deployment is a code-only change with no stored state to correct.

Rollback is a revert: `INDEPENDENT_VALIDATION_TARGET_DEFAULT` and the coverage-map parameter come
back with the code. Nothing written by the new code is unreadable by the old code, because nothing is
written — the change alters which entries are offered and how figures are computed, and both are
derived from responses that already existed.

## Open Questions

- Whether the FINAL VALIDATED DATASET export should carry a record of *which* attempt supplied the
  completing response. This change does not decide it, and nothing in the deltas forecloses it; it
  belongs to `completion-metrics-and-export`, which owns the export shape.