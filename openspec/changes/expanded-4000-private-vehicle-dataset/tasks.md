# Tasks

## 1. Verbatim IDs, suffix derivation, and the 800 range

- [ ] 1.1 Add the shared canonical-ID helper (parse + numeric ordering) and the shared category table; replace the strict-but-wrong id regex with the canonical contract. Verify: unit tests prove every valid family, every listed invalid shape, prefix/category agreement, and lexical-vs-numeric ordering.
- [ ] 1.2 Rewrite the parser for verbatim IDs: 5 blocks, 800 each, exact per-category ID sets, suffix-derived `sourceEntryId`, prefix/block agreement, category-purpose structural checks, verbatim payloads. Verify: 4,000 parsed; loud failure on gaps/duplicates/wrong prefixes/out-of-range suffixes/unknown categories/misplaced modes.
- [ ] 1.3 Widen zod `sourceEntryId` to 1..800 and repoint the import command to 4,000 records with read-only guarantees intact. Verify: typecheck enumerates the ripple; command tests prove the default path and refusal behavior.
- [ ] 1.4 Move every live 3000/600/`DO_0001` assumption (parser, command, guard hash, docs, specs) to the new source; pin SHA-256 `0fc905d5…`. Verify: no stale assumption remains outside archive/history.

## 2. Migration, audit, round-trip, and hosted reseed

- [ ] 2.1 Write one forward migration widening the `source_entry_id` CHECK to 1..800 (nullable preserved, v2 untouched, no transit constraint invented). Verify: PGlite applies the full set; 800 accepted; 801 and 0 refused with the CHECK named.
- [ ] 2.2 Record the pre-import source audit as Apply evidence (structure, distribution, contradiction scan with capable markers plus eye-sampled remainder). Verify: audit scripts rerun green against the committed file.
- [ ] 2.3 Prove the 4,000-row round-trip through PostgreSQL with per-category counts, exact id sets, byte-identical fields, payload values, and the exact transit distribution. Verify: integration tests over the real engine.
- [ ] 2.4 Back up the hosted 3,000-entry corpus and verify readability; apply the migration and read the constraint back; FK-order delete to zeros; import 4,000 rows; read back every verification (counts, id sets, fields, payloads, distribution, actives). Verify: measured hosted numbers recorded, never claimed.
- [ ] 2.5 Prove the hosted zero state (4000/0/0/4000/0%, empty exports with `omitted_incomplete_entries = 4000`) and run the production smoke with zero fake responses. Verify: export artifacts read back; anon gateway still denied.

## 3. Exports, allocation, dashboard, ledger, and full verification

- [ ] 3.1 Reshape exports (grouped JSON, `category_id`, numeric ordering, provenance kept, parity held, raw diagnostics stay raw-only). Verify: export tests prove grouping, ordering, parity, zero-state, and `private_vehicle` serialization in both forms.
- [ ] 3.2 Prove five-way `*_42` allocation coexistence and 4,000-scale reads (paging + chunking) with a >1000-row corpus through repository/service/export paths; prove the 4,000-entry dashboard zero state. Verify: allocation/dashboard/export tests.
- [ ] 3.3 Run can-fire probes on the verbatim-ID guard, the prefix/category agreement, the numeric ordering, and a grouped-shape key with green controls and byte-identical restores. Verify: all fire red.
- [ ] 3.4 Run the full suite (`lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`, `build`, `openspec validate --specs --strict`, guards) and record actual counts. Verify: all exit 0; re-derive stale ROADMAP/AGENTS ledger items in scope.
