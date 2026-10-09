# Design

## Context

Failures surface today as returned `reason` strings handled at the
action seam; only throttled/ownership refusals and sign-in attempts
leave any durable trace. The architecture is serverless Next.js on
Vercel plus Supabase Postgres: there is no scheduler, no worker, and
no authorized notification integration (no webhook/SMTP/Slack env,
client, route, or table anywhere in `main`). Evaluation must therefore
be lazy (on increment), state must live in Postgres behind
service-role, and push delivery must be a generic optional webhook —
with the dashboard panel as the credential-free operator surface.

## Goals / Non-Goals

**Goals:** durable aggregate counters for all eight signals with
5-minute windows; digest-only dedupe so retries cannot mislead;
documented per-signal thresholds; once-per-window dispatch of
aggregate-only payloads; failure of the recorder never breaking a
research write; tests for accuracy, thresholds, dispatch failure, and
payload privacy.

**Non-Goals:** per-participant or per-origin alerting (aggregate only);
client fingerprinting; new per-origin blocks (existing throttles
unchanged); a managed alerting vendor (no credential exists to
configure one); backfilling history from old logs (logs carry no
counts to backfill from).

## Decisions

- **D1 — Two tables, both deny-all RLS.** `operational_events(id,
  signal, window_start, dedupe_key, created_at)` with a partial unique
  index on `(signal, window_start, dedupe_key)` where the key is not
  null (keyless events always insert; keyed events insert once, so a
  retried submission cannot inflate its signal); `operational_alerts
  (rule, window_start, dispatched_at)` recording one dispatch per
  breached window. Retention: rows older than 30 days are deleted by a
  best-effort statement on each recorder call, bounded to one indexed
  range delete.
- **D2 — Pure evaluation, fixed taxonomy.** Signals:
  `enroll_failed`, `resume_failed`, `allocation_failed`,
  `persistence_failed`, `retry_exhausted` (privacy-safe client beacon
  carrying only a random beacon id, throttled like other client
  traffic), `already_recorded_spike` (counted, with the spike defined
  by the threshold rather than by the event), `reservation_abandoned`
  (counted when the allocator skips an expired reservation and when
  release fails), `researcher_signin_failed` (integrates the existing
  durable counter). Windows are 5-minute buckets; thresholds are a
  documented table in the domain module (e.g. persistence failures ≥ 5
  per window, sign-in failures ≥ 10 per 15 min to match the existing
  limiter, already_recorded ≥ 20 per window). Breach evaluation is a
  pure function over counts.
- **D3 — Dedupe keys are digests, never identifiers.** Keys are
  truncated SHA-256 over (signal, batch/entry/request nonce) computed
  in cores, following the existing diagnostic-digest pattern; raw IPs,
  corrections, translations, sentence text, credentials, and attempt
  identifiers never reach the recorder, and the payload tests assert
  their absence by shape.
- **D4 — Lazy once-per-window dispatch.** After incrementing, the
  recorder reads the window count, evaluates the rule, and — only if
  breached and no dispatch row exists for (rule, window) — writes the
  dispatch row first, then POSTs `{rule, windowStart, count,
  threshold, evaluatedAt}` to `OPS_ALERT_WEBHOOK_URL` if configured.
  A failed POST keeps the dispatch row (no silent re-fire every
  request, no loss of the fact) and falls back to the console error;
  the next window re-evaluates independently. Unconfigured webhook
  means the dashboard panel is the alert surface, stated as such.
- **D5 — Recorder failure is invisible to research.** Every call site
  wraps recording so a recorder throw degrades to the pre-existing
  console error; the research response is already decided before
  recording runs. Call sites live in cores behind injected
  repositories, so unit tests drive them with fakes.
- **D6 — New capability, Sync order stated.** The delta creates
  `operational-monitoring`; Sync installs it with the count rising by
  exactly one at that merge. If the CSP Sync lands first the count
  moves 27 → 28, otherwise 26 → 27 — the Sync commit states which.

## Risks / Trade-offs

- [Lazy evaluation latency] → A breach is noticed on the next
  increment, not on a tick. Accepted: there is no scheduler, and
  increments arrive with the failures themselves.
- [Webhook unconfigured] → Push delivery is unproven until an operator
  sets one URL. The change reports this as unproven rather than
  papering it over; the dashboard panel is independently verifiable.
- [Write amplification] → One insert plus occasional indexed
  count/delete per failure. Failures are rare relative to traffic, and
  the hot validation path only records on failure, never on success.

## Migration Plan

One new migration file following the repo's migration conventions
(precondition guard, deny-all RLS, closed column checks in the
integration suite). No existing table is altered. Rollback is drop
tables plus revert.

## Open Questions

None — threshold values are documented defaults, tunable without code
changes only if moved to config later (deliberately not now, to keep
this change reviewable).
