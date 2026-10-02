# batch-allocation Delta

## ADDED Requirements

### Requirement: Batch exclusion is scoped to the requesting validator, so entries overlap across validators

The exclusion applied to a validator's candidate entries SHALL be derived from that validator's own
stored responses alone. An entry that another validator has answered SHALL remain eligible for a
validator who has not answered it, and an entry's coverage SHALL be counted across every
validator's qualifying responses rather than only the requesting validator's.

The platform SHALL NOT withhold an entry from a validator on the ground that another validator's
batch, or another validator's stored response, already contained it. Two validators drawing from
one shared pool SHALL NOT be kept disjoint by any allocation rule. Overlap between validators'
batches is the mechanism by which coverage by DISTINCT validators can reach the configured
independent-validation target, and allocation SHALL continue to offer an entry until that target is
reached.

#### Scenario: An entry another validator has answered is still offered

- **WHEN** a validator requests a batch and an entry in the pool has a stored response recorded
  against a different validator, which the requesting validator has not answered
- **THEN** that entry remains eligible for the requesting validator and is not excluded on account
  of the other validator's response

#### Scenario: Two validators drawing from one pool are not kept disjoint

- **WHEN** two different validators each request a batch from the same active pool, and the
  configured batch size is smaller than the number of eligible entries
- **THEN** each validator's batch is selected from the pool independently, and the platform does not
  withhold from either validator an entry that appeared in the other's batch

#### Scenario: Coverage by distinct validators can rise toward the configured target

- **WHEN** three different validators each request a batch from the same active pool in turn, and
  each answers the entries it is given
- **THEN** an entry offered to all three accumulates qualifying coverage from three distinct
  validators, and the entry leaves the allocation pool only once the configured
  independent-validation target is reached