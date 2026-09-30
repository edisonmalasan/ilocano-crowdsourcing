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

- **WHEN** the screening screen's unselected options are compared against `AnswerOption`'s shared
  unselected treatment
- **THEN** every unselected option presents an identical treatment, so a proficiency level is
  never given more visual weight than another

> **Scoped during Apply, because the original was not executable.** This scenario previously
> compared "the screening screen and a validation answer screen". No validation answer screen
> exists until Phase 4, so half the comparison could not be run at all, and the change's
> verification record had to carry it as a standing exception — which is a live obligation
> dressed as a requirement. A requirement that cannot be executed is not evidence of anything.
>
> The screening half was never in doubt and is fully covered: `onboarding-routes.test.tsx` reads
> the **rendered** `class` attribute of every `role="radio"` and compares it to this shared
> constant, and that assertion goes red when `AnswerGroup` is bypassed. What remains for Phase 4
> is a single cross-screen comparison once a second screen exists. That is follow-on work, and
> it is deliberately not promised here.
