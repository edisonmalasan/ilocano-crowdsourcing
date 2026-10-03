# Design

## Context

See `proposal.md` — Why. The mechanism is deletion plus one new client-side
sequencing effect; the subtlety is entirely in what must not change while the
surfaces around it shrink.

## Goals / Non-Goals

**Goals**

- Two user actions to the first sentence on the normal path, with every
  removed element classified A (obsolete presentation), B (kept, simpler), or
  C (superseded methodology).
- Required proficiency enforced at intake, nullable storage preserved for
  legacy rows.
- Auto-orchestration reusing the existing actions with identical intents and
  guarantees — no new trust boundary, no new server action.

**Non-Goals**

- Changing allocation, reservation, completion, export, dashboard, or admin
  behavior.
- Deleting `/ready` (kept as fallback) or inventing cross-session identity.
- Any visual redesign beyond simplification; soft neo-brutalism stays.

## Decisions

### D1 — Tighten intake, never the stored shape

**Chosen:** `enrollmentIntentSchema` and `EnrollmentRequest` become
non-nullable; `validatorProfileSchema.ilocanoProficiency` and the DB column
stay nullable.

**Why.** The methodology correction governs what may be *submitted* from now
on, not what old rows hold. A non-nullable stored shape would either lie
about legacy rows or demand a data migration the thesis team did not approve.
`undefined`/missing and explicit `null` are both `invalid` going forward;
the `invalid` failure path (field-attached message) already exists.

### D2 — Auto-orchestration sequences existing actions, adds none

**Chosen:** `/validate` runs recovery lookup, then allocation, then a single
navigation — calling `requestInterruptedBatchAction` and `requestBatchAction`
with the same `{validatorId}`-only intents the manual buttons send today.

**Why.** A combined enroll-and-allocate server action would be a new
authority surface to specify, test, and harden. Sequential reuse keeps the
reservation atomicity (it lives in the claim RPC, not the button), the
bounded collapse to `exhausted`, and the additive failure rule (lookup
failure falls through to allocate; allocate failure renders retry +
resume-when-known). Exactly-once issuance is guarded by the existing
single-flight latch pattern; StrictMode double-mount must not double-allocate
(tested).

### D3 — `/ready` stays as a fallback, leaves the flow

**Chosen:** normal flow never navigates to `/ready`; the route keeps serving
direct visits with its honest not-started card.

**Why.** Deleting it turns bookmarked/direct visits into a dead end the
`absent` state describes worse. Keeping it costs one retained file and its
tests; the skip-clause copy is still edited (decline no longer exists).

### D4 — CTA relabel, not a second link

**Chosen:** the landing primary CTA reads "Continue validation" when the
browser holds an attempt at press time, "Start validation" otherwise; press
resolves via the existing resume decision (recognised → `/validate` auto
screen; unrecognised/absent → `/start`).

**Why.** One obvious action (distill: interaction simplification). A separate
quiet link preserves the card's two-path confusion in smaller type. The
storage read stays at press time (never during render — hydration rule), and
the server re-check stays authoritative.

### D5 — Out-of-range and stale positions behave as today

**Chosen:** no change to `resolveSessionEntry`, the `position + 1` advance, or
the finished derivation.

**Why.** The short-batch work just pinned these; the simplification must not
disturb them. Auto-navigation lands on the batch address without a position,
which resolves to the first unanswered entry by the existing rule.

### D6 — Copy triage rule

**Chosen:** a sentence survives iff it is an instruction the participant
needs at this step, an error, privacy/ethics content, or validation
guidance. Headings never carry badge + eyebrow + lead + hint together; one
heading, one supporting line at most, one primary action per screen.

**Why.** "Distinguish genuinely necessary from decorative" is otherwise a
taste call. This rule makes each deletion reviewable: the proposal's
inventory names the classification per element.

## Risks / Trade-offs

- **[Auto effect double-fires.]** Mitigation: single-flight latch +
  StrictMode test asserting one allocation request per mount.
- **[A reviewer reproduces a path needing `/ready`.]** Mitigation: it still
  exists; nothing links there except bookmarks.
- **[Locale parity breaks on new keys.]** Mitigation: `locale-copy`
  type-check fails on half-localized catalogs; Apply adds EN+FIL together.
- **[Required-field error is unclear.]** Mitigation: reuse the field-attached
  `invalid` message path, asserted in DOM tests.

## Migration Plan

None. No migration file is added or modified.

## Open Questions

None — the two Explore forks (resume style, `/ready` fate) are decided in D3/D4.
