# Design

## Context

The sixth category already exists in the committed JSON: six blocks with `category_id` 1..6, `category_name` values including `Double Transit Mode`, 800 entries each, `DTM_1..DTM_800`, each DTM `output` carrying `origin: null`, non-blank `destination`, `transit_mode: [a, b]`. Current code assumes five blocks, `transitMode: string | null`, scalar `transit_mode text`, `dataset_entries_import_v2` (scalar-only), five export groups, and 4,000-scale guards. CI fails on all of those.

## Goals

- Accept exactly the committed source; reject everything else loudly; never repair.
- Model the pair explicitly and losslessly end to end (parse → schema → DB → RPC → sink → repository → allocation/session → review → JSON/CSV) with order preserved.
- Keep categories 1-5 byte/behavior-identical; keep pooled completion, reservation, RLS, and export derivation rules unchanged.
- Prove 4,800 rows survive PostgREST paging (1000-row cap, bounded `.in()` chunking).

## Non-goals

- No Category 6 regeneration, no source rewrite, no research adjudication, no methodology change, no new allocation flow for DTM, no decorative review UI, no second `source_entry_id` range migration.

## Decisions

### D1: Extend the single category table, not a second map

`DATASET_CATEGORY_TABLE` gains `{ categoryId: 6, name: "Double Transit Mode", slug: "double_transit_mode", prefix: "DTM" }`. Comments saying 1..5 become 1..6. All lookups (`parseCanonicalEntryId`, `categoryRowForSlug/Name`, `compareCanonicalEntryIds`) work unchanged because they are table-driven.

### D2: Shared transit-mode domain (`src/lib/domain/transit-mode.ts`)

- `TRANSIT_MODES = ["walking","jeepney","taxi","private_vehicle"]`.
- `TransitMode` string union; `TransitModePair = readonly [TransitMode, TransitMode]` with `isTransitModePair` (length 2, both allowed, distinct).
- `TransitModeValue = null | TransitMode | TransitModePair` with `isTransitModeValue`, `formatTransitModeValue` (`null` → null; scalar → itself; pair → `a + b`), `serializeTransitModeCsvCell` (scalar → itself; pair → compact JSON `["a","b"]`; null → null per CSV null contract), `parseTransitModeCsvCell` inverse.
- Zod: `transitModeSchema` (scalar-or-null existing shape stays for old call sites only where pair impossible — actually replaced by `transitModeValueSchema` accepting null/scalar/pair) shared by `datasetEntryInputSchema.transitMode`, `allocatedEntrySchema.transitMode`, session projection validation.
- Alternatives rejected: `unknown`/`any`/`string[]` (loses distinctness/length/vocabulary); first-mode-wins (lossy); comma-joined text (ambiguous with place names); JSON-text-in-scalar-column (unqueryable, hides schema).

### D3: Parser is table-length-driven + DTM purpose arm

- Block count must equal `DATASET_CATEGORY_TABLE.length` (6); per-block 800; ID sets `D_/DT_/OD_/ODT_/CPE_/DTM_ 1..800` exact; prefix must agree with enclosing block.
- `assertCategoryPurpose`: null-mode (`destination_only`, `origin_destination`) unchanged; scalar-mode (`destination_transit_mode`, `origin_destination_transit_mode`, `complex_preference_expressions`) unchanged scalar vocabulary; `double_transit_mode` requires origin null, destination non-null, `transit_mode` array-like with exactly 2 distinct allowed modes (order kept). Source array preserved verbatim into `TransitModeValue`; never coerced to scalar.
- `sourcePayload` still the untouched record.

### D4: Database adds `transit_modes text[]`, keeps scalar column

- `alter table dataset_entries add column transit_modes text[]` nullable; CHECKs: (a) scalar categories keep `transit_modes is null`; (b) DTM rows carry `transit_mode is null and transit_modes has exactly 2 elements, both in vocabulary, distinct` (array_length + `<>` + `= ANY`); (c) non-null-mode scalar rows keep existing behavior (no new scalar CHECK invented — vocabulary enforced at parse time as today).
- `source_payload` unchanged; `source_entry_id` 1..800 CHECK untouched.
- Alternatives rejected: comma-joined scalar (lossy/ambiguous); JSON-text-in-scalar (untyped); replacing scalar column (breaks 4,000 existing rows + history).

### D5: Versioned RPC `dataset_entries_import_v3`

- Same posture as v2 (invoker, empty `search_path`, `xmax` discriminator, instruction/payload/`created_at` immutable, named divergence refusal, `service_role` grant + anon/authenticated revoke). Adds `p_transit_modes text[]`; update list sets both `transit_mode` and `transit_modes`; divergence `where` unchanged (instruction equality). v1/v2 stay deployed; sink constant moves to v3 only after engine tests prove insert/update/divergence/privilege.
- Precondition asserts table + both transit columns + PK, in-artefact (transaction-rollback reasoning as prior migrations).

### D6: Repository maps both columns to `TransitModeValue`

- `ENTRY_COLUMNS` gains `transit_modes`; `toDomain` builds `transitMode`: DTM rows → pair from `transit_modes` (validated by schema; mismatch raises `RepositoryError`); others → `transit_mode ?? null`. Column-name change stays on the mapping line; `source_payload` still not surfaced (archival copy reasoning unchanged).
- `listAllActive` paging (1000) unchanged; verified at 4,800 (5 pages).

### D7: Projections carry the pair opaquely

Allocation `projectEntries`, session `toAllocatedEntry`, recovery flows: no transit-specific logic; they copy `transitMode: TransitModeValue` through existing schemas. Distinctness proof is `D_42/DT_42/OD_42/ODT_42/CPE_42/DTM_42` are six canonical IDs.

### D8: Review renders `a + b`

`entry-review.tsx` `Field value={formatTransitModeValue(entry.transitMode) ?? "—"}`. No badges; validator session stays sentence-focused.

### D9: Exports preserve the pair losslessly

- Validated JSON `output.transit_mode: string | string[] | null` (array for DTM, order-preserved); six groups always, `category_id` order, numeric-suffix order (`DTM_2` before `DTM_10` via `compareCanonicalEntryIds`).
- Validated CSV `transit_mode` cell via `serializeTransitModeCsvCell`; parity test parses back with `parseTransitModeCsvCell`.
- Raw JSON six groups; raw CSV provenance (`category_id/category/category_name/dataset_entry_id/source_entry_id/response_id/attempt_id`) unchanged plus DTM rows.
- Summary zero-state: 4,800/0/0/4,800/`omitted_incomplete_entries` 4,800.

### D10: Guards move forward, never weaken

Immutable guard: new `EXPECTED_SHA256` (re-measured from `main` bytes in Apply), six names, six prefixes, 800 each. Tamper arms (alter/push/re-id) updated to six-block math.

## Risks / trade-offs

- `text[]` via PostgREST returns JS arrays; mapping must validate element types (unknown → schema) rather than trust. Mitigated by `datasetEntrySchema` pair validation + integration round-trip asserting order.
- CSV pair cell looks like JSON; consumers splitting on comma would misread — documented as compact-JSON contract + round-trip test. Alternative (two columns) would change `VALIDATED_RECORD_KEYS` shape and break parity; rejected.
- Hosted reset destroys pre-study rows; gated on `validations == 0` read first + dated backup + read-back.

## Open questions

- None blocking: category names/IDs/shapes are read off the committed file in Apply; any deviation from §1 contract fails the audit and is reported with exact IDs rather than repaired.
