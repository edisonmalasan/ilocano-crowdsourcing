# Spec Delta

## REMOVED Requirements

### Requirement: The route contract is defined once and used by every producer and by the one consumer

> **Why this requirement is removed rather than modified.** Its producer list
> and its "all four named producers" scenario name exactly four producers.
> The simplification adds a fifth — the post-enrollment auto-orchestrator,
> which navigates to a resumed or newly allocated batch without a manual
> press. Renaming that scenario to five would be a rename the validator
> refuses inside a MODIFIED block, so the requirement is recorded here **in
> full, verbatim**, and its replacement is added below. The round-trip rule
> itself is unchanged.

There SHALL be exactly one definition of how a batch identifier becomes a path and of how the dynamic
route parameter becomes a batch identifier. Every place that navigates to a batch SHALL obtain its address
from that definition, and the route SHALL obtain the identifier from it, so that no site can hold a
private copy of either operation.
The producers are the start screen's interrupted-batch resume address, the start screen's navigation to a
newly allocated batch, the validation form's navigation after a response is stored, and the finished
screen's navigation to another batch. No other route, island, or helper may construct a batch address or
read the dynamic route parameter directly.

#### Scenario: Every producer goes through the one definition

- **WHEN** any control that navigates to a batch produces an address
- **THEN** the address it navigates to is the one the single definition produces for that identifier, and
  the address contains no encoding that the definition did not itself produce

#### Scenario: All four named producers are accounted for

- **WHEN** the resume, allocation, post-submit, and continue navigations each build an address
- **THEN** all four addresses are equal to the single definition's output for their own identifier, and
  none of them performs its own encoding

#### Scenario: No other site builds a batch address or reads the route parameter

- **WHEN** every site that produces or consumes a batch address is enumerated across the whole
  application
- **THEN** each one is either the single definition itself or a caller of it, and no site builds an
  address or reads the dynamic route parameter on its own

## ADDED Requirements

### Requirement: The route contract is defined once and used by every producer, including the auto-orchestrator, and by the one consumer

There SHALL be exactly one definition of how a batch identifier becomes a path and of how the dynamic
route parameter becomes a batch identifier. Every place that navigates to a batch SHALL obtain its address
from that definition, and the route SHALL obtain the identifier from it, so that no site can hold a
private copy of either operation.
The producers are the start screen's interrupted-batch resume address, the start screen's navigation to a
newly allocated batch, the validation form's navigation after a response is stored, the finished
screen's navigation to another batch, and the post-enrollment auto-orchestrator's navigation to a
resumed or newly allocated batch. No other route, island, or helper may construct a batch address or
read the dynamic route parameter directly.

#### Scenario: Every producer goes through the one definition

- **WHEN** any control or effect that navigates to a batch produces an address
- **THEN** the address it navigates to is the one the single definition produces for that identifier, and
  the address contains no encoding that the definition did not itself produce

#### Scenario: All five named producers are accounted for

- **WHEN** the resume, allocation, post-submit, continue, and auto-orchestration navigations each build
  an address
- **THEN** all five addresses are equal to the single definition's output for their own identifier, and
  none of them performs its own encoding

#### Scenario: No other site builds a batch address or reads the route parameter

- **WHEN** every site that produces or consumes a batch address is enumerated across the whole
  application
- **THEN** each one is either the single definition itself or a caller of it, and no site builds an
  address or reads the dynamic route parameter on its own
