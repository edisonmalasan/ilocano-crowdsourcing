# interface-localization Specification

## Purpose

Defines how the public validator interface is presented in English or Filipino.
The interface locale is **presentation state held in the browser**: it changes
what a participant reads and nothing else. It is deliberately a separate
capability from the required English and Filipino **research translations**,
which are validator-authored data about a dataset entry. The two share the word
"translation" and nothing else, and this capability states the boundary so a
future change cannot blur it by accident.

## Requirements

### Requirement: The interface is available in English and Filipino, with English as the default

The public validator interface SHALL be available in **English** and
**Filipino**, and SHALL offer an obvious switcher such as `ENG | FIL`. English
SHALL be the locale for a browser or session that has expressed no preference.
The preference SHALL be remembered in the browser and preserved across navigation
and later visits.

Switching the locale SHALL NOT erase or reset the current screening answer, the
current validation selection, any correction text, either research-translation
text, or batch progress, because none of that is presentation state.

#### Scenario: English is the default for a browser that has expressed no preference

- **WHEN** a participant opens any public page with no stored locale preference
- **THEN** the interface is rendered in English and the document declares
  `lang="en"`

#### Scenario: A chosen locale is preserved across navigation and later visits

- **WHEN** a participant selects Filipino and then navigates to another public
  page, or returns to the site later
- **THEN** the interface is rendered in Filipino, because the preference is
  remembered rather than re-derived from the browser's own language settings

#### Scenario: Switching the language preserves the response in progress

- **WHEN** a participant switches locale while a screening answer, a validation
  selection, a correction, or either research translation has been entered
- **THEN** the entered content is unchanged, because the locale is presentation
  state and is not where a response is held

#### Scenario: The switcher is reachable from every public page

- **WHEN** a participant navigates to any public page
- **THEN** a language control is present and operable by keyboard, and it is not
  the dominant element of the page, because a participant who cannot find the
  switcher is excluded and a switcher that dominates competes with the validation
  task

### Requirement: An absent, unrecognised, or tampered locale resolves to English

The interface SHALL resolve its locale to exactly one of the two approved values.
An absent, empty, unrecognised, or tampered value SHALL resolve to English rather
than raising an error, because a presentation preference with a sensible default
must never be able to make a page fail.

#### Scenario: A stored value that is not an approved locale is ignored

- **WHEN** the stored locale preference is absent, empty, or a value other than
  the two approved locales
- **THEN** the interface renders in English and no error is raised, because a
  stale or edited preference must not be able to break a research instrument

### Requirement: Every localized interface string exists in both languages

Every string the interface localizes SHALL have both an English and a Filipino
rendering. A string added to one language and not the other SHALL fail the
project's type-check rather than silently falling back, and no Filipino rendering
SHALL be empty.

#### Scenario: A string with no Filipino rendering cannot be committed

- **WHEN** an English interface string is added with no Filipino rendering for
  the same key
- **THEN** the project's type-check fails, because a half-localized interface is
  indistinguishable at runtime from a finished one and would otherwise reach
  participants silently

#### Scenario: A Filipino rendering is never left empty

- **WHEN** a Filipino rendering is present but empty
- **THEN** the check fails, because an empty rendering displays as a blank label
  rather than as a missing one

### Requirement: Localization covers the interface's own copy and never the research material

Localization SHALL cover user-facing interface text: landing copy, navigation
labels, buttons, screening instructions, the proficiency question and its choice
labels, participation and privacy notices, progress, error messages, empty states,
and the continue and finish controls.

Localization SHALL **NOT** touch the synthetic Ilocano dataset instruction, a
validator's corrected Ilocano text, a validator's English or Filipino
research-translation text, place names, dataset identifiers, or any
machine-readable evaluation or proficiency value.

#### Scenario: Interface copy is presented in the chosen locale

- **WHEN** a participant views interface text such as a button label, the
  screening instructions, or an error message
- **THEN** that text is presented in the chosen locale

#### Scenario: The synthetic dataset instruction is never localized

- **WHEN** a participant is shown a dataset entry's Ilocano instruction
- **THEN** the instruction is rendered exactly as stored, in Ilocano, because it
  is the immutable research material and a localized rendering of it would be a
  modified dataset entry presented as authoritative

#### Scenario: Place names and dataset identifiers are never localized

- **WHEN** an origin or destination place name, or a dataset entry identifier, is
  displayed
- **THEN** it is rendered exactly as stored, because these are research data and
  their identity must not vary with the interface locale

#### Scenario: A validator's own research text is never localized

- **WHEN** a participant has entered a corrected Ilocano sentence, an English
  research translation, or a Filipino research translation
- **THEN** that text is displayed exactly as the participant wrote it and is never
  translated, re-rendered, or replaced, because it is the participant's research
  response rather than interface copy

### Requirement: Switching the language changes presentation only and never the meaning of an answer

The stored machine-readable value of a response SHALL be identical whichever
locale's label the participant saw. A proficiency recorded as `fluent` SHALL
remain `fluent` whether the interface showed an English or a Filipino label, and
an evaluation recorded as `correct_natural` SHALL remain `correct_natural`.

#### Scenario: The stored evaluation is independent of the label shown

- **WHEN** a participant selects an evaluation whose label is shown in Filipino
- **THEN** the value persisted is the same machine-readable evaluation the English
  label would have persisted, because localization changes presentation only and
  never the meaning or the stored value of an answer

#### Scenario: The stored proficiency is independent of the label shown

- **WHEN** a participant chooses a proficiency level whose label is shown in
  Filipino
- **THEN** the value persisted is the same machine-readable proficiency the
  English label would have persisted

#### Scenario: The document declares the language being rendered

- **WHEN** the interface renders in Filipino
- **THEN** the document element declares `lang="fil"`, because a screen reader
  reading Filipino text under an English declaration mispronounces it

### Requirement: The interface locale is presentation state and is never research data

The interface locale SHALL NOT be written to the research database, SHALL NOT be
attached to a validation record, and SHALL NOT be used to derive or imply any
conclusion about a participant's English proficiency. Nothing SHALL infer a
research conclusion from the locale, and a Filipino interface SHALL NOT be
treated as evidence of anything.

#### Scenario: The locale is never persisted as research data

- **WHEN** a participant changes the interface locale
- **THEN** no locale value is written to the research database or attached to any
  validation record, because a stored locale sits next to research responses and
  invites exactly the inference this requirement forbids

#### Scenario: Nothing infers proficiency from the locale

- **WHEN** a participant validates in Filipino
- **THEN** no capability records or derives that the participant's English
  proficiency is lower than a participant's using English, because a language
  preference is an accessibility choice and carries no such information

#### Scenario: The locale is stored in the browser rather than on the server

- **WHEN** the locale preference is persisted
- **THEN** it is held in the participant's browser, so that switching or clearing
  it affects only what is displayed and no research record is affected

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
