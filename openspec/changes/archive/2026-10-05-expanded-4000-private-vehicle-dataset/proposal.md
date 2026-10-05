# Proposal

## Why

The study is revising the pre-study corpus a second time: the committed
`data/merged-ilocano-synthetic-data.json` (owner direct commit `9a560c1`) is now
a 4,000-entry source — five blocks of 800 — with canonical unpadded IDs
(`D_1..D_800`, `DT_1..DT_800`, `OD_1..OD_800`, `ODT_1..ODT_800`,
`CPE_1..CPE_800`) already in the file, a restored category-purpose separation
(null-mode categories carry no transit mode), and a `private_vehicle` mode with
an exact intended distribution (200 each in DT/ODT/CPE, zero elsewhere).
Verified by read before planning: SHA-256
`0fc905d59af703bd9e876fe50d50667c15f499de351b9680434bbd0541927989`
matches the approved hash; structural audit over all 4,000 records reports zero
problems; the transit distribution matches the intended table exactly; a
keyword-contradiction scan whose markers were measured capable (taxi 600/600,
private 600/600) reports zero candidates, and the marker-blind remainder was
inspected by eye (Ilocano conjugations such as `magnaak`, `agtaxiak`,
`agjeep`, all supporting their structured mode).

The current pipeline was built for the previous 3,000-entry source and cannot
consume this revision: the parser mints zero-padded `DO_0001`-style ids, the
domain id schema demands four digits, `source_entry_id` stops at 600, the
database CHECK stops at 600, exports are flat JSON, and every count says 3000.
The hosted project still holds the old 3,000-entry corpus with zero responses.

## What Changes

- The parser reads the file's canonical IDs verbatim (no reminting, no
  padding), derives `source_entry_id` from the numeric suffix, verifies the
  prefix against the enclosing category, and enforces 5 blocks, 800 entries
  each, exact per-category ID sets, and the category-purpose structural shapes
  (null-mode categories refuse populated modes; mode-bearing categories require
  the four-word vocabulary).
- One shared canonical-ID helper (parse + numeric ordering by category then
  suffix) replaces scattered regexes; the domain id schema becomes the strict
  canonical contract; `sourceEntryId` becomes 1..800.
- One forward migration widens the `source_entry_id` range CHECK to 1..800,
  nullable semantics preserved. `dataset_entries_import_v2` is preserved: its
  signature already carries provenance as an integer and its behavior needs no
  change, and no transit-mode constraint exists anywhere, so none is invented.
- Exports become category-grouped JSON (`categories` in `category_id` order,
  records numeric-suffix ordered, no repeated category metadata inside grouped
  records) with a numeric `category_id` added to CSV rows; JSON/CSV parity,
  terminology, pooled methodology, and raw-only diagnostics are unchanged.
- Allocation keeps its shared pool with a five-way `*_42` coexistence proof;
  paging (1000-row) and 200-id chunking are re-verified at 4,000 scale.
- Operator-run hosted backup of the current 3,000-entry state, FK-ordered
  reset, migration apply, 4,000-row import, full read-back (counts, id sets,
  field equality, payload values, transit distribution), zero-state export and
  smoke — with no fabricated responses.

## Capabilities

### New Capabilities

(none — this revises the dataset behind existing capabilities)

### Modified Capabilities

- `dataset-import`: 4,000-entry verbatim-ID source, 800/category, suffix
  derivation, prefix/category agreement, category-purpose structural checks.
- `domain-contracts`: strict canonical dataset-ID contract with shared parser.
- `research-schema`: `source_entry_id` range migration to 1..800.
- `research-export`: grouped JSON, numeric `category_id`, numeric ordering.
- `researcher-dashboard`: 4,000 zero-state figures.
- `batch-allocation`: five-way coexistence and 4,000-entry scale.

## Impact

- Parser, canonical-id helper, zod dataset model, import command, one new
  migration, export builders (grouped JSON, category_id, ordering), allocation/
  dashboard/export tests, migration filename lists, dataset guard checksum,
  AGENTS.md/ROADMAP references.
- One new migration file; no new RPC function; no new dependency.
- Hosted destructive reset + reseed (operator-approved in the request itself,
  backup first, readability verified before any delete).

## Conflict surfaced during Explore

In-force `research-export` prescribes flat JSON records (`EXPORT_RECORD_KEYS`
parity). The request mandates grouped JSON. This is an intentional spec change,
carried as MODIFIED requirements below — not a silent drift of the artifact.
