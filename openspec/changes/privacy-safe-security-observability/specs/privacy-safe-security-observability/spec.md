# Spec Delta

## ADDED Requirements

### Requirement: Public security refusals are server-observable without identifying anyone

Every throttled refusal (`enroll`, `allocate`, `submit`, `resume`,
`session_open`) and every failed ownership or batch-capability check on
the public surface SHALL emit exactly one server log line carrying the
action, the internal reason, and truncated SHA-256 digests of the
origin (and actor where one exists). No line SHALL carry a raw header
value, a raw attempt or batch identifier, response content, a
proficiency answer, a credential, or anything countable as a distinct
person. Successes, reads, and routine state outcomes SHALL emit
nothing. Every outward refusal message SHALL remain byte-identical.

#### Scenario: A throttled call names its action and reason in the server log

- **WHEN** any of the five paced actions refuses a call for pacing
- **THEN** exactly one log line records that action with reason
  `throttled` plus the digests, and the requester receives only the
  standard throttled copy for that surface

#### Scenario: A failed ownership or capability check names itself in the server log

- **WHEN** a session presents a batch owned by another attempt, or a
  submission presents a batch capability naming no batch
- **THEN** exactly one log line records that check with its reason
  plus the digests, and the requester sees only the generic
  refusal or redirect that surface already returns

#### Scenario: The log carries nothing that identifies or censuses

- **WHEN** any public-security log line is read, or any success or
  routine state outcome occurs
- **THEN** the line contains no raw header, no raw identifier, no
  content, no proficiency, and no credential — and the success or
  routine outcome emits no line at all

### Requirement: Exported CSV cells are spreadsheet-safe

Every string cell in both exported CSV documents (`validations.csv`
and `validated-dataset.csv`) whose first character is `=`, `+`, `-`,
`@`, tab, or carriage return SHALL be emitted with a single-quote
prefix, so a spreadsheet opens it as text rather than as a live
formula. All other cells SHALL be byte-identical to today, header rows
SHALL be unchanged, and the JSON exports SHALL be untouched.

#### Scenario: A dangerous cell is neutralized in both CSV documents

- **WHEN** any exported value starts with a formula-dangerous
  character
- **THEN** both CSV renderings of that value carry the `'` prefix,
  and opening either file in a spreadsheet evaluates no formula

#### Scenario: Ordinary text and structure are untouched

- **WHEN** an exported value starts with any other character
- **THEN** its CSV rendering is byte-identical to the pre-change
  rendering, the header rows are unchanged, and every JSON export is
  byte-identical
