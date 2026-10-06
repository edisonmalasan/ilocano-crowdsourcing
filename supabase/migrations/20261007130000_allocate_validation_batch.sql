-- Database-side batch allocation: select, claim, and persist in one call.
--
-- FORWARD MIGRATION. No existing table, column, policy, or function is modified. This file ADDS
-- one function. It changes nothing already stored, and it is safe to apply while real Phase 11
-- responses exist: it reads them, it never rewrites them.
--
-- ---------------------------------------------------------------------------
-- WHY THIS FUNCTION EXISTS AT ALL
-- ---------------------------------------------------------------------------
-- Allocation used to read the whole 4,800-entry pool plus the pool's responses into the
-- application (tens of PostgREST round trips), reduce completion there, shuffle, claim through
-- the reservation RPC, and persist the batch in two untransacted writes. Measured on the hosted
-- project, the read path alone is ~32 requests and ~7 seconds server-side before the claim,
-- the create, the read-back, the navigation, and the session re-read. That is excessive work
-- to obtain ten entries.
--
-- This function moves the eligibility decision to where the data already is. One call computes
-- eligible entries, claims up to the requested size, persists the batch with 1-based positions,
-- and returns only the granted placements. The ordinary allocation path drops from ~37 round
-- trips to four: validator-profile read, this call, batch read-back, granted-entry projection.
--
-- ---------------------------------------------------------------------------
-- WHY THE POOLED-COMPLETION PILLARS ARE IN SQL HERE, DESPITE THE STANDING RULE
-- ---------------------------------------------------------------------------
-- `domain/validation-response.ts` and `allocate-batch.ts` both record the rule that the
-- completion predicate must not be reimplemented in SQL, because two implementations in two
-- languages drift — and a drifted coverage count is invisible. That rule stands for every
-- SECOND predicate. This function does not add a second predicate alongside the TypeScript
-- one: it moves the single allocation-time evaluation of that predicate into the database, in
-- exactly ONE place (the three EXISTS clauses below), and the parity suite
-- `tests/integration/allocation-rpc-parity.test.ts` proves the two classify every
-- evaluation/correction/translation combination identically — single-response and pooled,
-- all 96 single-response cells plus the multi-response pillar combinations. A drift in EITHER
-- direction fails that suite: it compares the function's actual grants against the TypeScript
-- definition's answers, not against a copy of either.
--
-- The dashboard, the export pipeline, and every other completion consumer keep calling the
-- TypeScript definition. This function serves allocation only.
--
-- What the database CHECK constraints already guarantee, so neither implementation has to
-- defend it: an unknown evaluation value cannot be stored, so the explicit value lists below
-- cannot silently misclassify one — it is unrepresentable, and an attempt to store it fails
-- at the constraint, not at either predicate.
--
-- ---------------------------------------------------------------------------
-- WHY SELECTION, CLAIM, AND PERSISTENCE SHARE ONE TRANSACTION
-- ---------------------------------------------------------------------------
-- The in-force spec requires selection, batch persistence, and reservation claims to commit
-- as one atomic unit from the requester's point of view. The previous implementation split
-- them across requests (select in the application, claim through the reservation RPC, persist
-- in two untransacted writes that could leave an entry-less batch row). This function runs
-- all three in its own transaction: two simultaneous calls arbitrate on the reservation
-- primary key exactly as `claim_entry_reservations` already does, the loser backfills past
-- denied ids within its own call, and a batch row is never written without its entries.
-- The disappearance of the entry-less residue is an improvement, documented here rather than
-- silent: `findById` still raises on such a row, because rows written by the old path may
-- still exist.
--
-- ---------------------------------------------------------------------------
-- WHY THE CALLER STILL MINTS THE BATCH IDENTITY
-- ---------------------------------------------------------------------------
-- The batch id scheme (`VAL_…-<ISO instant>`) and the one-instant pairing of id and
-- `created_at` belong to the application (`defaultBatch`), and the validator/profile gating
-- (`unknown_validator`, `screening_required`) stays in the service so the exact failure
-- reasons survive. The function takes them as arguments and enforces nothing about them
-- beyond the foreign keys — a caller-supplied order or entry list is still structurally
-- impossible, because there is no parameter that could carry one.
--
-- `set search_path = ''`, SECURITY INVOKER, revoke-from-PUBLIC/anon/authenticated plus
-- grant-to-service_role: the same posture as `claim_entry_reservations`, for the same reason.
-- The revoke names all three roles explicitly rather than PUBLIC alone because Supabase default
-- privileges grant EXECUTE to `anon` and `authenticated` EXPLICITLY at creation time — measured
-- on the live project, where a PUBLIC-only revoke left both grants standing (see
-- `20261004140000_rpc_execute_hardening.sql`). The only legitimate caller is `service_role`
-- through the repository layer; `anon`/`authenticated` cannot execute this function.
--
-- Preconditions first, so applying this file to a database that cannot serve it fails with
-- the missing piece NAMED rather than with a function that deploys and then fails per call.

