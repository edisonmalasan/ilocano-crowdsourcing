# Spec Delta

## ADDED Requirements

### Requirement: Interface copy reads as written by a person

Public and researcher interface strings SHALL read as plain human wording with
varied rhythm across screens, in both English and Filipino, while every key
set, meaning, sentence count (where pinned), and guard stays exactly as
specified. Rewording SHALL NOT add, remove, or rename a catalog key; SHALL
NOT change what any string promises about saving, resuming, pool size, or
coverage; SHALL NOT introduce encouragement, coverage-claim, or
cross-session-recognition vocabulary where the approved guards forbid it; and
SHALL NOT touch dataset instructions, corrections, research translations,
place names, identifiers, machine values, screening wording, evaluation
wording, translation field labels, or refusal messages.

#### Scenario: Key sets are unchanged

- **WHEN** both catalogs are compared key by key
- **THEN** every key present before the rewrite is present after it in both
  languages, and no key was added or removed

#### Scenario: Copy guards stay green

- **WHEN** the full suite runs after the rewrite
- **THEN** the research-material guard, encouragement and coverage
  zero-collision lists, recognition closed set, sentence-count parity, and
  continuation pins all pass unmodified in what they forbid

#### Scenario: Meanings are identical pair-wise

- **WHEN** each rewritten string is read beside the string it replaces
- **THEN** it says the same thing about what happened, what was saved, and
  what the participant can do next — in plainer words, not different ones

#### Scenario: Research text is untouched

- **WHEN** the dataset source, stored responses, and rendered entry sentences
  are compared before and after
- **THEN** nothing changed: the rewrite reached interface strings only
