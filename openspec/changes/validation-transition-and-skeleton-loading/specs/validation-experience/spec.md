# Spec Delta

## Purpose

Extends the per-entry validation flow with presentational pacing (entry settling) and skeleton-backed loading presentation, without changing any judgment, correction, translation, persistence, or completion rule.

## MODIFIED Requirements

### Requirement: A correction is offered exactly when the evaluation requires one

The session SHALL offer a corrected Ilocano sentence **exactly when** the chosen evaluation requires a correction — *correct but sounds unnatural* and *incorrect* — and SHALL require a non-blank corrected sentence before that response can be completed.

For *correct and natural* and *cannot confidently evaluate* the session SHALL NOT offer a corrected sentence, and a response carrying one SHALL NOT be accepted as though the evaluation allowed it.

Which evaluations require a correction SHALL be decided by the single rule already in force in `domain-contracts`, and this capability SHALL NOT restate it as a second rule that could disagree.

During the entry-settling interval the correction input, when offered, SHALL be disabled along with every other interactive control; the rule for when it is offered is unchanged.

#### Scenario: Choosing an evaluation that requires a correction reveals the correction input

- **WHEN** a validator chooses *correct but sounds unnatural* or *incorrect*
- **THEN** a corrected Ilocano sentence is offered and is required before the response can be completed

#### Scenario: A blank correction does not complete a response that requires one

- **WHEN** a validator has chosen an evaluation requiring a correction and the corrected sentence is
  blank or contains only whitespace
- **THEN** the response cannot be completed

#### Scenario: An evaluation that allows no correction offers no correction input

- **WHEN** a validator chooses *correct and natural* or *cannot confidently evaluate*
- **THEN** no corrected Ilocano sentence is offered

#### Scenario: The correction input settles with the rest of the form

- **WHEN** a new entry requiring a correction is presented
- **THEN** the correction input is disabled for the settling interval exactly like the other controls, and its offer/require rule is unchanged
