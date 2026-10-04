# Spec Delta

## ADDED Requirements

### Requirement: The dashboard offers the research export download

The authenticated researcher dashboard SHALL offer an "Export research data" action that starts the researcher export download for the current corpus. The action SHALL be visible only to signed researchers, inside the protected area, beside the coverage figures it summarizes.

#### Scenario: Signed researcher sees the export action

- **WHEN** an authenticated researcher views the dashboard
- **THEN** the export action is present, labelled as a download of the current research data

#### Scenario: The action starts a download, not a navigation

- **WHEN** the researcher invokes the export action
- **THEN** the browser receives the dated ZIP as a file download rather than a new page
