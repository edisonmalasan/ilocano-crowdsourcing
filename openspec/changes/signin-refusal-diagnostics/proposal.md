# Proposal

## Why

A researcher locked out of the sign-in screen sees one identical message for four different causes (unconfigured deployment, exhausted rate-limit window, wrong credential, unreachable counter). The operator diagnosing it sees nothing at all: no refusal reason is recorded anywhere server-side either. An operator who cannot distinguish "misconfigured" from "rate-limited" from "typo" cannot help, and repeated blind retries burn the rate-limit window further.

## What Changes

- Emit one server log line per refused researcher sign-in carrying the internal refusal reason (`not_configured`, `limit_reached`, `bad_credential`, `counter_unavailable`) plus the coarse origin key, and the credential ordinal on success. Never the credential, never the session, never to the client.
- The outward refusal stays exactly one indistinguishable message; the form, the guard, and the rate-limit behavior do not change.
- Cover the four reasons plus success with unit tests over injected loggers.

## Capabilities

### New Capabilities

- `signin-refusal-diagnostics`: server-side-only refusal diagnostics for researcher sign-in.

### Modified Capabilities

- `researcher-admin-access`: the identical-outward-refusal requirement gains a server-observable counterpart; refusal behavior toward the requester is unchanged.

## Impact

- `src/lib/admin/signin-core.ts` (and/or its `actions.ts` caller) gains an injected log sink; no signature change for existing callers beyond an optional dependency.
- No migration, no schema change, no new dependency, no client-visible change.
