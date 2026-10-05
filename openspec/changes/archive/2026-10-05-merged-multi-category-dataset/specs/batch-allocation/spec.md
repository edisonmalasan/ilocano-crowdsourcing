# Spec Delta

## ADDED Requirements

### Requirement: Allocation draws from one shared pool across all active categories

Allocation SHALL consider every active entry regardless of category, with all existing
guarantees intact: completed entries excluded, no same canonical entry twice to one attempt,
active reservations exclusive with TTL reclaim, `cannot_evaluate` never completing, and honest
short batches. Two entries sharing a source-local id under different categories SHALL be two
distinct allocatable entries by canonical id and SHALL coexist safely.

#### Scenario: Same local id in two categories allocates independently

- **WHEN** the pool holds entries with the same source-local id under different categories
- **THEN** both are eligible by their canonical ids, assignment of one never blocks or answers
  the other, and the at-most-once rule applies per canonical id
