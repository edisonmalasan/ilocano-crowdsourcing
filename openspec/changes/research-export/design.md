# Design

## Context

See `proposal.md` for why. The facts constraining the how:

- The qualifying rule has one definition, `isQualifyingValidation` /
  `countQualifyingValidations` in `src/lib/domain/validation-response.ts`, dependency-free and used by
  allocation, the dashboard, and (soon) this export. `countQualifyingValidations` dedupes by
  `validatorId` **across the array it is given**, so it is correct per-entry and returns a count of
  distinct validators if applied to the whole corpus. That property is a trap for a global total and
  is the reason D4 below exists.
- The corpus is 600 entries × ~3 responses ≈ 1800 rows. Small enough to read whole, and reading it
  whole is what keeps every exported figure a direct computation over current rows.
- `import:dataset` is the precedent for an operator command: a `scripts/` module, a `package.json`
  entry, env validated locally rather than through `@/lib/env/server` (that module is `server-only`
  and unreachable from a command), and no test holding a credential.

## Goals / Non-Goals

- Goals: JSON + CSV of every stored response with each validator's text separate; a per-entry and
  per-category summary with qualifying/non-qualifying counts distinct; the coverage target carried
  with the data; read-only; operator-triggered.
- Non-Goals: adjudicating disagreement, choosing a final corrected instruction, producing a
  "final validated dataset" (Phase 8's *pipeline*, which needs an approved adjudication rule),
  filters, dashboard download buttons, streaming for a corpus larger than this one.

## Decisions

### D1 — An operator command, not a route, and not a dashboard button

The import's reasoning inverts cleanly here: nothing in a request path may *write* a dataset entry,
so the import is a command. Symmetrically, nothing in a request path should be able to *read the whole
corpus and emit it*, so the export is a command. A dashboard download button would also have to
re-derive authorization for a bulk read and would put a research artifact on a path a browser can
reach. `scripts/export-research.ts` + `pnpm run export:research`, matching `import:dataset`.

### D2 — Serializers are pure; the command is a thin shell

`src/lib/export/` holds the JSON shaping, the CSV quoting, and the summary assembly as pure functions
over already-loaded rows, importing nothing but the domain predicates. The command reads the corpus
through the repositories, calls the serializers, and writes files. Every claim about the export's
*content* is therefore testable with fakes and no database, exactly as `import:dataset`'s decisions
were testable without a credential.

### D3 — One field per validator's text, and the no-merge invariant is asserted over the artifact

`english_translation` and `filipino_translation` are separate string fields on each record, named for
the research content rather than for a UI concept. The no-merge requirement is enforced by a test
that walks the serialized output and asserts no string field contains text from two different
validators — a structural check over the real artifact, not a comment. This is the requirement most
worth a guard, because a "consensus translation" column is exactly what a well-meaning future export
would add, and it would be wrong.

### D4 — Qualifying totals are summed per entry, never counted globally

`countQualifyingValidations` returns the number of DISTINCT validators across whatever array it is
given. Applied to one entry's responses that is the coverage count; applied to the whole corpus it
would be the number of validators who ever validated anything. The export therefore computes each
entry's figure per entry and **sums** the per-entry counts for the aggregate. A test asserts the two
differ on a fixture where they would, so the trap is pinned rather than described.

### D5 — Coverage target is carried, never hardcoded

The export takes the target as a parameter defaulting to
`INDEPENDENT_VALIDATION_TARGET_DEFAULT`, and writes it into every entry record and the summary
header. A research artifact that says "coverage complete" without saying what "complete" meant is
uninterpretable after the target changes — which it will, since it is pending adviser approval.

### D6 — CSV quoting is implemented rather than delegated

No CSV library is added. The quoting rules are four lines and the failure modes are known (RFC 4180:
quote on comma, quote, or newline; double an embedded quote). A hand-rolled serializer is auditable
in one screen; a dependency for four lines of quoting is not, and the round-trip test is what makes
the hand-rolled version trustworthy rather than merely short.

### D7 — The export does not decide anything

Disagreement is exported, never resolved: no majority vote, no selection of a preferred correction,
no consensus column, no final dataset. `tasks.md` records this as an explicit non-goal so that a
later phase is not read as a missing feature of this one. The review flag travels with the data
because it tells a researcher where to look, not what to conclude.

## Risks / Trade-offs

- [Risk] An export that reads the corpus whole will not scale to a much larger dataset. Mitigation:
  none needed at 1800 rows; if it ever matters the fix is pagination with a stated row count in the
  artifact, because a silently truncated research export is worse than a slow one.
- [Risk] Self-reported proficiency travelling with each response could be read as a quality signal.
  Mitigation: the field is named and documented as self-reported metadata, exactly as the dashboard
  states it, and the export defines no derived weight.
- [Risk] Adding a "consensus" column later would be easy and wrong. Mitigation: D3's structural
  assertion over the artifact, which fails if any field merges two validators.

## Migration Plan

None. No schema change, no RLS change, no backfill. The command is additive; deleting it removes the
only capability it provides.

## Open Questions

None that change specs, approach, or tasks. Column ordering and JSON key naming are presentation
choices settled by the implementation review, not research decisions.

One thing is deliberately **not** decided here and is recorded rather than answered: what the
"final-dataset export pipeline" means once an adjudication rule exists. It depends on a thesis-team
decision about how disagreement is resolved, and this change deliberately does not pre-build for it.
