-- Explicit EXECUTE revokes for privileged RPC functions.
--
-- FORWARD MIGRATION. No table, column, policy, or function body is modified. This file removes
-- privileges only.
--
-- ---------------------------------------------------------------------------
-- WHY THIS FILE EXISTS
-- ---------------------------------------------------------------------------
-- Every privileged RPC migration in this project revokes EXECUTE from PUBLIC — and on the hosted
-- project that revoke is necessary but not sufficient. Supabase's default privileges grant
-- EXECUTE on new functions to `anon` and `authenticated` EXPLICITLY, so a revoke addressed only
-- to PUBLIC leaves both grants standing. Measured on the live project during the
-- `entry-reservation-leases` archive: all five privileged functions carried both grants.
--
-- The PGlite harness does not reproduce Supabase default privileges, so CI asserts refusal by
-- privilege against a model in which the grant was never there. The effective barrier on hosted
-- is RLS under SECURITY INVOKER, measured denying both reads and writes — which is why this is
-- hardening (restoring the designed second layer) and not incident response (nothing was
-- exploitable as it stood).
--
-- ---------------------------------------------------------------------------
-- WHY EXPLICIT NAMES AND NOT A LOOP
-- ---------------------------------------------------------------------------
-- A `DO` block revoking over `pg_proc` would also revoke future functions — including any a
-- future migration intentionally exposes. Explicit names fail closed on review: the set is
-- visible, countable, and matched by the integration test's set, which fails when the two
-- disagree in either direction. If a sixth privileged RPC appears, it gets its own line here
-- by the same rule; "all functions" automation would silently cover functions nobody reviewed.

-- Claim + release for exclusive assignment leases. Service-role-only callers.
revoke all on function public.claim_entry_reservations(text, text[], integer)
  from anon, authenticated;
-- Holder-scoped release. Service-role-only callers.
revoke all on function public.release_entry_reservation(text, text)
  from anon, authenticated;
-- Rate-limit increment + clear. Server-side sign-in path only.
revoke all on function public.researcher_signin_attempts_record(text, integer)
  from anon, authenticated;
revoke all on function public.researcher_signin_attempts_clear(text)
  from anon, authenticated;
-- Operator dataset import. Operator command with service-role key only. Full signature:
-- a revoke naming the wrong arity revokes nothing and fails loudly rather than partially.
revoke all on function public.dataset_entries_import(text, text, text, text, text, text, jsonb, boolean)
  from anon, authenticated;
