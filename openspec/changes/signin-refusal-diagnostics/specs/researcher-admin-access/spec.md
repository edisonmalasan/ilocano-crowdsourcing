# Spec Delta

## ADDED Requirements

### Requirement: Sign-in refusals are server-observable without becoming client-distinguishable

In addition to the single outward refusal message, every researcher sign-in outcome SHALL emit one server log line: refused attempts carry the internal reason with the coarse origin key, successful attempts carry the credential ordinal with the origin key. The outward refusal SHALL remain exactly one indistinguishable message across all reasons, and no reason, credential, session token, or recoverable derivative SHALL reach the requester or the browser.

#### Scenario: Operator can distinguish causes that requesters cannot

- **WHEN** sign-ins are refused for different internal reasons
- **THEN** the server log distinguishes them while every requester receives the identical refusal message

#### Scenario: The outward message is unchanged

- **WHEN** any sign-in refusal is rendered
- **THEN** it is the same single refusal message as before this change, with no reason appended and no per-cause variation
