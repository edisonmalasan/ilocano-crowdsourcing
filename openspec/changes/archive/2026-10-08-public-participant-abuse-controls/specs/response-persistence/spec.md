# Spec Delta

## ADDED Requirements

### Requirement: Background response submission is paced per origin and per batch

Response submission SHALL limit repeated save calls with origin-scoped and batch-scoped buckets
so that a high-speed caller cannot flood the validations table at machine speed. The check SHALL
run after strict input parsing (malformed POSTs are refused before any database work, unchanged)
and before the submission RPC, so a refused save runs zero database RPCs. Refusal SHALL carry a
typed throttled reason that the queue treats as transient (retried with backoff, never parked as
a permanent refusal) and SHALL NOT create a second response: the
`UNIQUE (validator_id, dataset_entry_id)` guarantee and the already-recorded path are unchanged.

#### Scenario: Abusive submit burst is refused without RPCs

- **WHEN** a client issues an abusive burst of response saves against one batch or origin
- **THEN** further saves are refused with the typed throttled reason and no submission RPC runs
  for any refused save

#### Scenario: Throttled saves retry rather than park

- **WHEN** a queued save is refused by pacing
- **THEN** the queue retries it with backoff and the participant is not told the answer was not
  stored

#### Scenario: Ordinary submission is unaffected

- **WHEN** a validator submits the entries of one batch at human speed
- **THEN** every save succeeds exactly as before with no throttled outcome
