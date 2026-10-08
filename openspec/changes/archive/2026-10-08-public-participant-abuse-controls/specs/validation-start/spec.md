# Spec Delta

## ADDED Requirements

### Requirement: Start orchestration calls are paced per origin and per attempt

The start orchestration SHALL limit repeated allocation calls with origin-scoped and
attempt-scoped buckets so that a high-speed caller cannot burn reservations or run allocation
RPCs at machine speed. The check SHALL run before any database read, so a refused start performs
zero database work and allocates nothing. Refusal SHALL carry a typed throttled outcome with a
usable retry action and SHALL NOT collapse into `exhausted`, `screening_required`, or any honest
error: those outcomes remain reachable and unchanged for non-throttled calls.

#### Scenario: Abusive start burst is refused without allocation

- **WHEN** a client issues an abusive burst of start calls under one attempt or origin
- **THEN** further calls are refused with the typed throttled outcome, no allocation RPC runs,
  and no batch or reservation is created for any refused call

#### Scenario: Throttled start stays distinguishable from exhausted

- **WHEN** a start call is refused by pacing
- **THEN** the participant is offered a retry path, not the exhausted or screening-required state

#### Scenario: Ordinary start is unaffected

- **WHEN** a validator starts one batch, answers it, and starts another
- **THEN** each start succeeds exactly as before with no throttled outcome
