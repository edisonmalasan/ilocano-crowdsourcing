# Design

## Context

`next.config.ts` declares `headers()` with two sources: a global
`/:path*` five-header block and `/researcher/:path*` cache/robots block.
Next.js applies every matching block and merges header lists, so adding
one header to the global block composes with the researcher block rather
than replacing it. The app surface (mapped on `main`):

- Routes: `/`, `/start`, `/ready`, `/validate`, `/validate/[batchId]`,
  `/researcher/sign-in`, `/researcher` (+ entries), 404, plus
  `POST /api/validation-responses` (same-origin JSON) and
  `GET /researcher/export` (zip attachment).
- Zero author inline scripts/styles: no `next/script`, no
  `dangerouslySetInnerHTML`, no `<script`/`<style`/`style=` in `src`;
  styling is Tailwind utilities plus one global stylesheet.
- Networking is same-origin only: the sole client `fetch()` posts to
  `/api/validation-responses`; all forms are same-origin Server Actions.
  The Supabase browser client is defined with zero callers; all
  repository calls run server-side behind `server-only`.
- Fonts self-hosted via `next/font/google`; no analytics, no image CDN,
  no frames/media embeds; one `data:` SVG grain in global CSS.

## Goals / Non-Goals

**Goals:** an enforced CSP on every response covering at minimum
`default-src`, `base-uri`, `object-src`, `frame-ancestors`,
`form-action`, and restricted `connect-src`; existing five headers and
researcher block untouched; a probe that fails on any dropped or
weakened directive; served-header evidence from a deployed URL, not just
a config read.

**Non-Goals:** per-request nonces/hashes (would require middleware or
per-response code touching every route — its own change if the program
demands dropping `'unsafe-inline'`); HSTS `preload`; new external
origins; any logging, fingerprinting, or anonymous-model change.

## Decisions

- **D1 — One static header in the existing global block.** Literal
  key/value pair beside the five existing headers. No middleware, no
  per-response code, same reasoning the file already records for
  refusing middleware.
- **D2 — Exactly this policy.** `default-src 'self'` as the closed
  default; `script-src 'self' 'unsafe-inline'` and `style-src 'self'
  'unsafe-inline'` because Next.js hydration/flight-data and Server
  Actions require inline execution despite zero author inline code;
  `img-src 'self' data:` for the CSS grain; `font-src 'self'` for
  self-hosted fonts; `connect-src 'self'` for same-origin fetch/actions;
  `form-action 'self'`; `frame-ancestors 'none'` (pairs with `DENY`);
  `base-uri 'self'`; `object-src 'none'`. No `unsafe-eval`, no `*`, no
  `https:` wildcards, no Supabase origin until a browser caller exists.
- **D3 — Probe the resolved config, not a copy.** The test imports the
  real `next.config.ts`, awaits `headers()`, and asserts: a `/:path*`
  entry exists with exactly six keys (five preserved byte-identical plus
  `Content-Security-Policy`), and the policy string contains each
  required directive with its exact source list. A dropped directive, an
  added wildcard/`unsafe-eval`, or a touched existing header all fail.
- **D4 — New capability, not an edit.** No in-force requirement names
  CSP, so the delta creates `content-security-policy` (requirements plus
  scenarios); Sync installs it and the count rises 26 → 27 at exactly
  the Sync merge and nowhere else.
- **D5 — Served headers are the evidence.** Apply observes the policy on
  a running server (`/` plus one researcher route) and on the preview
  deployment via read-only header reads; production is re-read after the
  Archive lands. Build success alone proves nothing about serving.
- **D6 — Regressions tighten the app, not loosen the policy.** If a
  legitimate flow violates the policy in testing, the fix lands in the
  flow or the documented directive list — not a silent wildcard.

## Risks / Trade-offs

- [`'unsafe-inline'` scope] → Permits any inline script/style the
  browser sees, which is broader than nonces. Accepted because the
  alternative (nonce plumbing) touches every route's rendering path and
  the current app has zero author inline code to isolate; recorded here
  so a future change can narrow it with evidence.
- [Header-merge assumption] → Same premise as Change 4: Next.js merges
  all matching sources. The probe asserts declaration; effective merge
  is observed on a running server at Apply.
- [Future browser Supabase caller] → `connect-src 'self'` will block it.
  The failure will be loud (console violation + probe-adjacent test
  naming the caller file), and adding the exact project origin is its
  own change.

## Migration Plan

No migration. Config-only change plus one test file; rollback is a
revert. The ledger and roadmap advance by the normal stage lifecycle.

## Open Questions

None.
