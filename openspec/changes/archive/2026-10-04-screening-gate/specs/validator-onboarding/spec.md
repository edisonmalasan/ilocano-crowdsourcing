# Spec Delta

## ADDED Requirements

### Requirement: A pre-correction attempt without a recorded answer restarts screened

A validator restored from a profile created before proficiency became
required — one that records no screening answer — SHALL NOT be allocated new
validation work under that attempt. The orchestration SHALL present a
screening-required state naming the history rather than a fault, with exactly
one onward action: retiring the attempt locally (browser storage cleared,
zero server writes, the same primitive as Finish) and beginning a new
screened attempt. No retry is offered, because re-requesting a deterministic
refusal is a control that can never succeed.

The unrestored rule is unchanged: an answer typed alongside a successful
resume is still discarded, and an existing recorded answer is still never
overwritten — including by this path, which carries no answer to store. The
null row itself is left untouched: no value fabricated, nothing backfilled.

#### Scenario: A resumed attempt without an answer reaches the restart state

- **WHEN** a restored validator whose profile records no proficiency reaches
  batch orchestration
- **THEN** allocation is refused with reason `screening_required` and the
  screening-required state is presented instead of a batch, an exhausted
  state, or a failure-with-retry state

#### Scenario: Restarting retires locally and begins screened

- **WHEN** the participant activates the restart action
- **THEN** the stored identifier is cleared with no server write, and the
  participant is moved to screening, where a new attempt begins with a
  required proficiency answer

#### Scenario: Submitted work is declared safe

- **WHEN** the screening-required state is presented
- **THEN** it states that nothing already submitted is affected, so the
  participant does not fear that restarting discards their research record

#### Scenario: The null row is never filled by the restart

- **WHEN** the pre-correction attempt is retired and a new attempt is screened
- **THEN** the original profile still records no answer, and the new profile
  carries the newly given one under a new identifier
