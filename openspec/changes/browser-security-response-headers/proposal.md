# Proposal

## Why

Every response the platform serves — public validation pages, the researcher
sign-in, the refused 403 — currently carries whatever headers the platform
defaults to. Measured this session against `main` (`94ff31b`) by evaluating
the config's own `headers()`: exactly one block exists,
`/researcher/:path*` with `Cache-Control` plus `X-Robots-Tag`, and **no**
global block. So no route sends `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Strict-Transport-Security`, or `Permissions-Policy`.
That leaves MIME-sniffing, clickjacking (framed validation pages answering
as the platform), referrer leakage on outbound navigation, protocol
downgrade, and silent access to camera/microphone/geolocation to the
browser's defaults — on an anonymous study platform where geolocation in
particular must never be collected.

This is Change 4 of the pre-Phase-11 guardrail program (Change 1 attempt
and batch capabilities, Change 2 public abuse controls, Change 3
cross-platform import gate — all archived; ledger at fifty changes).

## What Changes

- Declare a global `/:path*` headers block in `next.config.ts` sending:
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Strict-Transport-Security: max-age=63072000; includeSubDomains`, and
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- The existing `/researcher/:path*` block is untouched; Next.js merges all
  matching sources, so researcher routes carry both sets.
- Add a config-level probe test driving the real `next.config.ts`
  `headers()`: the global block exists with exactly the five headers at the
  declared values, and the researcher block is byte-preserved.
- One new capability, `browser-security-headers`, with one requirement and
  its scenarios; capability count 24 → 25 at Sync.
- No middleware, no `Content-Security-Policy`, no behavior change, no
  migration, no new dependency, no participant tracking, no
  anonymous-study-model change.

## Capabilities

### New Capabilities

- `browser-security-headers`: every served response carries the five
  browser-hardening headers at the declared values (new; zero MODIFIED).

### Modified Capabilities

(none)

## Impact

- `next.config.ts` (one added headers block; existing block byte-identical)
  and one new unit test file.
- Browser-visible: responses gain five hardening headers. No page, flow,
  researcher, export, schema, or methodology change. `X-Frame-Options: DENY`
  means the app cannot be framed — which is the intent, since no flow
  requires framing.
