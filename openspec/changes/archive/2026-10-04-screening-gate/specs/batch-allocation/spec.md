# Spec Delta

## ADDED Requirements

### Requirement: Allocation requires a recorded proficiency answer

A batch SHALL NOT be allocated to a validator whose profile records no
Ilocano proficiency answer. When the requesting validator exists but the
profile carries no answer, allocation SHALL report `{status: "failed",
reason: "screening_required"}` — after the validator-exists check and before
any pool read — with no batch persisted, no entry reserved, and no response
row touched. The refusal is a methodology enforcement, not a fault, and SHALL
NOT be reported as `exhausted` (the pool is not empty) or as `persistence`
(nothing failed).

Profiles without an answer are rows created before proficiency became
required. They remain valid rows: the refusal fabricates no value for them,
backfills nothing, and imposes no retroactive constraint. Batches allocated
to such attempts before this rule existed drain normally — responses already
submitted are research data, and refusing them would destroy it.

#### Scenario: A requester with no recorded answer is refused without reading the pool

- **WHEN** a validator whose profile records no proficiency requests a batch
- **THEN** the outcome is `failed` with reason `screening_required`, and the
  only repository read performed is the validator-profile read

#### Scenario: The refusal persists and reserves nothing

- **WHEN** allocation refuses for a missing proficiency answer
- **THEN** no batch row, no batch-entry row, and no reservation row is created
  for the request

#### Scenario: A requester with any approved answer is unaffected

- **WHEN** a validator whose profile records one of the five approved choices
  requests a batch
- **THEN** allocation proceeds exactly as without this requirement, and the
  answer's value influences nothing about which entries are offered

#### Scenario: Batches allocated before the rule drain normally

- **WHEN** a validator works through a batch allocated before this requirement
  existed
- **THEN** per-entry submission proceeds under the rules in force for those
  responses, and the gate applies only to new allocation
