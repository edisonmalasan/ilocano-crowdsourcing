-- Merged multi-category dataset provenance: source-local ids, category names, and a versioned import function.
--
-- FORWARD MIGRATION. No applied file is modified and no archived specification is rewritten.
-- `20261003120000_dataset_entries_import.sql` stays deployed with its eight-argument function, and
-- `20261004120000_dataset_entries_import_guard.sql` keeps passing against it. This file ADDs two
-- nullable columns and one new function. It changes no existing table constraint, no existing
-- column, no existing policy, and no existing function.
--
-- ---------------------------------------------------------------------------
-- WHY NULLABLE COLUMNS WITH CHECKS, RATHER THAN NOT NULL
-- ---------------------------------------------------------------------------
-- This migration must apply over a table that already holds rows: the old single-category corpus
-- on hosted, and every integration seed that inserts without the new columns. A `NOT NULL` without
-- a backfill would fail the deploy it is meant to enable, and a backfill would invent provenance
-- for rows whose source is being replaced anyway. Nullable with a range check is the honest shape:
-- a value, when present, must be in 1..600, and a blank category name is never accepted. The
-- importer always supplies both, so every row it writes carries full provenance; rows that predate
-- the columns keep NULL until the approved reset removes them.
--
-- ---------------------------------------------------------------------------
-- WHY A VERSIONED FUNCTION RATHER THAN A REPLACEMENT
-- ---------------------------------------------------------------------------
-- The eight-argument `dataset_entries_import` is referenced by name and arity in the deployed guard
-- migration, in `tests/integration/dataset-entries-import.test.ts`, and in the RPC hardening set.
-- Replacing it in place would change what those artefacts describe without changing what ran on
-- hosted. `dataset_entries_import_v2` carries the two provenance arguments with the same security
-- posture (invoker, empty search path), the same immutability philosophy (instruction, source
-- payload, source-local id, category name, and creation timestamp are absent from the update list),
-- and the same divergence refusal. The sink defaults to v2; v1 stays as history.
--
-- ---------------------------------------------------------------------------
-- WHY THE ANON/AUTHENTICATED REVOKE LIVES HERE AND NOT IN THE HARDENING FILE
-- ---------------------------------------------------------------------------
-- `20261004140000_rpc_execute_hardening.sql` is applied history and names exactly five functions;
-- its integration test fails when that set disagrees in either direction. This function did not
-- exist when it ran, so its revoke is issued here, beside the grant — the same two lines every
-- privileged function migration carries — rather than by editing history.
--
-- ---------------------------------------------------------------------------
-- PRECONDITION
-- ---------------------------------------------------------------------------
-- Everything below depends on `dataset_entries` existing with `id` as its conflict target. If that
-- is not true the `on conflict (id)` clause would fail at CREATE time with an error that names a
-- column but not a cause, so the state is asserted here and the refusal names it. Asserted in the
-- ARTEFACT and not only in a test, because each migration file is applied inside one transaction:
-- a `raise exception` rolls back everything earlier in the SAME file, so no post-failure assertion
-- can distinguish "the check ran first" from "the write ran first". An ordering that matters has
-- to be enforced by the file.

do $precondition$
begin
  if to_regclass('public.dataset_entries') is null then
    raise exception
      'merged_dataset_provenance precondition failed: relation "public.dataset_entries" does not exist. This migration adds provenance columns and a versioned import function over that table and must run after 20260930120000_research_schema.sql. Nothing was created.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.dataset_entries'::regclass
      and contype = 'p'
  ) then
    raise exception
      'merged_dataset_provenance precondition failed: "public.dataset_entries" has no primary key, so `on conflict (id)` has no arbiter index. Nothing was created.';
  end if;
end
$precondition$;

-- ---------------------------------------------------------------------------
-- Provenance columns
-- ---------------------------------------------------------------------------
-- `source_entry_id` is the source-local id (1..600) within the entry's category block: the `id`
-- the merged source file actually carries. `category_name` is the human-readable source category
-- name, verbatim, kept for researcher provenance while the slug remains the machine key.
--
-- `if not exists` on each statement, so a re-applied file (or a partially applied one re-run by
-- an operator) does not fail on its own columns. The CHECKs are added as table constraints with
-- explicit names, so a violation names the rule rather than a generated identifier.

alter table public.dataset_entries
  add column if not exists source_entry_id integer;

alter table public.dataset_entries
  add column if not exists category_name text;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dataset_entries_source_entry_id_range'
  ) then
    alter table public.dataset_entries
      add constraint dataset_entries_source_entry_id_range
      check (source_entry_id is null or (source_entry_id >= 1 and source_entry_id <= 600));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dataset_entries_category_name_not_blank'
  ) then
    alter table public.dataset_entries
      add constraint dataset_entries_category_name_not_blank
      check (category_name is null or length(btrim(category_name)) > 0);
  end if;
end
$constraints$;

