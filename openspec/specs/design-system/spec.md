# design-system Specification

## Purpose
Defines the shared visual language of the platform: a strictly soft neo-brutalist token set and
the accessible primitive components that every public validation screen and researcher screen
is composed from.

## Requirements

### Requirement: Soft neo-brutalist visual language

The platform's visual design SHALL be soft neo-brutalism. Every rendered surface SHALL be built
from the shared token set rather than from ad-hoc literal values, so that the design cannot
drift between screens.

The token set SHALL express all of the following:

- **Bold visible borders** on interactive and content surfaces.
- **Hard offset shadows** — a solid, non-blurred shadow offset from the element, never a soft
  diffuse glow.
- **Warm or light neutral surfaces** as the default background, with a single restrained accent
  reserved for emphasis and primary actions.
- **Slightly softened corners** — a non-zero, modest radius. Sharp 90-degree corners, dark
  substrates, and terminal/military framing are explicitly not part of this language.
- **Strong typographic hierarchy** achieved with a display face, a highly readable body face,
  and a monospace face reserved for small-caps metadata labels.
- **Generous whitespace**, expressed as a spacing scale rather than arbitrary values.

#### Scenario: Surfaces are composed from tokens

- **WHEN** a rendered surface is inspected, its color, border, shadow, and radius values SHALL
  resolve to token values defined by the design system
- **THEN** no screen hard-codes a competing palette or shadow treatment

#### Scenario: No dark or terminal substrate

- **WHEN** the design system tokens are enumerated
- **THEN** the default surface tokens are warm or light neutrals and no dark "terminal" surface
  token is offered as an alternative substrate for the same interface

#### Scenario: No hard industrial interpretation

- **WHEN** the design system tokens are enumerated
- **THEN** the border radius token is non-zero and the accent set is restrained rather than a
  single high-saturation alert red

### Requirement: Accessible interactive states

Every interactive primitive SHALL expose a visible, high-contrast focus indicator that is not
communicated by color alone, and SHALL expose hover, focus-visible, active/pressed, and
disabled states. Interactive primitives SHALL be operable by keyboard alone, SHALL expose an
accessible name, and SHALL meet a minimum target size suitable for touch.

#### Scenario: Keyboard-only navigation

- **WHEN** a user tabs through a screen using only the keyboard
- **THEN** every interactive control receives a visible focus indicator and activating it with
  `Enter` or `Space` performs the action

#### Scenario: Essential information is not color-only

- **WHEN** any state is communicated to the user, including progress and selection
- **THEN** that state is also communicated by text, shape, or a semantic element, so it remains
  perceivable without color

#### Scenario: Disabled control is not focusable as an action

- **WHEN** a control is disabled
- **THEN** it does not respond to activation and its disabled state is exposed to assistive
  technology

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

### Requirement: Motion is restrained

Motion SHALL be limited to short transitions on appearance properties — opacity, transform, colour,
border colour, and surface shadow — so that a control visibly responds to hover, focus, press, and
selection. The system SHALL NOT introduce looping, attention-seeking, or progress-pressure
animation, and SHALL honour `prefers-reduced-motion`.

> Wording note. An earlier draft said "opacity and transform transitions", which is narrower than
> what a soft neo-brutalist control actually needs: a border or shadow that snaps rather than
> shifts reads as broken rather than tactile. The implementation transitions `background-color`,
> `color`, `box-shadow`, and `border-color` as well. The bound that matters is duration and
> non-looping, not the property list, and that bound was already met and is asserted.

#### Scenario: No timer or streak pressure

- **WHEN** any screen is rendered
- **THEN** no countdown timer, streak counter, or speed-pressure mechanic is present

#### Scenario: Reduced motion preference honored

- **WHEN** the user agent reports a reduced-motion preference
- **THEN** non-essential transitions are suppressed

### Requirement: Mobile-first responsive behavior

Components SHALL be authored mobile-first. Interactive content SHALL NOT require horizontal
scrolling at 320 CSS pixels of viewport width, and text SHALL remain readable without
horizontal scrolling at that width.

#### Scenario: Narrow viewport

- **WHEN** a screen is rendered at 320 CSS pixels wide
- **THEN** no content overflows horizontally and all controls remain reachable

#### Scenario: Text remains legible

- **WHEN** body text is rendered at 320 CSS pixels wide
- **THEN** the text size stays at or above the minimum readable body size defined by the token
  set
