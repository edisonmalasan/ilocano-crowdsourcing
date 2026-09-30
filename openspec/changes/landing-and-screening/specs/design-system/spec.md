# Spec Delta

## MODIFIED Requirements

### Requirement: Answer controls are visually neutral

Every choice control that collects a research answer SHALL share identical surface, border, and
shadow treatment before selection, so that no option is presented as more preferred than another.
This applies to the answer choices for a dataset entry AND to the choices in the Ilocano proficiency
screening, because both are collected research data. Visual emphasis SHALL be applied only after a
selection is made by the participant.

This requirement exists because a collected answer carries research meaning; a visual treatment
that nudges a participant toward one answer would bias collected research data. Screening is
explicitly included: an answer that makes one proficiency level look like the desirable response
would bias the recorded background of the validator population, and the thesis team has not yet
approved any rule about which levels matter.

#### Scenario: Unselected options are indistinguishable in weight

- **WHEN** the choices for a dataset entry or for the proficiency screening are rendered and none
  has been selected
- **THEN** every option presents the same border, surface, and shadow treatment, with no option
  carrying an accent color

#### Scenario: Selection is visible and exclusive

- **WHEN** a participant selects one answer
- **THEN** that option alone shows the selected treatment and the remaining options return to
  the neutral treatment

#### Scenario: Screening options are no more weighted than validation options

- **WHEN** the screening screen and a validation answer screen are compared
- **THEN** both present their unselected options with an identical treatment, so a proficiency
  level is never given more visual weight than a validation judgment and vice versa
