# Spec Delta

## ADDED Requirements

### Requirement: Each presented entry begins with a fresh validation form

When the session presents a dataset entry for validation, its form SHALL hold no state from any previously answered entry: no evaluation selected, no correction text, no English or Filipino translation text, the translation choice at its default, no field errors, and no pending submission. Advancing after a successful submit, arriving at an entry by position, or returning to an unanswered entry SHALL all present the same empty form. The reset SHALL clear the submitted payload as well as the visible inputs — hiding stale values while keeping them submittable is not a reset.

The participant's attempt/session identity and batch progress SHALL NOT be cleared by the reset; only per-entry form state is entry-scoped.

#### Scenario: Submitting entry 1 leaves entry 2 empty

- **WHEN** a validator fills entry 1 completely, submits it successfully, and entry 2 renders
- **THEN** no evaluation is selected, every text input is empty, the translation choice is unmade, no error is shown, and submitting immediately is refused as an incomplete response rather than sending entry 1's answer again

#### Scenario: Errors do not survive an advance

- **WHEN** a validator triggers a field error on entry 1 and then reaches entry 2
- **THEN** entry 2 shows no error from entry 1

#### Scenario: Identity and progress survive the reset

- **WHEN** the form resets for a new entry
- **THEN** the attempt identifier, the batch, and the completed count are unchanged, and only entry-scoped state is cleared
