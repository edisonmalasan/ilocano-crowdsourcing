# researcher-export-download Specification

## Purpose

Authenticated researchers can download the research export as one dated ZIP from the researcher dashboard, built by the same derivation as the operator command.

## Requirements

### Requirement: An authenticated researcher downloads the export as one dated ZIP

A researcher holding a valid session in the protected researcher area SHALL be offered an "Export research data" action that downloads a single ZIP archive containing exactly the five existing artifacts: `validations.json`, `validations.csv`, `summary.json`, `validated-dataset.json`, and `validated-dataset.csv`. The download filename SHALL carry the server's current date, so two downloads taken on different days are distinguishable without opening them.

#### Scenario: Signed researcher downloads the current corpus

- **WHEN** an authenticated researcher invokes the export action
- **THEN** the response is a ZIP holding the five artifacts generated from the current database state, with a dated filename and a `Content-Disposition: attachment` header

#### Scenario: Unauthenticated visitor cannot reach the export

- **WHEN** a request without a valid researcher session reaches the export route
- **THEN** it is refused with the area's standard refusal and no export content, headers describing an export, or corpus-derived bytes are returned

#### Scenario: No public export endpoint exists

- **WHEN** the application's public routes are examined
- **THEN** none of them serves, triggers, or links to a research export; the download lives only beneath the protected researcher area

### Requirement: The download is authorized per request, never by layout alone

The export request SHALL have its presented session verified on the server by the same guard that protects the researcher area, before any privileged read is attempted. Route-group placement SHALL NOT be the authorization: a layout renders pages, not file responses, so the download handler verifies explicitly, and refused requests perform zero repository reads.

#### Scenario: Explicit verification precedes the first privileged read

- **WHEN** an export request arrives with a forged, expired, or absent session
- **THEN** the handler refuses before constructing any privileged client or issuing any repository read

#### Scenario: A valid session still needs no browser-held privilege

- **WHEN** an authorized export request is served
- **THEN** no credential, token, or secret travels to the browser; the response carries only the ZIP bytes and download headers

### Requirement: Web and CLI exports are content-equivalent from the same state

The downloadable ZIP and `pnpm run export:research` SHALL be built by the same derivation over the same builders: the same record, summary, validated-record, and CSV construction over the same repository reads. From the same database state the five artifact contents SHALL be equivalent document-for-document; only the envelope differs (ZIP entry versus file on disk).

#### Scenario: Same state produces the same five documents

- **WHEN** the web export and the operator command each run against the same database state
- **THEN** each of the five artifacts matches its counterpart byte-for-byte apart from the ZIP container

#### Scenario: The operator path stays available

- **WHEN** the dashboard download exists
- **THEN** `pnpm run export:research` still runs unchanged as the operator and backup path

### Requirement: The download is read-only and preserves adjudication semantics

The export SHALL perform no insert, update, or delete against any research table. The validated document in the ZIP SHALL carry the same derivation rule, the same per-field earliest-supplier assembly, and the same `needs_review` flags as the operator artifact: a mechanical candidate pending thesis-approved adjudication, never presented as adjudicated.

#### Scenario: Export performs no research write

- **WHEN** an authenticated export completes
- **THEN** the database holds exactly the rows it held before, and the only observable effect is the downloaded file plus the audit log line

#### Scenario: Size is bounded and failures are reported, not partial

- **WHEN** the corpus exceeds the documented response-size bound
- **THEN** the request is refused with a stated limit rather than a truncated ZIP; a failure mid-build is reported rather than served as a partial archive
