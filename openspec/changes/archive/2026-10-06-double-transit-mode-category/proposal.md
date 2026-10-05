# Proposal

## Why

Commit `9337545` pushed the sixth dataset category (Double Transit Mode, `DTM_1..DTM_800`) directly to `main`, growing the authoritative source to 4,800 entries. The application still implements the former five-category / 4,000-entry model with a scalar-only transit mode, so CI is red and no forward path (parser, domain, database, import, allocation, dashboard, review, exports, guards) can consume the committed source. This change brings the whole stack forward to the committed six-category source without regenerating or reverting it.

## What Changes

- Authoritative source stays `data/merged-ilocano-synthetic-data.json` (6 blocks, 800 each, 4,800 total, SHA-256 `57fbe5ae686523ad8529a98147c7b027a9d2b16e0f669e70f3783bd27e59649b` re-measured in Apply); the immutable-source guard is updated forward to that hash, six names, and six exact ID sets. Guard is not weakened.
- Category table gains row 6 (`Double Transit Mode` / `double_transit_mode` / prefix `DTM`); canonical IDs `DTM_1..DTM_800` accepted, `DTM_0` / `DTM_801` / `DTM_0001` / unknown prefixes rejected; research order stays `category_id` then numeric suffix.
- Shared transit-mode domain added: `TransitMode` (`walking` | `jeepney` | `taxi` | `private_vehicle`), `TransitModePair` (exactly two distinct, order-preserving), `TransitModeValue` (`null` | scalar | pair); used by dataset schema, parser, batch/session/recovery projections, repository mapping, review, and exports. No `any`/`unknown` widening.
- Parser enforces six exact blocks and Category 6 purpose (origin null, destination required, `transit_mode` exactly two distinct allowed modes, array-like source); categories 1-5 shapes unchanged; no normalization or repair.
- Database: new forward migration adds nullable `transit_modes text[]` plus CHECKs (null for scalar categories, exactly-two distinct ordered allowed modes for DTM; scalar `transit_mode` null for DTM), preserves `source_payload`, keeps `source_entry_id` 1..800 range (no new range migration). New versioned RPC `dataset_entries_import_v3` carries the pair; v1/v2 untouched; sink defaults to v3 after engine-backed tests.
- Import, repository mappings, allocation (one shared 4,800 pool, no DTM special flow), session/recovery projections, researcher review (pair renders `jeepney + walking`), dashboard (4,800 / 800 per category / zero-state 4800-0-0-4800-0%), raw + validated JSON (six groups always, sorted), validated CSV (pair as compact JSON `["jeepney","walking"]`), raw CSV provenance, and summary (`omitted_incomplete_entries` 4,800 at zero state) all move to six categories losslessly.
- Pooled completion semantics unchanged; validators never vote on which of the two modes wins.
- Hosted: read real state first; stop if validations > 0; otherwise dated backup, apply new migration, FK-safe reset (reservations, validations, batch_entries, validation_batches, validation_sessions, validators, dataset_entries; preserve schema/history/functions/RLS/indexes/auth/`researcher_signin_attempts`), import 4,800, independent read-back (counts, ID sets, DTM pairs, payload identity, RLS), fresh zero-state exports.
- Tests, guards, OpenSpec validation, ROADMAP/AGENTS ledger re-derived (no stale 5/4000 counts).

## Capabilities

### New Capabilities

(none — this brings an already-committed source behind existing capabilities)

### Modified Capabilities

- `dataset-import`: six blocks, 4,800 rows, DTM IDs and purpose, pair-aware round-trip.
- `domain-contracts`: six prefixes, scalar/null/pair transit-mode domain.
- `research-schema`: `transit_modes` column, checks, and `dataset_entries_import_v3`.
- `research-export`: six groups, pair-preserving JSON/CSV, 4,800 zero state.
- `researcher-dashboard`: 4,800 totals, six per-category summaries, pair rendering in review.
- `batch-allocation`: one shared 4,800 pool, six `*_42` distinctness, paged reads at 4,800.

## Impact

- `src/lib/domain/categories.ts`, new `src/lib/domain/transit-mode.ts`, `src/schemas/dataset.ts`, `src/schemas/batch.ts`, `src/lib/dataset/synthetic-source.ts`, `src/lib/dataset/supabase-sink.ts`, `src/lib/repositories/supabase/dataset-entries.ts`, allocation/session/recovery projections, export builders (`records.ts`, `validated.ts`, `documents.ts`), researcher review view, dashboard copy, `supabase/migrations/` (one new file + v3 function), `scripts/import-dataset.ts` if arity changes, `tests/` (unit/dom/integration), immutable guard, hosted Supabase data, OpenSpec specs, `docs/ROADMAP.md`, `AGENTS.md` ledger.
- No archived history rewritten; no applied migration edited; no Category 6 regeneration.
