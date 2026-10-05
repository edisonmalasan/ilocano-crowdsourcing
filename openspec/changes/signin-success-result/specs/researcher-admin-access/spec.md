# Spec Delta

## ADDED Requirements

### Requirement: A successful sign-in completes by returned result, never by a redirect exception

A successful researcher sign-in SHALL complete as a returned success result carrying no credential and no session content, and the sign-in form SHALL navigate to the researcher area on that result. The server action SHALL NOT end success by throwing a redirect: a redirect is control flow disguised as failure, and any client-side `catch` between the call and the navigation — including a future one — converts it into the refusal message, showing a refusal for an access that was granted.

#### Scenario: Correct credential navigates with no refusal ever rendered

- **WHEN** a researcher submits the correct operator credential
- **THEN** a session cookie is issued, the client navigates to `/researcher`, and no refusal message appears at any point

#### Scenario: A refused credential still renders the generic refusal

- **WHEN** a researcher submits an incorrect credential
- **THEN** the existing generic refusal is rendered exactly as before, and no navigation occurs

#### Scenario: Transport failures keep the generic failure treatment

- **WHEN** the sign-in request never produces an answer
- **THEN** the generic failure message is shown without confusing it with a successful redirect
