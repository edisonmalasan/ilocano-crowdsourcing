# Spec Delta

## Purpose

Defines what a validator sees and may do once every entry in their batch has been answered. Covers how
a finished batch is recognised from the absence of unanswered entries rather than from a stored status,
how the finished screen reports its two server-derived figures, how a validator may request one further
coverage-aware batch or stop without discarding anything, and what the finished presentation
deliberately does not reveal.

## ADDED Requirements

### Requirement: A finished batch is recognised from the absence of work, never from an assertion

When a validator has answered every entry a batch holds, the batch SHALL be presented as finished.
The server SHALL derive that state from the absence of unanswered entries in the batch, and a
client SHALL NOT be able to assert that a batch is finished, that a number of entries remain, or that
a validator has completed any particular total.

Finishing SHALL be reported as a terminal presentation state and SHALL NOT introduce a persisted
batch-lifecycle status. A batch is finished when no work remains in it, and the absence of remaining
entries is the single source of that truth. Storing a `status` on the batch would create a second
authority that can disagree with the entries, and this change deliberately declines to add one.

#### Scenario: The last answered entry leads to a finished batch

- **WHEN** a validator's response to the last unanswered entry in a batch is persisted
- **THEN** the next presentation of that batch reports the batch as finished rather than offering
  another entry

#### Scenario: A client cannot declare a batch finished

- **WHEN** a client submits a write request that also supplies a completion status, a count of
  answered entries, or a count of remaining entries
- **THEN** those values are ignored and the server derives the authoritative state itself from the
  persisted entries

#### Scenario: Finishing a batch records no lifecycle state of its own

- **WHEN** a batch becomes finished
- **THEN** no batch status, completion timestamp, or abandonment marker is written, because
  `research-schema` leaves those undefined until the change that owns them, and the finished
  presentation derives its own state

### Requirement: The finished screen reports two distinct figures, both server-derived

The finished presentation SHALL report the number of entries the validator answered **in this batch**
and the number of entries that validator **has answered in total**, and SHALL keep the two visually
and verbally distinct so that neither can be read as the other.

Both figures SHALL be derived by the server from persisted state. The lifetime figure SHALL count every
recorded response the validator has submitted, **including a response that could not be confidently
evaluated**. It SHALL NOT be a count of only those responses that qualify toward research coverage:
a figure that rose only when a validator felt confident would reward confidence rather than effort and
would be a covert quality measure, which the project's research rules forbid. Because the lifetime
figure is not a coverage figure, the single definition of a qualifying completed validation does not
govern it, and the presentation SHALL NOT describe it as one.

#### Scenario: The batch figure and the lifetime figure are both shown and distinguishable

- **WHEN** a validator is shown the finished presentation for a batch
- **THEN** it reports both the entries answered in that batch and the validator's lifetime total, each
  labelled so that a reader can tell which is which

#### Scenario: The lifetime total counts a response that could not be evaluated

- **WHEN** a validator's recorded response to an entry is a "cannot confidently evaluate" response
- **THEN** that response is included in the lifetime total, and the presentation describes the total as
  entries answered rather than as entries that counted toward the study

#### Scenario: The figures are derived by the server and not supplied by the client

- **WHEN** the finished presentation is rendered
- **THEN** both figures come from persisted state on the server, and a figure presented by the client
  is not used in their place

#### Scenario: The lifetime figure is a completion record and not a running pressure mechanic

- **WHEN** any screen is rendered
- **THEN** the lifetime total appears only on the finished presentation as a static record of work
  already done, no screen displays a lifetime total that rises while a validator is answering, and the
  figure is not accompanied by any comparison, target, milestone, rank, or encouragement to reach a
  further one

This is the boundary against the existing rule that no screen carries a streak counter or a
speed-pressure mechanic. The distinguishing property is **whether the figure escalates during the
activity**. Progress *within the current batch* is a progress indicator and is already required; a
lifetime total that climbs on screen while a validator works would be a volume counter competing for
attention with the sentence in front of them, which is the mechanic that rule exists to prevent. The
figure is therefore shown once, after the batch, as a record.

### Requirement: Continuing offers one further batch, requested from the server

The finished presentation SHALL offer exactly one control that continues validation, which requests a
new coverage-aware batch from the server and then presents it. The batch SHALL be chosen by the
server on the same basis as any other batch, including excluding every entry the validator has already
answered; the client SHALL NOT assemble, order, or suggest the contents of the continued batch.

