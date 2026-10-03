# Spec Delta

## ADDED Requirements

### Requirement: A contention-short batch presents its actual persisted size

A batch that allocation persisted short under contention SHALL present its
actual persisted size everywhere a size appears: the session total, the
position readout, and the completion and progress counts SHALL all derive
from the batch's own persisted entries rather than from the configured batch
size. A 9-entry persisted batch SHALL display positions 1 of 9 through 9 of 9.
No entry SHALL be repeated merely to satisfy the configured size of 10, and a
completed entry SHALL NOT be presented again for validation within the same
batch. Allocation SHALL still collapse to the short batch within its existing
bounded claim rounds rather than waiting indefinitely for exactly 10, and
exclusive reservation semantics are unchanged by this requirement.

#### Scenario: A 9-entry batch reports a total of 9

- **WHEN** a validator opens a batch whose persisted entries number 9
- **THEN** the session total is 9, derived from those persisted entries

#### Scenario: Positions run 1 of 9 through 9 of 9

- **WHEN** a validator works through a 9-entry batch in the server-allocated
  order
- **THEN** each presented entry carries its persisted 1-based position and the
  readout advances from 1 of 9 to 9 of 9

#### Scenario: No entry is repeated to reach 10

- **WHEN** contention leaves a batch with 9 granted entries of 10 requested
- **THEN** the persisted batch contains 9 entries with 9 distinct dataset
  entry ids and contiguous positions 1 through 9, and no tenth row

#### Scenario: Progress and completion counts use the actual size

- **WHEN** a validator has completed entries in a 9-entry batch
- **THEN** the completed and remaining counts sum to 9, and completing all 9
  reports the batch finished with a completed count of 9

#### Scenario: A completed entry in a short batch is not presented again

- **WHEN** a validator returns to a position whose entry they already completed
  in the same short batch
- **THEN** that entry is not presented again for validation

#### Scenario: Allocation does not wait indefinitely for exactly 10

- **WHEN** claim rounds grant fewer entries than requested and bounded
  backfill still leaves the batch short
- **THEN** the short batch is reported as allocated (or `exhausted` when none
  could be granted) within the existing round bound, and the request is not
  retried indefinitely
