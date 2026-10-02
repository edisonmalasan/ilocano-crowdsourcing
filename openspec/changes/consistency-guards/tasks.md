# Tasks

## 1. Cross-consumer consistency

- [ ] 1.1 One shared corpus exercising every clause — an entry that is complete, one that is not, one
      whose qualifying evaluations disagree, one whose non-qualifying responses would look like
      disagreement if evaluated raw, a second category, and entries with no responses. Every figure the
      two consumers report is computed BY HAND and written in the fixture comment.
      Verified with unit tests asserting: equal total qualifying validations, equal qualifying count
      for EVERY entry, equal coverage-complete set, equal review-flag set — and each assertion
      comparing the two consumers' actual outputs rather than their helpers.
- [ ] 1.2 Emptiness guards: the comparison asserts both consumers ran over the corpus, and an empty
      corpus still compares both rather than skipping. Verified by asserting the consumer count and
      the entry count explicitly.
- [ ] 1.3 Can-fire: each of the three agreement claims proved red by breaking ONE consumer — a
      qualifying count, the complete set, the review set — with green controls and byte-identical
      restores. This is the check's own evidence that it can see a disagreement.

## 2. Ledger integrity

- [ ] 2.1 Read the `Archived Changes` table BY STRUCTURE: located by its header cells, rows read as
      rows, and a line that opens a row inside a known table treated as a row even if it has lost its
      closing delimiter — reported as malformed, never skipped, and never ending the table.
      Verified with unit tests including a malformed-row case and a row-appended-below-the-table case.
- [ ] 2.2 Assert every archive directory is named in the ledger and every ledger entry exists on disk,
      and that the count the `Project Status` block quotes equals the directory's contents.
- [ ] 2.3 Emptiness guards: zero directories found, or zero rows read, is a FAILURE with its own
      message — never a silent match.
- [ ] 2.4 Can-fire: proved red by (a) a directory present but unlisted, (b) a ledger entry naming a
      directory that does not exist, and (c) an empty archive directory. Controls green, restores
      byte-identical.

## 3. Close out

- [ ] 3.1 `pnpm run lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`,
      `build` — all run, all reported with the figures they actually produced.
- [ ] 3.2 `openspec change validate consistency-guards --strict` exits 0, and
      `openspec validate --specs --strict` reports 16.
- [ ] 3.3 Update `docs/ROADMAP.md` `## Project Status`, including the archive count and this change's
      own stages.
- [ ] 3.4 Independent verification pass. No CRITICAL finding may survive, and no WARNING may be
      silently waived.
- [ ] 3.5 Merge with a merge commit only after 3.1–3.4 are green.
