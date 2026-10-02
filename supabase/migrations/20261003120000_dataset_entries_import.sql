-- The dataset-entry import function: one atomic, instruction-preserving upsert.
--
-- FORWARD MIGRATION. `20260930120000_research_schema.sql` is not modified, and no archived
-- specification is rewritten. This file ADDs one function. It changes no existing table, no existing
-- column, no existing policy, and no existing function.
--
-- ---------------------------------------------------------------------------
-- WHY THE UPSERT LIVES IN A FUNCTION AND NOT IN APPLICATION CODE
-- ---------------------------------------------------------------------------
-- The importer in `src/lib/dataset/import-dataset.ts` is already proven: all 600 records, through
-- the real migrations, into a real PostgreSQL engine. What it had no production caller for was the
-- WRITE, because `DatasetEntriesRepository` is deliberately a read interface — "There is no write
-- method on purpose... imported entries are written by the importer's own upsert path, which is a
-- different concern and is not allowed to be reachable from a request path."
--
-- That upsert path could have been assembled in TypeScript. It cannot be, for two independent
-- reasons, and both are properties of the repository's own narrow client interface rather than
-- preferences.
--
-- First, there is no way to ASK for this statement through PostgREST as a table operation. The narrow
-- `TableHandleLike` has no `upsert` — deliberately, so `ValidatorsRepository.create` cannot quietly
-- overwrite a duplicate id — and its `insert` takes no options object, so `onConflict` and
-- `ignoreDuplicates` are unreachable from the repository surface. PostgREST's own `upsert` would
-- REPLACE the named columns, which for this table means replacing `instruction`: exactly the write
-- this project must never perform. An application-side idempotent write is therefore reduced to
-- "insert, and on a unique violation fall back to update", which costs a second round trip on every
-- re-run and, far worse, makes the immutability guarantee a property of the CALLER'S DISCIPLINE.
--
-- Second, and decisively: a guarantee enforced only by the discipline of one code path is not a
-- guarantee. This repository has found that defect repeatedly — a `setInterval` that can never fire,
-- an ESLint boundary rule inert on Windows for a component that omits its own `"use client"`, a
-- regression guard that was satisfied by a comment, and a `clientOrder` parameter that no behavioural
-- test could pin because the test could not see a key that did not exist yet. The generalisation is
-- that enforcement belongs at the layer that can SEE the thing being enforced.
--
-- Here the layer that can see the write is the statement itself. `instruction` is not in this
-- function's update list, so there is no version of this function, and no caller of it, that can
-- rewrite a stored instruction. That is a stronger claim than "the code does not", and it is the
-- claim the research data needs.
--
-- It follows the precedent set by `20261002120000_researcher_signin_attempts.sql`, which put an
-- atomic counter in a function for the same underlying reason: PostgREST cannot express
-- `INSERT ... ON CONFLICT DO UPDATE` with a computed SET expression, so the only way to have the
-- DATABASE perform the statement is to let the database own it.
--
-- SECURITY INVOKER, NOT SECURITY DEFINER, and this is the load-bearing property.
-- ---------------------------------------------------------------------------
-- A `security definer` function runs as its owner, which on a hosted project is `postgres`. That
-- role bypasses Row Level Security, so an `anon` caller could invoke the import and write arbitrary
-- rows into `dataset_entries` — the one table whose contents every validator's batch is drawn from.
-- That would turn the immutability guarantee into a write amplifier pointed at the research dataset.
-- Invoker semantics mean an `anon` call runs as `anon`, which has no policy on this table and is
-- refused by the same deny-all posture every research table already has.
--
-- `service_role` holds `bypassrls`, so the operator command reaches the row. That is the only caller.
--
-- EXECUTE IS REVOKED FROM PUBLIC, so the revoke is the barrier and the RLS policy is the backstop.
-- Postgres grants EXECUTE on a new function to `PUBLIC` by default, which would leave the function
-- callable by `anon` even with invoker semantics — refused, but by a policy rather than by a
-- privilege, and one migration's slip away from being callable at all.
--
-- ---------------------------------------------------------------------------
-- WHY `source_payload` IS ALSO IMMUTABLE, WHICH IS NOT THE OBVIOUS ANSWER
-- ---------------------------------------------------------------------------
-- `source_payload` is the archival copy of the source record, and the migration that created
-- `dataset_entries` says it exists precisely so that "an unmodelled field survives here rather than
-- being dropped". It CONTAINS the instruction.
--
-- So the tempting move is to treat it as a mutable projection and update it like `origin`. That would
-- be wrong, and wrong in a way that only shows up months later: if `instruction` is immutable while
-- `source_payload` is not, then a re-run against an edited source file leaves the row holding TWO
-- DIFFERENT INSTRUCTIONS IN TWO COLUMNS — the one validators were shown, and the one sitting in the
-- archival copy beside it. Nothing errors. Nothing looks wrong. The dataset is simply internally
-- inconsistent, and the inconsistency is between the text a person read and the text the database
-- recorded as the truth about that text.
--
-- Keeping both immutable keeps them consistent by construction rather than by a rule somebody has to
-- remember. `created_at` is immutable for the ordinary reason: when an entry entered the study does
-- not change because the file was touched again.
--
-- ---------------------------------------------------------------------------
-- WHY A DIVERGING INSTRUCTION IS REFUSED RATHER THAN SILENTLY KEPT
-- ---------------------------------------------------------------------------
-- The conflict update is guarded by `where entries.instruction = excluded.instruction`, so a re-run
-- whose instruction DIFFERS from the stored one updates nothing and returns no row. The function then
-- raises, naming the entry.
--
-- The alternative — keep the old instruction, report success, and let the operator notice the
-- divergence later — is worse than useless on a research import. A green run that silently means "600
-- parsed, 600 updated, and 12 of those are not the file you just gave me" is a false report, and the
-- person who most needs to know is the one who will read the report and stop looking.
--
-- What a difference MEANS is a research question and is deliberately not answered here: whether a
-- revised synthetic dataset should revise entries validators have already seen is the thesis team's
-- decision, not a migration's. Refusing is the safe behaviour while that question is open, and
-- refusing loudly is what makes the question visible instead of leaving it to be discovered in a
-- dataset.
--
-- The exception names the ENTRY ID and nothing else. Not either instruction text. Error messages end
-- up in logs, and Ilocano research text belongs in the dataset, not in a log line.