-- ---------------------------------------------------------------------------
-- dataset_entries_import_v2
-- ---------------------------------------------------------------------------
-- Writes one entry and reports whether it created the row or matched an existing one.
--
-- One statement, so the row and the outcome cannot disagree: there is no read before the write
-- whose answer could be stale by the time the write lands.
--
-- `set search_path = ''` means nothing is resolved through a writable schema: every name in the
-- body is either fully qualified or lives in `pg_catalog`, which Postgres searches ahead of the
-- search path in any case.
--
-- `xmax` is Postgres' own discriminator between the two paths of an `ON CONFLICT`: it is 0 for a
-- row this statement INSERTED and non-zero for a row it UPDATED. Reading it here is what lets the
-- report be exact without a prior `select`, and it is the engine's answer rather than an inference
-- from a round trip that could race.

create function public.dataset_entries_import_v2(
  p_id              text,
  p_category        text,
  p_source_entry_id integer,
  p_category_name   text,
  p_instruction     text,
  p_origin          text,
  p_destination     text,
  p_transit_mode    text,
  p_source_payload  jsonb,
  p_is_active       boolean
)
returns text
language plpgsql
volatile
-- STATED EXPLICITLY RATHER THAN RELIED ON AS THE DEFAULT. `security invoker` is PostgreSQL's
-- default for a `create function`, so this clause changes no behaviour — and it is written out
-- anyway because a definer function would let `anon` write arbitrary rows into the table every
-- validator's batch is drawn from. `tests/integration/merged-dataset-provenance.test.ts` reads
-- `pg_proc.prosecdef` for this function and fails if it ever becomes true.
security invoker
set search_path = ''
as $fn$
declare
  v_outcome text;
begin
  insert into public.dataset_entries as entries
         (id, category, source_entry_id, category_name, instruction, origin, destination,
          transit_mode, source_payload, is_active)
  values (p_id, p_category, p_source_entry_id, p_category_name, p_instruction, p_origin,
          p_destination, p_transit_mode, p_source_payload, coalesce(p_is_active, true))
  on conflict (id) do update
     set category        = excluded.category,
         source_entry_id = excluded.source_entry_id,
         category_name   = excluded.category_name,
         origin          = excluded.origin,
         destination     = excluded.destination,
         transit_mode    = excluded.transit_mode,
         is_active       = excluded.is_active
    -- `instruction`, `source_payload`, and `created_at` are DELIBERATELY ABSENT from the list
    -- above, and this is the whole reason this function exists. Their absence is the guarantee:
    -- there is no argument this function accepts, and no caller that can reach it, that changes
    -- them. `source_entry_id` and `category_name` ARE in the list: they are provenance the
    -- importer always supplies identically for a given canonical id, so a re-run converges them
    -- rather than freezing a first-write typo beside a corrected file.
    --
    -- The `where` is the second half of the same guarantee. A conflicting row whose stored
    -- `instruction` differs from the incoming one is NOT updated and returns nothing, which is what
    -- turns a silent divergence into the refusal below.
   where entries.instruction = excluded.instruction
  returning case when entries.xmax = 0 then 'inserted' else 'updated' end into v_outcome;

  if v_outcome is null then
    -- Reachable ONLY through the `where` above. A fresh insert always returns its row, and a
    -- conflict whose instruction matches always returns its row, so no other state produces a NULL
    -- here. The name in this message is stable and is what the integration test matches on; the
    -- entry id is in the message and the two instructions deliberately are not.
    raise exception
      'dataset_entries_instruction_diverged: the stored instruction for entry % differs from the one being imported. The stored row was left untouched, and neither instruction is reproduced here. If the synthetic dataset has been revised, this needs the thesis team''s decision on whether entries validators have already seen may change at all.',
      p_id;
  end if;

  return v_outcome;
end
$fn$;

comment on function public.dataset_entries_import_v2(text, text, integer, text, text, text, text, text, jsonb, boolean) is
  'Writes one merged-dataset entry idempotently and returns ''inserted'' or ''updated'' from the engine''s own discriminator. Never modifies instruction, source_payload, or created_at, and refuses by name when a conflicting row''s stored instruction differs.';

-- ---------------------------------------------------------------------------
-- EXECUTE GRANTS
-- ---------------------------------------------------------------------------
-- The revocation is the barrier; the table's deny-all Row Level Security is the backstop.
-- `service_role` is granted explicitly because it is the only legitimate caller and it is the
-- role that holds `bypassrls`. The anon/authenticated revoke is issued here rather than in the
-- hardening file because that file is applied history: see the header.

revoke all on function public.dataset_entries_import_v2(text, text, integer, text, text, text, text, text, jsonb, boolean) from public;
grant execute on function public.dataset_entries_import_v2(text, text, integer, text, text, text, text, text, jsonb, boolean) to service_role;
revoke all on function public.dataset_entries_import_v2(text, text, integer, text, text, text, text, text, jsonb, boolean) from anon, authenticated;

-- The table's own privileges are NOT granted here, and deliberately so, for the same reason
-- `20261002120000_researcher_signin_attempts.sql` does not grant them: Supabase provisions table
-- privileges in `public` for its API roles, and this project's integration harness reproduces those
-- grants after migrations run. Re-granting them here would make the migration depend on which
-- environment applies it.
