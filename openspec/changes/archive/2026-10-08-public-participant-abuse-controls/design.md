# Design

## Context

Change 1 shipped `src/lib/validators/public-throttle.ts`: per-action dual buckets
(origin-scoped + actor-scoped), 300s sliding window, SHA-256-hashed key components, raw values
never stored/logged/exported, and a process-memory `Map` behind `sharedPublicThrottle`. Only
`resume` (origin 60 / attempt 30) and `session_open` (origin 300 / attempt 120) use it. See
proposal.md for why the three write surfaces come next. Existing terminal outcomes
(`exhausted`, `screening_required`, honest errors), the malformed-before-DB rule on both POST
and action paths, and the queue's transient/permanent retry classifier are constraints, not
material to reshape.

## Goals / Non-Goals

**Goals:** pace enrollment, allocation/start, and response submission with the shipped
mechanism; refused calls cost zero database work; legitimate human-speed flows never see a
refusal; throttled submission retries rather than parks.

**Non-Goals:** CAPTCHA or any interactive challenge; IP bans, blocklists, or durable
per-origin counters; cross-instance throttle state (no Redis, no new dependency); touching the
`resume`/`session_open` thresholds; new participant request logging; client single-flight
changes (already shipped).

## Decisions

- **D1 — Reuse the shipped throttle mechanism unchanged in shape.** New bucket entries only;
  no new store, no new key-derivation primitive, no new header handling. Alternative (per-table
  durable counters like researcher sign-in) rejected: participant pacing needs no durable
  audit trail, and a write per check would make the guard itself a write amplifier.
- **D2 — Bucket set and thresholds (per 300s window):**
  - `enroll`: origin 30, no actor bucket — no identity exists yet, so there is nothing to
    scope to. 30 admits a classroom behind one NAT enrolling over minutes while stopping a
    script minting hundreds of junk validator rows.
  - `allocate`: origin 60 + attempt 20 — mirrors the shipped `resume` 60/30 shape.
    Legitimate use is ~1 call per batch (minutes of answering); 20 per 5 minutes is generous.
  - `submit`: origin 300 + batch 30 — 5 saves per batch plus retries and
    already-recorded replays fit comfortably in 30; 300 admits a NAT classroom submitting
    concurrently while stopping a single-origin flood.
- **D3 — Check placement: after parse for enroll/submit, first for allocate.** Invalid
  enroll/submit payloads are refused by parsing before the check, so garbage cannot burn a
  shared origin budget (spec-pinned). Allocation follows the `resume` precedent: check first
  on the supplied identity, zero DB on refusal.
- **D4 — Submission is keyed on the client-supplied batch id, not a validator id.** The
  server derives the validator from stored batch state and never trusts a browser-supplied
  one, so there is no safe client validator key; the opaque 128-bit `BAT_` capability is
  hashed inside `check()` exactly like attempt ids. A 429-vs-unknown-batch distinction is not
  an oracle: batch ids are unguessable, so confirming a guessed id's existence is infeasible.
- **D5 — Refusal semantics per surface.** Enroll: typed throttled outcome, no row, generic
  message (same indistinguishability posture as resume). Allocate: typed throttled outcome
  with a retry path, never collapsed into `exhausted`/`screening_required`/honest-error.
  Submit: typed throttled reason classified **transient** in the queue (bounded backoff
  retry, payload retained), never permanent — misclassification would park legitimate saves,
  so a test pins the mapping.
- **D6 — No observability or anonymity change.** Refusals consume no budget on the refused
  call (shipped behavior), emit no participant-request log line, and hash every key
  component. The anonymous-study model is untouched.

## Risks / Trade-offs

- [Shared-NAT false positive] → Generous thresholds plus a retry path on every throttled
  outcome; a refused human retries once and succeeds.
- [Per-instance memory store] → On multi-instance deploys each instance paces independently,
  so the guard raises abuse cost rather than making abuse impossible. Carried over from
  Change 1 honestly rather than fixed here; fixing it needs shared state (see Non-Goals).
- [429 retry storm] → Queue backoff already bounds transient retries; throttled saves join
  that path instead of bypassing it.
- [Threshold tuning without production traffic] → Numbers are reasoned, not measured;
  recorded here so first production observation can adjust them in a follow-up change.

## Migration Plan

No migration. Code-only change behind existing seams; rollback is a revert. The ledger and
roadmap advance by the normal stage lifecycle.

## Open Questions

None — thresholds are the tunable, and D2 records them as reasoned-but-unmeasured so a
follow-up may adjust without a spec change.
