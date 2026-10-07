# Spec Delta

## ADDED Requirements

### Requirement: Batch session open is ownership-gated with a unified redirect

Opening a validation session SHALL take the requested batch identifier plus
the browser's current active attempt identity, load the stored batch,
derive the stored owner, and compare the two server-side. Content SHALL be
returned only on equality. Mismatch, unknown batch, malformed attempt, absent
attempt, and non-resumable batches where revealing the distinction is
unnecessary SHALL all produce one generic redirect outcome to `/`, preserving
the interface locale where the locale architecture supports it. The outcome
SHALL NOT name which case occurred, SHALL NOT create a validator on foreign
link open, and SHALL NOT crawler-mint junk validator rows.

Submission authorization SHALL continue to derive ownership from stored batch
state rather than trusting a browser-provided validatorId.

#### Scenario: Matching session opens the current entry

- **WHEN** the owning session opens its batch address with its active attempt
- **THEN** the current entry resolves server-side exactly as before

#### Scenario: Foreign link under another attempt redirects without content

- **WHEN** a batch address is opened under a different active attempt
- **THEN** no sentence is revealed and the outcome is a redirect to `/`

#### Scenario: Foreign link with no attempt redirects without auto-enrollment

- **WHEN** a batch address is opened with no active attempt
- **THEN** no sentence is revealed, no validator row is created, and the
  outcome is a redirect to `/`

#### Scenario: Locale is preserved across the ownership redirect

- **WHEN** the ownership gate redirects
- **THEN** the interface locale is preserved where the locale architecture
  supports it
