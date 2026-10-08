# validation-start Specification

## Purpose

Collapses the Continue/start → first-entry path into one client→server round trip: a single start orchestration that checks for a resumable interrupted batch, allocates a new batch when there is none, and resolves the first entry to present — returning only the batch id plus that one entry, so the participant waits through one quiet working state instead of four sequential hops.

## Requirements

### Requirement: One start orchestration resolves the first entry in a single round trip

The platform SHALL provide one start orchestration that a client invokes with a single request carrying only the anonymous validator identity (plus an optional size preference capped server-side), and that request SHALL return everything the client needs to present the first entry: either the address of a resumable interrupted batch plus its first unanswered entry, or a newly allocated batch's identifier plus its first entry. The orchestration SHALL perform the recovery check, the allocation (where needed), and the first-entry resolution server-side within that one invoked request, issuing exactly one allocation RPC in the fresh-start case and zero allocation RPCs in the resume case.

The orchestration's result SHALL carry the batch identifier plus exactly one entry (identifier, sentence, position, total) plus the completed count for that batch (zero for a freshly allocated batch, the authoritative completed count for a resumed batch), and SHALL NOT carry the remaining batch entries. The completed count is the only permitted addition beyond the batch identifier and the single entry: no second entry's sentence, identifier, or position, no source payload, no coverage data, and no researcher metadata SHALL be present. Later entries continue to arrive through the existing per-position next-entry path; the orchestration does not pre-deliver them.

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

#### Scenario: The result carries the completed count and nothing else beyond it

- **WHEN** the orchestration result is inspected on the wire
- **THEN** it carries a completed count (zero for a fresh batch, the authoritative count for a resumed batch) alongside the batch identifier and the single entry, and no source payload, coverage data, researcher metadata, or second entry is present

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

### Requirement: Start opens directly into the Validating shell

The `/validate` route SHALL NOT present a separate "Start validating" page. While the single start orchestration runs, the route SHALL render the Validating page shell — the same container, header, and layout-matched validation skeleton the participant meets everywhere else in the validating experience — and SHALL present the first entry in that same mounted shell as soon as the orchestration resolves, without navigating through a second session resolution. The participant goes from screening Continue directly into the Validating experience with no intermediate waiting-room page and no second loading phase.

The browser URL SHALL still become the batch address (`/validate/[batchId]`) through a history update that does not re-trigger the session-open path, so the normal handoff performs zero session reads for an entry the orchestration already resolved. A direct visit, refresh, or pasted link to the batch address SHALL still reconstruct the session server-side through the unchanged session route. All server-side work underneath is unchanged: attempt validation, screening requirements, recovery, allocation, reservation, and server authorization run exactly as specified. Only the participant-facing handoff is changed: the first entry is rendered from the orchestration result, not re-resolved.

#### Scenario: Continue reaches the Validating shell, not a start page

- **WHEN** a validator completes screening and continues
- **THEN** the Validating shell with a layout-matched skeleton is shown while the orchestration runs, and no separate "Start validating" page appears

#### Scenario: The first real entry replaces the start skeleton

- **WHEN** the start orchestration resolves with a batch and its first entry
- **THEN** the session opens on the real first entry, replacing the skeleton with no intermediate page

#### Scenario: No second session resolution before first render

- **WHEN** the start orchestration resolves in the normal flow
- **THEN** the first entry renders from the orchestration result with no second session-open read and no second loading boundary entered before it

#### Scenario: The URL names the batch without re-resolving

- **WHEN** the first entry renders from the orchestration result
- **THEN** the browser URL becomes the batch address without triggering the session-open path again

#### Scenario: A refreshed batch address reconstructs server-side

- **WHEN** a validator refreshes, pastes, or directly visits the batch address
- **THEN** the session route resolves the current entry server-side exactly as before, independent of any in-memory start state

#### Scenario: Start failures keep their onward actions

- **WHEN** the orchestration ends in `exhausted`, an honest failure, `screening_required`, or no usable identity
- **THEN** the existing error state with its retry or restart path is shown, exactly as specified, with no skeleton left standing

### Requirement: Batch session open is ownership-gated with a unified redirect

Opening a validation session SHALL take the requested batch identifier plus
the browser's current active attempt identity, load the stored batch,
derive the stored owner, and compare the two server-side. Content SHALL be
returned only on equality. Mismatch, unknown batch, malformed attempt, absent
attempt, and non-resumable batches where revealing the distinction is
unnecessary SHALL all produce one generic redirect outcome to `/`, preserving
the interface locale where the locale architecture supports it. The outcome
SHALL NOT name which case occurred, SHALL NOT create a validator on foreign
link open, and SHALL NOT crawler-mint junk validator rows.

Submission authorization SHALL continue to derive ownership from stored batch
state rather than trusting a browser-provided validatorId.

#### Scenario: Matching session opens the current entry

- **WHEN** the owning session opens its batch address with its active attempt
- **THEN** the current entry resolves server-side exactly as before

#### Scenario: Foreign link under another attempt redirects without content

- **WHEN** a batch address is opened under a different active attempt
- **THEN** no sentence is revealed and the outcome is a redirect to `/`

#### Scenario: Foreign link with no attempt redirects without auto-enrollment

- **WHEN** a batch address is opened with no active attempt
- **THEN** no sentence is revealed, no validator row is created, and the
  outcome is a redirect to `/`

#### Scenario: Locale is preserved across the ownership redirect

- **WHEN** the ownership gate redirects
- **THEN** the interface locale is preserved where the locale architecture
  supports it

### Requirement: Start orchestration calls are paced per origin and per attempt

The start orchestration SHALL limit repeated allocation calls with origin-scoped and
attempt-scoped buckets so that a high-speed caller cannot burn reservations or run allocation
RPCs at machine speed. The check SHALL run before any database read, so a refused start performs
zero database work and allocates nothing. Refusal SHALL carry a typed throttled outcome with a
usable retry action and SHALL NOT collapse into `exhausted`, `screening_required`, or any honest
error: those outcomes remain reachable and unchanged for non-throttled calls.

#### Scenario: Abusive start burst is refused without allocation

- **WHEN** a client issues an abusive burst of start calls under one attempt or origin
- **THEN** further calls are refused with the typed throttled outcome, no allocation RPC runs,
  and no batch or reservation is created for any refused call

#### Scenario: Throttled start stays distinguishable from exhausted

- **WHEN** a start call is refused by pacing
- **THEN** the participant is offered a retry path, not the exhausted or screening-required state

#### Scenario: Ordinary start is unaffected

- **WHEN** a validator starts one batch, answers it, and starts another
- **THEN** each start succeeds exactly as before with no throttled outcome
