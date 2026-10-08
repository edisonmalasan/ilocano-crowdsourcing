# Proposal

## Why

Change 1 (`attempt-and-batch-capability-hardening`, archived) throttled the two cheapest public
surfaces — resume checks and session opens, both read-only — but left the three public surfaces
that perform database **writes** completely unpaced: enrollment mints one validator row per call,
allocation runs one mutating RPC plus three reads per call, and response submission runs one
versioned RPC per entry. A script hitting any of the three can mint junk validator rows, burn
reservations, or flood the validations table at machine speed with no per-origin or per-actor
friction. This change extends the shipped dual-bucket throttle mechanism to those three surfaces
before production crowdsourcing.

## What Changes

- Add three throttle bucket pairs (`enroll`, `allocate`, `submit`) to the existing
  `public-throttle.ts` mechanism (origin-scoped plus actor-scoped buckets, 300s sliding window,
  SHA-256-hashed keys, no raw identifiers stored or logged).
- Pace enrollment: origin-only bucket (no attempt identity exists yet) checked after input parsing
  and before the validator row is created; refused enrollments create no row and reveal nothing.
- Pace batch allocation / start orchestration: origin plus attempt buckets checked before any
  database read; refused starts allocate nothing and keep every existing terminal outcome
  (`exhausted`, `screening_required`, honest errors) reachable and unchanged.
- Pace validation-response submission on the POST route: origin plus batch buckets checked after
  strict input parsing and before the submission RPC; refused saves run no RPC and return a typed
  throttled reason.
- No migration, no new dependency, no new logging of participant requests, no change to the
  anonymous-study model.

## Capabilities

### New Capabilities

(none — all behavior attaches to existing capabilities)

### Modified Capabilities

- `validator-onboarding`: ADDED requirement pacing public enrollment writes.
- `validation-start`: ADDED requirement pacing the start/allocation orchestration.
- `response-persistence`: ADDED requirement pacing background response submission.

## Impact

- `src/lib/validators/public-throttle.ts` (new buckets only; existing `resume`/`session_open`
  thresholds untouched), `onboarding-actions-core.ts` + `actions.ts` (enroll wiring),
  `start-validation` core + action (allocate wiring), `POST /api/validation-responses` route plus
  `submit-response-core.ts` (submit wiring).
- Participant-visible: only a new typed throttled outcome on each of the three surfaces (generic
  message, retry action where one can succeed). No copy, layout, export, schema, or methodology
  change.
