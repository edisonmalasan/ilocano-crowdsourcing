-- Durable sign-in attempt counter for the researcher area.
--
-- FORWARD MIGRATION. `20260930120000_research_schema.sql` is not modified, and no archived
-- specification is rewritten. This file ADDS one operational table and two functions. It changes no
-- existing table, no existing column, and no existing policy.
--
-- ---------------------------------------------------------------------------
-- WHY THIS TABLE EXISTS AT ALL
-- ---------------------------------------------------------------------------
-- The researcher sign-in surface must refuse further attempts after a configured number of
-- consecutive failures. The obvious implementation is a counter in a module-level variable, and the
-- reason it is refused here is the deployment rather than taste: this application is deployed as
-- serverless functions, so a counter held in one process is invisible to the next instance. An
-- unauthenticated party who varies which instance their request lands on never reaches the limit,
-- and the guard that looks like protection in the source is not protection in production. That is
-- the specific defect this project has already found twice in a review pass — a check that cannot
-- fire — so it is worth writing the table rather than the counter.
--
-- The counter is therefore a row, read and incremented through the existing server-only privileged
-- path. This is the first write this project performs through that path in a request an
-- unauthenticated party can reach, which is acceptable precisely because the write is server-shaped:
-- a single function call whose arguments are a coarse origin key and a window length, with no
-- client-supplied value determining what is written beyond the increment itself.
--
-- ---------------------------------------------------------------------------
-- WHY THE INCREMENT LIVES IN A FUNCTION AND NOT IN APPLICATION CODE
-- ---------------------------------------------------------------------------
-- A read-modify-write from the application is not atomic. Two concurrent requests can both read
-- `attempt_count = 4` and both write `5`, so the stored count under-reports by one per lost update
-- and a determined party keeps going. `INSERT ... ON CONFLICT DO UPDATE` inside a single statement is
-- atomic, and the only way this project can ask Postgres for that through PostgREST is to let the
-- database own the statement. Hence the function, and hence the `rpc` member added to
-- `SupabaseClientLike` in the same change.
--
-- SECURITY INVOKER, NOT SECURITY DEFINER, and this is the load-bearing property.
-- ---------------------------------------------------------------------------
-- A `security definer` function runs as its owner, which on a hosted project is `postgres`. That role
-- bypasses Row Level Security, so an `anon` caller could invoke the increment and write rows into a
-- table it is supposed to be refused on — turning a rate limiter into an unauthenticated write
-- amplifier. Invoker semantics mean an `anon` call runs as `anon`, which has no policy on this table
-- and is refused by the same deny-all posture every other research table already has.
--
-- `service_role` holds `bypassrls`, so the server-side privileged path reaches the row. That is the
-- only caller this table has, and it is asserted in `tests/integration/researcher-signin-attempts.test.ts`.
--
-- EXECUTE IS REVOKED FROM PUBLIC, so the revoke-from-`anon` path above is defence in depth rather
-- than the only barrier. Postgres grants EXECUTE on new functions to `PUBLIC` by default, which would
-- have made the function callable by `anon` even with invoker semantics — refused, but by a row-level
-- policy rather than by a privilege, and one migration's slip away from being called at all.
--
-- ---------------------------------------------------------------------------
-- KEYING, AND WHAT IT DOES NOT PROMISE
-- ---------------------------------------------------------------------------
-- The key is a COARSE request origin, computed by the application from the request's own headers. It
-- is not a client identifier and it is not a researcher identifier: it holds no personal data, which
-- is what lets it live in a research database at all.
--
-- It is coarse on purpose. Reading a client's address from an unverified header is trivially
-- forgeable, so the honest claim is that this SLOWS a distributed party rather than stopping one.
-- That is a rate limit, not an authorization control, and the spec's requirement says so; the
-- authorization decision is the credential comparison, which this table has nothing to do with.
--
-- ---------------------------------------------------------------------------
-- WHY `window_started_at` IS STORED RATHER THAN COMPUTED
-- ---------------------------------------------------------------------------
-- The window has to survive across requests and across instances, which means it has to be a value
-- the database compares against. Storing it is what makes the reset correct: the count restarts at
-- 1 when, and only when, the stored window start is further behind than the configured window, so a
-- party that stops attacking and returns after the window is not permanently locked out. The spec
-- requires that reaching the limit deny a party that cannot authenticate rather than granting one,
-- and an unbounded lockout would do the opposite.

-- ---------------------------------------------------------------------------
-- researcher_signin_attempts
-- ---------------------------------------------------------------------------
-- One row per coarse origin. The primary key is that origin, which is what makes the increment a
-- single atomic `INSERT ... ON CONFLICT` rather than a search for a free slot.
--
-- Deliberately NOT a research table. It holds no research response, no dataset entry, no validator,
-- and nothing derived from a validator. It is excluded from the six research tables by construction:
-- it is created after them, references none of them, and has no foreign key into any of them.

create table public.researcher_signin_attempts (
  -- The coarse origin key. Bounded so a hostile header cannot grow a row without limit; the
  -- application truncates to the same width before ever calling the function.
  origin_key         text        primary key,

  -- When the current counting window opened. The count below is the count WITHIN this window.
  window_started_at  timestamptz not null,

  -- Consecutive failures recorded in the current window. Zero is representable because `clear`
  -- deletes the row rather than zeroing it, and a stored 0 would mean a window that never had a
  -- failure in it — a state the function cannot produce.
  attempt_count      integer     not null,

  -- When the count last changed. Within a window `window_started_at` is fixed while the count grows,
  -- so this is the only way to see when the LAST failure arrived rather than when the window opened.
  updated_at         timestamptz not null,

  constraint researcher_signin_attempts_origin_key_length
    check (char_length(origin_key) between 1 and 200),

  constraint researcher_signin_attempts_count_not_negative
    check (attempt_count >= 0)
);

