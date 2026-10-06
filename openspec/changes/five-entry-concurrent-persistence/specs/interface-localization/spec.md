# Spec Delta

## ADDED Requirements

### Requirement: Batch-size copy names five entries

Every active user-visible string that names the batch size SHALL name 5 (English "five",
Filipino "lima") where a number is still useful. Strings that read "ten sentences",
"10 entries", "ten-item batch", "Sampung pangungusap", or equivalent SHALL read
five/five-entry/lima as appropriate. Progress readouts that named a position ("Sentence 3 of 10"
or any x-of-y form) SHALL NOT be replaced with a five-form; that UI is removed instead per
`validation-experience`. Type-level ENG/FIL parity and the no-em-dash rule are unchanged.

> **The batch size of 10 in interface copy is SUPERSEDED by this change, recorded rather than
> silently edited.** Archived copy keeps its historical wording; only active catalogs move.

#### Scenario: No ten-copy remains in active catalogs

- **WHEN** the English and Filipino catalogs are inspected
- **THEN** no active participant-facing string names ten/10/sampu where the batch size is meant

#### Scenario: Progress keys stay absent in both languages

- **WHEN** either catalog is inspected
- **THEN** no sentence x-of-y, saved-count, progress-bar, or routine saving key exists

#### Scenario: Finished-card copy keeps parity

- **WHEN** the finished card renders in either locale
- **THEN** heading, invitation, and both controls read correctly with no missing or empty rendering
