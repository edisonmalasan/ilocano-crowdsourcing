# Spec Delta

## ADDED Requirements

### Requirement: New batch identifiers are independent opaque capabilities

Newly minted batch identifiers SHALL be cryptographically random and
independent of the attempt identity, in the shape `BAT_` followed by 32
lowercase hex characters (at least 128 bits of CSPRNG entropy), using
URL-safe characters, generated server-side. A new batch identifier SHALL NOT
contain, encode, hash, or derive from the validator ID, the creation instant,
entry IDs, or a batch number/counter. The `validatorId-timestamp` mint is
retired for new batches. `batch_id`, `validator_id`, and `created_at` remain
separate stored facts.

Legacy stored batch identifiers SHALL remain readable only through the
ownership authorization; new batches SHALL mint only `BAT_` identifiers. No
primary-key or foreign-key rewrite of research history is performed to
normalize identifiers.

#### Scenario: New batch IDs contain no validator identity

- **WHEN** a new batch identifier is inspected
- **THEN** it does not contain the owning attempt's identifier in any encoded
  or hashed form

#### Scenario: New batch IDs contain no timestamp

- **WHEN** a new batch identifier is inspected
- **THEN** it carries no creation instant, counter, or entry reference

#### Scenario: Legacy batches stay readable through the ownership gate

- **WHEN** a legacy batch is opened by its owning session with proof of
  attempt
- **THEN** it resolves exactly as before, subject to the same ownership check
  as a new batch

### Requirement: A batch address alone grants nothing

The server SHALL return batch sentence content only when the stored batch
owner equals the browser's currently supplied active attempt identity. The
check SHALL require both the requested batch identifier and the active
attempt identity; a batch identifier alone SHALL NOT open a batch.

The initial server render of a batch address SHALL reveal no participant
sentence data before ownership is proven. A direct refresh by the legitimate
owning session SHALL continue to work.

#### Scenario: Owner with matching attempt resumes

- **WHEN** the supplied active attempt equals the stored batch owner
- **THEN** the approved session projection is returned

#### Scenario: Foreign attempt reveals nothing and redirects home

- **WHEN** the supplied active attempt differs from the stored batch owner
- **THEN** no sentence, batch metadata, validator identity, or existence
  distinction is revealed, and the participant-facing outcome is a redirect to
  `/`

#### Scenario: No attempt reveals nothing and redirects home

- **WHEN** no active attempt is supplied
- **THEN** no sentence or metadata is revealed, no validator is created, and
  the participant-facing outcome is a redirect to `/`

#### Scenario: Unknown batch is indistinguishable from foreign

- **WHEN** the batch identifier names no stored batch
- **THEN** the participant-facing outcome is the same redirect to `/` with no
  existence signal
