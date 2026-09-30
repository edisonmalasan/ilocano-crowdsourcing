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

### Requirement: A control whose action is in flight exposes a pending state

An interactive control that **started an action which has been accepted and has not yet completed** —
the control a participant activated — SHALL expose a pending state. It SHALL NOT respond to further
activation, it SHALL expose its in-progress status to assistive technology, for example through
`aria-busy`, and it SHALL communicate that progress through text as well as through its visual
treatment.

This requirement governs the control that initiated the action. A control that is made **inert
alongside** an in-flight action — a choice among options, or a field belonging to the same form — SHALL
be inert and SHALL NOT be required to report progress of an action it did not start. Such controls MAY
change appearance, and any change SHALL apply uniformly to all of them, so that no option appears more
preferred, more available, or more advanced than another.

A pending state SHALL be distinguishable from a control that is disabled for any other reason, such as
a control that is unavailable in the current state rather than busy, so a participant can tell "this is
happening now" from "this cannot be done yet".

A control SHALL retain an accessible name while it is pending, and its label SHALL change to report the
pending state rather than continue to present the idle action. Progress SHALL NOT be communicated
through motion, animation, or elapsed time alone.

> **Why the scope is the initiating control and not every disabled control.** The first draft of this
> delta opened "an interactive control whose action has been accepted and has not yet completed SHALL …
> communicate that progress through text". Read literally against the implementation, that is violated
> by the screening choices themselves: while an enrollment is in flight they become inert and dim, they
> change no text, and they carry no in-progress status — because they start no action of their own. A
> delta that the code it describes cannot satisfy is a specification of an intention. The rule is
> therefore split: the initiating control reports progress, and controls made inert alongside it are
> required only to be inert and to change appearance uniformly. See design.md D1.
>
> This requirement is **ADDED rather than folded into "Accessible interactive states"** because that
> requirement already governs what a control does *while it is disabled* — it does not respond to
> activation and exposes its state to assistive technology. What was missing was *when a control
> becomes disabled*, and that turned out to be unspecified for the write paths this project now has.
> Re-derived from all nine in-force specs rather than inherited: **0 of 181 scenarios mandate that a
> control be inert while a write is in flight**, and that count holds under every vocabulary tried.
> The gap was found by re-deriving an enumeration, not by reading the specs once.
>
> **No count of "requirement blocks mentioning the vocabulary" is quoted here, deliberately.** Two
> definitions of that phrase produce two *different* sets of three, because
> `interface-localization` matches on the phrase "the response in progress" while `design-system`
> matches on "and disabled states" — the same count over different members, which reads as
> confirmation and is not. The count of scenarios is the load-bearing figure and it is
> definition-independent. See design.md D4.
>
> **One scenario below is vacuously satisfied today and must not be cited as existing coverage.** No
> control in `src/` is currently disabled for unavailability as opposed to in-flight work, so
> "pending is distinguishable from unavailable" has no pair of controls to distinguish. It becomes
> observable in Phase 5. See design.md, Risks.

#### Scenario: The initiating control is inert

- **WHEN** a control has started an action that has not completed
- **THEN** activating that control again has no effect, and the control exposes its in-progress status
  to assistive technology

#### Scenario: Controls made inert alongside the action are inert without claiming progress

- **WHEN** an action is in flight and other controls on the same screen are made inert as a result
- **THEN** those controls do not respond to activation, and they do not present themselves as the
  source of the in-flight action

#### Scenario: Inert controls change appearance uniformly

- **WHEN** an action is in flight and a group of sibling controls is made inert
- **THEN** every control in that group changes appearance in the same way, so none appears more
  preferred, more available, or more advanced than another

#### Scenario: Progress is communicated by text, not by styling alone

- **WHEN** a control is pending
- **THEN** its pending state is conveyed by text as well as by visual treatment, so it remains
  perceivable without color

#### Scenario: Pending is distinguishable from unavailable

- **WHEN** one control is pending while another is disabled because it is unavailable in the current
  state
- **THEN** a participant can tell the two apart, so neither is read as a failure

#### Scenario: The label reports the pending state and the name survives it

- **WHEN** a control becomes pending
- **THEN** its label reports the pending state rather than the idle action, and it still exposes an
  accessible name

#### Scenario: Progress is not conveyed by timing

- **WHEN** a control becomes pending
- **THEN** no indication of progress depends solely on an animation or on how long the participant
  waits
