# Proposal

## Why

The deployed participant experience costs five user actions before the first
validation sentence (Start validation → select proficiency → Continue → Start
validating → Give me my sentences) across four routes (`/` → `/start` →
`/ready` → `/validate` → `/validate/[batchId]`), with double header chrome,
three adjacent "what happens" explanations on `/ready`, a large
"Already started?" card for a session-convenience feature, and a decline path
the thesis methodology now rejects. The screenshots show the clutter; the
route map was measured on `main`, not assumed.

This change collapses the normal path to two user actions (select proficiency
→ Continue) ending at the first sentence, with enrollment and batch
allocation happening automatically through the existing server actions. It is
a simplification, not a reskin: every removed sentence is classified below as
obsolete presentation (A), preserved-but-simpler (B), or superseded
methodology (C).

## What Changes

- **Proficiency required (C).** The skip/decline path is removed from UI,
  intake, and spec. A submission without exactly one approved choice is
  `invalid`. Stored shape stays nullable for legacy rows; no value is
  fabricated for existing `NULL` rows and no retroactive `NOT NULL` is added.
- **`/ready` leaves the normal flow (A).** After Continue, enrollment
  resolves straight into the auto-orchestration screen. `/ready` remains as a
  backwards-compatible fallback for direct visits and bookmarks (its
  not-started card already serves them honestly); it is not deleted.
- **`/validate` becomes auto-orchestration (A).** The manual "Give me my
  sentences" press and the separate resume card are replaced by one effect:
  recovery lookup first (resume interrupted batch at its first gap when one
  exists), otherwise allocate, then navigate. Same `{validatorId}`-only
  intents, same atomic reservation semantics, same bounded collapse to
  `exhausted`. No new server action; no browser-trusted values.
- **One header (A).** The root-layout language bar becomes the single public
  bar (`Sadino` + `ENG | FIL`); per-page `<header>`s, step eyebrows, and the
  dataset/recruit badges are removed. Switcher guarantees unchanged.
- **Minimal resume (B).** The landing CTA becomes "Continue validation" when
  the browser holds an attempt in this session (press-time read, server
  re-check authoritative); the auto-flow resumes interrupted batches without
  a second card. `sessionStorage` semantics, no-person language, and
  Finish-retires-attempt are untouched.
- **Privacy kept concise (B).** The pre-enrollment notice compresses to three
  bilingual sentences (voluntary + stop anytime + nothing saved until
  Continue; no name/email/ID collected, no account; anonymous session-scoped
  code, clearing data ends recognition) on the screening screen above
  Continue. No ethics-relevant proposition is dropped.
- **`Sentence N of M` stays.** Useful batch progress is not onboarding chrome.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `validator-onboarding`: REMOVED/ADDED pairs — required proficiency (was:
  decline permitted), single-flight over one affordance (was: two), exit
  retargeted to auto-orchestration (was: `/ready`). Privacy notice, identity
  minting, storage lifetime, resume-without-overwrite, and honest-failure
  requirements unchanged.
- `batch-routing`: REMOVED/ADDED pair — the auto-orchestrator joins the
  producer enumeration as the fifth producer (was: four). Round-trip and
  refusal requirements unchanged.
- `batch-recovery`: REMOVED/ADDED pair — the additive rule restated for the
  auto path (was: persistent manual start control). Recognition, offer
  shape, resume-writes-nothing, and identifier-keyed lookup unchanged.

## Impact

- No migration. No reservation, allocation-semantics, or export change.
- `src/` changes confined to participant surfaces: layout header, landing,
  screening form, `/validate` island, copy catalog (both languages —
  `locale-copy` parity enforced by type-check), `/ready` skip-clause copy.
- `validatorProfileSchema.ilocanoProficiency` stays nullable (legacy reads);
  only the enrollment **intake** becomes non-nullable.
- Deferred: visual redesign beyond simplification; `/ready` deletion (kept as
  fallback); cross-session identity (forbidden, not deferred).