comment on table public.researcher_signin_attempts is
  'Durable per-origin counter of consecutive researcher sign-in failures. Operational, not research: it holds no response, entry, or validator data.';

comment on column public.researcher_signin_attempts.origin_key is
  'Coarse request origin key computed by the server. Forgeable by a determined party, so this rate limit slows rather than stops.';

-- Row Level Security, exactly as the six research tables have it: enabled, with NO policy granting
-- anything to `anon` or `authenticated`. Enabling RLS on a new table is not a change to an existing
-- policy, and the deny-all posture this project depends on does not get a hole here.
alter table public.researcher_signin_attempts enable row level security;

-- No index beyond the primary key. The only access pattern is a point read and a point upsert, both
-- served by the primary key's btree. An index on `window_started_at` would exist to answer "which
-- origins are stale", and no code asks that question — a column with an index nothing reads is a
-- claim about a future cleanup job that does not exist.

-- ---------------------------------------------------------------------------
-- researcher_signin_attempts_record
-- ---------------------------------------------------------------------------
-- Atomically records one failed attempt and returns the resulting count for this window.
--
-- One statement, so two concurrent callers cannot both read the same count and both write the same
-- increment. `set search_path = ''` means nothing is resolved through a writable schema: every name
-- in the body is either fully qualified or lives in `pg_catalog`, which Postgres searches ahead of
-- the search path in any case.
--
-- `p_window_seconds` is floored at 1 rather than trusted. A zero or negative window would make the
-- expiry test below true on every call, which would silently turn the counter into "always reset to
-- 1" — a rate limit that never limits, written in a way that looks correct.

create function public.researcher_signin_attempts_record(
  p_origin_key       text,
  p_window_seconds   integer
)
returns integer
language plpgsql
volatile
set search_path = ''
as $fn$
declare
  v_now     timestamptz := now();
  v_window  integer     := greatest(p_window_seconds, 1);
  v_count   integer;
begin
  -- Every SET expression is evaluated against the OLD row, so both cases below see the stored
  -- `window_started_at` and not a half-updated one. Writing `window_started_at` first would still
  -- be correct here, but relying on that is a trap for the next person to edit this.
  insert into public.researcher_signin_attempts as attempts
         (origin_key, window_started_at, attempt_count, updated_at)
  values (p_origin_key, v_now, 1, v_now)
  on conflict (origin_key) do update
     set attempt_count = case
                           when v_now - attempts.window_started_at
                                > make_interval(secs => v_window) then 1
                           else attempts.attempt_count + 1
                         end,
         window_started_at = case
                               when v_now - attempts.window_started_at
                                    > make_interval(secs => v_window) then v_now
                               else attempts.window_started_at
                             end,
         updated_at = v_now
  returning attempt_count into v_count;

  return v_count;
end
$fn$;

comment on function public.researcher_signin_attempts_record(text, integer) is
  'Records one failed sign-in attempt and returns the count for the current window. Resets to 1 once the stored window is older than the configured window.';

-- ---------------------------------------------------------------------------
-- researcher_signin_attempts_clear
-- ---------------------------------------------------------------------------
-- Forgets an origin's failures. Called after a SUCCESSFUL sign-in, so a legitimate researcher who
-- mistyped their credential a few times is not left with a shortened allowance for the rest of the
-- window.
--
-- It DELETES rather than zeroing, so "no row" and "a window with no failures in it" stay the same
-- state. A stored zero would be a third state that nothing can produce and every reader would have
-- to special-case.

create function public.researcher_signin_attempts_clear(p_origin_key text)
returns void
language sql
volatile
set search_path = ''
as $fn$
  delete from public.researcher_signin_attempts where origin_key = p_origin_key;
$fn$;

comment on function public.researcher_signin_attempts_clear(text) is
  'Clears an origin''s recorded failures. Called only after a successful sign-in.';

-- ---------------------------------------------------------------------------
-- EXECUTE GRANTS
-- ---------------------------------------------------------------------------
-- Postgres grants EXECUTE on a new function to `PUBLIC`. With invoker semantics an `anon` call would
-- be refused by Row Level Security rather than by privilege, but relying on the policy while the
-- privilege is open is the wrong order: the revocation is the barrier and the policy is the
-- backstop. `service_role` is granted explicitly, because it is the only legitimate caller and it is
-- the role that holds `bypassrls`.

revoke all on function public.researcher_signin_attempts_record(text, integer) from public;
grant execute on function public.researcher_signin_attempts_record(text, integer) to service_role;

revoke all on function public.researcher_signin_attempts_clear(text) from public;
grant execute on function public.researcher_signin_attempts_clear(text) to service_role;

-- The table's own privileges are NOT granted here, and deliberately so. The six research migrations
-- grant nothing either: Supabase provisions table privileges in `public` for its API roles, and this
-- project's own integration harness reproduces those grants after migrations run. Re-granting them
-- here would make the migration depend on which environment applies it, and `tests/integration/
-- pglite-harness.test.ts` proves the harness's ordering is what the RLS assertions depend on.