do $$
declare
  missing text[];
begin
  select array_agg(required.need)
    into missing
    from (
      values
        ('public.dataset_entries'),
        ('public.validators'),
        ('public.validations'),
        ('public.validation_batches'),
        ('public.batch_entries'),
        ('public.entry_reservations')
    ) as required(need)
   where to_regclass(required.need) is null;

  if missing is not null then
    raise exception 'allocate_validation_batch_v1 precondition: missing relation(s): %',
      array_to_string(missing, ', ');
  end if;

  if to_regprocedure('public.claim_entry_reservations(text, text[], integer)') is null then
    raise exception 'allocate_validation_batch_v1 precondition: '
      'public.claim_entry_reservations(text, text[], integer) is not installed; '
      'apply the entry_reservations migration first';
  end if;
end
$$;

create function public.allocate_validation_batch_v1(
  p_validator_id text,
  p_batch_id     text,
  p_batch_size   integer,
  p_ttl_seconds  integer,
  p_created_at   timestamptz
)
returns table (entry_id text, entry_position integer)
language plpgsql
volatile
set search_path = ''
as $fn$
declare
  -- Floor only. The ceiling is the service's `resolveBatchSize`: the only caller caps the
  -- request there, and a second ceiling here would be a second number to keep in agreement.
  v_size integer := greatest(p_batch_size, 1);
  v_ttl  integer := greatest(p_ttl_seconds, 1);
  -- Every candidate id this call has already considered, granted or denied. Later rounds
  -- select past this set, so a round never re-asks a question Postgres just answered.
  v_seen    text[] := '{}';
  v_granted text[] := '{}';
  v_picked  text[];
  v_won     text[];
  v_round   integer;
