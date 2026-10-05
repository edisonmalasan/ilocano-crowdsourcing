# Tasks

## 1. Source audit (read-only)

- [ ] 1.1 Audit committed `data/merged-ilocano-synthetic-data.json`: 6 blocks, 800 each, 4,800 total; IDs exactly `D_/DT_/OD_/ODT_/CPE_/DTM_ 1..800` with no gaps/duplicates/padding; DTM origin null, destination non-blank, pair exactly-two distinct allowed modes; instructions unique where intended; report exact offending IDs (no source rewrite).
- [ ] 1.2 Independently re-measure SHA-256 of the committed bytes (Node, no shell pipe) and record it; confirm hosted `.env.local` names only.
- [ ] 1.3 Inventory every `1..5` / `five` / `4000` / scalar-`transit_mode` assumption across `src/`, `tests/`, `supabase/`, `scripts/`, specs, ROADMAP/AGENTS.

## 2. Domain + parser

- [ ] 2.1 Add `src/lib/domain/transit-mode.ts` (vocabulary, pair, value, guards, format/serialize/parse, zod schemas) with unit tests.
- [ ] 2.2 Extend `DATASET_CATEGORY_TABLE` with DTM row; update 1..5 comments; unit tests for `DTM_1..DTM_800` accept and `DTM_0/801/0001/-1/unknown` reject + numeric ordering.
- [ ] 2.3 Update `datasetEntryInputSchema` / `allocatedEntrySchema` (+ session/recovery projections) to `TransitModeValue`; type tests.
- [ ] 2.4 Update `parseSyntheticDataset` to six blocks + DTM purpose arm; unit + integration parser tests (6×800, exact ID sets, pair/order/vocabulary/distinctness rejections: 1-mode, 3-mode, duplicate, bad vocab, origin-non-null, destination-null).

## 3. Database + import path

- [ ] 3.1 New forward migration `supabase/migrations/<ts>_double_transit_mode.sql`: `transit_modes text[]`, CHECKs, precondition, comments; never edits history.
- [ ] 3.2 New `dataset_entries_import_v3`; grants/revokes; sink defaults to v3; `scripts/import-dataset.ts` arity if needed.
- [ ] 3.3 Repository mapping (`ENTRY_COLUMNS` + `toDomain`) for both columns; round-trip order preservation.
- [ ] 3.4 Engine-backed integration tests: migration applies from production dir, v3 insert/update/divergence/privilege, 4,800-row import idempotent with byte-identical fields + value-identical payloads + distribution (null 1600; scalars per existing; pairs 800 ordered distinct).

## 4. Allocation / session / recovery

- [ ] 4.1 Keep one shared pool; prove `D_42…DTM_42` six distinct; re-verify paging/chunking at 4,800; completion/reservation/`cannot_evaluate`/short-batch semantics unchanged.
- [ ] 4.2 Session + recovery projections preserve pair; tests.

## 5. Review / dashboard / exports

- [ ] 5.1 Review renders pair (`a + b`); no `[object Object]`; tests.
- [ ] 5.2 Dashboard 4,800 + six per-category summaries + zero-state figures; tests.
- [ ] 5.3 Validated JSON six groups + array pair + ordering; validated CSV compact-JSON pair + parity round-trip; raw JSON/CSV six groups + provenance; summary zero-state 4800/omitted 4800; tests.

## 6. Guards + docs

- [ ] 6.1 Immutable guard forward: new SHA, six names, six ID sets, six-block tamper math.
- [ ] 6.2 Update migration-filename lists, RPC-version assertions, scale comments (3000/4000→4800, five→six) across tests.
- [ ] 6.3 Apply verification: format, lint, typecheck, unit, DOM, integration, build, guards, `openspec validate --strict`; read counts from logs; CI green on branch.

## 7. Hosted Supabase (after Apply green)

- [ ] 7.1 Read real hosted state (entries, per-category, validations, complete/incomplete, RLS anon probe); STOP + report if validations > 0.
- [ ] 7.2 Dated backup + readability check; apply new migration; read migration state back.
- [ ] 7.3 FK-safe reset (reservations → validations → batch_entries → validation_batches → validation_sessions → validators → dataset_entries; preserve schema/history/functions/RLS/indexes/auth/signin_attempts); import 4,800; independent read-back (counts, ID ranges, DTM pairs/order, payload identity, active, RLS); fresh zero-state exports.

## 8. Sync + Archive

- [ ] 8.1 `openspec validate --specs --strict`; sync six specs; re-derive ROADMAP/AGENTS ledger (no stale counts); archive.
- [ ] 8.2 Final main/CI/Vercel verification before CHANGE 2.
