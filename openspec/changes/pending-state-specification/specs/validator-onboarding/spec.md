# Spec Delta

## ADDED Requirements

### Requirement: An onboarding write is single-flight, and completed onboarding moves to `/ready`

The public onboarding flow SHALL be single-flight. While an enrollment or a resume is in flight, every
control that could begin another write SHALL be inert, so a participant cannot cause a second write to
start before the first has completed. This applies to the screening choices and to **both** submit
affordances — the one that submits the current selection and the one that declines to answer — because
either of them is a write.

The participant SHALL be moved to `/ready` once the flow completes by either path: a newly created
identity or a resumed existing one.

`/ready` SHALL confirm that an anonymous validator profile was persisted. It SHALL NOT render the
stored identifier, the self-reported proficiency answer, a timestamp, or a counter read back from the
profile.

> **This is ADDED, not a modification of the sequence requirement.** "The public onboarding sequence
> is landing, screening, then enrollment" names the *order* of the three steps, and its scenarios stop
> at the enrollment write. It does not say what happens during the write, and it does not name the
> route a participant reaches afterwards — `/ready` appears in **0 of the 9** in-force specs. A
> requirement that defines the happy path of a flow while leaving the in-flight state and the exit
> unspecified is what makes an unguarded call site possible in the first place.
>
> The single-flight property is a **research-integrity** property, not a usability one. A second
> enrollment write would persist one person twice, splitting a single participant's research record
> across two anonymous identities with nothing in the stored data able to detect the split. The
> existing requirements reduce the risk — the server mints identifiers, client-supplied values are
> ignored, and a second screening answer is never stored — but **none of them prevents a duplicate
> write**, because each governs what is persisted rather than whether a write may begin.

#### Scenario: A second onboarding write cannot begin

- **WHEN** an enrollment or a resume is in flight
- **THEN** the screening choices are inert and neither submit affordance can be activated, so no second
  write is started

#### Scenario: Declining is also blocked while a write is in flight

- **WHEN** an enrollment is in flight and the participant would otherwise be able to decline
- **THEN** the decline affordance is inert too, because it is a write and not merely a cancellation

#### Scenario: A new enrollment moves to the ready route

- **WHEN** an enrollment completes successfully
- **THEN** the participant is moved to `/ready`

#### Scenario: A resumed identity moves to the same route

- **WHEN** a stored identifier is confirmed and the flow completes
- **THEN** the participant is moved to `/ready`, and no additional validator profile was created

#### Scenario: The ready route confirms without echoing the profile

- **WHEN** `/ready` is presented
- **THEN** it states that enrollment completed, and shows no identifier, no proficiency answer, no
  timestamp, and no counter read back from the stored profile