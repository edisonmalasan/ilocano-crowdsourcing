# Production Deployment Checklist

Owner-executed. The agent prepares; the owner runs Vercel auth and owns the project. Prepared
2026-10-03 for Phase 11 (production crowdsourcing). Nothing here is automated — every step names
its human action.

## 0. Preconditions (all must hold before deploying)

- [ ] `attempt-scoped-allocation` archived (in flight as this checklist is written).
- [ ] Real-flow regression verification complete, with the production test-data strategy applied
  (owner decision: run against the live project).
- [ ] `entry-reservation-leases` migration applied to the hosted project through the Management
  API, one request per file, verified by re-reading `pg_class` — never by pasting into the SQL
  Editor (single-transaction rollback reports success while applying nothing).

## 1. Vercel project

- [ ] Import `edisonmalasan/ilocano-crowdsourcing` into Vercel (owner auth — agent has none).
- [ ] Node.js runtime satisfies `engines.node: ">=24 <27"`; package manager pnpm `12.6.0`
  (`pnpm-workspace.yaml` pins it; do not mix package managers).
- [ ] Build command is the repository default (`next build` via `pnpm run build`); no
  `vercel.json` exists in the repo and none is required unless the defaults prove wrong.

## 2. Environment variables (seven, in three groups — from `.env.example`, which is authoritative)

Browser-inlined (NOT secrets, but must be the live project's values):

- [ ] `NEXT_PUBLIC_SUPABASE_URL` = live project URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` = live publishable anon key

Server-only (never `NEXT_PUBLIC_*`, never in the bundle):

- [ ] `SUPABASE_URL` = same live project URL
- [ ] `SUPABASE_ANON_KEY` = same live publishable anon key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` = live service-role key — **bypasses RLS entirely**.
  The client-env validator refuses a service-role-shaped value in any `NEXT_PUBLIC_*`
  variable; a deploy that mixes these up fails loudly at boot, which is the intended direction.

Researcher access (server-only; generate fresh — never reuse sample text):

- [ ] `ADMIN_OPERATOR_SECRETS` = comma-separated operator credentials, one per person
  (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`)
- [ ] `ADMIN_SESSION_SECRET` = a SEPARATE generated value, never equal to any operator entry

## 3. Post-deploy verification (in order)

- [ ] `GET /` returns 200; document title, skip link, and `main` landmark present.
- [ ] Researcher sign-in round-trips with one operator credential (then rotate it if typed
  anywhere observable — credentials are single-person and revokable by list edit, which
  invalidates all sessions).
- [ ] One allocation smoke pass through the public flow WITHOUT submitting (screening → batch
  render). No validation row should exist afterwards.
- [ ] `robots` decision recorded: the landing page currently serves `noindex`. Link
  distribution makes indexing unnecessary — keep `noindex` unless the thesis team wants
  discoverability, and record the choice here: ______________.

## 4. Phase 11 operations (recurring, owner-run)

- [ ] Distribute the validation link to the validator pool.
- [ ] Monitor coverage on `/researcher` (complete/incomplete, overlap + late-arrival
  diagnostics are the contention instruments for the reservation TTL).
- [ ] Monitor error logs; a spike in `already_recorded` means overlap the design did not predict.
- [ ] Periodically run the five-file export to a dated destination as backup
  (`pnpm run export:research -- <dir>`).
- [ ] Watch the `entry_reservations` table size: rows die on submit-release and lazy expiry, but
  a growing count of unexpired rows with no matching batches signals abandoned traffic worth
  understanding (tune `reservationTtlSeconds`, default 1800, from this observation).

## 5. Rollback

- [ ] Redeploy the previous Vercel deployment. No migration in the current sequence destroys
  data; reservations are ephemeral by definition. Never rewrite migration history to un-deploy.
