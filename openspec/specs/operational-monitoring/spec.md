# operational-monitoring Specification

## Purpose

Defines the durable operational monitoring counters and their
aggregate-only alert delivery: per-signal failure counts in fixed
windows with digest-only dedupe, documented per-signal thresholds with
once-per-window dispatch, a five-field aggregate webhook payload, and
the guarantee that recorder or dispatch failure never changes a
research write. All monitoring records carry aggregates only — no
research content and no identity data.

## Requirements

### Requirement: Operational failures are counted durably in aggregate windows

The platform SHALL record each operational failure — enrollment
failure, resume failure, batch allocation failure, response
persistence failure, client retry exhaustion, `already_recorded`
occurrence, abandoned reservation, researcher sign-in failure — as a
durable aggregate counter row in a fixed time window, keyed so that a
retried or duplicated request cannot inflate the count, and SHALL
evaluate documented per-signal thresholds over those windows.

#### Scenario: Retried submission counts once per signal window

- **WHEN** the same validation submission is retried and fails or
  reports `already_recorded` twice within one window
- **THEN** the signal's window count reflects one occurrence for one
  dedupe key, not two

#### Scenario: Breach produces one aggregate dispatch per window

- **WHEN** a signal's window count reaches its documented threshold
- **THEN** exactly one dispatch is recorded for that rule and window,
  carrying only the rule name, window, count, threshold, and timestamp

### Requirement: Monitoring payloads carry no research or identity data

No operational record — counter row, dedupe key, dispatch payload, or
dashboard figure — SHALL contain participant corrections,
translations, sentence text, credentials, service-role keys, raw IP
addresses, or attempt identifiers; dedupe material SHALL be
digest-only.

#### Scenario: Privacy-shape audit of every payload

- **WHEN** any monitoring payload is formed for storage, dispatch, or
  display
- **THEN** it contains only the signal/rule name, window markers,
  counts, thresholds, timestamps, and truncated digests, and the suite
  asserts the absence of every forbidden field by shape

### Requirement: Recorder failure never breaks the research path

A failure of the monitoring recorder or of alert dispatch SHALL NOT
change, delay, or drop any validation response, batch allocation, or
researcher decision; it degrades to the pre-existing diagnostic log.

#### Scenario: Research write succeeds while the recorder throws

- **WHEN** a validation submission succeeds but the counter insert
  throws
- **THEN** the response is persisted and acknowledged exactly as if
  monitoring were absent, and the recorder failure is logged without
  research content
