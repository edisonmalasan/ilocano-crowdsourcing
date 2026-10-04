# Spec Delta

## REMOVED Requirements

### Requirement: An active validation session presents one entry at a time

> **Why this requirement is removed rather than modified.** Its first scenario
> — *A validator with an allocated batch sees a single entry with its origin
> and destination* — states a presentation rule the thesis owner has now
> reversed: intended endpoints confuse validators rather than guiding them,
> and the dataset identifier is researchers-only. The scenario cannot survive
> as written, while the single-entry, progress, and second-entry scenarios
> are unchanged and still hold. The removed requirement is therefore recorded
> here **in full, verbatim**, and its replacement is added below.

A validator holding an allocated batch SHALL be able to work through it as a session that presents
**exactly one** dataset entry at a time. The presented entry SHALL show the Ilocano sentence together
with the entry's **intended origin** and **intended destination**, and the session SHALL show the
validator's **progress** through the active batch.

The session SHALL NOT require the validator to hold the whole batch in view to know where they are, and
progress SHALL be derived from the batch the server allocated rather than from client-side bookkeeping.

> **Scoped deliberately.** Displaying an entry is not the same as rendering it read-only. What may be
> *entered* for the presented entry is specified by the requirements below, and this requirement says
> nothing about it on purpose — a reader must not infer from "one entry at a time" that any particular
> field is available.

#### Scenario: A validator with an allocated batch sees a single entry with its origin and destination

- **WHEN** a validator opens an allocated batch
- **THEN** exactly one dataset entry is presented, showing its Ilocano sentence, its intended origin,
  and its intended destination

#### Scenario: The session shows progress through the active batch

- **WHEN** a validator is partway through an allocated batch
- **THEN** the session shows their progress through that batch, derived from the server-allocated batch

#### Scenario: A second entry is not presented alongside the current one

- **WHEN** a validator is viewing an entry in an allocated batch
- **THEN** no other entry's sentence is presented for evaluation at the same time

## ADDED Requirements

### Requirement: An active validation session presents one sentence at a time

A validator holding an allocated batch SHALL be able to work through it as a session that presents
**exactly one** dataset entry at a time. The presented entry SHALL show the Ilocano sentence and
nothing else of the entry: neither the intended origin, nor the intended destination, nor the
travel mode, nor the dataset entry identifier is shown to the validator. The session SHALL show the
validator's **progress** through the active batch.

The session SHALL NOT require the validator to hold the whole batch in view to know where they are, and
progress SHALL be derived from the batch the server allocated rather than from client-side bookkeeping.

> **Scoped deliberately.** Displaying an entry is not the same as rendering it read-only. What may be
> *entered* for the presented entry is specified by the requirements below, and this requirement says
> nothing about it on purpose — a reader must not infer from "one entry at a time" that any particular
> field is available.
>
> **Withheld deliberately.** Endpoints and identifiers are research-internal: comparison against a
> stated intent was producing confusion rather than signal, and the identifier is researchers-only.
> Researcher surfaces keep full data; this rule governs the participant screen alone.

#### Scenario: A validator with an allocated batch sees a single sentence

- **WHEN** a validator opens an allocated batch
- **THEN** exactly one dataset entry is presented, showing its Ilocano sentence and no endpoint,
  mode, or identifier alongside it

#### Scenario: The session shows progress through the active batch

- **WHEN** a validator is partway through an allocated batch
- **THEN** the session shows their progress through that batch, derived from the server-allocated batch

#### Scenario: A second entry is not presented alongside the current one

- **WHEN** a validator is viewing an entry in an allocated batch
- **THEN** no other entry's sentence is presented for evaluation at the same time
