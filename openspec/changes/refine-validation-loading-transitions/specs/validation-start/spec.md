# Spec Delta

## ADDED Requirements

### Requirement: Start opens directly into the Validating shell

The `/validate` route SHALL NOT present a separate "Start validating" page. While the single start orchestration runs, the route SHALL render the Validating page shell — the same container, header, and layout-matched validation skeleton the participant meets everywhere else in the validating experience — and SHALL navigate to the allocated session as soon as the orchestration resolves. The participant goes from screening Continue directly into the Validating experience with no intermediate waiting-room page.

All server-side work underneath is unchanged: attempt validation, screening requirements, recovery, allocation, reservation, and server authorization run exactly as specified. Only the participant-facing waiting page is removed.

#### Scenario: Continue reaches the Validating shell, not a start page

- **WHEN** a validator completes screening and continues
- **THEN** the Validating shell with a layout-matched skeleton is shown while the orchestration runs, and no separate "Start validating" page appears

#### Scenario: The first real entry replaces the start skeleton

- **WHEN** the start orchestration resolves with a batch and its first entry
- **THEN** the session opens on the real first entry, replacing the skeleton with no intermediate page

#### Scenario: Start failures keep their onward actions

- **WHEN** the orchestration ends in `exhausted`, an honest failure, `screening_required`, or no usable identity
- **THEN** the existing error state with its retry or restart path is shown, exactly as specified, with no skeleton left standing
