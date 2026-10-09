# Proposal

## Why

The platform serves an enforced five-header browser-hardening set
(`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, HSTS,
`Permissions-Policy`) from a static `/:path*` block in `next.config.ts`,
but serves **no `Content-Security-Policy` on any route**. Measured on
`main` (`43fd184`): `next.config.ts` declares no `Content-Security-Policy`
or `Report-Only` header, and a live read of
`https://sadino-web.vercel.app/` returns the five headers with no `CSP`
present. Without a policy, a stored or injected script, object embed, or
framed ancestor runs at the browser's default permission — on an
anonymous study platform that must never collect location or run
unreviewed third-party code.

This is a dedicated follow-up to archived Change 4
(`browser-security-response-headers`), whose design explicitly deferred
CSP as "a second change if the program requires it". The program now
requires it.

## What Changes

- Declare an enforced `Content-Security-Policy` in the existing global
  `/:path*` headers block in `next.config.ts`, preserving the five
  existing headers byte-identical:
  `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self'
  'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src
  'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self';
  object-src 'none'`.
- `'unsafe-inline'` for scripts and styles is the framework's requirement,
  not author code: the app ships zero author inline scripts, zero
  `dangerouslySetInnerHTML`, zero `next/script`, and Tailwind-compiled
  same-origin CSS, but Next.js App Router injects hydration/flight-data
  inline payloads and the app uses Server Actions plus `use client`
  islands. No `unsafe-eval`, no wildcards, no external origins.
- `connect-src 'self'` covers the single client-initiated fetch
  (`POST /api/validation-responses`) plus Server Actions; the Supabase
  browser client exists but has zero callers, so no `*.supabase.co` entry
  is declared until a caller exists. `img-src data:` covers one inline
  SVG grain in global CSS; fonts are `next/font`-self-hosted.
- Add a resolved-config probe suite driving the real `next.config.ts`
  `headers()`: the global block carries all six header keys with the CSP
  containing every required directive, and the researcher block is
  byte-preserved.
- One new capability, `content-security-policy`, with requirements and
  scenarios; capability count 26 → 27 at Sync.
- Verify the production build, public routes, researcher sign-in, and
  browser console for CSP violations; fix regressions rather than
  weakening the policy. Verify actual served headers from the preview
  deployment and, after merge, from production. A config file plus a
  green build is not the evidence; served headers are.
- No middleware, no nonce plumbing, no HSTS-preload change, no new
  dependency, no participant tracking, no anonymous-study-model change.

## Capabilities

### New Capabilities

- `content-security-policy`: every served response carries the enforced
  policy covering at minimum `default-src`, `base-uri`, `object-src`,
  `frame-ancestors`, `form-action`, and restricted `connect-src`
  (new; zero MODIFIED).

### Modified Capabilities

(none)

## Impact

- `next.config.ts` (one added header in the global block; five existing
  headers and the researcher block byte-identical) and one new unit test
  file.
- Browser-visible: responses gain an enforced CSP. No page, flow,
  researcher, export, schema, or methodology change. `frame-ancestors
  'none'` matches the existing `X-Frame-Options: DENY` intent.
