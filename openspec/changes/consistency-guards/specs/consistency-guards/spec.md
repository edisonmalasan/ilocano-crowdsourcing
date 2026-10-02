# Spec Delta

## Purpose

Turns two claims this repository repeats in prose into assertions: that every consumer of the shared
qualifying rule agrees on the same corpus, and that the project's own ledger enumerations match the
repository they describe.

## ADDED Requirements

### Requirement: Independent consumers of the qualifying rule agree on one corpus

Given a single corpus of stored responses, every consumer that reports coverage SHALL report the same
qualifying total, the same distribution of entries across coverage buckets, the same number of entries
with coverage complete, and the same set of entries requiring researcher review. Consumers SHALL be
compared by running them over the same inputs and asserting the results are equal, not by asserting
that they share a helper — two modules can call the same predicate and still disagree about which
responses to include, which bucket to place them in, or how to total them.

#### Scenario: Dashboard and export agree on the qualifying total

- **WHEN** the dashboard overview and the export summary are computed from the same corpus
- **THEN** they report the same total number of qualifying validations

#### Scenario: Dashboard and export agree on the coverage-bucket distribution

- **WHEN** the dashboard overview and the export summary are computed from the same corpus
- **THEN** the number of entries each places in every coverage bucket is identical, derived from the
  export's per-entry counts

#### Scenario: Dashboard and export agree on which entries need review

- **WHEN** the dashboard overview and the export summary are computed from the same corpus
- **THEN** the set of entry identifiers each reports as requiring researcher review is identical, and
  the number each reports as coverage-complete is identical

#### Scenario: Disagreement is detected, not assumed away

- **WHEN** one consumer's figures are altered so that it no longer matches the other
- **THEN** the consistency check fails, naming the figure that differs

#### Scenario: A corpus with no responses still agrees

- **WHEN** both consumers are computed from a corpus holding no stored responses
- **THEN** both report zero qualifying validations, no complete entries, and no review flags

### Requirement: The ledger's archived-changes enumeration matches the archive directory

The project's ledger SHALL list every directory in the change-archive directory, and SHALL list no
directory that is absent from it. The count the ledger reports as archived SHALL equal the number of
directories that directory contains. The check SHALL be derived by reading the directory rather than
from a remembered list, so that adding or removing an archived change is what makes the check fail.

#### Scenario: Every archived change appears in the ledger

- **WHEN** the ledger's archived-changes enumeration is compared with the archive directory
- **THEN** each directory in the archive is named in the ledger, and each archived change named in the
  ledger exists on disk

#### Scenario: A newly archived change that the ledger omits fails the check

- **WHEN** an archived change exists that the ledger does not name
- **THEN** the check fails and names the change that is missing

#### Scenario: The reported count equals the directory's contents

- **WHEN** the ledger states how many changes are archived
- **THEN** that number equals the number of directories in the archive

### Requirement: Consistency checks cannot pass on nothing

Every consistency check SHALL assert that it examined something: a comparison over zero consumers, or
an archive check that found no directories, SHALL be a failure rather than a pass. A check that
silently matched nothing would report coverage it is not providing, which is the specific defect this
change exists to prevent in the repository's own guard rails.

#### Scenario: An empty corpus does not make the comparison vacuous

- **WHEN** the consistency check runs over a corpus with no stored responses
- **THEN** it still compares both consumers and asserts equality of their figures, rather than
  skipping the comparison

#### Scenario: The archive check refuses an empty archive

- **WHEN** the archive directory is empty or absent
- **THEN** the check fails rather than reporting that the ledger matches an empty directory

#### Scenario: The enumeration is read from a located table

- **WHEN** the ledger's archived-changes enumeration is read
- **THEN** it is located by its own header line, a row that loses its formatting is both counted and
  reported as malformed rather than skipped, and the read stops at the end of the table so a change
  listed below it is not counted
