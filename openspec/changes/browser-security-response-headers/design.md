# Design

## Context

`next.config.ts` declares `headers()` with a single source,
`/researcher/:path*`. Next.js applies **every** block whose `source`
matches the request path and merges their header lists, so adding a
`/:path*` block composes with the researcher block rather than replacing
it. The measured gap (see proposal.md) is that no block matches the public
routes at all.

## Goals / Non-Goals

**Goals:** every served response carries the five hardening headers at
fixed values; the researcher block keeps its exact keys and values; the
declaration carries a probe that fails if a header is dropped or altered;
no anonymous-study-model change.

**Non-Goals:** `Content-Security-Policy` (inline-script hashes or a nonce
per response would touch every route's rendering path — a second change if
the program requires it, not a drive-by here); `X-Frame-Options` values
other than `DENY`; HSTS `preload` (declaring it claims a submission that
has not happened); new participant request logging; any fingerprinting,
tracker, CAPTCHA, or geolocation collection.

## Decisions

- **D1 — Declare, don't compute.** A static `/:path*` block with literal
  key/value pairs. No middleware, no per-response code, no second place to
  get the researcher-area decision wrong (the same reasoning `next.config.ts`
  already records for refusing middleware in D6's area).
- **D2 — Exactly these five headers.** `nosniff` (script/style MIME
  confusion), `DENY` (framing — no flow embeds or is embedded),
  `strict-origin-when-cross-origin` (least referrer compatible with normal
  navigation; never a full URL cross-origin), HSTS two years plus
  subdomains (production is HTTPS-only on Vercel), and a permissions policy
  that switches off camera, microphone, and geolocation — the last being
  the one the anonymous model cares about, since location must never be
  collected.
- **D3 — Probe the resolved config, not a copy.** The test imports the real
  `next.config.ts`, awaits `headers()`, and asserts: a `/:path*` entry
  exists carrying exactly the five pairs at the declared values, and the
  `/researcher/:path*` entry still carries exactly `Cache-Control` plus
  `X-Robots-Tag` at their values. A dropped header, an altered value, or a
  touched researcher block all fail. The probe states the premise it rests
  on: Next.js merges all matching sources, so both blocks reach a
  researcher response.
- **D4 — New capability, not an edit.** No in-force requirement names
  response headers, so there is nothing truthful to attach an ADDED scenario
  to. The delta creates `browser-security-headers` (one requirement, two
  scenarios); Sync installs it and the count rises 24 → 25 at exactly the
  Sync merge and nowhere else.
- **D5 — Record the program cursor at Apply.** The roadmap's
  `Next eligible objective` row names this guardrail as forthcoming;
  landing the Apply without advancing that row would leave a prescription
  for work already done. One measured sentence, no rule change.

## Risks / Trade-offs

- [Header-merge assumption] → If a future Next.js version stops merging
  all matching sources, the researcher routes could lose one set. The probe
  asserts both blocks are DECLARED; effective merge is observed once on
  local dev at Apply (`GET /researcher/sign-in` shows both sets) and
  recorded — a runtime observation, not a test, because no harness here
  runs a real server.
- [DENY vs SAMEORIGIN] → `DENY` breaks any future flow that frames the
  app. No current flow does, and a framed validation page answering as the
  platform is exactly the attack, so `DENY` is the correct strictness today;
  relaxing it later is its own change.

## Migration Plan

No migration. Config-only change plus one test file; rollback is a revert.
The ledger and roadmap advance by the normal stage lifecycle.

## Open Questions

None.
