# Proposal

## Why

Two measured gaps stand between this platform and Phase 11 distribution,
and both are about what the OPERATOR can see — not what the participant
is told.

**Gap 1: the abuse controls refuse silently.** Change 2 paces `enroll`
(origin 30 per 300s), `allocate` (origin 60 + attempt 20), and `submit`
(origin 300 + batch 30), and Changes 1–2 pace `resume` and `session_open`
with ownership gates — but none of those refusals emits a server log
line. Measured on `main` (`521c9cc`): the five `throttled` return sites
(`onboarding-actions-core.ts:155`, `start-validation-core.ts:283`,
`submit-response-core.ts:122`, `onboarding-actions-core.ts:260` as
`absent`, `session-service.ts:183` as `redirectHome`), the session
ownership mismatch (`session-service.ts:191`), and the submit
unknown-batch capability (`validation-actions-core.ts:254`) all return
their refusal with NO `console.*` call on the path. The `logForOperator`
wrappers log only `not_configured` and pre-service failures. Phase 11
tasks the operator to "monitor error logs" and "monitor suspicious
duplicate behavior" — with no data source for either on the public
surface, those tasks are currently unperformable.

**Gap 2: the research CSVs are formula-live.** Measured by driving the
real `csvField`: `=1+1`, `+2+2`, `-3+3`, and `@SUM(A1:A2)` all pass
through BARE — a spreadsheet opens them as live formulas. Exported
cells carry validator-authored corrections and translations, so this is
a researcher-side code-execution vector, not a formatting preference.
Measured against all 4,800 merged source records: ZERO fields start
with a formula-dangerous character, so hardening changes no byte of
current data — it guards the validator text Phase 11 is about to
collect.

This is Change 5 of the pre-Phase-11 guardrail program (Changes 1–4
archived; ledger at fifty-one changes; Step 0 main protection verified
active). It is the last guardrail before the readiness report.

## What Changes

- Seven refusal sites emit exactly one server log line each, in the
  `signin-refusal-diagnostics` shape: a pure formatter in the cores via
  an injected `log` sink, namespaced `console.info` at the shells. Each
  line carries action + internal reason + truncated SHA-256 digests of
  the origin (and actor where one exists). It NEVER carries a raw
  header value, a raw attempt/batch identifier, response content,
  proficiency, a credential, or anything countable as a person.
- `csvField` single-quote-prefixes cells starting with `=`, `+`, `-`,
  `@`, tab, or CR. Both CSV documents share the rule through the one
  choke point; header rows and JSON exports are untouched.
- Outward behavior is byte-identical: refusal messages, catalog keys,
  CSV headers, and JSON exports do not change.
- One new capability, `privacy-safe-security-observability`, with two
  requirements and their scenarios; capability count 25 → 26 at Sync.
- No migration, no new dependency, no durable counter, no raw-IP
  logging, no success logging, no tracker, no CAPTCHA, no fingerprint,
  no geolocation, no anonymous-study-model change.

## Capabilities

### New Capabilities

- `privacy-safe-security-observability`: public security refusals are
  server-observable without identifying anyone, and exported CSV cells
  are spreadsheet-safe (new; zero MODIFIED).

### Modified Capabilities

(none)

## Impact

- Seven log call sites across five core/shell pairs, one pure
  diagnostic module, one hardened CSV serializer, and probe tests for
  both halves.
- Operator-visible: security refusals appear in server logs with
  correlatable digests. Researcher-visible: dangerous CSV cells gain a
  leading `'`. Participant-visible: nothing — every refusal message
  and every screen is unchanged.
