# signin-refusal-diagnostics Specification

## Purpose

Operators diagnosing a researcher sign-in refusal can tell its cause apart server-side, while requesters still cannot tell any causes apart at all.

## Requirements

### Requirement: Every sign-in refusal is recorded server-side with its reason

Each refused researcher sign-in SHALL emit one server log line carrying the internal refusal reason (`not_configured`, `limit_reached`, `bad_credential`, or `counter_unavailable`) together with the coarse origin key the attempt was counted against. A successful sign-in SHALL emit one server log line carrying the credential ordinal and the same origin key. No log line SHALL carry a credential, a session token, or any value from which either is recoverable, and no reason SHALL reach the requester apart from the single outward refusal message.

#### Scenario: A refusal names its reason in the server log

- **WHEN** a sign-in is refused for any of the four internal reasons
- **THEN** exactly one log line records that reason with the origin key, and the requester receives only the standard refusal message

#### Scenario: A success names its credential position in the server log

- **WHEN** a sign-in succeeds
- **THEN** one log line records the credential ordinal with the origin key, carrying no credential and no session

#### Scenario: The log carries nothing an attacker can reuse

- **WHEN** any sign-in log line is read
- **THEN** it contains no credential, no session token, no digest of either, and nothing that distinguishes one configured credential from another beyond its position
