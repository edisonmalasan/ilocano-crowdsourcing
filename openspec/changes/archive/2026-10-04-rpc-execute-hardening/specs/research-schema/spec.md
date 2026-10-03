# Spec Delta

## ADDED Requirements

### Requirement: Privileged RPC functions are executable by service_role only

Every function the application calls through the privileged path SHALL be executable by
`service_role` and by no other role: `anon` and `authenticated` SHALL be refused by privilege
(`permission denied for function`), not merely by row policy. Revoking from `PUBLIC` alone is
insufficient, because default privileges grant EXECUTE to `anon`/`authenticated` explicitly —
measured on the live project, where all five privileged functions carried both grants despite
their migrations' revokes.

The covered set is closed and exact: `claim_entry_reservations`,
`release_entry_reservation`, `researcher_signin_attempts_record`,
`researcher_signin_attempts_clear`, and `dataset_entries_import`. A sixth privileged function
SHALL receive the same revoke or the set assertion fails.

#### Scenario: Anonymous execution is refused by privilege

- **WHEN** `claim_entry_reservations` is invoked as `anon`
- **THEN** the call is refused with insufficient-privilege before any row policy is evaluated,
  and no row is read, written, or returned

#### Scenario: Authenticated execution is refused the same way

- **WHEN** any covered function is invoked as `authenticated`
- **THEN** it is refused with insufficient-privilege, because there is no
  researcher-authenticated role in this design

#### Scenario: The privileged path is unaffected

- **WHEN** any covered function is invoked as `service_role`
- **THEN** it executes normally, because the revoke names only `anon` and `authenticated`

#### Scenario: The covered set cannot silently shrink

- **WHEN** the migration and the test each name the covered functions
- **THEN** both name the same five, so a function added to one and missing from the other
  fails rather than drifting
