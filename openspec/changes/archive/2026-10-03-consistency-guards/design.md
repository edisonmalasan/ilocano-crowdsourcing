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
and asserts their AGGREGATE figures are equal: the qualifying total, the coverage-bucket distribution
derived from the export's per-entry counts, the complete-entry count, and the review-flag set.

**It compares AGGREGATES, and the requirement was amended to match.** The first draft required a
per-entry qualifying comparison, which is not implementable against the current API:
`DashboardOverview` exposes buckets and `reviewEntryIds` and no per-entry qualifying map. Adding one
would be a product change, and this change is tests-only, so the requirement was narrowed rather than
the assertion faked. For the corpus here the loss is nil — the four distinct qualifying counts present
map to four distinct buckets at target 3, so a mix-up between different-count entries necessarily
changes the distribution. At a target of 2 the aggregate would be weaker, which is stated rather than
glossed.

It deliberately does NOT assert that both
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

The `Archived Changes` table is located by its header LINE, and rows are located by the archive path
they carry. This is the repair of a defect this repository has already found once: a checker that
decided "is this a row?" by `startsWith("|") && endsWith("|")` silently discarded the very row that had
lost its closing delimiter — and ended the table, blinding every row beneath it.

Three rules, each written after measuring the alternative:

- **A damaged row is COUNTED and REPORTED.** Counting alone lets a damaged row pass unnoticed; reporting
  alone lets it hide a change. Both halves are needed, and both are tested.
- **Rows are NOT detected by cell count.** This ledger carries a literal pipe inside a cell, so
  splitting on `|` reports a different cell count than the row really has — a defect the ledger's own
  tooling notes already record.
- **The read STOPS at the table's end.** A change listed below the table is not counted, so it reads as
  MISSING and the check fails loudly. That loudness is the safety property; continuing past the blank
  line to "find" such a row would mean parsing unrelated tables further down the document.

**CORRECTION, because the first draft of this change asserted the opposite.** The original delta
required that "a change appended below the table is still counted", and an independent verification
pass measured that it is not — the reader breaks at the blank line. Two options existed: make the
reader continue, or state the behaviour it has. **It stops, and the requirement was amended to say
so** — the loud failure is better than a check that reads more than its own subject, and the
appended change is still caught.

**A CORRECTION INSIDE THIS CORRECTION, found by the verification pass that reviewed it, and it is
the reason this paragraph is quoted rather than summarised.** The first draft of this paragraph ended
"It continues; the loud failure is better…". **That sentence was false**, and false in the specific
way this project keeps finding: three lines above it says the reader BREAKS at the blank line, the
amended requirement says the read STOPS at the end of the table, and the code says
`if (trimmed === "") break;`. Proved by mutation — reversing `break` to `continue` turns the file
red. So a reader consulting the one place that explains *why* the requirement was amended would have
been told the opposite decision was taken, and the only defence would have been to go read the SQL
of a TypeScript loop. **A correction that leaves a second, contradicting copy of itself in the same
paragraph has not corrected anything.**

The safety argument is unchanged and does not depend on the reader continuing: an archived directory
the reader cannot see is simply absent from `listed`, so it appears in `missing` and
`names EVERY archived change` fails naming it. That was proved on the REAL ledger by moving a row
out of the table — **red, naming that test**, rather than argued here.

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
