# Spec Delta

## ADDED Requirements

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