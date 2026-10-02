# Proposal

## Why

This project makes two claims about itself repeatedly, in prose, and checks neither.

**One:** the qualifying rule has exactly ONE definition, shared by allocation, the dashboard, and the
export. Every module re-derives its figures from the same predicate and re-asserts the uniqueness in a
comment — but nothing asserts that two independent consumers **agree on the same corpus**. If the
dashboard and the export ever reported different coverage for the same data, both suites would stay
green and the disagreement would surface in a thesis write-up.

**Two:** the `docs/ROADMAP.md` enumerations are hand-maintained. The file says so itself — *"a
hand-maintained index drifts as a matter of course, so an index that must stay correct needs an
assertion, not a habit"* — and then records three consecutive archives in which a figure was stale on
arrival: an archive count that read thirteen when the directory held fifteen, a phase row still
describing the previous phase as live, and a milestones cell whose placeholder outlived its PR. Each
was caught by reading, which is not a mechanism.

Both are claims of consistency with no guard, which is the defect class this project treats as the
serious one. Phase 9's full test matrix is too large for one bounded change, so this change takes the
two parts of it that have direct measured evidence of being unguarded.

## What Changes

- A **cross-consumer consistency suite**: given one hand-built corpus, the dashboard's overview and
  the export's summary must report the same qualifying total, the same coverage-bucket distribution,
  the same complete-entry count, and the same review-flag set — computed by two independently written
  code paths that share only the domain predicate. This is the "one definition" claim turned into an
  assertion. Compared as **aggregates, not per entry**: the dashboard exposes no per-entry qualifying
  figure, and adding one would be a product change inside a tests-only change.
- A **ledger-integrity suite** asserting that the `Archived Changes` table in `docs/ROADMAP.md` lists
  exactly the directories in `openspec/changes/archive/`, and that the count the `Project Status`
  block quotes matches that directory. Reads only files on disk; no network, no `gh`.
- **No product change.** No new behaviour, no schema change, no migration, no dependency. Every file
  added is a test.

## Explicitly out of scope, and why

- **`Doc-only PRs` cell.** It counts pull requests, which needs `gh` and the network. A test that
  cannot run in CI is not a guard, so this stays a documented residual rather than a skipped task.
- **Phase 9's UX matrix** (mobile, tablet, desktop, keyboard, slow connection). Not closable by any
  command in this repository — it needs a browser, which is the standing residual this ledger already
  records.
- **The schema reject/accept matrix** in the Phase 9 preamble. Already covered by
  `tests/integration/research-schema.test.ts` against the production migrations, with rejections
  matched against the NAMED constraint. Re-deriving it here would duplicate coverage rather than add it.

## Capabilities

### New Capabilities

- `consistency-guards`: the guarantees that two consumers of the shared qualifying rule agree on the
  same corpus, and that the repository's own ledger enumerations match the repository.

### Modified Capabilities

(none — no existing requirement's behaviour changes. This change makes two existing claims testable
rather than changing what the system does.)

## Impact

- `tests/unit/cross-consumer-consistency.test.ts`: dashboard service and export summary over one
  shared fixture.
- `tests/unit/ledger-integrity.test.ts`: `docs/ROADMAP.md` against `openspec/changes/archive/`.
- No file under `src/`, `scripts/`, or `supabase/` is touched.
