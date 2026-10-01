# Proposal

## Why

The roadmap's Phase 7 requires a protected researcher area, and the architecture already reserves
the slot for it: `src/lib/supabase/admin.ts` states that "the researcher's own authorization is
decided by the protected admin boundary". That boundary does not exist. What exists instead is the
*other* meaning of the word — `createAdminSupabaseClient` is the **service-role client**, a
privileged database credential with no notion of a person behind a request, and it is explicitly
documented as never to be reached "in a request path whose authority comes from client-supplied
input".

So there is currently no way to distinguish a thesis researcher from anyone else, and the only
credential that can read research tables is one that must never be reachable from an unauthorized
request. This change builds the missing boundary between the two.

It cannot be built and verified at the same time. No Supabase project exists — all three
`SUPABASE_*` variables are absent and no Supabase client has ever been constructed in this project
— so an authorization boundary implemented now would be provable only against a fake. That is the
"claim of enforcement that does not enforce" shape this project has now found three separate times,
and it is worse here than anywhere else, because the thing being faked is the thing that decides who
may read raw research responses. **The gate is therefore an entry condition on this change, not a
task inside it.**

## What Changes

- **A new env-configured operator credential.** Two server-only variables: a set of operator
  tokens and a separate session-signing secret. No personal data is collected, no `auth.users`
  table is created, and no research-team email address is stored anywhere.
- **Server-authoritative admin sessions.** A submitted operator token is verified against the
  configured set and exchanged for a signed, `httpOnly`, `SameSite` cookie. Verification is
  server-side and constant-time; the browser never holds a credential, only an opaque session.
- **A protected admin route boundary.** Every admin route refuses to render or serve without a
  verifying session, and the refusal is a refusal rather than an empty page, so an unauthenticated
  request is distinguishable from a successful read of nothing.
- **An explicit logout** that clears the session cookie.
- **`.env.example` gains both variables**, so the thesis team can supply real values later. It is a
  tracked template, and a populated `.env`/`.env.local` is never committed. Both admin variables are
  documented **empty rather than filled with sample text**, because a published sample operator
  credential is a perfectly valid credential: the shipped template would then authorize anyone who
  has read the repository. Empty is also the correct default, since a blank value is treated as
  unset and the admin area refuses every request.
- **No dashboard views.** The roadmap's overview figures, coverage displays, per-validator entry
  review, filters, and disagreement flagging are **deliberately deferred to a follow-on change** that
  depends on this one. Adding them here would make this change unbounded and would mean merging a
  screen full of research figures before anything can verify it.

Two things are deliberately **not** changed:

- **The `research-schema` deny-all posture is preserved.** No Row Level Security policy is added or
  relaxed, and no requirement in that capability is modified. The privileged read still happens
  through the existing server-only service-role path; what is new is that the *application* decides
  who may ask for it. The obvious alternative — granting `authenticated` a read policy and
  authenticating researchers through Supabase Auth — is rejected, and `research-schema` explicitly
  forbids it: it requires that no key, foreign key, index, or default reference `auth.users` or
  `auth.uid()`.
- **No `MODIFIED` capability.** `data-access-boundary` is not changed either: an app-level
  authorization check performed in server-only code, ahead of a privileged read, is compatible with
  all three of its access paths and violates none of its requirements.

### The entry gate

No implementation in this change may be merged until a real Supabase project exists and the
boundary has been exercised against it. Concretely, before the Apply merges:

- the admin boundary is reachable in a running application against real credentials, and a request
  without a session is refused by the real server rather than by a stub;
- a request with a valid operator session reads through the real PostgREST surface, which is the
  first time in this project's history that `.in()`, `.range()`, `.neq()`, and `.eq()` are observed
  on the wire rather than asserted against a recording fake;
- Row Level Security is confirmed as enforced by the Supabase API gateway rather than by the
  database engine, which PGlite cannot reproduce.

Until then the honest position is that this change's authorization is **implemented and unit-tested,
and never exercised against a real authorization boundary.**

## Capabilities

### New Capabilities

- `researcher-admin-access`: How a member of the research team is recognized as such, how that
  recognition is established server-side and carried as an opaque session, how admin routes refuse
  an unverified request, and the entry gate that must be satisfied before any of it is trusted.

### Modified Capabilities

None. `research-schema` and `data-access-boundary` are read as constraints this change must
satisfy, not as capabilities whose requirements change; the reasoning for leaving both untouched
is recorded above and in `design.md`.

## Impact

- **New, server-only:** an admin environment contract, a session signer/verifier, a login and
  logout boundary, and an admin session read used by the route guard.
- **New, client-facing:** an admin sign-in surface and the guarded route group it protects. The
  public validator experience under `/`, `/start`, `/ready`, and `/validate/**` is untouched.
- **Modified:** `.env.example` (two new documented variables and the corrected variable count).
- **Not touched:** `data/ilocano-synthetic-data.json`, every table under `supabase/migrations/`, and
  every existing capability in `openspec/specs/`.
- **New deployment obligation:** two secrets that must be set in whatever environment serves the
  app. An environment missing them must degrade to "the admin area refuses every request", never to
  "the admin area is open", and never to a failure that takes the public validator experience down
  with it.