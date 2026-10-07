# Spec Delta

## ADDED Requirements

### Requirement: Public resume checks are throttled and oracle-free

The resume path SHALL limit repeated attempts with action-specific buckets
so that high-speed valid/invalid identifier probing is refused. Malformed,
unknown, and throttled failures SHALL NOT make enumeration easier and SHALL
NOT emit distinct participant-facing messages that distinguish the cases.

#### Scenario: Abusive resume burst is refused

- **WHEN** a client issues an abusive burst of resume attempts
- **THEN** further attempts are refused with a typed generic outcome and no
  validator data is revealed

#### Scenario: Distinct resume failures stay indistinguishable

- **WHEN** resume fails as malformed, unknown, or throttled
- **THEN** the participant-facing outcome does not distinguish the cases
