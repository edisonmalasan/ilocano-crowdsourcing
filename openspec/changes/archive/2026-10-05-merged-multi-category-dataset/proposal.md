# Proposal

## Why

The study is resetting from the single-category 600-entry Origin + Destination dataset to the merged 5-category 3,000-entry source already committed at `data/merged-ilocano-synthetic-data.json`. The current parser, importer, schema, and every guard still assume one flat array, one category, and `OD_*` ids — so nothing downstream can consume the new source until the pipeline is rebuilt around it, and the hosted pre-study data must be reset first.

## What Changes

- The authoritative import source becomes `data/merged-ilocano-synthetic-data.json`; the parser reads the 5-block shape with strict per-block validation (5 blocks, 600 entries each, local ids exactly 1..600, no silent skips, values preserved byte-identical, `transit_mode` from the file).
- Category names map to stable slugs (`destination_only`, `destination_transit_mode`, `origin_destination`, `origin_destination_transit_mode`, `complex_preference_expressions`) with the human-readable name kept for provenance.
- Canonical entry ids are minted deterministically as `DO_0001…`, `DT_0001…`, `OD_0001…`, `ODT_0001…`, `CPE_0001…`; `source_entry_id` (1..600) is modelled explicitly in schema/database/export; `source_payload` preserves the original record; no 1..3000 renumbering.
- Forward migration adds `source_entry_id` / `category_name` columns (nullable + range/blank checks, so old rows and old test inserts keep applying) and a new versioned import function carrying the two provenance arguments; applied migrations are never modified and the old function stays deployed.
- One-time operator-run hosted reset (backup first): delete research state in FK order plus the old 600 `dataset_entries` rows; schema, migrations, functions, RLS, auth config, and `researcher_signin_attempts` preserved; then import 3,000 rows and read back full verification.
- Exports gain category/source provenance (`source_entry_id`, `category`, `category_name`, judgment-supplier fields) under the existing response/attempt terminology; dashboard and allocation work over all 3,000 entries with existing guarantees intact.
- All guards, checksums, commands, docs, and specs that assume the old file are moved to the new source.

## Capabilities

### New Capabilities

(none — this replaces the dataset behind existing capabilities)

### Modified Capabilities

- `dataset-import`: merged 5×600 source, canonical ids, provenance columns, 3,000-row import and verification.
- `research-schema`: `source_entry_id` / `category_name` columns, checks, and the versioned import function.
- `research-export`: category/source provenance on raw and validated records.
- `researcher-dashboard`: category-aware counts over 3,000 entries.
- `batch-allocation`: one shared pool across all five categories with unchanged guarantees.

## Impact

- Parser, sink, import command, zod dataset model, repository row mappings, export builders, allocation/dashboard/export tests, migration filename lists, dataset guard checksums, AGENTS.md/ROADMAP references.
- One new migration file; one new DB function version; `fflate`-scale dependency change: none.
- Hosted destructive reset + reseed (operator-approved in the request itself, backup first).
