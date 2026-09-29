# Spec Delta

## Purpose

Defines the domain contracts every layer of the platform depends on: the shapes and vocabulary of
dataset entries, validators, validation responses, and batch requests, and the integrity rules
that keep a stored research response internally consistent.

## MODIFIED Requirements

### Requirement: Validator must not validate the same entry twice

The platform SHALL treat "one anonymous validator holds at most one validation for a given dataset
entry" as a repository-level contract: a second insert for the same pair SHALL be surfaced as a
typed error naming the failed operation, and SHALL NOT be silently swallowed as a no-op, because
"already validated" is a meaningful outcome the service must be able to report to the validator.

The data-layer guarantee for this rule is a uniqueness constraint over the pair of validator and
dataset entry, enforced by the database independently of application code. That constraint exists:
`validations` carries a named uniqueness constraint over `(validator_id, dataset_entry_id)`, and
the constraint is exercised against a real PostgreSQL engine so a duplicate is rejected by the
database and not merely by an application check. The repository seam described above is what the
constraint sits behind, and a repository implementation surfaces a violation as a typed error
rather than absorbing it.

#### Scenario: A duplicate insert is surfaced as a named error, not a silent success

- **WHEN** a second validation is submitted for the same validator and the same dataset entry
- **THEN** the repository raises a typed error naming the insert operation, and the caller can
  distinguish that outcome from a transport failure and from a successful first insert

#### Scenario: Different validators may validate the same entry

- **WHEN** two different anonymous validators each submit a validation for the same dataset
  entry
- **THEN** neither insert is rejected as a duplicate of the other

#### Scenario: The at-most-once rule is not left to application code alone

- **WHEN** the uniqueness constraint over `(validator_id, dataset_entry_id)` is exercised against
  the database
- **THEN** a duplicate insert is rejected by the constraint itself, so the rule still holds if
  application code is bypassed, and the rejection is asserted in the PostgreSQL integration
  harness rather than only in an application test
