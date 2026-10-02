-- ---------------------------------------------------------------------------
-- dataset_entries_import guard
-- ---------------------------------------------------------------------------
-- Asserts, LOUDLY, the three pieces of state `dataset_entries_import` depends on:
-- the table exists, it carries every column the function reads or writes, and its
-- primary key is exactly `(id)`, which is the `ON CONFLICT` arbiter. It also asserts
-- the function itself is present with the deployed signature, so a later change that
-- drops or replaces the function cannot pass this file silently.
--
-- WHY A SECOND FILE RATHER THAN A REPAIR OF THE FIRST
-- ---------------------------------------------------
-- `20261003120000_dataset_entries_import.sql` carries a precondition block whose second
-- and third arms CANNOT FIRE in the states they name, and that file is already applied
-- to the hosted project. An applied migration is history: editing it would change the
-- record of what ran without changing what ran, and this repository does not rewrite
-- migration history to make a deploy easier — or a review tidier. So the correction is
-- forward-only, in this file, and the defects in the old file are named here rather
-- than silently fixed there:
--
--   1. The old column arm is `not exists (select 1 ... where column_name in (nine
--      columns))`. `EXISTS` over an `IN` list is true when AT LEAST ONE matches, so
--      `not exists` is true only when ZERO match — the table holding none of its own
--      columns, a state the relation arm above it has already excluded. A table
--      missing exactly one column applies cleanly, installs the function, and fails
--      at CALL time. Measured: dropping `source_payload` left the old file green and
--      produced `column "source_payload" of relation "dataset_entries" does not
--      exist` on first call.
--   2. The old primary-key arm asks `contype = 'p'` — "is there ANY primary key?" —
--      not "is the primary key on `id`?". A table keyed on `category` passes and then
--      fails at call time with `there is no unique or exclusion constraint matching
--      the ON CONFLICT specification`. Measured the same way.
--   3. The old comment says the failure would occur "at CREATE time". It would not:
--      `plpgsql` parses the body at `CREATE FUNCTION` and resolves it at first
--      execution, so the function is CREATED in every one of those states. The
--      comment describes a mechanism that does not exist.
--
-- WHAT THIS FILE DOES DIFFERENTLY, ARM BY ARM
-- -------------------------------------------
--   - Columns are checked by SET DIFFERENCE against the expected nine, and the
--     refusal NAMES every missing column. A refusal that says "a column is missing"
--     without saying which one sends the operator to go and find out; the name is
--     the whole value of failing fast.
--   - The primary key is checked by COLUMN SET, not by existence: the ordered key
--     column list must equal exactly `id`. Existence was the old defect; naming the
--     actual key columns in the refusal is what lets a reader see the mismatch
--     without querying the catalog.
--   - The function is checked by `to_regprocedure` with the full deployed signature,
--     because "the table is right" and "the function is deployed" are different
--     facts and this file is the last one that can check both together.
--
-- This file creates NOTHING. It is a `DO` block only, so applying it to a correct
-- project is a no-op that returns, and applying it to a broken one stops the deploy
-- with a named cause instead of installing a function that fails unnamed at call time.

do $dataset_entries_import_guard$
declare
  missing_columns text;
  pk_columns text;
begin
  if to_regclass('public.dataset_entries') is null then
    raise exception
      'dataset_entries_import guard failed: relation "public.dataset_entries" does not exist. This guard runs after 20261003120000_dataset_entries_import.sql and the research schema it builds on. Nothing was created.';
  end if;

  select string_agg(expected.col, ', ' order by expected.col)
    into missing_columns
    from (values
      ('id'), ('category'), ('instruction'), ('origin'), ('destination'),
      ('transit_mode'), ('source_payload'), ('is_active'), ('created_at')
    ) as expected(col)
   where not exists (
     select 1
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'dataset_entries'
        and column_name = expected.col
   );
  if missing_columns is not null then
    raise exception
      'dataset_entries_import guard failed: "public.dataset_entries" is missing column(s): %. The import function reads and writes those columns, and this guard adds no table change, so a missing column here means the wrong schema was deployed. Nothing was created.',
      missing_columns;
  end if;

  select string_agg(a.attname, ', ' order by a.attnum)
    into pk_columns
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = any (c.conkey)
   where c.conrelid = 'public.dataset_entries'::regclass
     and c.contype = 'p';
  if pk_columns is null then
    raise exception
      'dataset_entries_import guard failed: "public.dataset_entries" has no primary key, so `on conflict (id)` has no arbiter index. Nothing was created.';
  elsif pk_columns <> 'id' then
    raise exception
      'dataset_entries_import guard failed: "public.dataset_entries" has its primary key on (%) but the import conflicts on (id), so `on conflict (id)` has no matching arbiter. Nothing was created.',
      pk_columns;
  end if;

  if to_regprocedure('public.dataset_entries_import(text, text, text, text, text, text, jsonb, boolean)') is null then
    raise exception
      'dataset_entries_import guard failed: function public.dataset_entries_import(text, text, text, text, text, text, jsonb, boolean) does not exist. This guard runs after the migration that creates it, so an absent function here means the wrong migration set was deployed. Nothing was created.';
  end if;
end
$dataset_entries_import_guard$;
