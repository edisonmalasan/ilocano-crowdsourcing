# Spec Delta

## ADDED Requirements

### Requirement: Public enrollment writes are paced per origin

Enrollment SHALL limit repeated validator-minting calls with an origin-scoped bucket so that a
high-speed caller cannot mint validator rows at machine speed. The check SHALL run after strict
input parsing (invalid payloads are refused without consuming budget or touching the database)
and before the validator row is created, so a refused enrollment performs zero database writes.
Refusal SHALL carry a typed throttled outcome with a generic participant-facing message and
SHALL create no validator row, store no identifier, and reveal nothing about other attempts.

#### Scenario: Abusive enrollment burst is refused without a write

- **WHEN** a client issues an abusive burst of enrollment calls from one origin
- **THEN** further calls are refused with the typed throttled outcome and no validator row is
  created for any refused call

#### Scenario: Invalid enrollment payloads consume no budget

- **WHEN** an enrollment call carries an invalid proficiency value or identifying field
- **THEN** it is refused by parsing before the throttle check and a later valid enrollment from
  the same origin is not starved by the invalid calls

#### Scenario: Ordinary enrollment is unaffected

- **WHEN** a validator enrolls once per browser session through the normal screening flow
- **THEN** the enrollment succeeds exactly as before with no throttled outcome
