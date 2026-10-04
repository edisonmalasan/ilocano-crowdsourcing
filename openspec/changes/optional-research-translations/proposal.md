# Proposal

## Why

Validators currently must supply both an English and a Filipino translation for every evaluable
response, with no skip option. Owner decision: translation effort is the main reason careful
validators abandon entries, so each response SHALL offer a per-response language choice — English,
Filipino, both, or skip — while entry completion stays pooled and strict: an entry leaves the
assignable pool only when it holds at least one evaluable validation, at least one non-blank
English translation, and at least one non-blank Filipino translation, from any combination of
responses.

## What Changes

- **Per-response translation choice.** After evaluation (and any required correction), the
  validator chooses English, Filipino, both, or skip. Evaluation and required corrections stay
  mandatory; `cannot_evaluate` still carries neither translation and never completes.
- **Pooled completion (BREAKING methodology change).** `entry-completion` no longer requires one
  response carrying the whole package. An entry is complete when its stored rows collectively hold
  an evaluable validation with any required correction present, plus a non-blank English
  translation, plus a non-blank Filipino translation — each possibly from a different response.
  Raw row counts still never decide anything.
- **Database constraints relax forward.** The two directional bilingual CHECKs (both-present for
  evaluable, both-absent for `cannot_evaluate`) are replaced by per-language allowance: each
  translation independently present-and-non-blank or absent; blank-when-present still rejected;
  `cannot_evaluate` still carries neither; correction-evaluation consistency unchanged. Widening
  is lossless — every existing row already satisfies the stricter rule — so no refusal
  precondition is needed.
- **Pooled export assembly.** The validated record derives per-field earliest-non-blank
  (validated Ilocano from the earliest evaluable response with any required correction;
  each translation from its earliest non-blank supplier), with `source_validation_id` pointing
  at the validated-Ilocano supplier. Any complete entry whose fields come from more than one
  response, or whose evaluable responses disagree on evaluation or correction, is flagged
  `needs_review`. The final adjudication rule belongs to the thesis team (Phase 12); the export
  assembles mechanically and flags, never resolves.
- **Dashboard and allocation follow the shared pooled rule.** No new figures; qualifying-count
  language becomes coverage language. Allocation eligibility, dashboard, and export keep the
  three-consumer agreement over the same corpus.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `validation-experience`: translation step becomes a language choice (English / Filipino /
  both / skip) instead of a required pair.
- `entry-completion`: single-package completion becomes pooled per-entry coverage.
- `domain-contracts`: per-response translation rule becomes a choice; the shared qualifying
  definition becomes pooled entry coverage.
- `research-schema`: directional bilingual CHECKs relax to per-language allowance via a new
  forward migration.
- `research-export`: validated-record derivation becomes per-field earliest-non-blank assembly
  with multi-source `needs_review`.
- `researcher-dashboard`: coverage figures become pooled entry coverage.
- `batch-allocation`: eligibility scenarios restated in pooled terms (rule still defers to
  `entry-completion`).
- `consistency-guards`: three-consumer agreement restated over pooled coverage.

## Impact

- One forward migration (constraint replacement, no data change, PGlite-proven). No table,
  column, index, RLS, RPC, or repository-shape change.
- UI: translation step gains a choice control; per-language inputs render conditionally; skip
  submits evaluation (+correction) with neither translation. Server re-parses with the same
  schema; the database refuses malformed rows independently.
- Deferred, deliberately: the final multi-source adjudication rule (thesis team, Phase 12);
  any change to the four evaluations, correction rules, or `cannot_evaluate` semantics.
