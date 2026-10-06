-- Single-round-trip validation response persistence: resolve, verify, insert, release.
--
-- FORWARD MIGRATION. No existing table, column, policy, or function is modified. This file ADDS
-- one function. It changes nothing already stored, and it is safe to apply while real Phase 11
-- responses exist: it inserts new rows under the existing constraints, it never rewrites them.
--
-- ---------------------------------------------------------------------------
-- WHY THIS FUNCTION EXISTS AT ALL
-- ---------------------------------------------------------------------------
-- One background response save used to cost three PostgREST round trips from the application:
-- read the batch, insert the validation, release the reservation — plus strict parsing and
-- membership checks in TypeScript. The ordinary path therefore serialized three network hops
-- per entry, and five rapid submissions queued five times that chain.
--
-- This function collapses the persistence half to ONE call: it resolves the stored batch,
-- derives the validator from that batch, verifies the entry belongs to it, inserts exactly one
-- validation response, and releases that entry's reservation after the insert. Strict input
-- parsing and server-minted identity stay in the application (`runSubmitResponse`); the
-- database owns only what the database can decide atomically.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENCY, AND WHY ON CONFLICT IS THE MECHANISM
-- ---------------------------------------------------------------------------
-- A retry after a response was stored but its acknowledgement was lost must resolve as
-- already_recorded rather than creating a second response. `UNIQUE (validator_id,
-- dataset_entry_id)` is the guarantee; `ON CONFLICT DO NOTHING` is how the function reads it
-- without racing it. A pre-check SELECT followed by an INSERT could interleave with a second
-- submit of the same pair and double-store; the conflict clause cannot, because the index
-- arbitrates. On conflict the function reads back the stored row's id and reports
-- `already_recorded` — the retry learns the response IS stored, which is the safe direction.
--
-- The no-row-found corner is stated rather than hidden: a bare `ON CONFLICT DO NOTHING` also
-- swallows a primary-key collision on the server-minted response id, in which case no row
-- exists for this validator+entry pair and the follow-up SELECT finds nothing. Response ids
-- are CSPRNG-minted, so that collision is a server bug, and the function raises rather than
-- reporting a confirmation it does not have.
--
-- ---------------------------------------------------------------------------
-- RESERVATION RELEASE IS BEST-EFFORT, AND THE ORDER IS LOAD-BEARING
-- ---------------------------------------------------------------------------
-- The release runs AFTER the insert, never before it: releasing first would open a window
-- where the entry is neither reserved nor answered, claimable mid-submit. A release failure
-- is caught and reported in `reservation_released` but NEVER fails the recorded response —
-- a stuck row decays by TTL, while a recorded submit reported as failed would tell a
-- validator that banked work was lost. The release reuses `release_entry_reservation`, so the
-- holder-scoping (one attempt can only release its own claim) is not reimplemented here.
--
-- ---------------------------------------------------------------------------
-- WHAT THE FUNCTION DOES NOT DECIDE
-- ---------------------------------------------------------------------------
-- Payload validity (evaluation vocabulary, correction requirements, translation choice) is
-- enforced twice: by the application's zod schemas before the call, and by the table CHECK
-- constraints on the insert itself. This function adds no third predicate — an invalid row
-- fails at the constraint with a 23514, which the repository reports as a persistence failure
-- rather than as a confirmation. Timestamps and the response id arrive as arguments, minted
-- by the server before the call; the browser never supplies them.
--
-- `set search_path = ''`, SECURITY INVOKER, revoke-from-PUBLIC/anon/authenticated plus
-- grant-to-service_role: the same posture as `allocate_validation_batch_v1` and
-- `claim_entry_reservations`, for the same reason. Supabase default privileges grant EXECUTE
-- to `anon` and `authenticated` EXPLICITLY at creation time, so the revoke names all three
-- roles rather than PUBLIC alone. The only legitimate caller is `service_role` through the
-- repository layer; `anon`/`authenticated` cannot execute this function.
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
        ('public.validation_batches'),
        ('public.batch_entries'),
        ('public.validations'),
        ('public.entry_reservations')
    ) as required(need)
   where to_regclass(required.need) is null;

  if missing is not null then
    raise exception 'submit_validation_response_v1 precondition: missing relation(s): %',
      array_to_string(missing, ', ');
  end if;

  if to_regprocedure('public.release_entry_reservation(text, text)') is null then
    raise exception 'submit_validation_response_v1 precondition: '
      'public.release_entry_reservation(text, text) is not installed; '
      'apply the entry_reservations migration first';
  end if;
