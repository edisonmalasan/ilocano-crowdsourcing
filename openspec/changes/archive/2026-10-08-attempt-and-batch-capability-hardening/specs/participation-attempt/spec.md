# Spec Delta

## ADDED Requirements

### Requirement: New attempt identities carry 128-bit server-minted entropy

Newly minted anonymous attempt identifiers SHALL use at least 128 bits of
cryptographically secure randomness generated server-side, in the shape
`VAL_` followed by 32 lowercase hex characters (16 CSPRNG bytes). Minting
SHALL use a CSPRNG only: no `Math.random`, no timestamp, no sequence or
counter, no hash of participant information, no IP address, and no
device/browser information. When no CSPRNG is reachable the mint SHALL fail
closed by throwing rather than producing a predictable identifier.

Identifiers in the legacy shape (`VAL_` + 8 lowercase hex) SHALL remain
acceptable wherever an existing record requires it, but the mint SHALL never
produce the legacy shape again. The `VAL_` prefix is retained.

#### Scenario: New attempts mint the strong shape

- **WHEN** the server mints an anonymous attempt identity
- **THEN** the value matches `VAL_` + 32 lowercase hex characters

#### Scenario: Legacy identifiers are accepted but never minted

- **WHEN** an existing record carries a legacy `VAL_` + 8-hex identifier
- **THEN** it continues to resolve where required, and no new enrollment mints
  that shape

#### Scenario: Randomness failure fails closed

- **WHEN** no CSPRNG is reachable at mint time
- **THEN** the mint throws and no identifier is produced

### Requirement: Throttled public resume does not oracle identifiers

The public resume/ownership-check surface SHALL be rate-limited with
action-specific buckets combining a short-lived hashed request-origin
component and a per-attempt component at generous human thresholds. Unknown,
malformed, throttled, and absent outcomes SHALL be indistinguishable to a
prober and SHALL NOT make enumeration easier. The platform SHALL NOT log raw
attempt IDs unnecessarily and SHALL NOT persist request-origin information
into research tables.

#### Scenario: Resume probing is throttled

- **WHEN** a client issues high-speed resume/ownership probes
- **THEN** further attempts are refused with a typed generic outcome and no
  batch or sentence data is revealed

#### Scenario: No request-origin data enters research records

- **WHEN** any throttled or unthrottled public action runs
- **THEN** no raw IP address or request-origin value is written to a research
  table or export
