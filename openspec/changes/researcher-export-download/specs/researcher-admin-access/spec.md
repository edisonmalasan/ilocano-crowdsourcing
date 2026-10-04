# Spec Delta

## ADDED Requirements

### Requirement: The export download verifies its own request

The researcher export download SHALL verify the request's presented session with the same researcher-area guard before any privileged access, independently of any layout or route-group placement. A refused request SHALL receive the area's standard refusal with no reason, no corpus-derived bytes, and no indication of whether the area is configured.

#### Scenario: Verification precedes privilege on the download

- **WHEN** an export request arrives without a valid session
- **THEN** it is refused before any privileged client is constructed or any repository is read

#### Scenario: Refusal discloses nothing

- **WHEN** an export request is refused
- **THEN** the response is byte-identical to the refusal for a protected page, carrying no reason and no configuration fact
