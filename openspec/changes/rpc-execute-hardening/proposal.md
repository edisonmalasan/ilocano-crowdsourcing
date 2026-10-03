# Proposal

## Why

Measured on the live project during the `entry-reservation-leases` archive: `anon` and
`authenticated` hold EXECUTE on all five privileged RPC functions (`claim_entry_reservations`,
`release_entry_reservation`, `researcher_signin_attempts_record`,
`researcher_signin_attempts_clear`, `dataset_entries_import`). The migrations revoked EXECUTE
from PUBLIC, but Supabase's default privileges grant it to `anon`/`authenticated` explicitly —
a grant the PGlite harness does not reproduce, so CI asserts refusal by privilege against a
dataless model of the real posture.

The effective barrier today is RLS under SECURITY INVOKER (measured denying both reads and
writes), so nothing is exploitable as it stands. But the posture rests on one layer where the
design calls for two, and a future RLS slip would turn every one of these functions into an
unauthenticated write amplifier. The fix is five explicit revokes — one migration, no behavior
change for any legitimate caller (all five are service_role-only by design).

## What Changes

- **New migration `20261004140000_rpc_execute_hardening.sql`**: `REVOKE ALL ON FUNCTION ...
  FROM anon, authenticated` for all five privileged RPCs. Forward-only; revoking a privilege
  granted by default is not a change to any table, policy, or function body.
- **Spec**: one ADDED `research-schema` requirement — privileged RPC functions SHALL be
  executable by `service_role` only, with `anon`/`authenticated` refused by privilege.
- **Tests**: PGlite suite asserting the revoke statements execute and `has_function_privilege`
  is false for anon/authenticated on all five functions (true end-state assertion, not a
  default-state artifact); source-text parity between the migration's function list and the
  test's function list so a sixth function cannot silently miss the revoke; hosted gateway
  re-check (anon RPC → permission-denied-for-function) recorded in the archive, not in CI.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `research-schema`: ADDED requirement on RPC EXECUTE posture (service_role only).

## Impact

- One migration file; one integration test file (or extension); the bidirectional union test
  is untouched (no new operation names — privileges, not operations).
- No `src/` changes: every legitimate caller already uses service_role.
- Deferred: anything beyond the five measured functions. If a sixth privileged RPC appears, it
  gets its own revoke line by the same rule — the source-text parity test is what enforces that
  the migration and the test agree on the set.
