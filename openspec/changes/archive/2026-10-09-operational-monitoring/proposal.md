# Proposal

## Why

The platform's operational visibility is log lines only: seven
refusal-diagnostic sites plus one durable researcher sign-in counter,
and every other failure is a returned `reason` plus a best-effort
`console.error`. Measured on `main`: no durable counter exists for
enrollment failures, resume failures, allocation exhaustion, response
persistence failures, `already_recorded` spikes, or abandoned
reservations; no threshold is defined anywhere; no alert path exists
(no webhook, email, Slack, or paging client, env var, route, or table —
grep confirms). An operator must tail logs; nothing evaluates a rule
and nothing reaches anyone. The original monitoring requirements are
therefore unmet, and the archived observability change explicitly
promised only diagnostic logs, never counters or delivery.

## What Changes

- One migration creating `operational_events` (per-signal 5-minute
  bucket rows with an optional digest-only dedupe key and a partial
  unique index) and `operational_alerts` (once-per-window dispatch
  record per rule), both deny-all RLS service-role-only like every
  research table, with a documented retention bound.
- One pure domain module: the eight-signal taxonomy, 5-minute window
  bucketing, the documented threshold table, and breach evaluation over
  counts — no I/O, no identifiers, no content.
- One server-only recorder called from the existing failure points
  (enrollment/resume/allocation/submit/reservation-release paths plus
  the integrated sign-in counter): digest-only dedupe keys, never raw
  IPs, corrections, translations, sentence text, credentials, or
  attempt identifiers; recorder failure never breaks the research
  path (falls back to the existing console error).
- Lazy threshold evaluation on each increment (no scheduler exists on
  this serverless architecture): when a window breaches, one dispatch
  row is written and one generic HTTPS webhook POST carries ONLY the
  aggregate (rule name, window, count, threshold, timestamp) —
  configured by an optional `OPS_ALERT_WEBHOOK_URL` env var.
- The researcher dashboard gains an operational panel listing rule
  states (breached/clear with counts), which is the operator surface
  verifiable without external credentials.
- Exact remaining-configuration steps for push delivery are
  documented; implemented counters, configured rules, and proven
  deliveries are reported as three distinct statuses. No active
  alerting is claimed without a delivered alert as evidence.
- One new capability, `operational-monitoring`, with requirements and
  scenarios; capability count 27 → 28 at Sync (after the CSP Sync
  lands; ordering with it is by merge order and stated in tasks.md).

## Capabilities

### New Capabilities

- `operational-monitoring`: durable per-signal aggregate counters with
  defined windows, evaluated thresholds, privacy-safe payloads, and a
  real dispatch path (new; zero MODIFIED).

### Modified Capabilities

(none)

## Impact

- New migration (2 tables), one domain module, one server-only
  recorder plus call sites at existing failure points, one webhook
  dispatch module, one dashboard panel, new env template entry, unit
  plus integration suites.
- No research-schema change, no response-content change, no new
  participant tracking or fingerprinting, no service-role exposure to
  the browser, no shared-network penalty (limits are aggregate, never
  per-origin blocks beyond the existing throttles).
