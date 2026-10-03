# Design

## Context

See `proposal.md` — Why for the motivation and the delta under `specs/` for the requirements.
What an implementer needs and cannot read off those two: where the assigned-ids read comes from
(it already exists), where the exclusion merges (service, not the pure rule), and why the
recovery path is untouched.

`allocateBatch` (`src/lib/allocation/allocate-batch.ts`) currently builds its exclusion set from
one read: `validations.listEntryIdsForValidator` (answered entries). It performs no batch read at
all — confirmed by grep, not assumed. `BatchesRepository.listForRecovery(validatorId)` already
returns the attempt's batches WITH entry ids (`RecoverableBatch.entryIds`), so no repository
interface change and no migration is needed.

## Goals / Non-Goals

**Goals**

- A second Continue in one attempt cannot be served entries its earlier batches still hold.
- The recovery offer, lookup, and batch route behave exactly as today.
- Cross-attempt allocation is byte-for-byte unchanged in behavior.

**Non-Goals**

- Rewriting recovery, resume, or the interrupted-batch offer.
- Adjudication, deployment, real-flow verification.
- Any change to what `already_recorded` means: it stays the backstop for replayed submits.

## Decisions

### D1 — The exclusion merges in the service, not in the pure rule

**Chosen:** `allocateBatch` unions assigned entry ids (from `listForRecovery`) with answered ids
before calling `selectBatchEntries`, whose signature is unchanged.

**Why.** The pure rule takes eligibility sets; where a set comes from is the service's job —
this is the same layering the coverage-map handoff already uses. Widening the rule's signature
for a second set would push repository knowledge toward the domain. The service already merges
exactly one set; merging two is the same shape.

**Rejected — filter inside `selectBatchEntries`.** Would require passing batches or a second set
into the pure function and re-proving its ordering/shuffle properties around a parameter that
carries no order. Nothing about the shuffle changes, so nothing about the rule needs to.

### D2 — All of the attempt's batches count, not only interrupted ones

**Chosen:** union entry ids across every batch `listForRecovery` returns for the attempt.

**Why.** Entries in fully-answered batches are answered, hence already excluded; the union
therefore reduces in practice to assigned-but-unanswered remainders without a special case for
"interrupted". No lifecycle column exists to distinguish batch states anyway, and inventing one
here would be speculative scope.

**Rejected — only-batches-with-remainders.** Would require the service to re-derive
interruptedness (responses vs assignments per batch), duplicating the recovery rule's
recognition logic in a second place that can drift from it.

### D3 — Recognition semantics are reused, not restated

**Chosen:** no change to `batch-recovery.ts`; the allocation path reads the same
`listForRecovery` rows the recovery path reads.

**Why.** A response recorded in any own batch answers the entry for BOTH paths (recovery
already decides this; allocation's answered-set already decides this). Two readers of one read
cannot disagree about what was read — the failure mode the consistency guard exists to catch.

### D4 — Exhaustion covers the remainders-only case

**Chosen:** when the eligible set is empty because everything left is own-assigned, return
`exhausted` (existing outcome, existing shape).

**Why.** The outcome already exists and already means "nothing new to offer"; the resume offer
is surfaced by the recovery path, not by allocation. Inventing a fourth outcome
(`resume_available`) would push recovery concerns into allocation and force every consumer to
handle a case that is two existing outcomes composed.

## Risks / Trade-offs

- **[`listForRecovery` returns entry-less residue rows.]** The recovery type models empty
  `entryIds` explicitly (partial-write residue). Mitigation: empty sets union to nothing; the
  exclusion is unaffected by residue rows by construction.
- **[One more repository read per allocation.]** Mitigation: it is the same read recovery
  already performs, against indexed batch/validator columns; the allocation path already pays a
  whole-pool response read, so one more scoped read does not change its shape.
- **[A validator who abandons a batch can no longer be served its entries fresh.]** Mitigation:
  intended — that is the requirement. The entries remain reachable through resume, which is
  stated in the delta scenario, not hidden.
- **[The in-force exhausted-pool requirement still said "coverage target".]** Found while
  drafting this delta (the slice-2 sync rewrote eligibility and ordering but not that line).
  Mitigation: this delta rewrites that requirement wholesale, so the stale phrase leaves with
  it; recorded here so the next reader knows where it went.

## Migration Plan

None. Reads only; no stored state changes shape.

## Open Questions

None that would change the specs, the approach, or the tasks. The production test-data
strategy (staging project vs marked rows vs insert-then-verify) belongs to real-flow
verification, not to this change, and is recorded as awaiting owner decision.
