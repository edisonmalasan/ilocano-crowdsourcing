# Tasks

## 1. Parser, model, and import path for the merged source

- [x] 1.1 Replace the flat-array parser with strict merged-shape parsing (5 blocks, 600 each, local ids exactly 1..600, explicit category table, deterministic canonical ids, verbatim payloads, transit_mode from file). Verify: unit tests prove counts, uniqueness, determinism, mapping exactness, and loud failure on duplicates/gaps/unknown categories/blank instructions.
- [x] 1.2 Extend the zod dataset model with required `sourceEntryId` (int 1..600) and `categoryName` (non-empty); update the sink to pass provenance and default to the versioned function. Verify: `typecheck` enumerates the ripple; all fixtures updated, none weakened.
- [x] 1.3 Repoint the import command default source to `data/merged-ilocano-synthetic-data.json` with read-only guarantees intact. Verify: command tests prove the default path, refusal on bad records, and no source write.
- [x] 1.4 Move every old-source reference (parser, command, guard checksums, docs, specs) to the merged file; pin its SHA-256 as the new immutability constant. Verify: no `ilocano-synthetic-data.json` reference remains outside archive/history.

## 2. Migration, reset, reseed, and hosted verification

- [x] 2.1 Write one forward migration: nullable `source_entry_id`/`category_name` with CHECKs plus versioned import function with identical grants/posture, never modifying applied files. Verify: PGlite applies the full set; old rows and old test inserts still apply; new columns accept valid provenance and refuse bad values.
- [x] 2.2 Prove 3,000-row round-trip through PostgreSQL with per-category counts, id sets, and byte-identical fields. Verify: integration tests over the real engine.
- [x] 2.3 Back up the hosted corpus, FK-order delete the approved tables plus old `dataset_entries`, verify zeros, import 3,000 rows, and read back every verification in section 6 (counts, id sets, field equality, payloads, actives). Verify: measured hosted numbers recorded, never claimed.
- [x] 2.4 Prove zero-state dashboard and empty export after reset/import, plus category-aware figures and cross-category allocation with same-local-id coexistence. Verify: dashboard/export/allocation tests; production smoke with zero fake responses.

## 3. Exports, ledger, and full verification

- [x] 3.1 Add export provenance and terminology renames (raw + validated, JSON + CSV, key orders pinned, parity held, diagnostics stay raw-only). Verify: export tests prove attribution, renames with identical values, and recomputability.
- [x] 3.2 Run the full suite: `lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`, `build`. Verify: all exit 0 with counts read back.
- [x] 3.3 Run can-fire probes on the block validator, the canonical-id mapping, and a rename with green controls and byte-identical restores. Verify: all fire red.
- [x] 3.4 Update AGENTS.md/ROADMAP.md (`data/` source, counts, category/id rules) and verify `ledger-integrity` passes.