begin
  -- Bounded backfill INSIDE the call: each round either grows the grant or ends the loop, so
  -- contending allocators cannot livelock each other and persistent contention collapses to a
  -- short grant rather than to unbounded retries.
  for v_round in 1..3 loop
    exit when cardinality(v_granted) >= v_size;

    -- The candidate set, in one statement. Eligibility is the conjunction of:
    --   active entry, pooled-incomplete (three pillars below), unanswered by this attempt,
    --   unassigned to this attempt's batches, not actively reserved by another attempt,
    --   unseen earlier in this call. Randomized here; the service draws no randomness at all
    --   on this path, and `ORDER BY random()` over 4,800 rows is single-digit milliseconds.
    select coalesce(array_agg(picked.id), '{}')
      into v_picked
      from (
        select e.id
          from public.dataset_entries as e
         where e.is_active
           -- POOLED COMPLETION, the single SQL place it lives. An entry is complete when its
           -- stored responses collectively hold a valid judgment, a covering English
           -- translation, and a covering Filipino translation — the three pillars possibly
           -- coming from different responses. Each pillar is an EXISTS over the entry's rows:
           --
           --   judgment: an evaluable evaluation whose required correction is actually present.
           --     `correct_natural` needs no correction; `correct_unnatural`/`incorrect` need a
           --     non-blank one (`btrim`, matching the TypeScript `isPresent` exactly, including
           --     for hypothetical blanks the normalizer would never store).
           --   english/filipino: an evaluable evaluation carrying that translation, non-blank.
           --     `cannot_evaluate` carries neither by schema, and the eligibility gate gives
           --     impossible rows the methodology's answer (nothing covered) rather than a
           --     presence check's accident.
           and not (
                 exists (select 1
                           from public.validations as v
                          where v.dataset_entry_id = e.id
                            and v.evaluation in ('correct_natural', 'correct_unnatural', 'incorrect')
                            and (v.evaluation = 'correct_natural'
                                 or btrim(coalesce(v.corrected_instruction, '')) <> ''))
             and exists (select 1
                           from public.validations as v
                          where v.dataset_entry_id = e.id
                            and v.evaluation in ('correct_natural', 'correct_unnatural', 'incorrect')
                            and btrim(coalesce(v.english_translation, '')) <> '')
             and exists (select 1
                           from public.validations as v
                          where v.dataset_entry_id = e.id
                            and v.evaluation in ('correct_natural', 'correct_unnatural', 'incorrect')
                            and btrim(coalesce(v.filipino_translation, '')) <> '')
             )
           -- One attempt never answers one entry twice.
           and not exists (select 1
                             from public.validations as v
                            where v.dataset_entry_id = e.id
                              and v.validator_id = p_validator_id)
           -- Assigned-but-unanswered remainders of this attempt's own batches are not re-offered.
           -- Another attempt's batches exclude nothing by themselves (no predicate on them here
           -- beyond their reservations below): overlap without a reservation is expected
           -- collection, never prevented.
           and not exists (select 1
                             from public.batch_entries as be
                             join public.validation_batches as b on b.id = be.batch_id
                            where be.dataset_entry_id = e.id
                              and b.validator_id = p_validator_id)
           -- Another attempt's unexpired reservation excludes; anyone's expired row and our own
           -- rows do not (the claim re-grants our own, idempotent retry).
           and not exists (select 1
                             from public.entry_reservations as r
                            where r.entry_id = e.id
                              and r.validator_id <> p_validator_id
                              and r.expires_at > now())
           and not (e.id = any (v_seen))
         order by random()
         limit (v_size - cardinality(v_granted))
      ) as picked;

    exit when cardinality(v_picked) = 0;

    -- Claim through the EXISTING reservation function, not a copy of it: the PK-arbitration
    -- semantics (simultaneous claims serialize; expired rows reclaimed; own rows re-granted)
    -- stay in the one place that already owns them.
    select coalesce(array_agg(won.entry_id), '{}')
      into v_won
      from public.claim_entry_reservations(p_validator_id, v_picked, v_ttl) as won;

    v_seen := v_seen || v_picked;
    v_granted := v_granted || v_won;

    -- A round that grants nothing new ends the loop even below the cap: the next round would
    -- select past the same denied set, which is a slower way of learning nothing.
    exit when cardinality(v_won) = 0;
  end loop;

  -- Honest exhaustion, never an empty batch: no batch row, no entry rows, no reservations
  -- beyond what contention already holds. The service reports `exhausted` on the empty set.
  if cardinality(v_granted) = 0 then
    return;
  end if;

  insert into public.validation_batches as b (id, validator_id, created_at)
  values (p_batch_id, p_validator_id, p_created_at);

  -- 1-based positions derived HERE from the granted order. No caller supplies them: there is
  -- no parameter that could carry them. `with ordinality` numbers rows in array order, so the
  -- stored order is the granted order.
  insert into public.batch_entries as be (batch_id, dataset_entry_id, position)
  select p_batch_id, g.id, g.ord
    from unnest(v_granted) with ordinality as g(id, ord);

  -- Return what was STORED, in stored order — the same read-back guarantee the repository
  -- layer keeps, applied at the source rather than re-read over the wire.
  return query
    select be.dataset_entry_id as entry_id, be.position as entry_position
      from public.batch_entries as be
     where be.batch_id = p_batch_id
     order by be.position;
end;
$fn$;

comment on function public.allocate_validation_batch_v1(text, text, integer, integer, timestamptz) is
  'Allocates a coverage-aware batch in one transaction: pooled-incomplete selection with attempt and reservation exclusions, randomized claim with bounded backfill, atomic batch persistence, granted placements returned. Service_role only.';

revoke all on function public.allocate_validation_batch_v1(text, text, integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.allocate_validation_batch_v1(text, text, integer, integer, timestamptz) to service_role;
