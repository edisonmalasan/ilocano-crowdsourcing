# Spec Delta

## Purpose

Collapses the Continue/start → first-entry path into one client→server round trip: a single start orchestration that checks for a resumable interrupted batch, allocates a new batch when there is none, and resolves the first entry to present — returning only the batch id plus that one entry, so the participant waits through one quiet working state instead of four sequential hops.

## ADDED Requirements

### Requirement: One start orchestration resolves the first entry in a single round trip

The platform SHALL provide one start orchestration that a client invokes with a single request carrying only the anonymous validator identity (plus an optional size preference capped server-side), and that request SHALL return everything the client needs to present the first entry: either the address of a resumable interrupted batch plus its first unanswered entry, or a newly allocated batch's identifier plus its first entry. The orchestration SHALL perform the recovery check, the allocation (where needed), and the first-entry resolution server-side within that one invoked request, issuing exactly one allocation RPC in the fresh-start case and zero allocation RPCs in the resume case.

The orchestration's result SHALL carry the batch identifier plus exactly one entry (identifier, sentence, position, total), and SHALL NOT carry the remaining batch entries. Later entries continue to arrive through the existing per-position next-entry path; the orchestration does not pre-deliver them.

The orchestration SHALL be single-flight per invocation source: while a start request is in flight the control that initiated it SHALL expose a pending state and SHALL NOT begin a second start request (no double allocation from a double click or a StrictMode double-mount), and a retry after a transport failure SHALL be idempotent from the participant's point of view — it never leaves two usable batches where one was asked for.

#### Scenario: Fresh start resolves in one client→server round trip

- **WHEN** a validator with no interrupted batch starts validation
- **THEN** one client request produces the new batch identifier plus its first entry, with exactly one allocation RPC behind it and no separate recovery round trip visible to the client

#### Scenario: Resume resolves in one client→server round trip with no allocation

- **WHEN** a validator with an interrupted batch starts validation
- **THEN** one client request produces that batch's address plus its first unanswered entry, and no allocation RPC is issued

#### Scenario: The result carries one entry, never the batch

- **WHEN** the orchestration result is inspected on the wire and in rendered output
- **THEN** it names the batch identifier and exactly one entry, and no second entry's sentence, identifier, or position is present

#### Scenario: A double start issues one orchestration

- **WHEN** the start control is activated twice before the first request resolves
- **THEN** exactly one orchestration runs and exactly one batch results from it

### Requirement: The orchestration preserves every allocation and recovery guarantee

The orchestration SHALL NOT weaken any rule it composes: pooled-completeness eligibility computed in the allocation function, same-attempt exclusion, exclusive time-boxed reservations committed atomically with selection and persistence, most-recently-created resume ordering, resume-writes-nothing, strict client-intent rejection, and service-role-only persistence. A failed recovery check inside the orchestration SHALL fall through to allocation exactly as the standalone lookup does today, and an `exhausted`, `screening_required`, `no-identity`, or honest-error outcome SHALL reach the participant with a usable onward action rather than a stranded screen.

#### Scenario: A failed internal recovery check still allocates

- **WHEN** the orchestration's internal recovery check cannot complete
- **THEN** allocation proceeds exactly as when no interrupted batch exists, and no failure is shown for the check itself

#### Scenario: Allocation contention inside the orchestration stays honest

- **WHEN** concurrent orchestrations contend over the same eligible entries
- **THEN** no entry is granted to two batches, and a shortfall collapses to a short batch or `exhausted` under the existing bounds

#### Scenario: Every terminal outcome has an onward action

- **WHEN** the orchestration ends in `exhausted`, an honest failure, `screening_required`, or no usable identity
- **THEN** the participant is shown that state with a retry or restart path, never a screen with no onward action

### Requirement: Start latency is measured against a three-second target

The platform SHALL measure start latency from the moment the start request is dispatched (Continue press or auto-orchestrator run) to the moment the first entry is rendered, and the ordinary path SHALL complete within ~1–3s. The measurement SHALL be recorded from the real deployment path (not a synthetic harness alone), SHALL report the orchestration duration and the first-entry render separately where observable, and SHALL state what the measurement does not prove (for example, device, network, or cold-start conditions it did not cover).

#### Scenario: Start latency is a recorded measurement

- **WHEN** the orchestration ships
- **THEN** a measured dispatch-to-first-entry duration is recorded with its conditions, and any gap to the ~1–3s target is recorded as an open item rather than rounded into the target