-- ---------------------------------------------------------------------------
-- PRECONDITION
-- ---------------------------------------------------------------------------
-- Everything below depends on `dataset_entries` existing with `id` as its conflict target and with
-- `instruction`, `source_payload`, and `created_at` present as named columns. If any of that is not
-- true the `on conflict (id)` clause and the update list would fail at CREATE time with an error that
-- names a column but not a cause, so the state is asserted here and the refusal names it.
--
-- This is asserted in the ARTEFACT and not only in a test, because of a property of the harness this
-- project uses: each migration file is applied inside one transaction, so a `raise exception` rolls
-- back everything that ran earlier in the SAME file, and no post-failure assertion can distinguish
-- "the check ran first" from "the write ran first". An ordering that matters has to be enforced by
-- the file.

do $precondition$
begin
  if to_regclass('public.dataset_entries') is null then
    raise exception
      'dataset_entries_import precondition failed: relation "public.dataset_entries" does not exist. This migration adds a function over that table and must run after 20260930120000_research_schema.sql. Nothing was created.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'dataset_entries'
      and column_name in ('id', 'category', 'instruction', 'origin', 'destination',
                           'transit_mode', 'source_payload', 'is_active', 'created_at')
  ) then
    raise exception
      'dataset_entries_import precondition failed: "public.dataset_entries" does not have all of id, category, instruction, origin, destination, transit_mode, source_payload, is_active, created_at. This migration ADDs a function and does not change the table, so a missing column here means the wrong schema was deployed. Nothing was created.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.dataset_entries'::regclass
      and contype = 'p'
  ) then
    raise exception
      'dataset_entries_import precondition failed: "public.dataset_entries" has no primary key, so `on conflict (id)` has no arbiter index. Nothing was created.';
  end if;
end
$precondition$;

-- ---------------------------------------------------------------------------
-- dataset_entries_import
-- ---------------------------------------------------------------------------
-- Writes one entry and reports whether it created the row or matched an existing one.
--
-- One statement, so the row and the outcome cannot disagree: there is no read before the write whose
-- answer could be stale by the time the write lands.
--
-- `set search_path = ''` means nothing is resolved through a writable schema: every name in the body
-- is either fully qualified or lives in `pg_catalog`, which Postgres searches ahead of the search
-- path in any case.
--
-- `xmax` is Postgres' own discriminator between the two paths of an `ON CONFLICT`: it is 0 for a row
-- this statement INSERTED and non-zero for a row it UPDATED. Reading it here is what lets the report
-- be exact without a prior `select`, and it is the engine's answer rather than an inference from a
-- round trip that could race.

create function public.dataset_entries_import(
  p_id              text,
  p_category        text,
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
-- anyway because the header's central claim ("a definer function would let `anon` write arbitrary
-- rows") is a claim about THIS clause. A reader who has to infer it from a default cannot check it,
-- and a migration that is one edit away from `security definer` would then be one edit away from a
-- write amplifier aimed at the research dataset. `tests/integration/dataset-entries-import.test.ts`
-- reads `pg_proc.prosecdef` and fails if this ever becomes true.
security invoker
set search_path = ''
as $fn$
declare
  v_outcome text;
begin
  insert into public.dataset_entries as entries
         (id, category, instruction, origin, destination, transit_mode, source_payload, is_active)
  values (p_id, p_category, p_instruction, p_origin, p_destination, p_transit_mode,
          p_source_payload, coalesce(p_is_active, true))
  on conflict (id) do update
     set category     = excluded.category,
         origin       = excluded.origin,
         destination  = excluded.destination,
         transit_mode = excluded.transit_mode,
         is_active    = excluded.is_active
    -- `instruction`, `source_payload`, and `created_at` are DELIBERATELY ABSENT from the list above,
    -- and this is the whole reason this function exists. Their absence is the guarantee: there is no
    -- argument this function accepts, and no caller that can reach it, that changes them.
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

comment on function public.dataset_entries_import(text, text, text, text, text, text, jsonb, boolean) is
  'Writes one dataset entry idempotently and returns ''inserted'' or ''updated'' from the engine''s own discriminator. Never modifies instruction, source_payload, or created_at, and refuses by name when a conflicting row''s stored instruction differs.';

-- ---------------------------------------------------------------------------
-- EXECUTE GRANTS
-- ---------------------------------------------------------------------------
-- See the header. The revocation is the barrier; the table's deny-all Row Level Security is the
-- backstop. `service_role` is granted explicitly because it is the only legitimate caller and it is
-- the role that holds `bypassrls`.

revoke all on function public.dataset_entries_import(text, text, text, text, text, text, jsonb, boolean) from public;
grant execute on function public.dataset_entries_import(text, text, text, text, text, text, jsonb, boolean) to service_role;

-- The table's own privileges are NOT granted here, and deliberately so, for the same reason
-- `20261002120000_researcher_signin_attempts.sql` does not grant them: Supabase provisions table
-- privileges in `public` for its API roles, and this project's integration harness reproduces those
-- grants after migrations run. Re-granting them here would make the migration depend on which
-- environment applies it.
