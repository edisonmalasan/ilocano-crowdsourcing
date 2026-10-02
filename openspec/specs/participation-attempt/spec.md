# participation-attempt Specification

## Purpose

Defines what a participation attempt is and how long it lasts: one anonymous identity minted at
screening, scoped to a single browser session, preserved across reload and navigation, retired when
the participant chooses to finish, and re-screened on the next participation — together with the rule
that an attempt identifier is never evidence of a distinct person.

## Requirements

### Requirement: A participation attempt is one anonymous identity scoped to one browser session

A participation attempt SHALL begin when a participant submits the screening question and SHALL be
represented by exactly one server-minted anonymous identity for its whole duration. The attempt's
identity SHALL be retained in browser-local storage that is scoped to the browser session, and that
storage SHALL be the only research-related value held on the client.

A browser session that carries no attempt SHALL begin a **new** attempt on the next screening
submission. The platform SHALL NOT carry an attempt across a browser-session boundary, and SHALL NOT
recover one from any storage that outlives the session.

This replaces the previous model, in which one browser profile carried one identity for the life of
the study. That model is not merely a different lifetime: it made a single browser profile the
platform's stand-in for a single person, which is the assumption the corrected methodology removes.

#### Scenario: Screening mints a fresh identity for each attempt

- **WHEN** a participant submits the screening question and no attempt is active in this browser
  session
- **THEN** a new anonymous identity is minted by the server for the new attempt, and no earlier
  attempt's identity is reused, extended, or reactivated

#### Scenario: A new browser session begins a new attempt

- **WHEN** a participant starts the flow again in a browser session that holds no attempt
- **THEN** they are screened again and a new attempt begins, rather than any earlier attempt being
  resumed

#### Scenario: Nothing outside the browser session can restore an attempt

- **WHEN** the platform looks for an attempt to restore
- **THEN** it consults only storage scoped to the current browser session, and an identifier left
  behind by an earlier session is neither read nor reused

#### Scenario: The attempt's identity is the only client-held research value

- **WHEN** an attempt is active
- **THEN** the client holds the attempt identifier and nothing else research-related — no screening
  answer, no batch, no validation response, and no timestamp or counter

### Requirement: An attempt survives reload and navigation, and is retired by finishing

An attempt SHALL remain active across a reload of the page and across navigation within the study's
own routes, so that a participant who refreshes mid-batch is not enrolled again and does not lose
their place.

The participant SHALL be offered an explicit way to finish. Choosing it SHALL retire the attempt by
discarding the browser-local attempt identity, and SHALL THEN leave the public flow. Retiring an
attempt SHALL write nothing to the server: no participation record, no completion marker, no
abandonment flag, and no row of any kind.

Retiring the attempt SHALL NOT alter, delete, or mark any response the participant has already
submitted. Those responses are research data and remain exactly as recorded.

A later participation SHALL be a new attempt, screened again, with a new identity.

#### Scenario: A reload keeps the participant in the same attempt

- **WHEN** a participant reloads a page of the validation flow while an attempt is active
- **THEN** the same attempt continues, no second screening submission occurs, and no additional
  identity is created

#### Scenario: Navigation within the flow keeps the same attempt

- **WHEN** a participant moves between the study's own routes while an attempt is active
- **THEN** the same attempt continues and no additional identity is created

#### Scenario: Finishing retires the attempt without writing to the server

- **WHEN** a participant chooses to finish
- **THEN** the browser-local attempt identity is discarded, no row is written, and no participation,
  completion, or abandonment fact about the participant is recorded anywhere

#### Scenario: Retiring an attempt leaves every submitted response untouched

- **WHEN** a participant finishes after submitting one or more responses
- **THEN** every response they submitted remains exactly as recorded, and nothing is deleted,
  reverted, or marked as abandoned

#### Scenario: The next participation after finishing is a new, screened attempt

- **WHEN** a participant begins the flow again after having finished
- **THEN** they are asked the screening question again and are given a new anonymous identity, and
  the retired attempt's identity is not reused

#### Scenario: The end of a browser session retires the attempt without any action

- **WHEN** a browser session ends while an attempt is active and the participant did not choose to
  finish
- **THEN** the attempt's client-held identity ends with the session, no response is altered or
  deleted, and a later visit begins a new attempt rather than resuming the old one

### Requirement: An attempt identifier is never evidence of a distinct person

No part of the platform SHALL present, label, count, or export an attempt identifier as though it
identified a distinct human being. An attempt is an anonymous participation record, and the same
person may begin any number of attempts.

The platform SHALL NOT record anything that links one attempt to another, SHALL NOT derive a count of
distinct people from the number of attempts or the number of identifiers, and SHALL NOT describe an
attempt as a returning, continuing, or repeat participant.

The participant-facing experience SHALL NOT tell a participant that they are recognised as the same
person as on a previous occasion, because the platform cannot know that.

#### Scenario: Two attempts from one browser are two anonymous records, unlinked

- **WHEN** one browser begins a second attempt after finishing the first
- **THEN** two separate anonymous identities exist and nothing stored records that they came from the
  same browser or the same person

#### Scenario: No screen or message claims a returning participant is a known person

- **WHEN** any participant-facing screen of the flow is rendered
- **THEN** no text describes the participant as the same person as before, as a returning or repeat
  participant, or as anyone the platform has met before

#### Scenario: The end-of-attempt copy says what returning actually means

- **WHEN** a participant is shown the finished presentation's explanation of finishing
- **THEN** it states that what they submitted is unchanged and that taking part again means starting
  a new participation, and it does not say they will be recognised or resumed as the same validator
