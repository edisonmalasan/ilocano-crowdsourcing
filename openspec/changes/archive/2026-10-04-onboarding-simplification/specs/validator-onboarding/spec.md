# Spec Delta

## REMOVED Requirements

### Requirement: The approved screening question is the only question asked

> **Why this requirement is removed rather than modified.** Its third scenario
> states a methodology rule the thesis owner has now superseded: *Declining the
> question is allowed and recorded as absence*. Under the corrected methodology
> a submission with no proficiency choice is refused and no enrollment is
> attempted, so that scenario cannot survive as written while the other three
> scenarios (five choices in order, unapproved rejected, no derived values)
> are unchanged and still hold.
>
> A `MODIFIED` block replaces a requirement wholesale, and
> `openspec change validate --strict` **refuses** a MODIFIED block that omits
> a scenario the current spec still has. The removed requirement is therefore
> recorded here **in full, verbatim**, and its replacement is added below.
> Nothing is rewritten as though the old requirement never existed.

The screening screen SHALL present exactly the approved question, exactly the approved supporting
copy, and exactly the five approved choices, in the approved order. A submission carrying a
proficiency value outside those five SHALL be rejected before any persistence operation is
attempted.

A visitor MAY decline to answer. Declining is not an error and SHALL NOT be recorded as any of the
five proficiency values; it SHALL be recorded as an absence of a screening answer.

#### Scenario: All five approved choices are offered in order

- **WHEN** the screening screen is rendered
- **THEN** the approved question and supporting copy are shown together with exactly the five
  approved choices, presented in the approved order

#### Scenario: An unapproved proficiency value is rejected before persistence

- **WHEN** a screening submission carries a proficiency value that is not one of the five approved
  choices
- **THEN** the submission is rejected and no persistence operation is attempted

#### Scenario: Declining the question is allowed and recorded as absence

- **WHEN** a visitor continues without selecting a proficiency choice
- **THEN** enrollment still completes, and the stored profile records no screening answer rather
  than a placeholder, a default, or a substituted value

#### Scenario: No proficiency-derived value is stored or shown

- **WHEN** a validator profile is produced from a screening answer
- **THEN** the profile contains no score, weight, rank, or eligibility flag derived from the
  answer, and no such value is displayed anywhere in the public experience

### Requirement: An onboarding write is single-flight, and completed onboarding moves to `/ready`

> **Why this requirement is removed rather than modified.** Three of its five
> scenarios cannot survive as written: *Declining is also blocked while a
> write is in flight* (there is no decline affordance anymore),
> *A new enrollment moves to the ready route*, and *A resumed identity moves
> to the same route* (completed onboarding now enters the validation flow, and
> the confirmation route is no longer part of the normal path). The
> single-flight property and the no-echo confirmation property are unchanged
> and still hold, and both are carried into the replacement below rather than
> lost.

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

## ADDED Requirements

### Requirement: Proficiency is required and the screening question is the only question asked

The screening screen SHALL present exactly the approved question, exactly the approved supporting
copy, and exactly the five approved choices, in the approved order. A submission carrying a
proficiency value outside those five SHALL be rejected before any persistence operation is
attempted.

A submission with no proficiency choice selected SHALL be refused as invalid, and no enrollment
SHALL be attempted for it. There is no decline path: the corrected methodology requires exactly
one approved Ilocano proficiency option before continuing. Profiles created before this change
that record no screening answer remain valid and SHALL NOT be given a fabricated value, and no
retroactive constraint SHALL rewrite them.

#### Scenario: All five approved choices are offered in order

- **WHEN** the screening screen is rendered
- **THEN** the approved question and supporting copy are shown together with exactly the five
  approved choices, presented in the approved order

#### Scenario: An unapproved proficiency value is rejected before persistence

- **WHEN** a screening submission carries a proficiency value that is not one of the five approved
  choices
- **THEN** the submission is rejected and no persistence operation is attempted

#### Scenario: A submission with no choice is refused without enrolling

- **WHEN** a visitor activates Continue without selecting a proficiency choice
- **THEN** no enrollment is attempted, no validator profile is created, and the missing answer is
  identified on the screening control

#### Scenario: No proficiency-derived value is stored or shown

- **WHEN** a validator profile is produced from a screening answer
- **THEN** the profile contains no score, weight, rank, or eligibility flag derived from the
  answer, and no such value is displayed anywhere in the public experience

### Requirement: An onboarding write is single-flight, and completed onboarding enters the validation flow

The public onboarding flow SHALL be single-flight. While an enrollment or a resume is in flight,
the screening choices and the submit control SHALL be inert, so a participant cannot cause a
second write to start before the first has completed.

The participant SHALL be moved into the validation flow once the flow completes by either path —
a newly created identity or a resumed existing one: to the batch orchestration screen, which
resumes an interrupted batch where one exists and otherwise allocates a new one. The
intermediate confirmation route is not part of the normal path; it remains reachable for direct
visits.

A confirmation of enrollment SHALL NOT render the stored identifier, the self-reported
proficiency answer, a timestamp, or a counter read back from the profile, wherever such a
confirmation is presented.

#### Scenario: A second onboarding write cannot begin

- **WHEN** an enrollment or a resume is in flight
- **THEN** the screening choices are inert and the submit control cannot be activated, so no second
  write is started

#### Scenario: A new enrollment enters the validation flow

- **WHEN** an enrollment completes successfully
- **THEN** the participant is moved to the batch orchestration screen rather than to a
  confirmation screen

#### Scenario: A resumed identity enters the same validation flow

- **WHEN** a stored identifier is confirmed and the flow completes
- **THEN** the participant is moved to the batch orchestration screen, and no additional validator
  profile was created

#### Scenario: A confirmation echoes no profile value

- **WHEN** an enrollment confirmation is presented
- **THEN** it states that enrollment completed, and shows no identifier, no proficiency answer, no
  timestamp, and no counter read back from the stored profile
