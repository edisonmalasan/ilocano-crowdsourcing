# Spec Delta

## MODIFIED Requirements

### Requirement: A completed entry is persisted immediately and the session advances

When a validator completes an entry, the session SHALL place that response in a
persistent-until-confirmed save queue immediately, and SHALL NOT hold completed
responses until the batch is finished. Completing one entry SHALL advance the
session to the next entry in the server-allocated order without depending on the
rest of the batch and without waiting for the previous write round trip: the
advance and the persistence proceed concurrently, and the response is marked
saved only after the server confirms it.

The write SHALL be single-flight: while a response is being persisted, the
control that initiated it SHALL expose a pending state and SHALL NOT begin a
second write, and controls made inert alongside it SHALL change appearance
uniformly.

Whether a persisted response establishes a completed package SHALL be decided by
the definition already in force in `domain-contracts` and `entry-completion`,
and this capability SHALL NOT restate it.

The earlier design assumption that the next sentence must not be fetched before
the current response is stored is SUPERSEDED by this change: the thesis
methodology does not require it. A prefetched next entry is held but never
presented alongside the current one, so one-sentence-at-a-time judgement is
preserved while the fetch no longer blocks the transition.

> **Why immediacy is specified rather than left to implementation.** A batch is
> up to ten entries of free-text Ilocano plus two free-text translations each.
> Holding completed work in memory until the end of a batch is the difference
> between a dropped connection costing one entry and costing ten, and the loss
> is silent — the validator sees a form that accepted their work. The queue
> extends this guarantee across the transition: a response that has advanced
> past is still retried until confirmed, never silently dropped.

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
- **THEN** the next entry is presented without waiting for the previous
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

- **WHEN** two responses are still unconfirmed
- **THEN** the session waits for the queue to drain before presenting further
  entries, shows a plain saving state, and resumes automatically

#### Scenario: Finishing waits for every pending response

- **WHEN** the final entry is answered while saves are still pending
- **THEN** the batch is not reported complete and the attempt identity is not
  retired until every queued response is confirmed persisted

### Requirement: An active validation session presents one sentence at a time

A validator holding an allocated batch SHALL be able to work through it as a session that presents
**exactly one** dataset entry at a time. The presented entry SHALL show the Ilocano sentence and
nothing else of the entry: neither the intended origin, nor the intended destination, nor the
travel mode, nor the dataset entry identifier is shown to the validator. The session SHALL show the
validator's **progress** through the active batch.

The client MAY hold at most one server-prefetched future entry so transitions feel instant, but it
SHALL NOT present, render, or otherwise expose that entry's sentence before the current entry is
completed. Prefetching is a presentation cache for the transition, never research storage, and the
server alone decides which entry comes next.

The session SHALL NOT require the validator to hold the whole batch in view to know where they are, and
progress SHALL be derived from the batch the server allocated rather than from client-side bookkeeping.

> **Scoped deliberately.** Displaying an entry is not the same as rendering it read-only. What may be
> *entered* for the presented entry is specified by the requirements below, and this requirement says
> nothing about it on purpose — a reader must not infer from "one entry at a time" that any particular
> field is available.
>
> **Withheld deliberately.** Endpoints and identifiers are research-internal: comparison against a
> stated intent was producing confusion rather than signal, and the identifier is researchers-only.
> Researcher surfaces keep full data; this rule governs the participant screen alone.

#### Scenario: A validator with an allocated batch sees a single sentence

- **WHEN** a validator opens an allocated batch
- **THEN** exactly one dataset entry is presented, showing its Ilocano sentence and no endpoint,
  mode, or identifier alongside it

#### Scenario: The session shows progress through the active batch

- **WHEN** a validator is partway through an allocated batch
- **THEN** the session shows their progress through that batch, derived from the server-allocated batch

#### Scenario: A second entry is not presented alongside the current one

- **WHEN** a validator is viewing an entry in an allocated batch
- **THEN** no other entry's sentence is presented for evaluation at the same time

#### Scenario: A prefetched entry is never exposed before its turn

- **WHEN** the client holds a prefetched next entry while the current entry is
  still being answered
- **THEN** nothing of the prefetched entry's sentence is rendered, readable in
  the markup, or choosable, until the current entry is completed
