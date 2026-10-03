-- Exclusive assignment leases for incomplete dataset entries.
--
-- FORWARD MIGRATION. No existing table, column, policy, or function is modified. This file ADDS
-- one operational table and two functions. It changes nothing already stored.
--
-- ---------------------------------------------------------------------------
-- WHY THIS TABLE EXISTS AT ALL
-- ---------------------------------------------------------------------------
-- Allocation used to be pure read-then-write: select candidates, persist a batch, return. Two
-- simultaneous batch requests could select, persist, and return the SAME incomplete entry, and
-- nothing arbitrated between them — the double-submit refused only at insert time, as confusion
-- rather than prevention. The approved rule is that one incomplete entry is never actively
-- assigned to two validation attempts at once, and application logic cannot enforce "never" across
-- two concurrent requests: between the application's read and its write there is always an
-- interval, and a second request can act inside it.
--
-- The reservation is therefore a row, claimed through the existing server-only privileged path.
-- This is the same move `20261002120000_researcher_signin_attempts.sql` makes for the same reason:
-- the database owns the arbitrating statement, so simultaneity is decided by Postgres rather than
-- by whichever request read last.
--
-- ---------------------------------------------------------------------------
-- WHY THE CLAIM IS PK ARBITRATION AND NOT ROW LOCKING
-- ---------------------------------------------------------------------------
-- `SELECT ... FOR UPDATE SKIP LOCKED` presumes rows to lock. An unclaimed entry has no
-- reservation row, so there is nothing to select-for-update — the queue-consume pattern answers a
-- question this model never asks. The primary key IS the lock instead: two concurrent inserts for
-- one entry serialize on the unique index, exactly one wins, and `ON CONFLICT ... DO UPDATE ...
-- WHERE` decides the rest per row. No application logic runs between the conflict check and the
-- claim, so the losing interval of read-then-write does not exist here.
--
-- ---------------------------------------------------------------------------
-- WHY THE TABLE, NOT A COLUMN ON THE DATASET
-- ---------------------------------------------------------------------------
-- Reservation is operational state about the allocation pool: who holds what, until when. The
-- synthetic dataset is immutable research material, and a reservation column on it would make an
-- operational write look like a dataset edit. A separate table keeps the ownership honest, and
-- deleting the table later (if the model is ever retired) touches no research row.
--
-- Deliberately NOT a research table. It holds no research response, no dataset entry content, no
-- translation, and nothing derived from a validator. It is excluded from the research tables by
-- construction: it is created after them and references them only by key.
--
-- ---------------------------------------------------------------------------
-- WHY EXPIRY IS A COMPARISON, NOT A WATCHER
-- ---------------------------------------------------------------------------
-- A sweeper, a cron job, or a background worker would be a continuously running process the
-- deployment must keep alive — and its absence would fail silently into permanently parked
-- entries. Expiry is therefore a `timestamptz` comparison evaluated inside the claim itself: an
-- expired row is reclaimable by any caller, and reclaiming deletes-or-overwrites it in the same
-- statement. Abandoned tabs and batches decay back into the pool by time alone. There is nothing
-- to schedule, nothing to monitor for liveness, and nothing whose failure mode is "stuck".

-- ---------------------------------------------------------------------------
-- entry_reservations
-- ---------------------------------------------------------------------------
-- One row per reserved entry. The primary key is the entry id, which is what makes the claim a
-- single atomic `INSERT ... ON CONFLICT` rather than a search for a free slot.

create table public.entry_reservations (
  -- The reserved dataset entry. One row per entry, never more: two holders for one entry is the
  -- state this table exists to make unrepresentable.
  entry_id          text        primary key
    references public.dataset_entries (id) on delete cascade,

  -- The holding attempt. An attempt identifier, never evidence of a distinct human: the same
  -- person may hold any number of attempts, and this column says nothing about who they are.
  validator_id      text        not null
    references public.validators (id) on delete cascade,

  -- When the claim was granted, and until when it holds. Both are server time (`now()` inside
  -- the claim function), never client-supplied: a client-supplied deadline would let a holder
  -- park an entry indefinitely.
  --
  -- Deliberately NO check that `expires_at` exceeds `reserved_at`. The claim floors the TTL at
  -- one second, so the production path cannot invert them — while a check would refuse legitimate
  -- time manipulation such as backdating a row to exercise expiry. A constraint that blocks the
  -- test of the property it claims to protect is decoration with teeth.
  reserved_at       timestamptz not null default now(),
  expires_at        timestamptz not null
);

comment on table public.entry_reservations is
  'Exclusive assignment leases: which attempt holds which incomplete entry, until when. Operational, not research: it holds no response, entry content, or translation.';
comment on column public.entry_reservations.entry_id is
  'The reserved dataset entry. Primary key, so two simultaneous claims for one entry serialize on the unique index and exactly one wins.';
comment on column public.entry_reservations.validator_id is
  'The holding attempt. An identifier, never a person.';
comment on column public.entry_reservations.expires_at is
  'When the lease ends. Compared lazily inside the claim; no watcher, no sweeper.';

