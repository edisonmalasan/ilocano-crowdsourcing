# Tasks

## 1. Cross-consumer consistency

- [x] 1.1 One shared corpus exercising every clause — an entry that is complete, one that is not, one
      whose qualifying evaluations disagree, one whose non-qualifying responses would look like
      disagreement if evaluated raw, a second category, and entries with no responses. Every figure the
      two consumers report is computed BY HAND and written in the fixture comment.
      **The corpus comment was hand-counted WRONG on the first pass** — it claimed 13 stored rows,
      `zero = 4` and `complete = 2`, and the suite failed on the bucket literal. The measurement was
      right and the arithmetic was not. What matters is where the failure landed: on MY literal, with
      the two consumers having already agreed with each other, so the export-side comparison was never
      reached. Corrected figures: 10 stored rows, 7 qualifying, buckets {zero: 7, one: 2, two: 1,
      complete: 1} over 11 entries, C2 the only flagged entry.

      Verified with unit tests asserting: equal total qualifying validations, equal coverage-bucket
      distribution, equal complete-entry count, equal review-flag set — each comparing the two
      consumers' actual outputs rather than their helpers.
      **CORRECTION: the first draft of this task claimed "equal qualifying count for EVERY entry", and
      no such assertion exists.** `DashboardOverview` exposes buckets and `reviewEntryIds` and no
      per-entry qualifying map, so the claim was not implementable; the requirement, `design.md` and
      this task were amended rather than the assertion faked. **A second claim here — that the emptiness
      guards were verified — was itself partly vacuous and is corrected in 1.2.**
- [x] 1.2 Emptiness guards, **and the vacuous ones removed**. The first version asserted
      `expect([loadDashboardOverview, buildExportSummary]).toHaveLength(2)` — a statement about a
      two-element array literal that cannot fail whatever either consumer does — and
      `ENTRIES.filter(isActive)`, which is true by construction because the helper hardcodes
      `isActive: true`. **Both reported coverage they did not provide**, and both are removed. What
      replaced them: assertions about the corpus's own shape (more than one answered entry, at least
      one unanswered entry) and an assertion that the comparison has actually RUN. The empty-corpus
      case remains the substantive witness, and it runs both consumers rather than skipping.
- [x] 1.3 Can-fire: each of the three agreement claims proved red by breaking ONE consumer — a
      qualifying count, the complete set, the review set — with green controls and byte-identical
      restores. This is the check's own evidence that it can see a disagreement.

## 2. Ledger integrity

- [x] 2.1 Read the `Archived Changes` table BY STRUCTURE: located by its header LINE, rows located
      by the archive path they carry, a damaged row both COUNTED and REPORTED, and the read stopping
      at the end of the table. Verified with **four in-suite tests over SYNTHETIC ledgers** — added
      because the first draft of this task claimed a malformed-row case and a row-appended case that
      did not exist. With no synthetic input, a test of either would have had to corrupt the real
      ledger to produce the input it was testing.
      **The reader is parameterised on its source text for exactly that reason.** Two clauses of the
      original requirement were FALSE as implemented: an unclosed row with an intact path was counted
      and never reported, and a row appended below the table was silently invisible. The first is now
      implemented; the second is stated as the behaviour it has, because the appended change reads as
      MISSING and therefore fails loudly — which is the property that matters.
- [x] 2.2 Assert every archive directory is named in the ledger and every ledger entry exists on disk,
      and that the count the `Project Status` block quotes equals the directory's contents.
- [x] 2.3 Emptiness guards: zero directories found, or zero rows read, is a FAILURE with its own
      **This found real drift on its first run**: the table named **13** changes while the archive
      directory held **16**, missing `2026-10-02-researcher-dashboard`, `2026-10-03-hosted-dataset-import`
      and `2026-10-03-research-export`. The rows are now present, and the guard fails if they go again.
      That is the fourth consecutive archive with a stale hand-maintained figure, and the first one a
      command found rather than a reader.

      message — never a silent match.
- [x] 2.4 Can-fire: proved red by (a) a directory present but unlisted, (b) a ledger entry naming a
      directory that does not exist, and (c) an empty archive directory. Controls green, restores
      byte-identical.

## 3. Close out

- [x] 3.1 `pnpm run lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`,
      `build` — all run, all reported with the figures they actually produced. Measured: lint 0,
      format 0, typecheck 0, unit **70 files / 1598 tests**, dom **7 / 87**, integration **12 / 197**,
      build "Compiled successfully". The roadmap's 12 markdown tables were checked for well-formedness
      independently of the new guard: 12 tables, 0 malformed.
      **AND THE UNIT FIGURE WAS STALE IN BOTH PLACES WHEN FIRST WRITTEN — 1594, measured 1598 — which
      is recorded here because this change exists to catch exactly that.** The repair commit added four
      synthetic-ledger tests and inherited the earlier figure without re-running the command, so a
      ticked close-out task and the change's own evidence table were both reporting a number that had
      stopped being true, and neither guard in this change can see a number in prose. An independent
      verification pass found it by measuring. Re-derived rather than incremented: `1594 + 4 = 1598`,
      and the verifier independently confirmed the arithmetic by counting `it(` in the changed file.
