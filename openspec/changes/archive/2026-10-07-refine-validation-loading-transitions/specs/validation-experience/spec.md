# Spec Delta

## MODIFIED Requirements

### Requirement: A correction is offered exactly when the evaluation requires one

The session SHALL offer a corrected Ilocano sentence **exactly when** the chosen evaluation requires a correction — *correct but sounds unnatural* and *incorrect* — and SHALL require a non-blank corrected sentence before that response can be completed.

For *correct and natural* and *cannot confidently evaluate* the session SHALL NOT offer a corrected sentence, and a response carrying one SHALL NOT be accepted as though the evaluation allowed it.

Which evaluations require a correction SHALL be decided by the single rule already in force in `domain-contracts`, and this capability SHALL NOT restate it as a second rule that could disagree.

Entry transitions never present a real control in a disabled state: during the transition interval only the skeleton is shown, so the correction input — like every other control — is revealed already usable, with the rule for when it is offered unchanged.

#### Scenario: Choosing an evaluation that requires a correction reveals the correction input

- **WHEN** a validator chooses *correct but sounds unnatural* or *incorrect*
- **THEN** a corrected Ilocano sentence is offered and is required before the response can be completed

#### Scenario: A blank correction does not complete a response that requires one

- **WHEN** a validator has chosen an evaluation requiring a correction and the corrected sentence is
  blank or contains only whitespace
- **THEN** the response cannot be completed

#### Scenario: An evaluation that allows no correction offers no correction input

- **WHEN** a validator chooses *correct and natural* or *cannot confidently evaluate*
- **THEN** no corrected Ilocano sentence is offered

#### Scenario: The correction input settles with the rest of the form

- **SUPERSEDED by `refine-validation-loading-transitions`, kept so the replacement is visible rather than silent.** Originally the correction input was disabled for the settling interval. Transitions no longer present real controls at all; its replacement is "The correction input is revealed usable after the transition" below.

#### Scenario: The correction input is revealed usable after the transition

- **WHEN** a new entry requiring a correction is revealed after its transition skeleton
- **THEN** the correction input is enabled at once like the other controls, and its offer/require rule is unchanged

### Requirement: A completed entry is persisted immediately and the session advances

When a validator completes an entry, the session SHALL place that response in a
persistent-until-confirmed save queue immediately, and SHALL NOT hold completed
responses until the batch is finished. Completing one entry SHALL advance the
session to the next entry in the server-allocated order without depending on the
rest of the batch and without waiting for the previous write round trip or for
worker availability: the advance and the persistence proceed concurrently under the
controlled concurrency defined in `response-persistence`, and the response is confirmed
only after the server acknowledges it.

Advancing means the transition skeleton followed by the reveal: the response is
enqueued synchronously at submit, the skeleton shows for the transition interval
defined in `validation-transition`, and the next entry is revealed immediately
interactive — never gated on persistence, prefetch, reservation, or server state.
The next entry's real sentence and form are not rendered during the interval.

The write SHALL be single-flight per entry: while a response is being persisted, the
control that initiated it SHALL expose a pending state and SHALL NOT begin a
second write for the same entry, and controls made inert alongside it SHALL change appearance
uniformly. Different entries' writes proceed independently, and one entry's slow or retrying
save SHALL NOT hold back advancement to the next entry.

Background persistence SHALL be quiet: no routine saving or saved status is shown.
A transient failure SHALL surface a non-alarming retry status and an exhausted or
refused save SHALL surface an actionable error; failures are never swallowed
silently merely because routine status is hidden.

Whether a persisted response establishes a completed package SHALL be decided by
the definition already in force in `domain-contracts` and `entry-completion`,
and this capability SHALL NOT restate it.

The earlier design assumption that the next sentence must not be fetched before
the current response is stored is SUPERSEDED by this change: the thesis
methodology does not require it. A prefetched next entry is held but never
presented alongside the current one, so one-sentence-at-a-time judgement is
preserved while the fetch no longer blocks the transition.

> **Why immediacy is specified rather than left to implementation.** A batch is
> up to five entries of free-text Ilocano plus optional free-text translations each.
> Holding completed work in memory until the end of a batch is the difference
> between a dropped connection costing one entry and costing five, and the loss
> is silent — the validator sees a form that accepted their work. The queue
> extends this guarantee across the transition: a response that has advanced
> past is still retried until confirmed, never silently dropped.
> (The earlier text read "ten entries" and "costing ten"; the batch size of 10 is
> SUPERSEDED by the batch size of 5 recorded in `batch-allocation`, and the note
> is otherwise unchanged.)

> **The pending state is a consumer, not a restatement.** `design-system` and
> `validator-onboarding` already specify that a control whose action is in
> flight exposes a pending state and that a write is single-flight. This
> requirement states that the validation write is such a write; it adds no new
> rule about appearance.

