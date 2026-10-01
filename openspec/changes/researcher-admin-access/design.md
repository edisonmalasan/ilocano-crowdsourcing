# Design

## Context

Two things exist under the name "admin" and they are unrelated. `src/lib/supabase/admin.ts`
constructs the **service-role Supabase client** — a privileged database credential that bypasses Row
Level Security, is guarded by `import "server-only"`, and whose own doc comment states it must
never be reached "in a request path whose authority comes from client-supplied input" and that "the
researcher's own authorization is decided by the protected admin boundary". That boundary does not
exist yet. This change builds it, and it deliberately does not reuse the word for the new code
(D7).

Constraints that shape the approach, each read from the in-force specs rather than assumed:

- `data-access-boundary` requires the privileged credential to be readable only from server-side
  modules, enforced at runtime by `server-only`, and requires three separately constructed access
  paths.
- `research-schema` requires that no policy grant `anon` or `authenticated` any access to a research
  table, and that no key, foreign key, index, or default reference `auth.users` or `auth.uid()`.
- `src/lib/env/server.ts` validates its three variables as **required** members of one schema, and
  `getServerEnv()` is called on the public allocation, validation, and recovery paths.
- `.env.example` currently documents five variables in two groups, separated so that nothing
  `NEXT_PUBLIC_*` can be a server secret.

No Supabase project exists. All three `SUPABASE_*` variables are absent and no Supabase client has
been constructed in this project, so nothing here can be exercised against a real boundary before a
project exists. See the gate at D9.

## Goals / Non-Goals

**Goals:**

- A researcher is recognized from an environment-supplied operator credential and from nothing else.
- Authorization is decided in server-only code, in the Node runtime, before any privileged read.
- Every failure mode — no credential, wrong credential, altered session, expired session, unconfigured
  environment, exhausted attempt limit — fails **closed**, and the refusals are distinguishable from
  a successful read of nothing.
- A misconfiguration degrades only the admin area. The public validator experience is untouched.
- The attempt limit actually works across deployment instances, rather than being a limit that only
  exists on one process.

**Non-Goals:**

- Any dashboard view. Overview figures, coverage displays, per-validator entry review, filters, and
  disagreement flagging are follow-on changes that depend on this one.
- Any change to a table, policy, or requirement in `openspec/specs/`.
- Anything that identifies a researcher, including an "who am I" display.
- Replacing the `research-schema` deny-all posture. It is preserved, not relaxed.

## Decisions

### D1 — The admin credential variables are validated separately from the existing server environment schema

Two new server-only variables: an operator credential set and a session-protection secret. They are
validated by their **own** schema, read only from admin paths.

The obvious alternative is to add them as required members of `serverEnvSchema`. That is wrong, and
the consequence is severe enough to name: `serverEnvSchema` requires all three of its variables, and
`getServerEnv()` is called by allocation, validation submission, and batch recovery — all public
validator paths. Adding two more required members means **every public validator request fails in
any environment that has not configured an admin credential**, which today is every environment,
including the one a thesis team would run a pilot from. A security feature that takes the public
site down when it is not configured has failed closed in the wrong direction.

So the admin contract is separate and lazy: absent admin variables produce a *refusal on admin
paths only*, never a `ServerEnvError` on a validator path. This follows the existing optional
precedent in the same module, `isServiceRoleKeyConfigured`, which returns a boolean rather than
throwing.

### D2 — Two variables, never one: the session-protection secret is not an operator credential

One variable would mean one value serving as both "the thing you must present" and "the key that
forges sessions". A captured session then becomes a credential, and rotating a single researcher's
access rotates everyone's.

Rejected alternative: deriving both from one root value via a key-derivation function. It is
cryptographically sound and it is still one value in the environment, so an environment compromise
still yields everything; the operational win is small and the readability cost is real. Two
documented variables are easier to rotate independently and easier to reason about in an incident.

### D3 — The session carries a non-secret key identifier, so one operator can be revoked without killing every session

The session payload is an issued-at instant, an expiry, a format version, and a **key identifier** with
two parts:

- `k` — the 1-based ordinal of the operator credential that established the session. Configuration
  position, not anything derived from the credential, so publishing it in a cookie discloses no
  secret material.
- `b` — a **binding**: `base64url(HMAC-SHA256(sessionSecret, "v1\x1f" + ordinal + "\x1f" + credential))[0..16]`,
  always 22 base64url characters.

