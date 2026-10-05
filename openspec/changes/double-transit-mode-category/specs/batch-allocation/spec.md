# Spec Delta

## MODIFIED Requirements

### Requirement: Five same-suffix entries across categories allocate independently

`D_42`, `DT_42`, `OD_42`, `ODT_42`, `CPE_42`, and `DTM_42` SHALL be six distinct allocatable
entries by canonical id. Assignment of one SHALL never block or answer another, and the
at-most-once rule SHALL apply per canonical id. All existing guarantees — completed
entries excluded, active reservations exclusive with TTL reclaim, `cannot_evaluate`
never completing, honest short batches — SHALL hold unchanged over all 4,800 entries.

#### Scenario: Same numeric suffix in five categories allocates independently

- **WHEN** the pool holds the six `*_42` entries and one attempt answers `OD_42`
- **THEN** a later allocation may still offer the other five, and never offers `OD_42`
  again to that attempt

### Requirement: Allocation-scale reads hold at 4000 entries

Whole-pool and id-filtered reads SHALL serve the 4,800-entry corpus through the same
bounded mechanisms proven at 3,000: paged whole-pool reads past the per-request cap
with per-page count agreement, and id filters chunked rather than issued as one giant
`.in()`. Growing the corpus SHALL NOT reintroduce truncation or refusal failures.

#### Scenario: A corpus larger than the response cap still allocates

- **WHEN** allocation reads a pool larger than one PostgREST response
- **THEN** every active entry is considered exactly once, or the read refuses loudly
  rather than serving a short pool
