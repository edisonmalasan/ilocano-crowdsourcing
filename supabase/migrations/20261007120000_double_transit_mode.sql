-- Double Transit Mode pair storage and versioned import function.
--
-- FORWARD MIGRATION. No applied file is modified and no archived specification is rewritten.
-- `20261005120000_merged_dataset_provenance.sql` stays deployed with
-- `dataset_entries_import_v2`, and `20261006120000_source_entry_id_range_800.sql` keeps the
-- 1..800 range CHECK under its existing name. This file ADDs one nullable column, three
-- CHECK constraints, and one new function. It changes no existing table constraint, no existing
-- column, no existing policy, and no existing function. The `source_entry_id` range is NOT
-- re-migrated here: 1..800 already admits every Double Transit Mode suffix.
--
-- ---------------------------------------------------------------------------
-- WHY A NULLABLE ARRAY COLUMN BESIDE THE SCALAR, RATHER THAN A REPLACEMENT
-- ---------------------------------------------------------------------------
-- This migration must apply over a table that already holds rows: the 4,000 scalar/null
-- pre-study rows on hosted, and every integration seed that inserts without the new column.
-- A `NOT NULL` without a backfill would fail the deploy it is meant to enable, and a backfill
-- would invent transit modes for rows whose source is being replaced anyway. Nullable with
-- CHECKs is the honest shape: a value, when present, must be exactly two ordered distinct
-- modes from the approved vocabulary, and a scalar category must carry none.
--
-- The scalar `transit_mode` column is kept, not replaced, for the same reason v1/v2 functions
-- are kept: 4,000 existing rows and every archived test read it. Forcing the pair into the
-- scalar as `"jeepney,walking"` would be lossy and ambiguous; hiding JSON text in a scalar
-- would be unqueryable. The pair lives in `transit_modes`; the scalar stays null for DTM.
--
-- ---------------------------------------------------------------------------
-- WHY A VERSIONED FUNCTION RATHER THAN A REPLACEMENT
-- ---------------------------------------------------------------------------
-- `dataset_entries_import_v2` is referenced by name and arity in the sink, in
-- `tests/integration/dataset-entries-import.test.ts`, and in the provenance migration's own
-- grants. Replacing it in place would change what those artefacts describe without changing
-- what ran on hosted. `dataset_entries_import_v3` carries one extra argument
-- (`p_transit_modes text[]`) with the same security posture (invoker, empty search path),
-- the same immutability philosophy (instruction, source payload, and creation timestamp are
-- absent from the update list), and the same divergence refusal. The sink defaults to v3;
-- v1 and v2 stay as history.
--
-- ---------------------------------------------------------------------------
-- WHY THE ANON/AUTHENTICATED REVOKE LIVES HERE AND NOT IN THE HARDENING FILE
-- ---------------------------------------------------------------------------
-- `20261004140000_rpc_execute_hardening.sql` is applied history and names exactly the five
-- functions that existed when it ran; its integration test fails when that set disagrees in
-- either direction. This function did not exist when it ran, so its revoke is issued here,
-- beside the grant — the same lines every privileged function migration carries — rather
-- than by editing history.
--
-- ---------------------------------------------------------------------------
-- PRECONDITION
-- ---------------------------------------------------------------------------
-- Everything below depends on `dataset_entries` existing with `id` as its conflict target and
-- with the scalar `transit_mode` column present. If that is not true the `on conflict (id)`
-- clause would fail at CREATE time with an error that names a column but not a cause, so the
-- state is asserted here and the refusal names it. Asserted in the ARTEFACT and not only in
-- a test, because each migration file is applied inside one transaction: a `raise exception`
-- rolls back everything earlier in the SAME file, so no post-failure assertion can
-- distinguish "the check ran first" from "the write ran first". An ordering that matters
-- has to be enforced by the file.

