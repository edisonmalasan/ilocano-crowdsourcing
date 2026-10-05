# Spec Delta

## MODIFIED Requirements

### Requirement: Category-agnostic dataset entry contract

A dataset entry SHALL be identified by a stable, externally meaningful canonical
source ID, a category, the synthetic instruction, and the intended information
for that category. The canonical ID SHALL have the strict form
`{prefix}_{suffix}` where the prefix is one of `D`, `DT`, `OD`, `ODT`, `CPE`
and the suffix is an integer 1..800 with no zero-padding and no global
renumbering: `D_1`, `DT_800`, `OD_124`, `ODT_63`, `CPE_700` are valid, while
`DO_0001`, `D_0001`, `D_0`, `D_801`, `DT_900`, `ODT_9999`, `XYZ_12`, and
`CPE_-1` are not. Parsing and validation SHALL share one canonical-ID helper
rather than scattering the rule across regexes, and research-facing order SHALL
be numeric by category then suffix rather than lexical. The contract SHALL
support categories beyond these five without requiring a schema or code change,
and the source synthetic instruction SHALL be immutable.

#### Scenario: Origin + Destination entry is accepted

- **WHEN** a record with ID `OD_124`, category `origin_destination`, an instruction, an origin,
  and a destination is validated
- **THEN** validation succeeds and yields a dataset entry preserving the exact source ID

#### Scenario: A zero-padded legacy id is rejected

- **WHEN** a record carries ID `OD_0001` or `D_0001`
- **THEN** validation fails, because canonical ids are never zero-padded and the previous
  revision's minted form is not a valid identity in this one

#### Scenario: An out-of-range suffix is rejected

- **WHEN** a record carries ID `D_0`, `D_801`, or `DT_900`
- **THEN** validation fails and identifies the id as invalid

#### Scenario: An unknown prefix is rejected

- **WHEN** a record carries ID `XYZ_12`
- **THEN** validation fails rather than inventing a category for it

#### Scenario: Numeric ordering beats lexical ordering

- **WHEN** canonical ids are ordered for research-facing output
- **THEN** `D_2` precedes `D_10`, because the suffix compares numerically rather than
  lexically

#### Scenario: Instruction is required and non-empty

- **WHEN** a record is supplied with an empty or whitespace-only instruction
- **THEN** validation fails and identifies `instruction` as invalid

#### Scenario: Category is required

- **WHEN** a record is supplied without a category
- **THEN** validation fails and identifies `category` as required

#### Scenario: Unknown category is still representable

- **WHEN** a record is supplied with a category identifier that the platform has not seen
  before
- **THEN** validation succeeds, so importing a new category does not require a code change

#### Scenario: Optional fields accept an explicit null

- **WHEN** a record is supplied with an absent or `null` transit mode
- **THEN** validation succeeds and the entry represents "no transit mode" rather than
  rejecting the record
