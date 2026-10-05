# Design

## Context

See proposal.md - Why. The revised source is committed at HEAD (`9a560c1`,
1,252,668 bytes, SHA-256 verified against the approved hash). Current main is
the archived `merged-multi-category-dataset` tree: parser mints `DO_0001`-style
ids, `datasetEntryIdSchema` is `/^[A-Z]{2,4}_\d{4,}$/`, `sourceEntryId` is
1..600 in zod and in CHECK `dataset_entries_source_entry_id_range`, exports
are flat, hosted holds 3,000 entries with 0 responses and both import
functions deployed. No transit-mode CHECK exists anywhere (verified by
searching every migration), so §13's conditional needs no work.

## Goals / Non-Goals

**Goals:** verbatim-ID parsing with suffix derivation and category agreement;
strict shared ID contract; 1..800 everywhere (zod, parser, one CHECK
migration); grouped exports with numeric ordering; 4,000-row round trip;
hosted backup → migrate → reset → import → read-back with distribution proof;
zero-state export and smoke with no fake responses.

**Non-Goals:** adjudication, new categories, import UI, transit enum, v3 RPC,
Vercel deployment (owner-executed, reported as blocker/follow-up only).

## Decisions

**D1: Canonical IDs are read, never minted; the mapping table keyes on prefix.**

One table — numeric `category_id`, human name, slug, prefix — shared by parser
and exports (new `@/lib/domain/categories.ts`; the parser's old table moves
there). The parser verifies each record's id against `^(prefix)_(\d+)$` of the
ENCLOSING block, derives the suffix as `sourceEntryId`, and asserts the exact
per-category set (`D_1..D_800` etc.). `source_payload` keeps the record
verbatim. A `DT_12` inside Destination Only fails naming both.

**D2: One strict ID helper, used by the schema, the parser, and ordering.**

`parseCanonicalEntryId(id)` returns `{ prefix, suffix }` or null; the zod
schema refines on it plus suffix range plus known prefix (unknown `XYZ_12`,
`DO_0001`, `D_0001`, `D_0`, `D_801` all fail). `compareCanonicalEntryIds`
orders by category order then numeric suffix — lexical order is wrong for
unpadded ids and gets a regression test. No scattered regexes.

**D3: Category-purpose checks are structural and live in the parser.**

Null-mode blocks (D, OD) refuse non-null origin (D) / any transit_mode;
mode blocks (DT, ODT) require the four-word vocabulary; CPE requires a
destination, origin-if-present, and the same vocabulary. Sentence-vs-output
agreement beyond that is audit evidence (done in Explore, zero candidates with
capable markers), not a spec requirement — regexes cannot prove Ilocano.

**D4: One CHECK migration, no v3 function, no transit constraint.**

`ALTER TABLE DROP CONSTRAINT` + `ADD CONSTRAINT` with the same name and the
1..800 expression, nullable preserved, precondition on the table only (the old
CHECK's presence is not load-bearing: re-running after a partial apply must
converge, and the integration suite asserts the final state, not the path).
v2's integer provenance argument already accepts 800. No transit CHECK exists,
so none is touched.

**D5: Grouped JSON, flat CSV, parity by information.**

`validations.json`: `{ categories: [{ category_id, category, category_name,
responses: [...] }] }`; `validated-dataset.json`: `{ derivation: {...},
categories: [...] }` keeping `omitted_incomplete_entries` in derivation.
Grouped records drop the enclosing category triple (kept in CSV rows, which
gain leading `category_id`). Records sort by numeric suffix; responses keep
collection order. `source_entry_id` stays in both forms (prior provenance
contract kept, though the request's example omits it — examples are
illustrative, the contract is not).

**D6: Scale re-verification, not re-architecture.**

Paging (1000) and 200-chunks stay with identical bounds unless measurement
disagrees. Integration proves 4,000 rows through PGlite; unit proves >1000
through repository/service/export reads; hosted proves 4,000 through the real
gateway.

## Risks / Trade-offs

- [Risk] Owner direct commit already replaced the data file on main; the Apply
  branch must not fight it → Mitigation: Apply changes code only around the
  committed file; the guard's new hash is the file as committed.
- [Risk] Grouped JSON breaks an unknown external consumer → Mitigation: CSV
  keeps every field flat; the shape change is an intentional spec MODIFIED with
  parity scenarios, recorded here rather than drifted.
- [Risk] 4,000 sequential RPC import calls are slow → Mitigation: idempotent
  re-runs make interruption recoverable; counts distinguish partial runs.
- [Risk] Hosted destructive step → Mitigation: backup-first with readability
  check; per-table counts before/after every delete; user-approved.

## Migration Plan

1. Apply the single new CHECK migration hosted; read back the constraint.
2. Operator backup of the 3,000-entry corpus; verify readability.
3. FK-ordered deletes with per-table counts; verify zeros.
4. Import 4,000 rows; expect 4,000 inserted, 0 updated/refused.
5. Read-back: counts, id sets, field equality, payload values, transit
   distribution, actives; zero-state export + smoke with zero fake responses.
