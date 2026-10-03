# Spec Delta

## REMOVED Requirements

### Requirement: The recovery lookup is additive and can never withhold an option

> **Why this requirement is removed rather than modified.** Two of its three
> scenarios assume a persistent manual start control: *The start control
> survives a resume offer* and *A failed lookup withholds nothing* (which
> presents "the control that requests a new batch"). The simplification
> replaces the manual press with auto-orchestration, so those scenarios
> cannot survive as written. The additive property and the modelled-outcome
> distinction are unchanged and still hold, and both are carried into the
> replacement below rather than lost.

The lookup for an interrupted batch SHALL only ever ADD an affordance. It SHALL NOT remove, disable, or
delay the existing control that requests a new batch, and a lookup that has not completed — or that fails —
SHALL present the start experience exactly as it is presented when no interrupted batch exists.

A lookup that cannot complete SHALL report an explicit modelled outcome that distinguishes "no interrupted
batch" from "could not determine", and SHALL NOT be an exception swallowed into a success. That modelled
outcome SHALL NOT be shown to the participant as an error sentence: the participant cannot act on it, and
inventing a message they can do nothing about would misinform them.

#### Scenario: The start control survives a resume offer

- **WHEN** the lookup finds an interrupted batch
- **THEN** the control that requests a new batch is still offered alongside the resumption affordance

#### Scenario: A failed lookup withholds nothing

- **WHEN** the lookup fails or cannot complete
- **THEN** the control that requests a new batch is presented exactly as when no interrupted batch exists, and no failure is reported to the participant

#### Scenario: "None" and "unknown" are different outcomes

- **WHEN** the lookup completes without finding an interrupted batch, and separately when it cannot complete
- **THEN** these are distinct outcomes the platform can tell apart, and the second is not an exception swallowed into the first

## ADDED Requirements

### Requirement: Recovery lookup is additive and the auto-orchestration never strands a participant

The lookup for an interrupted batch SHALL only ever ADD information to the orchestration. It SHALL NOT
remove, disable, or delay the onward path: the orchestration runs the lookup first and then proceeds —
to the interrupted batch where one is recognised, otherwise to allocation — and a lookup that has not
completed, or that fails, SHALL proceed to allocation exactly as when no interrupted batch exists.

A lookup that cannot complete SHALL report an explicit modelled outcome that distinguishes "no interrupted
batch" from "could not determine", and SHALL NOT be an exception swallowed into a success. That modelled
outcome SHALL NOT be shown to the participant as an error sentence: the participant cannot act on it, and
inventing a message they can do nothing about would misinform them.

The orchestration SHALL always end in exactly one of: navigation to a batch address, an honest
`exhausted` state, an honest failure state with a retry path, or a return to screening where the
browser holds no usable identity. It SHALL NOT leave the participant on a screen with no onward
action.

#### Scenario: A recognised interrupted batch is resumed without asking

- **WHEN** the lookup finds an interrupted batch
- **THEN** the orchestration navigates to that batch's address without requiring a further press,
  and no new batch is requested alongside the resumption

#### Scenario: A failed lookup falls through to allocation

- **WHEN** the lookup fails or cannot complete
- **THEN** the orchestration proceeds to allocation exactly as when no interrupted batch exists, and
  no failure is reported to the participant

#### Scenario: "None" and "unknown" are different outcomes

- **WHEN** the lookup completes without finding an interrupted batch, and separately when it cannot complete
- **THEN** these are distinct outcomes the platform can tell apart, and the second is not an exception swallowed into the first