do $precondition$
begin
  if to_regclass('public.dataset_entries') is null then
    raise exception
      'double_transit_mode precondition failed: relation "public.dataset_entries" does not exist. This migration adds the transit_modes column and a versioned import function over that table and must run after 20261005120000_merged_dataset_provenance.sql. Nothing was created.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.dataset_entries'::regclass
      and contype = 'p'
  ) then
    raise exception
      'double_transit_mode precondition failed: "public.dataset_entries" has no primary key, so `on conflict (id)` has no arbiter index. Nothing was created.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dataset_entries'
      and column_name = 'transit_mode'
  ) then
    raise exception
      'double_transit_mode precondition failed: "public.dataset_entries" has no transit_mode column. This migration adds transit_modes beside it and must run after the research schema. Nothing was created.';
  end if;
end
$precondition$;

-- ---------------------------------------------------------------------------
-- Pair column
-- ---------------------------------------------------------------------------
-- `transit_modes` is the Double Transit Mode pair: exactly two ordered modes for DTM rows,
-- NULL for every other category. `if not exists` on the column, so a re-applied file (or a
-- partially applied one re-run by an operator) does not fail on its own column. The CHECKs
-- are added as table constraints with explicit names, so a violation names the rule rather
-- than a generated identifier.

alter table public.dataset_entries
  add column if not exists transit_modes text[];

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dataset_entries_transit_modes_pair_shape'
  ) then
    alter table public.dataset_entries
      add constraint dataset_entries_transit_modes_pair_shape
      check (
        transit_modes is null
        or (
          array_length(transit_modes, 1) = 2
          and transit_modes[1] in ('walking', 'jeepney', 'taxi', 'private_vehicle')
          and transit_modes[2] in ('walking', 'jeepney', 'taxi', 'private_vehicle')
          and transit_modes[1] <> transit_modes[2]
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dataset_entries_transit_modes_scalar_absent'
  ) then
    alter table public.dataset_entries
      add constraint dataset_entries_transit_modes_scalar_absent
      check (
        transit_modes is null
        or category in (
          'double_transit_mode'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dataset_entries_transit_mode_pair_absent'
  ) then
    alter table public.dataset_entries
      add constraint dataset_entries_transit_mode_pair_absent
      check (
        transit_mode is null
        or category <> 'double_transit_mode'
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dataset_entries_transit_modes_pair_required'
  ) then
    alter table public.dataset_entries
      add constraint dataset_entries_transit_modes_pair_required
      check (
        category <> 'double_transit_mode'
        or transit_modes is not null
      );
  end if;
end
$constraints$;

-- ---------------------------------------------------------------------------
-- dataset_entries_import_v3
-- ---------------------------------------------------------------------------
-- Writes one entry, pair-capable, and reports whether it created the row or matched one.
--
-- One statement, so the row and the outcome cannot disagree: there is no read before the
-- write whose answer could be stale by the time the write lands.
--
-- `set search_path = ''` means nothing is resolved through a writable schema: every name in
-- the body is either fully qualified or lives in `pg_catalog`, which Postgres searches ahead
-- of the search path in any case.
--
-- `xmax` is Postgres' own discriminator between the two paths of an `ON CONFLICT`: it is 0
-- for a row this statement INSERTED and non-zero for a row it UPDATED. Reading it here is
-- what lets the report be exact without a prior `select`, and it is the engine's answer
-- rather than an inference from a round trip that could race.

-- `or replace`, so an operator re-running a half-applied file converges rather than
-- erroring on its own function. The signature is unchanged by a re-run, so replacing it with
-- an identical body is a no-op rather than a rewrite.

create or replace function public.dataset_entries_import_v3(
  p_id              text,
  p_category        text,
  p_source_entry_id integer,
  p_category_name   text,
  p_instruction     text,
  p_origin          text,
  p_destination     text,
  p_transit_mode    text,
  p_transit_modes   text[],
  p_source_payload  jsonb,
  p_is_active       boolean
)
returns text
language plpgsql
volatile
-- STATED EXPLICITLY RATHER THAN RELIED ON AS THE DEFAULT. `security invoker` is PostgreSQL's
-- default for a `create function`, so this clause changes no behaviour — and it is written out
-- anyway because a definer function would let `anon` write arbitrary rows into the table every
-- validator's batch is drawn from. The integration test reads `pg_proc.prosecdef` for this
-- function and fails if it ever becomes true.
security invoker
set search_path = ''
as $fn$
declare
  v_outcome text;
begin
  insert into public.dataset_entries as entries
         (id, category, source_entry_id, category_name, instruction, origin, destination,
          transit_mode, transit_modes, source_payload, is_active)
  values (p_id, p_category, p_source_entry_id, p_category_name, p_instruction, p_origin,
          p_destination, p_transit_mode, p_transit_modes, p_source_payload,
          coalesce(p_is_active, true))
  on conflict (id) do update
     set category        = excluded.category,
         source_entry_id = excluded.source_entry_id,
         category_name   = excluded.category_name,
         origin          = excluded.origin,
         destination     = excluded.destination,
         transit_mode    = excluded.transit_mode,
         transit_modes   = excluded.transit_modes,
         is_active       = excluded.is_active
    -- `instruction`, `source_payload`, and `created_at` are DELIBERATELY ABSENT from the list
    -- above, and this is the whole reason this function exists. Their absence is the guarantee:
    -- there is no argument this function accepts, and no caller that can reach it, that changes
    -- them. `source_entry_id` and `category_name` ARE in the list: they are provenance the
    -- importer always supplies identically for a given canonical id, so a re-run converges them
    -- rather than freezing a first-write typo beside a corrected file.
    --
    -- The `where` is the second half of the same guarantee. A conflicting row whose stored
    -- `instruction` differs from the incoming one is NOT updated and returns nothing, which is
    -- what turns a silent divergence into the refusal below.
   where entries.instruction = excluded.instruction
  returning case when entries.xmax = 0 then 'inserted' else 'updated' end into v_outcome;

  if v_outcome is null then
    -- Reachable ONLY through the `where` above. A fresh insert always returns its row, and a
    -- conflict whose instruction matches always returns its row, so no other state produces a
    -- NULL here. The name in this message is stable and is what the integration test matches
    -- on; the entry id is in the message and the two instructions deliberately are not.
    raise exception
      'dataset_entries_instruction_diverged: the stored instruction for entry % differs from the one being imported. The stored row was left untouched, and neither instruction is reproduced here. If the synthetic dataset has been revised, this needs the thesis team''s decision on whether entries validators have already seen may change at all.',
      p_id;
  end if;

  return v_outcome;
end
$fn$;

comment on function public.dataset_entries_import_v3(text, text, integer, text, text, text, text, text, text[], jsonb, boolean) is
  'Writes one dataset entry idempotently, pair-capable, and returns ''inserted'' or ''updated'' from the engine''s own discriminator. Never modifies instruction, source_payload, or created_at, and refuses by name when a conflicting row''s stored instruction differs.';

-- ---------------------------------------------------------------------------
-- EXECUTE GRANTS
-- ---------------------------------------------------------------------------
-- The revocation is the barrier; the table's deny-all Row Level Security is the backstop.
-- `service_role` is granted explicitly because it is the only legitimate caller and it is
-- the role that holds `bypassrls`. The anon/authenticated revoke is issued here rather than
-- in the hardening file because that file is applied history: see the header.

revoke all on function public.dataset_entries_import_v3(text, text, integer, text, text, text, text, text, text[], jsonb, boolean) from public;
grant execute on function public.dataset_entries_import_v3(text, text, integer, text, text, text, text, text, text[], jsonb, boolean) to service_role;
revoke all on function public.dataset_entries_import_v3(text, text, integer, text, text, text, text, text, text[], jsonb, boolean) from anon, authenticated;

-- The table's own privileges are NOT granted here, and deliberately so, for the same reason
-- `20261002120000_researcher_signin_attempts.sql` does not grant them: Supabase provisions
-- table privileges in `public` for its API roles, and this project's integration harness
-- reproduces those grants after migrations run. Re-granting them here would make the
-- migration depend on which environment applies it.
