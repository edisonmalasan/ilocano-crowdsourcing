# Spec Delta

## ADDED Requirements

### Requirement: Entry reservations are stored in an operational table, never in the dataset

The schema SHALL provide an `entry_reservations` table holding one row per reserved entry:
`entry_id` (primary key, referencing the dataset entry), `validator_id` (the holding attempt),
`reserved_at`, and `expires_at`. The table SHALL carry no synthetic-dataset content and SHALL
add no column to any dataset table: reservation is operational state about the allocation pool,
and the imported source stays immutable.

Rows SHALL be removed when their entry is answered (release on submit), when they expire
(lazily, inside the claim transaction — never by a watcher), and opportunistically whenever a
claim touches them. No process SHALL be required to run continuously for expiry to take effect.

#### Scenario: A reservation names its holder and its deadline

- **WHEN** an entry is reserved for an attempt
- **THEN** exactly one row exists for that entry, naming the holding attempt and an expiry
  instant derived from the configured TTL

#### Scenario: Expiry needs no watcher

- **WHEN** a reservation's expiry instant passes with no process running
- **THEN** the entry is eligible again: the next claim reclaims it by time comparison alone

#### Scenario: The dataset carries no reservation state

- **WHEN** the dataset tables are inspected
- **THEN** no reservation column, flag, or timestamp exists on any of them

### Requirement: Reservation claims arbitrate atomically at the database layer

The schema SHALL provide a `claim_entry_reservations` function that, in ONE transaction, deletes
expired claims over the supplied candidate ids and inserts the caller's claims with
`ON CONFLICT (entry_id) DO NOTHING`, returning the granted subset. Simultaneous claims for one
entry SHALL be decided by the primary key itself: exactly one claimant is granted, the others
skip the row. No application read-then-write SHALL decide a claim; the application supplies
candidates and records grants.

#### Scenario: Simultaneous claims grant exactly one holder

- **WHEN** two claim calls name the same entry with no unexpired reservation behind it
- **THEN** exactly one call is granted that entry, whether the calls overlap in time or follow
  one another

#### Scenario: An expired claim is reclaimed by time comparison

- **WHEN** a claim call names an entry whose reservation expired
- **THEN** the expired row is removed and the new claim is granted, with no sweeper involved

#### Scenario: An unexpired claim blocks everyone else

- **WHEN** a claim call names an entry another attempt holds under an unexpired reservation
- **THEN** the call is not granted that entry, and the existing row is unchanged

### Requirement: Reservations share the deny-all research posture

Row Level Security SHALL be enabled on `entry_reservations` with no policy granting `anon` or
`authenticated` access, like every research table. Application access SHALL be server-side
through the privileged path. Constraint violations — including the duplicate-entry refusal —
SHALL surface as typed errors naming the failed operation, never as silent no-ops.

#### Scenario: A public credential cannot read or write reservations

- **WHEN** reservations are requested with a public or anon credential
- **THEN** the request is refused by default, like every other research table

### Requirement: Release on submit keeps the table to live claims

After every successfully stored validation response, the service SHALL delete the submitting
attempt's reservation row for that entry — best-effort: a release failure is logged and SHALL
NOT fail the submit. A qualifying submit needs no row afterwards (the entry is complete and
allocation ignores it); a `cannot_evaluate` submit releases its row so the entry becomes
allocatable again. Abandonment without submit relies on TTL expiry, so retiring an attempt
SHALL still write nothing to the server.

#### Scenario: A stored response releases its entry

- **WHEN** a validator's response for an entry is stored
- **THEN** no reservation row for that validator and entry remains afterwards

#### Scenario: A failed release does not fail the submit

- **WHEN** the reservation delete fails after a successful validation insert
- **THEN** the submit still reports recorded, the failure is logged for the operator, and the
  row decays by expiry
