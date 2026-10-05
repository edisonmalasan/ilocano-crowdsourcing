# Design

## Context

See proposal.md - Why. The merged source (`data/merged-ilocano-synthetic-data.json`, 914,367 bytes, verified by read: 5 blocks × 600 entries, local ids unique 1..600 per block, shape `{categories: [{category_id, category_name, entries: [{id, instruction, output: {origin, destination, transit_mode}}]}]}`) is already committed. The current parser hardcodes one flat array and one category; `datasetEntryIdSchema` (`/^[A-Z]{2,4}_\d{4,}$/`) already accepts every new prefix; the import function carries a fixed 8-argument signature pinned by the import guard; the sink passes provenance-free rows.

## Goals / Non-Goals

**Goals:**

- Strict merged-shape parsing with deterministic canonical ids and loud failure.
- Provenance columns plus a versioned import function, old function untouched.
- Operator-run backup → FK-ordered delete reset → 3,000-row import → read-back verification.
- Export/dashboard/allocation work over five categories with existing guarantees.

**Non-Goals:**

- Adjudication, new categories beyond the five, streaming import, import UI.

## Decisions

**D1: New parser entry point over the merged shape; `source_payload` preserves the raw entry verbatim.**

One explicit category table (name → slug, prefix) drives block acceptance, canonical-id minting (`{prefix}_{local:04d}`), and the unknown-category refusal. `source_payload` keeps `{id, instruction, output}` exactly as filed; block context travels in columns, not by rewriting the payload. The old flat-array parser is replaced, not kept beside the new one — two parsers for one source file is how a future import silently uses the wrong one.

**D2: `source_entry_id` / `category_name` are nullable columns with CHECKs, set by a versioned function.**

Nullable (not NOT NULL) because the migration must apply over the current table holding old rows, and because existing integration inserts omit the columns — a NOT NULL without backfill would fail the deploy it is meant to enable. `CHECK (1..600)` and non-blank `category_name` still reject bad values; the import always supplies both. New function `dataset_entries_import_v2` (10 args, same grants, same immutability/update-list philosophy, same invoker/search-path posture); the v1 function and its guard stay deployed and passing. Sink default becomes v2.

**D3: Zod dataset model gains required `sourceEntryId` (int 1..600) and `categoryName` (non-empty).**

Required, not optional: silent absence is how a future entry loses provenance. The ripple through test fixtures is enumerated by `typecheck` and fixed there, not waived. Repository row mapping carries NULL → absent only for legacy reads; the sink refuses an entry missing either field before any RPC.

**D4: Reset is explicit `DELETE`s in FK order, never `DROP`/`TRUNCATE`.**

`entry_reservations` → `validations` → `batch_entries` → `validation_batches` → `validation_sessions` → `validators` → `dataset_entries`, each with a row count read back, all through the Management API query endpoint already used for migrations. `researcher_signin_attempts` is not touched. Backup (`export:research`) runs first and its file list is recorded before any delete.

**D5: Export renames stop at the serializers.**

`response_id`/`attempt_id` and validated `source_response_id`/`source_attempt_id` plus provenance fields are key-array and builder changes only. DB columns, repository mappings, domain types, and stored values are untouched. Closed key-set tests pin both orders; JSON/CSV parity tests pin equivalence.

## Risks / Trade-offs

- [Risk] 3,000 sequential RPC import calls are slow → Mitigation: measured at Apply; idempotent re-runs make interruption recoverable, and the count report distinguishes partial from complete.
- [Risk] A second operator runs import concurrently → Mitigation: upsert keyed on canonical id is idempotent; instruction-divergence refusal names the conflict.
- [Risk] Fixture ripple from required model fields hides a real break → Mitigation: full suite plus can-fire probes; no test weakened to pass.
- [Risk] Hosted destructive step → Mitigation: backup-first ordering with recorded file list; counts read back before and after every step; user-approved in the request.

## Migration Plan

1. Apply the single new migration file hosted (Management API, one request), verify `pg_constraint` read-back.
2. Operator backup of the current corpus via `export:research`; record file list.
3. FK-ordered deletes with per-table counts; verify zeros.
4. Run the import; expect 3,000 inserted, 0 updated.
5. Read-back verification (counts per category, id sets, field equality, actives); dashboard/export smoke with zero fake responses.
