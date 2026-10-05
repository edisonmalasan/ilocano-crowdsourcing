# Tasks

## 1. Source audit (read-only)

- [x] 1.1 Audit committed `data/merged-ilocano-synthetic-data.json`: 6 blocks, 800 each, 4,800 total; IDs exactly `D_/DT_/OD_/ODT_/CPE_/DTM_ 1..800` with no gaps/duplicates/padding; DTM origin null, destination non-blank, pair exactly-two distinct allowed modes; instructions unique where intended; report exact offending IDs (no source rewrite).
- [x] 1.2 Independently re-measure SHA-256 of the committed bytes (Node, no shell pipe) and record it; confirm hosted `.env.local` names only.
- [x] 1.3 Inventory every `1..5` / `five` / `4000` / scalar-`transit_mode` assumption across `src/`, `tests/`, `supabase/`, `scripts/`, specs, ROADMAP/AGENTS.

## 2. Domain + parser

- [x] 2.1 Add `src/lib/domain/transit-mode.ts` (vocabulary, pair, value, guards, format/serialize/parse, zod schemas) with unit tests.
- [x] 2.2 Extend `DATASET_CATEGORY_TABLE` with DTM row; update 1..5 comments; unit tests for `DTM_1..DTM_800` accept and `DTM_0/801/0001/-1/unknown` reject + numeric ordering.
- [x] 2.3 Update `datasetEntryInputSchema` / `allocatedEntrySchema` (+ session/recovery projections) to `TransitModeValue`; type tests.
- [x] 2.4 Update `parseSyntheticDataset` to six blocks + DTM purpose arm; unit + integration parser tests (6×800, exact ID sets, pair/order/vocabulary/distinctness rejections: 1-mode, 3-mode, duplicate, bad vocab, origin-non-null, destination-null).

## 3. Database + import path

- [x] 3.1 New forward migration `supabase/migrations/<ts>_double_transit_mode.sql`: `transit_modes text[]`, CHECKs, precondition, comments; never edits history.
- [x] 3.2 New `dataset_entries_import_v3`; grants/revokes; sink defaults to v3; `scripts/import-dataset.ts` arity if needed.
- [x] 3.3 Repository mapping (`ENTRY_COLUMNS` + `toDomain`) for both columns; round-trip order preservation.
- [x] 3.4 Engine-backed integration tests: migration applies from production dir, v3 insert/update/divergence/privilege, 4,800-row import idempotent with byte-identical fields + value-identical payloads + distribution (null 1600; scalars per existing; pairs 800 ordered distinct).

## 4. Allocation / session / recovery

- [x] 4.1 Keep one shared pool; prove `D_42…DTM_42` six distinct; re-verify paging/chunking at 4,800; completion/reservation/`cannot_evaluate`/short-batch semantics unchanged.
- [x] 4.2 Session + recovery projections preserve pair; tests.

## 5. Review / dashboard / exports

- [x] 5.1 Review renders pair (`a + b`); no `[object Object]`; tests.
- [x] 5.2 Dashboard 4,800 + six per-category summaries + zero-state figures; tests.
- [x] 5.3 Validated JSON six groups + array pair + ordering; validated CSV compact-JSON pair + parity round-trip; raw JSON/CSV six groups + provenance; summary zero-state 4800/omitted 4800; tests.

## 6. Guards + docs

- [x] 6.1 Immutable guard forward: new SHA, six names, six ID sets, six-block tamper math.
- [x] 6.2 Update migration-filename lists, RPC-version assertions, scale comments (3000/4000→4800, five→six) across tests.
- [x] 6.3 Apply verification: format, lint, typecheck, unit, DOM, integration, build, guards, `openspec validate --strict`; read counts from logs; CI green on branch.

## 7. Hosted Supabase (after Apply green)

- [x] 7.1 Read real hosted state (entries, per-category, validations, complete/incomplete, RLS anon probe); STOP + report if validations > 0.
- [x] 7.2 Dated backup + readability check; apply new migration; read migration state back.
- [ ] 7.3 FK-safe reset (reservations → validations → batch_entries → validation_batches → validation_sessions → validators → dataset_entries; preserve schema/history/functions/RLS/indexes/auth/signin_attempts); import 4,800; independent read-back (counts, ID ranges, DTM pairs/order, payload identity, active, RLS); fresh zero-state exports. **NOT DONE BY OPERATOR DECISION 2026-10-06: hosted holds 1 real response (`RSP_29cbe8f5550b2924` on `OD_675`, both translations, 2026-10-05) and the task orders STOP before deleting research data. Schema-only migration applied instead; all 4,044 rows preserved; backup at `research-backup-20261006-dtm/`. Hosted corpus remains 4,000 old-category entries with 0 DTM rows until the response's disposition is decided.**

## 8. Sync + Archive

- [x] 8.1 `openspec validate --specs --strict`; sync six specs; re-derive ROADMAP/AGENTS ledger (no stale counts); archive.
- [ ] 8.2 Final main/CI/Vercel verification before CHANGE 2.
