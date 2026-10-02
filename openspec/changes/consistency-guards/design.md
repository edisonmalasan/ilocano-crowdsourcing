# Design

## Context

See `proposal.md` for why. The facts constraining the how:

- Two independent consumers already exist and both compute coverage from the shared predicate:
  `loadDashboardOverview` in `src/lib/admin/dashboard.ts` and `buildExportSummary` in
  `src/lib/export/records.ts`. They were written months apart, for different consumers, and neither
  consults the other.
- `docs/ROADMAP.md` has an `Archived Changes` table and a `Project Status` block quoting an archive
  count. Both are hand-maintained, and the file records three archives in which a figure was stale on
  arrival.
- This change adds only tests. It changes no behaviour, so the design question is entirely "what can
  these guards actually see".

## Goals / Non-Goals

- Goals: cross-consumer agreement on one corpus; ledger enumerations matching the archive directory;
  every guard provably non-vacuous.
- Non-Goals: anything requiring a network (`gh`, a hosted project), a browser, or a change to
  behaviour. Those stay documented residuals rather than skipped tasks.

## Decisions

### D1 — Compare outputs, not helpers

The consistency check builds one corpus, runs the dashboard service and the export summary over it,
and asserts their figures are equal per entry and in total. It deliberately does NOT assert that both
call `countQualifyingValidations` — that is a statement about implementation, it would break on a
harmless refactor, and it would pass even if a consumer pre-filtered its inputs wrongly. Two modules
can share a predicate and disagree about *which responses to include*; only comparing their outputs
sees that. The shared definition remains the thing the code documents; this checks the consequence.

### D2 — One shared corpus, deliberately including the hard cases

The corpus carries an entry that is complete, one that is not, one whose qualifying evaluations
disagree, one whose non-qualifying responses would look like disagreement if evaluated raw, one with a
second category, and entries with no responses at all. Every clause of the agreement claim needs a
row that exercises it, and a corpus that only agrees trivially is a corpus that proves nothing.

### D3 — Read the ledger's table by structure, never by a remembered line number

The `Archived Changes` table is located by its header cells, and rows are read as rows. This is the
repair of a defect this repository has already found once: a checker that decided "is this a row?"
by `startsWith("|") && endsWith("|")` silently discarded the very row that had lost its closing
delimiter — and ended the table, blinding every row beneath it. Here a line that opens a row inside a
known table IS a row, whether or not it is closed, and a malformed one is reported rather than skipped.

### D4 — Assert the guards are looking at something

Three emptiness guards, because the three ways these checks could pass vacuously are different:
comparing fewer than two consumers, finding zero archived directories, and reading zero rows from the
table. Each is its own assertion with its own message. "Matches" over an empty set is not a pass, and
a guard that reports it as one is worse than no guard.

### D5 — No network, deliberately

The ledger's `Doc-only PRs` cell counts merged pull requests and is therefore not checkable from the
repository. It stays a documented residual. Adding a test that shells out to `gh` would produce a
guard that fails in CI for the wrong reason — an unauthenticated runner — and a guard that fails
sporadically is one people learn to ignore.

## Risks / Trade-offs

- [Risk] The consistency check pins two consumers against each other, so a future change to one must
  change both or fail. Mitigation: that is the point — it is a change in research reporting, and it
  should be visible. The failure message names the entry and both figures.
- [Risk] The ledger check fails on every archive until the ledger row is updated, adding a step to a
  routine. Mitigation: it is one line in a change that already has to edit the ledger, and the failure
  names the exact missing directory.
- [Risk] A ledger check that is too strict about wording becomes noise. Mitigation: it compares
  directory NAMES, not prose, and it never asserts on sentence text.

## Migration Plan

None. No schema, no data, no deployment. The tests fail until the ledger is brought into agreement,
which is the intended first run.

## Open Questions

None that change specs, approach, or tasks. Whether the ledger should keep quoting a count at all, or
only point at the directory, is a documentation preference rather than a technical question, and the
check works either way.
