# Proposal

## Why

Owner-measured on the deployed participant experience: the sentence screen's
endpoint block (intended origin, intended destination, travel mode) confuses
validators rather than guiding them, and the dataset entry identifier
(`OD_0474`) is research-internal information researchers alone should hold.
Same pass removes two more proven-clutter items: the landing "Before you
start" card (whose item 02 — "you will stop being offered sentences once
enough other people have checked them" — states the superseded
three-validator model as fact) and the per-entry saving note (the save-as-you-go
promise is already made where it acts).

Methodology note, recorded rather than hidden: hiding the intended endpoints
means "Incorrect" judgments rest on fluency and sensibleness rather than on
matching a stated intent. The thesis owner accepts that trade — endpoint
comparison was producing confusion, not signal — and the evaluation options
themselves are unchanged by this pass.

## What Changes

- **Entry card becomes sentence-only.** The participant-facing card shows the
  Ilocano sentence and nothing else of the entry: no origin, no destination,
  no travel mode, no dataset identifier. Researcher surfaces keep full data.
- **Spec amended by REMOVED/ADDED pair** on `validation-experience`: the
  present-one-entry requirement no longer shows endpoints or identifiers.
- **Landing before-card deleted** (card, keys, tests, enumeration entry);
  its voluntary-participation proposition already lives, verbatim, in the
  screening notice where the ethics rule requires it.
- **Saving note deleted** from the per-entry form (keys retired); the
  immediate-persistence behavior is unchanged, only the repeated sentence.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `validation-experience`: REMOVED/ADDED pair — sentence-only presentation
  (was: sentence plus intended endpoints). Progress, single-entry, neutrality,
  correction, translation, and persistence requirements unchanged.

## Impact

- `src/` changes confined to: `EntryCard` props/rendering, its one call site,
  landing page section, validation-form note, copy catalog both languages.
  No schema, migration, repository, allocation, or export change.
- Researcher review, dashboard, and exports keep identifiers and endpoints.
- Deferred: rewording the evaluation options' intent language (not requested;
  flagged above as the known consequence).
