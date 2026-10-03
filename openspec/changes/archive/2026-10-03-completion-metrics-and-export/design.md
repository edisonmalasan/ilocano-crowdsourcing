# Design

## Context

See `proposal.md` — Why for the motivation and the deltas under `specs/` for the requirements.
What an implementer needs and cannot read off those two: where the new figures come from (no new
queries), how the validated builder shares code with the raw path without sharing its meaning,
and which of the plausible derivation rules is chosen for the validated record.

The dashboard service already loads every row the new figures need: active entries, all stored
responses for them, and the responding profiles. Overlap, lateness, abstention, and raw volume
are all reductions over those three lists. Nothing here adds a repository method.

The export command already joins entry + response + proficiency into `ExportSourceWithQualifying`
and already threads sources through records, summary, and CSV. The validated builder consumes the
same joined sources grouped by entry.

## Goals / Non-Goals

**Goals**

- Every approved figure computed, rendered, and pinned by a hand-counted fixture.
- The validated dataset derived by one pure function over the joined sources, with its rule
  stated in the artifact.
- The three-way agreement extended, with both-directions can-fire proof as before.

**Non-Goals**

- Adjudication rules and the adjudicated final (Phase 12). The validated document is the
  mechanical candidate; its own header says so.
- Attempt-scoped allocation, real-flow verification, new routes, actions, or scripts.
- Entry-review page changes: per-response content there is already complete.

## Decisions

### D1 — No new repository reads for any figure

**Chosen:** overlap, lateness, abstention, and raw volume reduce the rows `loadDashboardOverview`
already holds.

**Rejected — per-figure queries.** A `countLateForEntry` round trip per entry repeats the N+1
pattern `allocate-batch.ts` documents against, and each new query is a new chance to observe a
different snapshot. One read, many reductions.

### D2 — Earliest qualifying package supplies the validated record

**Chosen:** earliest server-minted `createdAt`; tie → smallest validation id, flagged.

**Rejected — latest wins.** Recency is not quality; the latest response is merely the last one
collected, and preferring it would let continued collection rewrite already-validated records.

**Rejected — all qualifying packages emitted per entry.** That is the raw document restated, not
a validated dataset, and it answers no question the raw pair does not already answer.

**Rejected — majority vote or "best" selection.** Forbidden by the methodology outright; not a
close call.

### D3 — The tie-break is arbitrary and says so

**Chosen:** smallest validation id wins ties, the rule is written into the artifact's stated
derivation, and the record is flagged `needs_review`.

**Why not a silent rule.** Validation ids are CSPRNG hex: the order carries no meaning, and a
tie-break that pretended otherwise would be a finding dressed as a method. Stating the
arbitrariness plus the flag is what keeps the mechanical derivation honest.

### D4 — CSV builder takes its key set as a parameter

**Chosen:** `buildCsv(records, keys)` with the header derived from the passed keys; both call
sites pass their own closed key set.

**Rejected — a second CSV module.** The quoting rules are shared and already pinned by
round-trip tests; duplicating them doubles the surface that can drift. The key-set parity tests
(`export-csv`, `export-no-merge`) extend to the validated keys unchanged in shape.

### D5 — Provenance is the validation id, not the attempt id

**Chosen:** `source_validation_id` only.

**Why.** The raw document already preserves authorship per record, so nothing is lost; and an
attempt id inside a "validated" artifact invites reading it as endorsement by a person, which
the methodology forbids. A response id links back to the raw row (and through it to everything)
without naming whose it was.

### D6 — Attempt counts stay defined, not relabelled away

**Chosen:** `totalValidators` keeps its name and type, its definition is fixed as distinct
validator ids holding stored rows (attempts, never persons), and the attempt-never-persons rule
is a spec requirement with view-level assertions.

**Why not rename to `totalAttempts`.** The domain identity IS the validator row, every repository
and test speaks that name, and a rename would churn the seam for no behavioral gain. The risk is
a reader inferring persons; the fix is the stated definition plus assertions, not a rename.

### D7 — The three-way agreement reuses the fold pattern

**Chosen:** the consistency test folds the validated records into the same partition shape the
dashboard reports, alongside the existing export-summary fold.

**Why.** The established property — compare outputs, not helpers — extends unchanged. The
can-fire proof runs both directions as before (dashboard bypass, validated inversion), naming
the partition test.

## Risks / Trade-offs

- **[`createdAt` ties in production.]** Mitigation: millisecond ISO instants make ties unlikely;
  the tie rule is deterministic and flagged, so a tie is visible rather than silent.
- **[Clock trust.]** `createdAt` is server-minted (injected clock, tested claim), but two app
  instances could disagree by skew. Mitigation: recorded, not solved — ordering within one
  corpus from one database is consistent, which is all the derivation promises.
- **[Five files break the "exactly three" assertions.]** Mitigation: those assertions are updated
  to five by the same tests that prove the files, not weakened — the allow-list scan gains the
  two new names.
- **[A test fixture that cannot discriminate.]** The validated-derivation fixtures must hold
  multi-package entries with distinct timestamps, corrections, and translations, or the
  earliest-wins rule passes by construction. Mitigation: fixtures built so each clause has a row
  that exercises it (stated per test, as the dashboard fixture does).
- **[Stale roadmap narrative sections 9–11 still describe the three-validator model.]** Those
  sections are product-requirement prose, not the status ledger; this change does not rewrite
  them. Mitigation: recorded here so the staleness is visible; a narrative-reconciliation pass
  is outstanding work, deliberately not smuggled into a change about figures and exports.

## Migration Plan

None in the database sense. Code-only change; the new documents are additive files in the
operator's destination. Rollback is a revert: the raw three files are byte-identical with or
without this change, because the validated builder reads but never alters the raw path.

## Open Questions

None that would change the specs, the approach, or the tasks. Adjudication rules belong to
Phase 12 and are deliberately unanswered here.