- [x] 3.2 `openspec change validate consistency-guards --strict` exits 0, and
      `openspec validate --specs --strict` reports 16. **Measured 15, and the difference is the point**:
      the live capability count is 15 because this change's delta has not been synced yet — the delta
      raises nothing until Sync. The task's figure is corrected here rather than left as a claim the
      command cannot produce. The delta's own scenario text is unchanged; what was wrong was this
      task's expected number.
- [x] 3.3 Update `docs/ROADMAP.md` `## Project Status`, including the archive count and this change's
      own stages. **Two prose defects of mine surfaced while doing it, and how each was found is now
      part of the record rather than a detail**: an earlier scripted patch had MANGLED a cell — the
      sentence was left glued to a fragment of its own replacement ("COMPLETE on its first bounded
      slice** on its first bounded slice") — and a historical sentence still read "Fifteen changes are
      archived" while the live count was sixteen.
      **The second claim in the first version of this task was FALSE and is corrected here: it said
      BOTH defects "were found by the new guard". Measurement showed the guard provably could not have
      found the second one.** The count guard used a NON-GLOBAL regex and read occurrence 1 only, and
      the stale "Fifteen" was in occurrence 2. A probe proved it: editing only the SECOND sentence left
      the suite green at `10 passed (10)`, while the same edit to the FIRST turned it red — which is the
      control that separates "the guard missed it" from "the guard cannot see it". Three repairs
      followed. (a) The guard now reads EVERY sentence in that phrasing and checks each, so a duplicate
      cannot hide a stale figure; the rule it enforces is stated in the test — that phrasing is reserved
      for the LIVE claim, and history is marked as history. (b) The first repair to that sentence had
      replaced a correct historical statement with a verbatim duplicate of the live one, making the
      paragraph self-contradictory, so the duplicate was removed and the parenthetical historical
      marker left standing. (c) This attribution was corrected.
      **The lesson is the one this change is built on, turned on its own artifacts: a stale
      hand-maintained figure is found by measuring, and attributing the finding to a guard that cannot
      see it is worse than the stale figure was.** The guard's own pattern had also been relaxed
      because of the mangled cell: it had required bold markers before the number and so reported "must
      state an archived count: null" against a ledger that stated it correctly.
- [x] 3.4 Independent verification pass. No CRITICAL finding may survive, and no WARNING may be
      silently waived. **Ran on the repair commit and returned PASS-WITH-FINDINGS: 2 CRITICAL, 5
      WARNING, 6 NIT. Both CRITICALs and all five WARNINGs are repaired above; nothing is waived.**
      The verifier ran 21 mutation probes, every one with a green control before and after and a
      sha256-verified byte-identical restore, and re-derived the change's own can-fire list rather than
      inheriting it. What it established: **every test in both new files can fail** (it produced a
      named red for all 18), the scope claim is true (zero files under `src/`, `scripts/`,
      `supabase/`, `data/`), and all five corrected `Merged as` cells are real two-parent merges that
      each moved the archive directory their row names.
      The two CRITICALs were both **claims that did not hold, not missing behaviour**: a ticked task
      and the change's own evidence table reporting `1594` where the command prints `1598` (see 3.1),
      and `design.md` D3 asserting the table reader "continues" three lines after recording that it
      "breaks" — proved by mutation, since reversing `break` to `continue` turns the file red.
      **Both were claim defects in a change whose entire subject is claims that are not measured.**
      The five WARNINGs: the first-occurrence-only count guard and its consequence (see 3.3); the
      self-contradicting paragraph the first repair created (see 3.3); a real-repo assertion inside a
      synthetic-ledger test, true by construction and therefore insensitive to the reader it claimed to
      be testing, now removed with a pointer to where the property is actually proved; the reader's
      measured one-line blind spot, recorded at the loop; and the count guard's 13–16 enumeration,
      recorded at the guard.
      **The verifier also caught two defects in its own instruments** — a `git show > file` redirect
      that returned UTF-16LE and matched nothing, and a markdown-table detector that reported 17 false
      "does not open a row" hits by keeping a table open into orphaned prose. Both are recorded because
      a checker that misreports its own subject is worse than no checker.
- [ ] 3.5 Merge with a merge commit only after 3.1–3.4 are green.
