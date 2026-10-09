-- Durable operational monitoring counters for the serverless deployment.
--
-- FORWARD MIGRATION. No existing table, column, function, or policy is modified. This file ADDS two
-- operational tables and their indexes. It changes no research table and no researcher table.
--
-- ---------------------------------------------------------------------------
-- WHY THESE TABLES EXIST AT ALL
-- ---------------------------------------------------------------------------
-- Operational failures surface today as returned `reason` strings plus a best-effort `console.error`.
-- A log line is invisible to the next serverless instance: an operator must tail logs, nothing
-- evaluates a rule, and nothing reaches anyone. The durable researcher sign-in counter proved the
-- pattern — a row the database owns survives across instances where a module-level counter does
-- not — and these two tables extend that pattern to the remaining failure signals. Counting is
-- therefore a row, read and incremented through the existing server-only privileged path.
--
-- Deliberately NOT research tables. They hold no research response, no dataset entry, no
-- validator, and nothing derived from a validator. They are created after the research tables,
-- reference none of them, and carry no foreign key into any of them. They are excluded from the
-- research export by construction.
--
-- ---------------------------------------------------------------------------
-- RETENTION
-- ---------------------------------------------------------------------------
-- Rows older than 30 days are deleted best-effort by the recorder on each call, bounded to one
-- indexed range delete. There is no scheduled job: this application is serverless, so there is no
-- worker to run one, and a cleanup statement piggybacked on the recorder is the only deletion
-- path. Stale rows are therefore bounded rather than absent.
--
-- ---------------------------------------------------------------------------
-- WHAT THE DEDUPE KEY HOLDS, AND WHAT IT NEVER HOLDS
-- ---------------------------------------------------------------------------
-- `dedupe_key` is a truncated SHA-256 digest over (signal, batch/entry/request nonce) material
-- supplied by the caller. It is never a raw IP, correction, translation, sentence text,
-- credential, or attempt identifier. A retried submission reuses its key, so the partial unique
-- index below makes the retry insert once rather than inflate the signal. Keyless events always
-- insert: a NULL key never conflicts, so heartbeat-style signals are counted, not deduped.

create table public.operational_events (
  id           bigint       generated always as identity primary key,
  signal       text         not null,
  window_start timestamptz  not null,
  dedupe_key   text,
  created_at   timestamptz  not null default now(),

  constraint operational_events_signal_check
    check (signal in (
      'enroll_failed',
      'resume_failed',
      'allocation_failed',
      'persistence_failed',
      'retry_exhausted',
      'already_recorded_spike',
      'reservation_abandoned',
      'researcher_signin_failed'
    ))
);

comment on table public.operational_events is
  'Durable per-signal aggregate counter rows in fixed time windows. Operational, not research: holds no response, entry, validator, or identity data. Dedupe keys are truncated digests, never raw identifiers.';

-- Keyed events insert once per (signal, window, key); keyless events always insert because NULL
-- never equals NULL. The partial predicate is what makes that true: without it a unique index on
-- (signal, window_start, dedupe_key) would still allow only ONE keyless row per window.
create unique index operational_events_dedupe_idx
  on public.operational_events (signal, window_start, dedupe_key)
  where dedupe_key is not null;

-- The recorder's window count reads exactly this prefix: all rows for one signal in one window.
create index operational_events_signal_window_idx
  on public.operational_events (signal, window_start);

-- Row Level Security, exactly as the research tables have it: enabled, with NO policy granting
-- anything to `anon` or `authenticated`. Enabling RLS on a new table is not a change to an
-- existing policy, and the deny-all posture this project depends on does not get a hole here.
alter table public.operational_events enable row level security;

-- ---------------------------------------------------------------------------
-- operational_alerts
-- ---------------------------------------------------------------------------
-- One dispatch row per breached (rule, window). Written BEFORE the webhook POST fires, so a
-- failed POST keeps the row (no silent re-fire on every subsequent request) and the next window
-- re-evaluates independently. `event_count` and `threshold` are the aggregate the dispatch
-- carried — rule name, window, count, threshold, timestamp — and nothing else.

create table public.operational_alerts (
  id           bigint       generated always as identity primary key,
  rule         text         not null,
  window_start timestamptz  not null,
  event_count  integer      not null,
  threshold    integer      not null,
  dispatched_at timestamptz not null default now(),

  constraint operational_alerts_rule_check
    check (rule in (
      'enroll_failed',
      'resume_failed',
      'allocation_failed',
      'persistence_failed',
      'retry_exhausted',
      'already_recorded_spike',
      'reservation_abandoned',
      'researcher_signin_failed'
    )),

  constraint operational_alerts_rule_window_unique
    unique (rule, window_start),

  constraint operational_alerts_count_not_negative
    check (event_count >= 0),

  constraint operational_alerts_threshold_positive
    check (threshold > 0)
);

comment on table public.operational_alerts is
  'Once-per-window dispatch record for breached operational rules. Aggregate only: rule name, window, count, threshold, timestamp.';

alter table public.operational_alerts enable row level security;

-- The table's own privileges are NOT granted here, and deliberately so. The research migrations
-- grant nothing either: Supabase provisions table privileges in `public` for its API roles, and
-- this project's own integration harness reproduces those grants after migrations run.
-- Re-granting them here would make the migration depend on which environment applies it.