Verification resolves `k` against the currently configured set, refuses if that ordinal is gone, and
recomputes `b` from the credential *currently* at that position, refusing on mismatch.

##### Why the binding was added after the ordinal proved insufficient — a defect a test found, not a review

This subsection records a correction rather than defending a decision, because the ordinal-only
design described above was implemented and then **failed**.

The claim was that "removing a credential revokes its sessions, because the sessions it established
reference an ordinal that no longer resolves". That is true only when the removal leaves no gap.
Remove the **middle** credential from `["a", "b", "c"]` and `b` is gone while positions 2 and 3 now
hold `c` and nothing respectively. Every session `b` had established survives — it now names
position 2, which is occupied by `c`. So the operation that matters most, removing one team member,
**transferred their authority to a different member instead of removing it**, and the session limit
did not catch it because the payload was well-formed.

The binding closes this. It covers the credential as well as the position, so a session established
by a credential that is no longer at its ordinal recomputes to a different value and is refused.
`tests/unit/admin-session.test.ts` pins both halves: two positions holding the *same* credential
produce *different* bindings, so a gap-filling edit is caught, and the same position produces a
*stable* binding, so a no-op rotation-free redeploy does not sign out the team.

##### What the binding is not

It is **not** an offline oracle for the credential. With a captured cookie in hand, a party must not
be able to test candidate credentials — and with the session-protection secret in hand, a party
*can*, because that same secret keys it. This boundary is stated at the constant and asserted by a
test rather than left implied: the binding defends against a stolen cookie and an unprivileged
reader of configuration, and it does not defend against whoever holds `ADMIN_SESSION_SECRET`. That
secret is already the thing whose compromise signs every session in the first place.

Accepted cost, unchanged: **adding, removing, reordering, or replacing a credential invalidates every
outstanding session**, because a changed set changes at least one binding. Documented at the variable,
because it is surprising, and the middle-removal case above is named there so the cost reads as a
deliberate trade rather than a surprise. The alternative that avoids it — a random public identifier
per operator, as in `kid:token` pairs — buys stability at the cost of a more complex variable format;
deferred, and recorded here so the trade is visible rather than rediscovered.

### D4 — Credential comparison has no early exit, and no early exit at the outer level either

Comparison uses `crypto.timingSafeEqual`, which requires equal-length buffers. Comparing raw values
would make length observable through the refusal, so each candidate is folded to a fixed-length
digest first and the digests are compared.

The subtler mistake is at the loop level: iterating the configured set and returning as soon as one
comparison matches leaks **which** configured credential was presented, because the matching
iteration takes longer than the ones before it and a mismatching one takes the full loop. The loop
therefore accumulates a match flag across **all** configured credentials and consults it once at the
end. A single-token environment and a ten-token environment do the same work for a hit and a miss.

### D5 — The sign-in attempt limit is durable, not in-memory

An in-memory counter is ineffective here. The target deployment is serverless functions, so a
counter in one process is invisible to the next instance; an attacker who varies the instance their
request lands on, or simply sends requests slowly enough to be sharded, never reaches the limit. That
is a guard that cannot fire, which is the defect class this project has now found repeatedly, and it
would have been merged looking like protection.

The limit is therefore a small durable counter, keyed by a coarse request origin, upserted within a
fixed window through the existing server-only privileged path. The table is **additive** — a new
table, no change to any existing table, no change to any policy — and it is the first thing this
project writes through the privileged path in a path an unauthenticated party can reach, which is
acceptable precisely because the privileged path is server-only and the write is a single
server-shaped upsert with no client-supplied authority.

Scope note: this makes the change larger than "add a login form", and it is the honest size. The
alternative was to ship the limit as best-effort and record the limitation, which is the same as not
shipping it.

### D6 — Route protection is a server-only guard in a layout, not middleware

The guard runs in Node runtime, in a module marked `import "server-only"`, and reads the environment
contract and the session secret from there. A layout-level guard covers every route beneath it, so a
new admin route cannot be added without protection by omission — which is the failure mode a
per-route check invites.

Middleware was considered and is genuinely viable: WebCrypto is available in the Edge runtime, so a
signature check does not require Node. It is rejected for two reasons that are about this repository
rather than about the technique. There is no middleware in this project today, and introducing global
request interception to protect one route group adds a surface that runs for unrelated traffic.
And a middleware guard cannot `import` a `server-only` module in the way the rest of this codebase
relies on, so the boundary that makes the rest of the architecture enforceable would be the one part
of it that is enforced by convention instead.

