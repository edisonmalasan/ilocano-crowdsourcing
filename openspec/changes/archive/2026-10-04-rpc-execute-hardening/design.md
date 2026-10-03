# Design

## Context

See `proposal.md` — Why. The mechanism is five `REVOKE` statements; the subtlety is entirely in
what the tests can and cannot prove about them.

## Goals / Non-Goals

**Goals**

- `anon`/`authenticated` hold no EXECUTE on any of the five functions, on the hosted project
  (measured) and as a standing migration (reviewable).
- CI pins the function set so a sixth function cannot miss the revoke silently.

**Non-Goals**

- Changing RLS, function bodies, or any caller: service_role paths are untouched.
- Reproducing Supabase default privileges in PGlite: the harness models grants minimally by
  design, and widening it to emulate hosting defaults would make every grant test ambient
  rather than explicit.

## Decisions

### D1 — Explicit revokes per function, not a loop over pg_proc

**Chosen:** five `REVOKE ALL ON FUNCTION <exact signature> FROM anon, authenticated` statements.

**Why.** A `DO` block looping over `pg_proc` would also revoke future functions — including any
a future migration intentionally exposes. Explicit names fail closed on review: the set is
visible, countable, and matched by the test's set.

### D2 — The CI proof is set-parity plus privilege end-state, not a behavior change

**Chosen:** PGlite test asserts `has_function_privilege('anon', ...)` is false for all five
after migrations apply, plus a source-text assertion that the migration names exactly the test's
five functions.

**Why this is honest about its limits.** In PGlite the privilege was never granted, so the
end-state assertion passes for a reason that does not exist on hosted. What it genuinely pins:
the migration executes cleanly, revokes what it names, and names the same set the test names.
The behavioral proof (anon refused on the wire) is the hosted gateway re-check, recorded —
like every hosted measurement in this repo — in the roadmap, not in CI.

### D3 — No `grant execute ... to service_role` in this migration

**Chosen:** revoke only.

**Why.** The earlier migrations already granted service_role explicitly; re-granting here would
suggest the revoke might have removed it, which it cannot (revoke names other roles). Touching
service_role's grants in a hardening migration invites exactly the misreading it guards against.

## Risks / Trade-offs

- **[A revoked role that legitimately needs EXECUTE.]** None exists: every caller in `src/`
  uses the service_role path (verified by grep over `client.rpc` call sites during Apply).
  Mitigation: the Apply greps and records.
- **[Future functions miss the revoke.]** Mitigation: the set-parity test fails when migration
  and test disagree — in either direction.

## Migration Plan

One file, `20261004140000_rpc_execute_hardening.sql`: five revokes. Forward-only, no data
touched, no function body altered. Rollback is a no-op conceptually (re-granting would reopen
the hole); the file is never rewritten.

## Open Questions

None.
