# Spec Delta

## REMOVED Requirements

### Requirement: Both research translations are collected for an evaluable response, with no skip affordance

> **Why this requirement is removed rather than modified.** Its first, third,
> and fifth scenarios require both translations together and forbid any skip
> control. Under per-response language choice a single-translation response
> and a skipped-translation response are both normal and expected, so those
> scenarios cannot survive as written while the evaluation, correction, and
> `cannot_evaluate` rules are unchanged. Recorded **in full, verbatim**,
> replaced below.

For every evaluable evaluation the session SHALL collect **both** an English translation and a Filipino
translation of the **validated** Ilocano sentence — the correction where one was required, and the
original sentence where none was — and SHALL require both to be non-blank before the response can be
completed.

The session SHALL NOT offer any control that skips, defers, or postpones a research translation
of an evaluable response.

For *cannot confidently evaluate* the session SHALL offer **neither** translation input, and a response
carrying either SHALL NOT be accepted as though the evaluation were translatable.

#### Scenario: An evaluable evaluation offers both translation inputs and requires both

- **WHEN** a validator has chosen *correct and natural*
- **THEN** an English translation input and a Filipino translation input are both offered, and both are
  required before the response can be completed

#### Scenario: The translations describe the validated sentence, not the pre-correction wording

- **WHEN** a validator has chosen *incorrect* and supplied a corrected Ilocano sentence
- **THEN** both translations are of the corrected Ilocano sentence, not of the original wording

#### Scenario: A single supplied translation does not complete an evaluable response

- **WHEN** a validator has supplied an English translation and no Filipino translation
- **THEN** the response cannot be completed

#### Scenario: A cannot-confidently-evaluate choice offers no translation input

- **WHEN** a validator chooses *cannot confidently evaluate*
- **THEN** neither an English translation input nor a Filipino translation input is offered

#### Scenario: No control skips a required research translation

- **WHEN** an evaluable evaluation is chosen
- **THEN** the session offers no control that skips, defers, or postpones either research translation

## ADDED Requirements

### Requirement: Each evaluable response offers a translation language choice

For every evaluable evaluation the session SHALL offer a translation choice — English, Filipino,
both, or skip — for translations of the **validated** Ilocano sentence: the correction where one
was required, and the original sentence where none was. Any translation the validator supplies
SHALL be non-blank before the response can be completed; a blank value is refused, never stored
as an empty translation.

The session SHALL NOT require any translation. Skipping carries no penalty, implies no judgment
about the validator, and SHALL NOT be presented as a lesser contribution.

For *cannot confidently evaluate* the session SHALL offer **neither** translation input and no
language choice, and a response carrying either SHALL NOT be accepted as though the evaluation
were translatable.

#### Scenario: A validator translates into one language only

- **WHEN** a validator has chosen *correct and natural* and then chooses English only
- **THEN** a single English translation input is offered, it is required to be non-blank, and
  the response completes with no Filipino translation

#### Scenario: A validator translates into both languages

- **WHEN** a validator chooses both languages
- **THEN** both inputs are offered and both are required to be non-blank before the response
  can be completed

#### Scenario: A validator skips translation without penalty

- **WHEN** a validator chooses skip after an evaluable evaluation (and any required correction)
- **THEN** the response completes with neither translation, and no control suggests the
  contribution counts for less

#### Scenario: The translations describe the validated sentence, not the pre-correction wording

- **WHEN** a validator has chosen *incorrect*, supplied a corrected Ilocano sentence, and chosen
  a language
- **THEN** each supplied translation is of the corrected Ilocano sentence, not of the original
  wording

#### Scenario: A cannot-confidently-evaluate choice offers no translation input

- **WHEN** a validator chooses *cannot confidently evaluate*
- **THEN** neither an English translation input nor a Filipino translation input is offered, and
  no language choice is presented
