# Spec Delta

## MODIFIED Requirements

### Requirement: Finishing is offered as a distinct action that discards nothing

The finished presentation SHALL offer a separate, clearly distinct way to stop, which ends the
participant's current pass without discarding, undoing, or altering any recorded response. Choosing it
SHALL write nothing: it records no participation state, no completion marker, and no abandonment flag,
and it writes no row at all.

Choosing it SHALL additionally retire the participant's **participation attempt** by discarding the
browser-local attempt identity, and SHALL then leave the public flow. That discard is a client-local
act: it creates no server-side fact, and it is the reason a later participation is a new attempt
rather than a continuation of this one. "Writes nothing" is a statement about the server and SHALL NOT
be read as "does nothing at all".

Declining to continue SHALL NOT be recorded as a fact about the validator, because the approved
research method defines no participation-end event, and inventing one would collect a fact about an
anonymous participant that no approved requirement asks for. Everything the validator submitted stays
persisted exactly as submitted.

> **Amended during Apply.** This requirement previously said that "a participant who returns later is
> still eligible to continue", which was true under the superseded model in which one browser profile
> carried one identity for the life of the study and returning therefore resumed the same validator.
> Under session-scoped attempts a returning participant is a **new attempt**: they are screened again
> and given a new identity. Their earlier responses are untouched and still count, and this screen's
> lifetime figure is unchanged, but there is no stored identity to continue *as*. The sentence is
> removed rather than reworded into something weaker, because "still eligible to continue" is exactly
> the claim the methodology correction makes false.

#### Scenario: Finishing leaves every recorded response untouched

- **WHEN** a validator chooses to finish after completing a batch
- **THEN** every response they have submitted remains exactly as recorded, and nothing is deleted,
  reverted, or marked as abandoned

#### Scenario: Finishing writes nothing

- **WHEN** a validator chooses to finish
- **THEN** no participation, completion, or abandonment record is written, and the action writes no
  row at all

#### Scenario: Finishing retires the attempt

- **WHEN** a validator chooses to finish
- **THEN** the browser-local attempt identity is discarded so that the same browser session begins a
  new, screened attempt next time, and that discard is the only effect beyond writing no row

#### Scenario: Finishing and continuing are distinct controls

- **WHEN** the finished presentation is rendered
- **THEN** continuing and finishing are two separate controls, and choosing one does not trigger the
  other

#### Scenario: Finishing leaves the public flow

- **WHEN** a validator chooses to finish
- **THEN** they are taken out of the validation flow to a page that asks for nothing further of them
  and offers no way to resume the retired attempt