end
$$;

create function public.submit_validation_response_v1(
  p_response_id           text,
  p_batch_id              text,
  p_dataset_entry_id      text,
  p_evaluation            text,
  p_corrected_instruction text,
  p_english_translation   text,
  p_filipino_translation  text,
  p_created_at            timestamptz
)
returns table (
  status               text,
  response_id          text,
  reservation_released boolean,
  refusal_reason       text
)
language plpgsql
volatile
set search_path = ''
as $fn$
declare
  v_validator text;
  v_member    boolean;
  v_stored_id text;
  v_released  boolean := false;
begin
  -- 1. Resolve the stored batch. The validator is read from the batch itself: the request
  -- carries no identity, so there is no second claim to reconcile.
  select b.validator_id
    into v_validator
    from public.validation_batches as b
   where b.id = p_batch_id;

  if v_validator is null then
    return query select 'refused'::text, null::text, false, 'unknown_batch'::text;
    return;
  end if;

  -- 2. Membership, not selection: the batch's own recorded placements decide.
  select exists (
    select 1
      from public.batch_entries as e
     where e.batch_id = p_batch_id
       and e.dataset_entry_id = p_dataset_entry_id
  ) into v_member;

  if not v_member then
    return query select 'refused'::text, null::text, false, 'not_in_batch'::text;
    return;
  end if;

  -- 3. Exactly one insert. The conflict clause is the duplicate-submit race resolving in
  -- favour of safety: a retry whose acknowledgement was lost lands here, stores nothing
  -- twice, and is told the response IS stored.
  insert into public.validations as v (
    id,
    validator_id,
    dataset_entry_id,
    batch_id,
    evaluation,
    corrected_instruction,
    english_translation,
    filipino_translation,
    created_at,
    updated_at
  )
  values (
    p_response_id,
    v_validator,
    p_dataset_entry_id,
    p_batch_id,
    p_evaluation,
    p_corrected_instruction,
    p_english_translation,
    p_filipino_translation,
    p_created_at,
    p_created_at
  )
  on conflict (validator_id, dataset_entry_id) do nothing
  returning v.id into v_stored_id;

  if found then
    -- 4a. Freshly stored. Release the submitter's own claim AFTER the insert, best-effort:
    -- a stuck row decays by TTL, while a recorded submit reported as failed would lie.
    begin
      perform public.release_entry_reservation(v_validator, p_dataset_entry_id);
      v_released := true;
    exception
      when others then
        v_released := false;
    end;
    return query select 'recorded'::text, v_stored_id, v_released, null::text;
    return;
  end if;

  -- 4b. Conflict: read back the stored row. Absent only when the conflict was the
  -- server-minted id itself, which is a server bug and raises rather than confirms.
  select s.id
    into v_stored_id
    from public.validations as s
   where s.validator_id = v_validator
     and s.dataset_entry_id = p_dataset_entry_id;

  if v_stored_id is null then
    raise exception 'submit_validation_response_v1: conflicting insert left no row for '
      'validator batch % entry %', p_batch_id, p_dataset_entry_id;
  end if;

  begin
    perform public.release_entry_reservation(v_validator, p_dataset_entry_id);
    v_released := true;
  exception
    when others then
      v_released := false;
  end;

  return query select 'already_recorded'::text, v_stored_id, v_released, null::text;
  return;
end
$fn$;

comment on function
  public.submit_validation_response_v1(text, text, text, text, text, text, text, timestamptz)
  is 'Persists one validation response in one call: batch-owned validator resolution, membership check, idempotent insert, best-effort reservation release. Service_role only.';

revoke all on function
  public.submit_validation_response_v1(text, text, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function
  public.submit_validation_response_v1(text, text, text, text, text, text, text, timestamptz)
  to service_role;