The control SHALL be a control rather than a link to a separate request screen, because the point of
continuing is that the participant does not have to ask for their sentences again. Offering exactly
one such control SHALL be asserted by count rather than by the absence of a second, because a control
that can be satisfied by having none at all is an assertion that cannot fail.

#### Scenario: Continuing requests a new batch from the server

- **WHEN** a validator activates the continue control on the finished presentation
- **THEN** the server requests a new batch on the validator's behalf and the new batch is presented

#### Scenario: The continued batch excludes entries the validator has already answered

- **WHEN** a validator continues after finishing a batch
- **THEN** no entry they have already answered appears in the new batch

#### Scenario: Exactly one continue control is offered

- **WHEN** the finished presentation is rendered
- **THEN** exactly one control can request another batch, asserted by counting occurrences rather than
  by asserting that no second such control is present

#### Scenario: An exhausted pool is reported honestly when continuing

- **WHEN** a validator activates the continue control and no eligible entry remains in the dataset
- **THEN** the outcome is reported as an exhausted pool rather than as a failure, in the same terms the
  existing exhausted-pool behaviour already uses, and no batch is fabricated

### Requirement: Finishing is offered as a distinct action that discards nothing

The finished presentation SHALL offer a separate, clearly distinct way to stop, which ends the
participant's current pass without discarding, undoing, or altering any recorded response. Choosing it
SHALL write nothing: it records no participation state, no completion marker, and no abandonment flag.

Declining to continue SHALL NOT be recorded as a fact about the validator, because the approved
research method defines no participation-end event, and inventing one would collect a fact about an
anonymous participant that no approved requirement asks for. Everything the validator submitted stays
persisted exactly as submitted, and a participant who returns later is still eligible to continue.

#### Scenario: Finishing leaves every recorded response untouched

- **WHEN** a validator chooses to finish after completing a batch
- **THEN** every response they have submitted remains exactly as recorded, and nothing is deleted,
  reverted, or marked as abandoned

#### Scenario: Finishing writes nothing

- **WHEN** a validator chooses to finish
- **THEN** no participation, completion, or abandonment record is written, and the action writes no
  row at all

#### Scenario: Finishing and continuing are distinct controls

- **WHEN** the finished presentation is rendered
- **THEN** continuing and finishing are two separate controls, and choosing one does not trigger the
  other

### Requirement: The finished presentation reveals nothing about the validator's stored profile

The finished presentation SHALL NOT display the validator's stored identifier, their self-reported
proficiency answer, an enrolment or activity timestamp, or any other value read back from the stored
profile. It reports progress only.

This extends the boundary already drawn for the enrolment-confirmation screen to the completion
screen, and it exists for the same reason: a participant-facing figure that is drawn from the stored
profile turns a progress display into an echo of research metadata, and the proficiency answer in
particular must never be shown back as though it were feedback or a judgement.

#### Scenario: The finished presentation shows no identifier and no proficiency answer

- **WHEN** a validator is shown the finished presentation
- **THEN** no stored identifier and no self-reported proficiency answer appear anywhere on it

#### Scenario: Progress figures come from validation records, not from the profile

- **WHEN** the finished presentation reports that a validator has answered entries
- **THEN** those figures are derived from recorded validation responses rather than from any counter
  stored on the validator profile

### Requirement: The finished presentation is localized in both interface languages

The finished presentation's text and the labels of both its controls SHALL exist in **both** interface
languages. The requirement that localization cover the continue and finish controls is already in
force; this change supplies what it asks for and revises the existing finished-screen text, which
currently states that asking for another batch is not part of the study.

Revising that text SHALL NOT state or imply that a validator's contribution depends on how many
batches they complete, and the localized versions SHALL carry the same meaning rather than one being a
looser or shorter rendering of the other.

#### Scenario: Both controls are present in both language catalogs

- **WHEN** the interface is switched to either supported language and the finished presentation is
  rendered
- **THEN** the completion text, the continue control, and the finish control are each present and
  readable

#### Scenario: The stale claim that continuing is unavailable is removed

- **WHEN** the finished presentation is rendered
- **THEN** no text tells the validator that asking for another batch is unavailable, in either
  language
