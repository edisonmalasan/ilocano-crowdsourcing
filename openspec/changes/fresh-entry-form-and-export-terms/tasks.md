# Tasks

## 1. Fresh form per entry

- [ ] 1.1 Reset entry-scoped form state when `datasetEntryId` changes in `ValidationForm` (evaluation, correction, both translations, translation choice, field errors), preserving attempt identity, batch progress, and transition state. Verify: DOM regression test fills entry 1, submits, advances to entry 2, and proves no entry-1 value, choice, or error survives — in state and in any subsequent payload.
- [ ] 1.2 Add `rerender` to the DOM harness for same-instance prop changes. Verify: existing DOM suites green unchanged.

## 2. Validated judgment metadata plus export terminology

- [ ] 2.1 Add `category`, `evaluation`, `self_reported_proficiency`, `source_attempt_id` to validated records and rename `source_validation_id` → `source_response_id` (JSON + CSV, key orders pinned). Verify: export tests prove judgment-supplier attribution on single- and multi-source records with `needs_review` unchanged.
- [ ] 2.2 Rename raw export keys `validation_id` → `response_id`, `validator_id` → `attempt_id` (JSON + CSV) with values and prefixes unchanged and no database change. Verify: export/round-trip tests prove the new names with identical values; raw diagnostic flags stay raw-only.
- [ ] 2.3 Run the full suite: `lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`, `build`. Verify: all exit 0 with counts read back.
- [ ] 2.4 Run can-fire probes on the entry reset and the terminology rename with green controls and byte-identical restores. Verify: both fire red.
- [ ] 2.5 Update `docs/ROADMAP.md` Project Status rows for the Apply and verify `ledger-integrity` passes.
