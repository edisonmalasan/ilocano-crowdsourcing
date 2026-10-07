# Design

## D1. Strengthen the mint, accept the past

New mints use 16 CSPRNG bytes rendered as 32 lowercase hex characters.
`VAL_` stays; the token grows from 8 to 32 hex. `BAT_` + 32 hex is a new,
independent mint: it is drawn from the CSPRNG at batch creation and is never
derived from, hashed from, or encoded from the validator ID, the timestamp,
entry IDs, or a counter. Concealment of the old shape (Base64, URL-encoding,
hashing the validator ID into the batch ID) is explicitly rejected: the new
batch ID is a fresh random value, not a disguised old one.

Validation accepts both the new 32-hex shape and the legacy 8-hex shape for
`VAL_`, because 35 live validators and 39 live batches use them (measured
2026-10-08). Minting produces only the new shape: the legacy shape is
accepted, never created. The database stays `text` PKs; if a forward
migration adds a CHECK it must accept both shapes and must preserve every
existing row. RNG unavailability throws (fail closed), as today.

## D2. Ownership is a server comparison, not a URL property

Opening a validation session takes `{ batchId, activeAttemptId }`. The server
loads the batch row, reads its stored `validator_id`, and compares it to the
supplied attempt with a constant-shape equality check. Match returns the
approved session projection (exactly what the route renders today, nothing
more). Anything else — unknown batch, malformed attempt, absent attempt,
owner mismatch, non-resumable batch where the distinction is unnecessary —
returns one generic `redirectHome` outcome. The participant-facing result is
identical across those cases: navigate to `/`, no sentence, no metadata, no
identity, no "belongs to someone else".

The browser supplies its active attempt from sessionStorage to a same-origin
server action/POST after rendering only a neutral shell. The Server Component
never sees sessionStorage and never renders sentence data before the gated
call resolves. No `VAL_` returns to the URL. Submission paths keep deriving
the owner from stored batch state; the supplied attempt is proof-of-session,
never an override of stored ownership.

## D3. Throttle the oracle without identifying the person

Enrollment, resume/ownership-check, allocation/start, and response submission
each get their own bucket (no single global counter). Buckets combine a
short-lived request-origin component (provider-controlled signal, hashed/HMAC
throttle key, bounded TTL, never persisted to research tables, never
exported) with a per-attempt component, at generous human thresholds that
tolerate campus Wi-Fi / NAT / shared households. Throttle refusal is a typed
generic outcome: no write, no batch, no existence signal, no successful-write
masquerade. `Cannot confidently evaluate` bursts stay usable: thresholds are
set from measured human-scale 5-entry-batch behavior, not from the 1.5s UI
skeleton (bots call endpoints directly).

Only `resume` and `session_open` buckets ship in this change (the two existence-oracle paths this change gates). Enrollment mints fresh identifiers (no oracle to throttle); allocation/start and response submission buckets are explicitly deferred to the planned abuse-controls follow-up (tasks.md 4.2), not silently dropped.

## Alternatives considered

- Hashing/encrypting the old `VAL_-timestamp` batch string: rejected — it
  preserves the coupling and invites reversal or key-management risk for zero
  benefit over a fresh random ID.
- Putting `VAL_` in the URL query for the ownership check: rejected — it
  re-exposes the identity the change removes and leaks it into history/logs.
- One global rate limit: rejected — a single counter couples unrelated
  actions and lets one noisy action starve the others; per-action buckets are
  standard.
- Deleting/rewriting legacy IDs to normalize: rejected — hosted research
  history (93 validations) must not be rewritten for cosmetic uniformity.

## Risks

- The ownership gate adds one client→server round trip on direct batch entry;
  mitigated by keeping the neutral shell layout-matched and the gated call
  minimal.
- Throttle keys derived from request origin must not become fingerprints:
  mitigated by short TTL, hashing, no persistence in research tables, no
  export, documented in the delta.
- Legacy acceptance widens the ID pattern: mitigated by pinning the mint to
  the new shape with tests that fail if the old shape is ever minted again.
