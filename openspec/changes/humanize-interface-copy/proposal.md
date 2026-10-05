# Proposal

## Why

The interface reads like it was generated, not written: failure strings repeat
the same three clauses in every combination ("Nothing was saved… You can try
again in a moment"), several screens open with the same "Nothing…" rhythm, and
the researcher dashboard labels are serviceable but flat. Participants do
repeated 10-item batches; copy that sounds templated makes the instrument feel
unfinished, which is a data-quality risk dressed as a style preference.

## What Changes

- Rewrite pass over the public catalog (`ENGLISH_COPY` + `FILIPINO_COPY`):
  stiff and formulaic wording becomes plain human wording, with variety
  between screens instead of the same clause everywhere.
- Same pass over the researcher dashboard and entry-review hardcoded strings
  (English-only by design; that does not change).
- Key sets byte-identical in both catalogs; no key added, none removed.
- Meanings identical pair-wise; sentence counts per key unchanged where tests
  pin them (`validate.finished.*` parity); recognition-vocabulary membership
  unchanged per key; no new ENCOURAGEMENT/COVERAGE/reversal-pattern matches.
- Untouched, explicitly: dataset instructions, corrections, research
  translations, place names, identifiers, machine values, screening
  question/choices, evaluation labels, translation field labels, refusal
  messages, continue labels, figure labels. The research-material path stays
  unwired from the catalog, as asserted by the existing boundary tests.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `interface-localization`: one ADDED requirement — interface copy reads
  naturally in both languages (key sets, guards, and research-data separation
  unchanged).

## Impact

- `src/lib/i18n/copy.ts` (values only, both catalogs), researcher dashboard +
  entry-review strings, pinned test expectations where wording pins move.
- No migration, no dependency, no route, no schema change.
- All copy guards must stay green: key parity (type-level), no-empty,
  no-English-fallback, research-material bilateral guard, encouragement and
  coverage zero-collision lists, recognition closed set (23), sentence-count
  parity, continuation pins.
