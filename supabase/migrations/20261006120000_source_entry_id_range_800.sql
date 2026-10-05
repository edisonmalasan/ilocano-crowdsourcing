-- source_entry_id range 1..800 for the revised 4,000-entry corpus.
--
-- FORWARD MIGRATION. No applied file is modified. `20261005120000_merged_dataset_provenance.sql`
-- stays exactly as applied; this file replaces only its range CHECK's expression under the same
-- constraint name. `dataset_entries_import_v2` is untouched: its integer provenance argument
-- already accepts the new values, so no v3 function is created. No transit-mode CHECK or enum is
-- invented here — no persistent transit-mode constraint exists, and the mode vocabulary is
-- enforced at parse time.
--
-- ---------------------------------------------------------------------------
-- WHY DROP + ADD UNDER THE SAME NAME
-- ---------------------------------------------------------------------------
-- PostgreSQL has no `ALTER CONSTRAINT ... CHECK (new expression)`: the expression is replaced
-- by dropping the constraint and adding it back. Keeping the name
-- (`dataset_entries_source_entry_id_range`) keeps every violation message, every test matching
-- on that name, and every future reader pointed at one rule rather than a pile of versioned
-- ones. The nullable semantics are preserved: a value, when present, must lie in 1..800.
--
-- ---------------------------------------------------------------------------
-- PRECONDITION
-- ---------------------------------------------------------------------------
-- Everything below depends on `dataset_entries` existing with the provenance columns. If that
-- is not true the `alter table` would fail with an error naming a column but not a cause, so
-- the state is asserted here and the refusal names it. Asserted in the ARTEFACT and not only
-- in a test, because each migration file is applied inside one transaction: a `raise
-- exception` rolls back everything earlier in the SAME file, so no post-failure assertion can
-- distinguish "the check ran first" from "the write ran first".

do $precondition$
begin
  if to_regclass('public.dataset_entries') is null then
    raise exception
      'source_entry_id_range_800 precondition failed: relation "public.dataset_entries" does not exist. This migration widens that table''s source_entry_id range and must run after 20261005120000_merged_dataset_provenance.sql. Nothing was changed.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dataset_entries'
      and column_name = 'source_entry_id'
  ) then
    raise exception
      'source_entry_id_range_800 precondition failed: "public.dataset_entries" has no source_entry_id column. This migration widens that column''s range and must run after 20261005120000_merged_dataset_provenance.sql. Nothing was changed.';
  end if;
end
$precondition$;

-- Re-runnable by shape: dropping a constraint that is already gone and adding one that is
-- already correctly expressed would both fail, so each half is guarded. The guards inspect
-- the catalogue rather than assuming this file runs once, because an operator re-running a
-- half-applied file must converge rather than error.
do $range$
begin
  if exists (
    select 1 from pg_constraint where conname = 'dataset_entries_source_entry_id_range'
  ) then
    alter table public.dataset_entries
      drop constraint dataset_entries_source_entry_id_range;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dataset_entries_source_entry_id_range'
  ) then
    alter table public.dataset_entries
      add constraint dataset_entries_source_entry_id_range
      check (source_entry_id is null or (source_entry_id >= 1 and source_entry_id <= 800));
  end if;
end
$range$;