#### Scenario: Completing an entry persists it without waiting for the batch

- **WHEN** a validator completes an entry while other entries in the batch remain unanswered
- **THEN** that response is persisted immediately, and the remaining entries are not required to be
  finished first

#### Scenario: The session advances to the next entry in the allocated order

- **WHEN** a validator's response for the current entry is persisted
- **THEN** the session advances to the next entry in the order the server allocated

#### Scenario: Advancing does not wait for the previous write round trip

- **WHEN** a validator completes an entry whose next entry was already prefetched
- **THEN** the response is enqueued at submit, the transition skeleton shows for the transition
  interval, and the next entry is revealed immediately interactive without waiting for the previous
  response's persistence round trip, and the previous response is marked saved
  only after the server confirms it

#### Scenario: Advancing follows the allocated order even when an earlier entry is unanswered

- **WHEN** a validator completes an entry out of order, so an earlier entry in the allocated order is
  still unanswered
- **THEN** the session advances to the next entry in the allocated order rather than back to the
  earlier unanswered one, and the earlier entry is still reachable afterwards

> **Added at Sync, and it introduces no new rule.** `validation-experience` already states that
> completing an entry advances the session "to the next entry in the order the server allocated", and
> the allocated order is `batch_entries.position`. A validator who reaches position 7 with positions
> 1-6 unanswered is therefore next shown position 8, which is what the implementation does. This
> scenario exists because a **deleted unit test asserted the opposite** — that the next entry is the
> first one *still needing an answer* — and deleting it removed an assertion nobody had noticed was
> asserting anything. Two rules are satisfiable by both readings whenever a validator answers in
> order, which is the only way the session is meant to be driven, so the requirement read as though
> it did not decide this case. It does.
>
> **No entry is lost under this rule.** Once the requested position passes the end of the batch the
> session falls back to the first entry still needing an answer, so an earlier unanswered entry is
> never permanently skipped and remains available for the validating package that completes it. A
> reviewer who prefers the other rule should reject this scenario **and** change the implementation,
> not merely the scenario.
>
> **The note above previously ended "can still reach its coverage target", and that phrase is
> corrected rather than carried forward.** Under the superseded methodology the target was a number
> of validators, so a reachable unanswered entry had three chances at it. Under the corrected
> methodology an entry needs one validating package, and a reachable unanswered entry is reachable in
> order to supply exactly that. The scenario's own rule — the session does not permanently skip an
> entry — is unchanged, and so is every other sentence in the note.

#### Scenario: The write that persists a response is single-flight

- **WHEN** a response is being persisted
- **THEN** the control that initiated it exposes a pending state and cannot begin a second write

#### Scenario: A control inert alongside the write changes appearance uniformly

- **WHEN** a response is being persisted and other controls are made inert alongside it
- **THEN** those controls change appearance uniformly, and none of them claims to be in progress

#### Scenario: A transient save failure is retried without losing the response

- **WHEN** a background save fails for a transient reason
- **THEN** the complete response is retained, retried with bounded backoff, and
  the participant is shown a non-alarming retry status — never a saved
  confirmation and never a silent drop

#### Scenario: A permanent save refusal is not retried

- **WHEN** a background save is refused as invalid, unknown-batch, or not-in-batch
- **THEN** it is not retried, and the participant is told the answer was not stored

#### Scenario: A full backlog pauses advancement until saves drain

- **SUPERSEDED by this change, kept so the removal is visible rather than silent.**
  Originally: when two responses were still unconfirmed, the session waited for the queue to
  drain before presenting further entries. Advancement no longer waits on worker occupancy:
  all 5 current-batch responses may exist independently in the queue under `MAX_ACTIVE_SAVES = 3`,
  and completing the current entry advances immediately while unconfirmed responses continue
  their own lifecycles. Its replacement is the scenario below.

#### Scenario: A slow save does not pause advancement

- **WHEN** earlier responses are still unconfirmed and their workers are occupied
- **THEN** completing the current entry still advances the session immediately,
  and the unconfirmed responses continue their own lifecycles independently

#### Scenario: Finishing waits for every pending response

- **SUPERSEDED by this change, kept so the removal is visible rather than silent.**
  Originally: when the final entry was answered while saves were still pending, the batch was
  not reported complete and the attempt identity was not retired until every queued response
  was confirmed persisted. The guarantee is retained but its mechanism is replaced: the session
  transitions in place to the finished card with the queue intact, and the checkpoint defined in
  `response-persistence` (queue drained AND fresh server verification of all 5 placements)
  gates both completion controls. Its replacement is the scenario below.

#### Scenario: Finishing passes through the finished-card checkpoint

- **WHEN** the final entry is answered while saves are still pending
- **THEN** the session transitions in place to the finished card with the queue
  intact, and neither completion control becomes usable until the
  checkpoint defined in `response-persistence` passes