-- Row Level Security, exactly as every other table has it: enabled, with NO policy granting
-- anything to `anon` or `authenticated`. Enabling RLS on a new table is not a change to an
-- existing policy, and the deny-all posture this project depends on does not get a hole here.
alter table public.entry_reservations enable row level security;

-- One index beyond the primary key, for the foreign key it serves: deleting a validator cascades
-- into this table, and without this index that cascade would scan it. The point-claim and
-- point-release paths are served by the primary key's btree.
-- No index on `expires_at`: expiry is evaluated per candidate row inside the claim, and an index
-- nothing reads would be a claim about a sweeper that does not exist.
create index entry_reservations_validator_id_idx
  on public.entry_reservations (validator_id);

-- ---------------------------------------------------------------------------
-- claim_entry_reservations
-- ---------------------------------------------------------------------------
-- Atomically claims the supplied candidate entries for one attempt and returns the granted subset.
--
-- One statement, so two concurrent callers cannot both read "free" and both write a claim: the
-- second insert for one entry blocks on the first's speculative insertion, then re-evaluates the
-- `WHERE` against the committed row. An unexpired foreign row fails the predicate and is
-- skipped; an expired row — anyone's, including the caller's own — is overwritten and granted;
-- the caller's own unexpired row is re-granted (idempotent retry), because refusing it would turn
-- a retried claim into phantom contention.
--
-- `set search_path = ''` means nothing is resolved through a writable schema: every name in the
-- body is either fully qualified or lives in `pg_catalog`.
--
-- `p_ttl_seconds` is floored at 1 rather than trusted. A zero or negative TTL would make every
-- claim expire before it is read, which would silently turn exclusive assignment into no
-- assignment — written in a way that looks correct.
--
-- SECURITY INVOKER, NOT SECURITY DEFINER, for the reason
-- `20261002120000_researcher_signin_attempts.sql` records at length: a definer function runs as
-- `postgres`, which bypasses RLS, so an `anon` caller could write rows into a table it is
-- supposed to be refused on. Invoker semantics mean an `anon` call runs as `anon` — refused by
-- the deny-all posture — and the only legitimate caller is `service_role`, which holds
-- `bypassrls`. EXECUTE is revoked from PUBLIC and granted to `service_role` explicitly, because
-- Postgres grants EXECUTE on new functions to PUBLIC by default.

create function public.claim_entry_reservations(
  p_validator_id text,
  p_entry_ids    text[],
  p_ttl_seconds  integer
)
returns table (entry_id text)
language sql
volatile
set search_path = ''
as $fn$
  insert into public.entry_reservations as reservations
         (entry_id, validator_id, reserved_at, expires_at)
  select candidate,
         p_validator_id,
         now(),
         now() + make_interval(secs => greatest(p_ttl_seconds, 1))
    from unnest(p_entry_ids) as candidate
  on conflict (entry_id) do update
     set validator_id = excluded.validator_id,
         reserved_at  = excluded.reserved_at,
         expires_at   = excluded.expires_at
   where reservations.expires_at <= now()
      or reservations.validator_id = p_validator_id
  returning reservations.entry_id;
$fn$;

comment on function public.claim_entry_reservations(text, text[], integer) is
  'Atomically claims candidate entries for one attempt; returns the granted subset. Simultaneous claims serialize on the primary key; expired rows are reclaimed by time comparison; own unexpired rows are re-granted.';

-- ---------------------------------------------------------------------------
-- release_entry_reservation
-- ---------------------------------------------------------------------------
-- Releases one attempt's own claim. Called after a stored validation response, so an answered
-- entry stops occupying the exclusivity table whether or not it completed: a qualifying submit
-- needs no row afterwards (the entry is complete and allocation ignores it), and a
-- `cannot_evaluate` submit releases its row so the entry becomes allocatable again.
--
-- The `validator_id` predicate is load-bearing, not decorative: without it any caller could
-- release anyone's claim. Best-effort by contract — the service never fails a recorded submit
-- over a failed release — and a stuck row decays by expiry, which is the same guarantee every
-- other abandonment path already has.

create function public.release_entry_reservation(
  p_validator_id text,
  p_entry_id     text
)
returns void
language sql
volatile
set search_path = ''
as $fn$
  delete from public.entry_reservations
   where entry_id = p_entry_id
     and validator_id = p_validator_id;
$fn$;

comment on function public.release_entry_reservation(text, text) is
  'Releases one attempt''s own claim after a stored response. Holder-scoped: it cannot release another attempt''s row.';

revoke all on function public.claim_entry_reservations(text, text[], integer) from public;
grant execute on function public.claim_entry_reservations(text, text[], integer) to service_role;

revoke all on function public.release_entry_reservation(text, text) from public;
grant execute on function public.release_entry_reservation(text, text) to service_role;

-- The table's own privileges are NOT granted here, and deliberately so, for the reason the
-- sign-in-attempts migration records: Supabase provisions table privileges in `public` for its
-- API roles, the integration harness reproduces those grants after migrations run, and re-granting
-- here would make the migration depend on which environment applies it.
