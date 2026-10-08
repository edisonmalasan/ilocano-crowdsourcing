# Design

## Context

The sign-in path already solved this problem once
(`signin-refusal-diagnostics`, archived): a pure `formatSignInDiagnostic`
in the core, an injected `log` sink, one namespaced `console.info` line
per outcome at the shell, outward refusal byte-identical. The public
paths never got the same treatment — Change 2 deliberately shipped
"no participant request logging", and nothing since has revisited that.
The `verify-batch-actions.ts:25` line is the closest public-adjacent
precedent: verdict plus duration, never entry/validator ids or response
text. This change extends that shape to the seven probing-indicative
refusals and to the CSV serializer both export documents share.

## Goals / Non-Goals

**Goals:** every throttled refusal and every failed
ownership/capability check on the public surface emits one
privacy-safe server line; every exported CSV cell is spreadsheet-safe;
both halves carry probes that fail if a site goes silent or a
dangerous cell passes through bare; no anonymous-study-model change.

**Non-Goals:** durable abuse counters (that would put request-origin
data in the research database, which the spec forbids — the throttle's
memory-only standing is unchanged); raw-IP logging; success or routine
state-outcome logging (that would build a participant census in the
logs); JSON export changes (JSON has no formula evaluation); a second
CSV dialect for spreadsheets (one safe document beats two that can
drift); any fingerprinting, tracker, CAPTCHA, or geolocation
collection.

## Decisions

- **D1 — Log the refusal, never the person.** Each line carries
  `action`, `reason`, and truncated SHA-256 digests (`hex.slice(0, 16)`)
  of the origin key and — where the action has an actor bucket — of the
  raw actor value. The raw header value and the raw `VAL_`/`BAT_`
  identifier never reach the log; neither does response content,
  proficiency, or any credential. Digests are computed in the cores
  from values they already hold, so the raw values never reach the log
  line; the shells supply only the `console.info` sink, and the throttle's
  "raw values never reach the table" standing is untouched.
- **D2 — Exactly these seven sites.** The five `throttled` refusals
  (enroll, allocate, submit, resume-as-`absent`,
  session_open-as-`redirectHome`) plus the session ownership mismatch
  and the submit unknown-batch capability. Reads stay silent (a stale
  batch URL is routine navigation, not probing); successes stay silent
  (logging them would census participants); routine state outcomes
  (`invalid`, `screening_required`, `not_in_batch`, `already_recorded`)
  stay silent. The rule is "pacing refusals and failed authorization
  checks", and anything else logging is a defect, pinned by a test
  enumerating the seven.
- **D3 — Sign-in shape, not a second dialect.** Pure
  `formatPublicSecurityDiagnostic(event)` in a dependency-free module
  (same standing as `public-throttle.ts`: `node:crypto`, no
  `server-only`, directly unit-testable); cores take an optional `log`
  sink defaulting to silence so recording-fake suites keep working;
  shells pass `(line) => console.info('[sadino:abuse] ' + line)`.
  Outward messages keep their exact catalog keys — a changed refusal
  string fails the suite.
- **D4 — Single-quote prefix, at the one choke point.** `csvField`
  prefixes `'` when the first character is `=`, `+`, `-`, `@`, tab, or
  CR (the OWASP CSV-injection set). Both CSV documents inherit it
  through `csvRow`/`buildCsv`; headers (which never start dangerous)
  and JSON are untouched. The round-trip test is re-aimed at safe
  encoding rather than byte identity, and a dedicated test asserts each
  dangerous leading character is neutralized while normal text —
  including commas, quotes, and newlines — is byte-identical.
- **D5 — New capability, not an edit.** No in-force requirement names
  public-refusal logging or CSV formula safety, so there is nothing
  truthful to attach an ADDED scenario to. The delta creates
  `privacy-safe-security-observability` (two requirements, five
  scenarios); Sync installs it and the count rises 25 → 26 at exactly
  the Sync merge and nowhere else.
- **D6 — Record the program cursor at Apply.** The roadmap's
  `Next eligible objective` row names this guardrail as forthcoming;
  landing the Apply without advancing that row would leave a
  prescription for work already done. One measured sentence, no rule
  change.

## Risks / Trade-offs

- [Digests are correlatable by log-holders] → A truncated digest still
  links a burst within one log, which is the entire point (abuse
  monitoring needs correlation), and low-entropy origin inputs are
  brute-forceable by anyone holding the log. Stated, not hidden:
  operator logs are a trusted surface — the same standing as the
  sign-in precedent, which logs the RAW coarse origin — and the
  platform layer logs network facts regardless. What this change
  guarantees is that OUR lines add no raw identifier, no content, and
  no proficiency beyond what the platform already records.
- [The `'` prefix alters cell text] → A programmatic consumer sees
  `'=1+1` where the validator wrote `=1+1`. Measured impact on current
  data: zero of 4,800 source records start dangerous, so nothing real
  changes today; the strip rule (one leading `'` before a dangerous
  character is the guard, not the data) is documented in the export
  derivation for the consumer who parses. Excel consumes the quote as
  a text marker and displays the value unchanged, which is the surface
  researchers actually open.
- [Seven sites, not every refusal] → A future prober signal outside
  the seven stays silent. The enumeration test names the seven, so a
  new refusal site that SHOULD log fails loudly only if someone adds
  it to the enumeration — the list is a deliberate line, not an
  exhaustive claim.

## Migration Plan

No migration. Log lines plus one serializer rule plus tests; rollback
is a revert. The ledger and roadmap advance by the normal stage
lifecycle.

## Open Questions

None.
