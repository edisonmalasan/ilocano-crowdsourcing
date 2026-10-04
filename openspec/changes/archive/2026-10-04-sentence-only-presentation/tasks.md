# Tasks

## 1. Sentence-only entry card

- [x] 1.1 Narrow `EntryCardProps` (delete endpoint labels, `transitModeAbsent`,
  and the ID span; delete the endpoint `<dl>`), update its one call site, and
  retire the five now-unused copy keys in both languages. Verify: `typecheck`
  fails any caller still passing the props; route test pins sentence-only.
- [x] 1.2 Rewrite the exactly-one-entry guard over instruction text (distinct
  fixture instructions) instead of the identifier. Verify: green, and red
  when a second instruction renders (duplicate-instruction probe).
- [x] 1.3 Delete the landing before-card (section, keys both languages, tests,
  enumeration entry) and the per-entry saving note (paragraph, keys both
  languages). Verify: no `landing.before.*` or `validation.savingNote` key
  remains in either catalog.

## 2. Ledger and spec hygiene

- [x] 2.1 Confirm `openspec validate --specs --strict` is **still 19** (delta
  lives under `openspec/changes/`, no new capability) and no migration file
  was added or modified.
- [x] 2.2 Update `docs/ROADMAP.md` Project Status rows and verify
  `tests/unit/ledger-integrity.test.ts` passes.
