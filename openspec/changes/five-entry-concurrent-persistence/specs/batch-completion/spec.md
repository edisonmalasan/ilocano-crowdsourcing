# Spec Delta

## MODIFIED Requirements

### Requirement: A finished batch is recognised from the absence of work, never from an assertion

When a validator has answered every entry a batch holds, the batch SHALL be presented as finished.
The server SHALL derive that state from the absence of unanswered entries in the batch, and a
client SHALL NOT be able to assert that a batch is finished, that a number of entries remain, or that
a validator has completed any particular total.

Finishing SHALL be reported as a terminal presentation state and SHALL NOT introduce a persisted
batch-lifecycle status. A batch is finished when no work remains in it, and the absence of remaining
entries is the single source of that truth. Storing a `status` on the batch would create a second
authority that can disagree with the entries, and this change deliberately declines to add one.

The finished card SHALL use the current owner-approved minimal copy: a heading stating the batch
is finished and an invitation to answer another batch ("Would you like to answer another batch?"
with the Filipino equivalent). It SHALL NOT show batch or lifetime numeric figures, explanatory
paragraphs, progress statistics, or save/sync counters. Owner-removed content stays removed; no
removed copy is restored merely because an older test expects it.

The two completion controls (Answer another batch, Finish for now) SHALL stay unavailable until
the hard checkpoint defined in `response-persistence` passes: queue drained AND fresh server
verification proving stored responses for every batch placement. While verification is incomplete
the card shows its visual shell with disabled/aria-busy semantics and no routine saving message;
failures surface as actionable errors. Finish SHALL NOT retire the attempt before the checkpoint
passes; Answer another batch SHALL keep the same attempt and allocate a new 5-entry batch.

> **Earlier numeric-figure text is SUPERSEDED and recorded, not deleted.** The finished screen once
> stated batch and lifetime totals; that display was withdrawn by owner decision. Server-side counts
> remain for progress derivation and read-back; they are simply not presented.

#### Scenario: The last answered entry leads to a finished batch

- **WHEN** a validator's response to the last unanswered entry in a batch is persisted
- **THEN** the next presentation of that batch reports the batch as finished rather than offering
  another entry

#### Scenario: A client cannot declare a batch finished

- **WHEN** a client submits a write request that also supplies a completion status, a count of
  answered entries, or a count of remaining entries
- **THEN** those values are ignored and the server derives the authoritative state itself from the
  persisted entries

#### Scenario: Finishing a batch records no lifecycle state of its own

- **WHEN** a batch becomes finished
- **THEN** no batch status, completion timestamp, or abandonment marker is written, because
  `research-schema` leaves those undefined until the change that owns them, and the finished
  presentation derives its own state

#### Scenario: Completion controls wait for the checkpoint

- **WHEN** the finished card is shown before queue drain plus server verification of all 5 placements
- **THEN** both controls are unavailable and no routine saving message is shown

#### Scenario: Verification of all five enables the controls

- **WHEN** server verification proves stored responses for every batch placement
- **THEN** Answer another batch and Finish for now become usable

#### Scenario: The finished card shows minimal copy only

- **WHEN** a validator views the finished card
- **THEN** no numeric figure, explanatory paragraph, progress statistic, or save/sync counter is shown
