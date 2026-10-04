# Spec Delta

## REMOVED Requirements

### Requirement: The export is an operator command and performs no research-data write

> **Why this requirement is removed rather than modified.** Its first scenario
> forbids every request path from triggering an export. The approved product
> decision adds exactly one authenticated request path — the signed researcher
> download — while the read-only property, the five-file set, and the operator
> command are unchanged. Recorded **in full, verbatim**, replaced below.

The export SHALL run as an operator command and SHALL NOT be reachable from an HTTP route, a Server
Action, or a page. It SHALL NOT write, update, or delete any dataset entry, validation, validator, or
other research record; it reads the corpus and writes only its own output files. Its destination
SHALL be supplied by the operator, and a refusal to write SHALL be reported rather than silently
producing a partial artifact.

#### Scenario: No request path can trigger an export

- **WHEN** the application's routes, Server Actions, and pages are examined
- **THEN** none of them invokes the export, and the export exists only as a command

#### Scenario: The export writes no research row

- **WHEN** the export runs
- **THEN** it performs no insert, update, or delete against a research table, and its only writes
  are its own output files

#### Scenario: An unwritable destination is reported

- **WHEN** the export cannot write its output
- **THEN** it reports the failure with the destination it was given, and does not report success

## ADDED Requirements

### Requirement: The export runs as an operator command and as one authenticated download, and performs no research-data write

The export SHALL run as an operator command, and SHALL additionally be downloadable through exactly
one authenticated request path: the researcher export download, available only to a signed
researcher session. No public route, no Server Action, and no validator-facing page SHALL invoke
the export. It SHALL NOT write, update, or delete any dataset entry, validation, validator, or
other research record; it reads the corpus and emits only its own artifacts. Its command
destination SHALL be supplied by the operator, and a refusal to write SHALL be reported rather
than silently producing a partial artifact.

#### Scenario: Exactly one request path serves the export

- **WHEN** the application's routes, Server Actions, and pages are examined
- **THEN** the researcher export download is the only one that serves export content, and the
  export otherwise exists only as a command

#### Scenario: The export writes no research row on either path

- **WHEN** the export runs, by command or by authenticated download
- **THEN** it performs no insert, update, or delete against a research table, and its only
  emissions are its own artifacts

#### Scenario: An unwritable destination is reported

- **WHEN** the export cannot write its output
- **THEN** it reports the failure with the destination it was given, and does not report success