**Forward constraint, recorded now because it is easy to forget:** the session cookie is
`SameSite=Lax`, which blocks a cross-site POST from carrying it but still permits a top-level GET
navigation to carry it. Any future admin **write** — export download initiation above all — must be a
POST that re-checks the session server-side, and must not be reachable by a link.

### D7 — The new area is named for the person, not for the privilege

The code and routes for this capability are named around "researcher", not "admin", because in this
repository "admin" already names the service-role client. Two unrelated things sharing a word is how
`admin.ts` ends up imported into a request whose authority came from a request body. The domain term
in the roadmap stays "the admin area"; the code does not.

### D8 — Refusals are cache-hostile and unindexed by construction

Refused and served admin responses are marked not publicly cacheable, and the route group declares
`noindex`. Both are cheap, and both address a failure that a shared cache would turn from "researcher
A was refused" into "researcher A was served" for everyone behind it.

##### MEASURED 2026-10-02: the `noindex` half holds, and the `Cache-Control` half is weaker than declared

Measured against a real running server, because this half is the kind that is easy to assert and
never observe:

- `X-Robots-Tag: noindex, nofollow` arrives on every researcher response, and the 403 body also
  carries a `robots` meta `noindex`. Both declared noindex mechanisms work.
- `Cache-Control` arrives as `no-cache, must-revalidate`, **not** the `private, no-store, max-age=0`
  that `next.config.ts` declares in the same header block. The same block's `X-Robots-Tag` does
  arrive, which proves the block matches the path and is not the problem: Next.js **replaces**
  `Cache-Control` on a dynamic App Router response, and every researcher route is dynamic because
  each reads the session cookie.

The requirement is a property rather than a header string, and the measured value satisfies it — the
response is not marked publicly cacheable, and every reuse requires revalidation, which re-runs the
guard rather than replaying a stored decision. Two facts close the remainder: the refusal is a **403**,
and 403 is not among the status codes HTTP permits to be heuristically cached, so a compliant shared
cache will not store it on freshness grounds before even reading `no-cache`; and `no-store` is
obtainable for a dynamic page only through middleware, which D6 declines for the same reason it
declines a middleware guard — a second file in the researcher area is a second place to get it wrong.

Recorded here and in `next.config.ts` rather than papered over, because a comment asserting a
mechanism the platform silently replaces is worse than no comment.

### D9 — The real-project gate

Everything above is verifiable now: pure functions, the server-only import boundary enforced by the
existing lint rule, the env contract, the schema, the attempt table against PGlite. **None of it is
verifiable against a real authorization boundary**, and the three things that would first expose a
defect are precisely the ones this project has never exercised:

1. An unauthorized request refused by a real running server rather than by a stub.
2. A privileged read observed on the real PostgREST wire, which is the first time `.in()`,
   `.range()`, `.neq()`, and `.eq()` would be observed rather than asserted against a recording fake.
3. Row Level Security confirmed as enforced by the Supabase API gateway rather than by the database
   engine, which PGlite cannot reproduce and which this project's deny-all posture depends on.

##### STATUS, measured 2026-10-02: item 1 SATISFIED, items 2 and 3 BLOCKED

**Item 1 is satisfied, by observation.** `pnpm run dev` was run against the real `.env.local` and a
real `GET /researcher` was issued. It returns a genuine HTTP **403** — not a redirect to sign-in and
not a 500 — which is what proves the guard is reached and that `forbidden()` is in effect. The
response carries `X-Robots-Tag: noindex, nofollow` and a `robots` meta noindex; it is byte-identical
across repeat requests once Next.js's per-request RSC id is normalised; it discloses no reason, no
credential name, and no fact about whether the deployment is configured; `/researcher/sign-in` is
reachable without a session, and no session cookie is set for an unauthenticated requester; and
`/`, `/start`, and `/ready` are served 200 with exactly one `h1` each, which is the load-bearing
consequence of validating the admin variables separately (D1). The dev server's own log independently
records `GET /researcher 403` on every such request.

Two things that probe could **not** establish, recorded so a reader does not over-read it:

- **It is not browser verification.** No desktop browser is connected to this session, so the screen
  has still never been rendered by anything that lays it out. The evidence is HTTP status, headers,
  and served HTML — not appearance.
- **It never reached a database read.** The guard refuses before any read, so this exercises
  authorization and nothing else. Items 2 and 3 remain unobserved.

