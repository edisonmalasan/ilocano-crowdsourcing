# Spec Delta

## MODIFIED Requirements

### Requirement: Recovery lookup is additive and the auto-orchestration never strands a participant

The lookup for an interrupted batch SHALL only ever ADD information to the orchestration. It SHALL NOT
remove, disable, or delay the onward path: the orchestration runs the lookup first and then proceeds —
to the interrupted batch where one is recognised, otherwise to allocation — and a lookup that has not
completed, or that fails, SHALL proceed to allocation exactly as when no interrupted batch exists.

On the validation-start path defined in `validation-start`, the lookup SHALL run inside the single
start orchestration rather than as a separate client-issued round trip. Recognition, ordering, and
resume semantics are unchanged: the most recently created interrupted batch is still the one offered,
resuming still writes nothing, and a failed internal check still falls through to allocation with
nothing shown to the participant for the check itself.

A lookup that cannot complete SHALL report an explicit modelled outcome that distinguishes "no interrupted
batch" from "could not determine", and SHALL NOT be an exception swallowed into a success. That modelled
outcome SHALL NOT be shown to the participant as an error sentence: the participant cannot act on it, and
inventing a message they can do nothing about would misinform them.

The orchestration SHALL always end in exactly one of: navigation to a batch address, an honest
`exhausted` state, an honest failure state with a retry path, a screening-required state with a
restart path for an attempt that records no proficiency answer, or a return to screening where the
browser holds no usable identity. It SHALL NOT leave the participant on a screen with no onward
action. The screening-required state offers no retry, because re-requesting a deterministic refusal
is a control that can never succeed.

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

#### Scenario: The start path issues no standalone recovery round trip

- **WHEN** a validator starts validation through the orchestration defined in `validation-start`
- **THEN** the client issues no separate recovery-lookup request; the check runs inside the
  orchestration and the resume-or-allocate decision arrives with the first entry

#### Scenario: The folded lookup keeps its ordering and silence

- **WHEN** the orchestration's internal check finds an interrupted batch, and separately when it fails
- **THEN** the most recently created batch is the one resumed, resuming writes nothing, and a
  failed check is indistinguishable to the participant from no interrupted batch existing
