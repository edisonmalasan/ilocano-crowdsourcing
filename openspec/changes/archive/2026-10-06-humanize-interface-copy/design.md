# Design

## Context

See proposal.md - Why. The catalog holds 139 keys per language, measured off
the real file (stale comments in tests say otherwise; the count is not
asserted anywhere). Four guard families constrain every rewrite: zero-collision
vocabulary lists (ENCOURAGEMENT 28+16, COVERAGE_CLAIM), the 23-entry
recognition closed set, per-key sentence-count parity over
`validate.finished.*`, and exact-value pins (continue labels, figure-label
distinctness, retired-clause absence). Screening/evaluation/translation labels
are assigned from schema constants and are out of scope by construction.

## Goals / Non-Goals

**Goals:** plain human wording with varied rhythm across screens, identical
meanings, identical key sets, all guards green.

**Non-Goals:** new keys, new screens, tone change of approved methodology
strings, touching research data, visual redesign.

## Decisions

**D1: Rewrite values, never keys, never structure.**
Key renames would trip the type-level parity and the named key lists for no
benefit. Rhythm variety comes from the sentences themselves.

**D2: Keep the failure taxonomy exact.**
Each failure string names its reason and subject (notConfigured/invalid/
persistence × enroll/resume). Rewording must preserve which of the three
happened and what was/wasn't saved — that distinction is the reason the keys
are split.

**D3: Keep guard-loaded words out of new copy.**
No coverage/contribution/encouragement/recognition vocabulary may enter a
string that does not already carry it, and no string may lose the membership
it has. Verified by running the suite, not by eyeballing: the closed-set test
names any drift by key.

**D4: Filipino mirrors are rewritten, not translated word-for-word.**
Same meaning, same sentence count per key, natural Filipino — including
keeping deliberate asymmetries (e.g. endonym `Filipino`) where the current
catalog documents them.

**D5: Researcher strings stay English-only and factual.**
Humanize = shorter, warmer labels and empty states. Refusal and credential
strings are untouched: their wording is a security posture, not a style
choice.

## Risks / Trade-offs

- [Risk] A rewrite trips a zero-collision guard → Mitigation: run the full
  suite after rewriting; every guard names the offending key.
- [Risk] "Humanize" drifts into changing what a string promises → Mitigation:
  pair-wise meaning review against the old strings in the Apply diff; failure
  strings keep their reason/subject taxonomy.
- [Risk] 278 strings is a large diff to review → Mitigation: values only, one
  file for public copy plus the researcher files; no logic changes, so review
  is reading prose.

## Migration Plan

No migration. No hosted operation. The change ships as copy values; verification
is the existing suite (guards are the acceptance criteria) plus a read-through
of the final diff.