**Items 2 and 3 are blocked on a manual Supabase action, not on code.** The project exists and is
reachable — `/auth/v1/health` returns 200 and the seven `.env.local` variables are present and
non-blank — but the hosted schema is **empty**: PostgREST's OpenAPI root exposes **zero** relation
paths. Applying the migrations requires SQL, and this machine has no Supabase PAT, no linked
`supabase` CLI, no `psql`, no `docker`, and PostgREST exposes no SQL-executing function. The five
production migrations have been bundled into one pasteable file and handed to the operator; nothing
in this repository can execute it. Until it is applied, the researcher area's privileged reads have
never run and gate items 2 through 5 stay open.

The gate is an **entry condition on the Apply**, not a task inside it: no implementation in this
change merges until a real Supabase project exists and all three have been observed. Until then the
change's own status is "implemented and unit-tested, refused correctly by a real server, and never
exercised against a real authorization boundary or a real database", and the ledger must say that
rather than imply otherwise.

### D10 — The documented admin variables ship empty, not filled with sample text

The three Supabase keys in `.env.example` carry fake values like
`your-publishable-anon-key`, and that is harmless: a fake project reference cannot connect to
anything, so shipping one breaks loudly and immediately. **An operator credential has no such
property.** A published sample value is a perfectly valid credential, so
`ADMIN_OPERATOR_SECRETS="placeholder-operator-token"` in a deployed environment would authorize
anyone who has read the repository, and it would do so silently and successfully — the one failure
mode this whole change exists to prevent.

The alternative of shipping a sample value and adding a rule that rejects values matching the
template was rejected: it is a denylist protecting against a mistake this project would not make
twice, and it adds a code path whose only job is to recognise its own documentation.

So both admin variables are documented **empty**. The credential contract already treats a
present-but-blank value as absent (D1), which means the shipped template produces the correct
default behaviour for free: the admin area refuses every request, and a real value has to be
deliberately generated and deliberately pasted. The comment beside them explains exactly why the
emptiness is intentional, because "fill in the placeholder" is the obvious thing to do and it is the
one action that would open the area.

This is a small instance of a general rule worth stating once: **a placeholder is only safe when
the thing it stands in for cannot be used as the thing.** A URL, a host, an email, an ID — safe. A
password, a token, a key — a published placeholder is a live credential.

## Risks / Trade-offs

- **An in-memory attempt limit would be theatre under serverless** → the limit is durable (D5).
  Residual risk: the counter is keyed by a coarse origin, so a distributed attacker behind many
  origins is only slowed, not stopped. This is a rate limit, not an authorization control, and the
  requirement text says so.
- **A stateless session cannot be revoked by signing out** → the key identifier makes per-operator
  revocation possible (D3), and the maximum lifetime bounds the residual window. The spec states the
  residual window rather than implying sign-out revokes anything.
- **`Secure` cookies break plain-HTTP local testing** → the flag follows the environment, and the
  setting is part of the admin env contract rather than hardcoded, so the difference between a local
  preview and a deployed environment is visible rather than inferred.
- **Reordering the credential set invalidates outstanding sessions** → documented at the variable and
  in D3, because a surprise here looks like an authentication bug.
- **The whole authorization boundary is unexercised until a project exists** → the gate (D9), stated
  as a merge precondition rather than a follow-up task.
- **A future admin write reachable by a link would ride a `Lax` cookie** → D6 records the POST-only
  constraint now, while the person who can still fix it cheaply is reading this.
- **The attempt table is the first unauthenticated-reachable write through the privileged path** →
  it is server-only, single-upsert, and shaped entirely by server code; no client value determines
  what is written beyond the counter increment.

## Migration Plan

1. Add the additive attempt table in a new migration. It touches no existing table and no policy, so
   it is forward-only and safe to apply ahead of the code.
2. Document both variables in `.env.example`, keeping them in the server group so neither can become
   `NEXT_PUBLIC_*`.
3. Ship the admin route group and guard. **With the variables unset, the admin area refuses every
   request and the public experience is unchanged** — that is the deployed default and it is the
   rollback behaviour too.
4. Rollback is to unset the variables: the admin area refuses again. No code revert and no data
   change is required, which is why there is no separate rollback path.

## Open Questions

- The concrete maximum session lifetime and the attempt limit and window. These are configuration
  values, and no scenario depends on the specific numbers; they belong to deployment configuration,
  not to this change's design.
- Whether the deferred dashboard views are better as one follow-on change or split into coverage
  reporting and entry review. A roadmap sequencing question, not a design constraint on this change.