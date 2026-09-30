# Spec Delta

## MODIFIED Requirements

### Requirement: Six research tables exist with the documented shape

The platform SHALL provide `dataset_entries`, `validators`, `validation_sessions`,
`validation_batches`, `batch_entries`, and `validations`. Primary keys SHALL be the domain
identifiers defined by the domain contracts — the source dataset entry id, the anonymous validator
id, and opaque non-empty text elsewhere — and SHALL NOT be surrogate `uuid` values, because no
validator in this platform is a Supabase authenticated user and nothing in the domain joins on an
authentication subject.

#### Scenario: A dataset entry is keyed by its source identifier

- **WHEN** a dataset entry is stored
- **THEN** its primary key is the source dataset entry id, so the externally meaningful
  identifier is preserved rather than replaced by an internal one

#### Scenario: A validator is keyed by its anonymous identifier

- **WHEN** an anonymous validator profile is stored
- **THEN** its primary key is the anonymous validator id and no column exists for a name, email
  address, student id, phone number, or address

#### Scenario: The schema does not couple identity to an authentication subject

- **WHEN** the schema is inspected
- **THEN** no primary key, foreign key, index, or default value references `auth.users` or
  `auth.uid()`, because an anonymous validator has no authentication subject

#### Scenario: Structural tables carry no invented behavior

- **WHEN** `validation_sessions`, `validation_batches`, and `batch_entries` are created
- **THEN** they exist so that foreign keys from `validations` are real, and `batch_entries` carries
  a `position` recording the server-selected order of its batch, while batch status, completion
  timestamps, and assignment timestamps remain undefined until the changes that own them add them
