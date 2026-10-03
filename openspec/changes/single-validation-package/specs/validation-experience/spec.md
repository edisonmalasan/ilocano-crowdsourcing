# Spec Delta

## MODIFIED Requirements

### Requirement: A completed entry is persisted immediately and the session advances

When a validator completes an entry, the session SHALL persist that response immediately, and SHALL
NOT hold completed responses until the batch is finished. Completing one entry SHALL advance the session
to the next entry in the server-allocated order without depending on the rest of the batch.

The write SHALL be single-flight: while a response is being persisted, the control that initiated it
SHALL expose a pending state and SHALL NOT begin a second write, and controls made inert alongside it
SHALL change appearance uniformly.

Whether a persisted response establishes a completed package SHALL be decided by the definition
already in force in `domain-contracts` and `entry-completion`, and this capability SHALL NOT restate
it.

> **Why immediacy is specified rather than left to implementation.** A batch is up to ten entries of
> free-text Ilocano plus two free-text translations each. Holding completed work in memory until the end
> of a batch is the difference between a dropped connection costing one entry and costing ten, and the
> loss is silent — the validator sees a form that accepted their work.

> **The pending state is a consumer, not a restatement.** `design-system` and `validator-onboarding`
> already specify that a control whose action is in flight exposes a pending state and that a write is
> single-flight. This requirement states that the validation write is such a write; it adds no new rule
> about appearance.

#### Scenario: Completing an entry persists it without waiting for the batch

- **WHEN** a validator completes an entry while other entries in the batch remain unanswered
- **THEN** that response is persisted immediately, and the remaining entries are not required to be
  finished first

#### Scenario: The session advances to the next entry in the allocated order

- **WHEN** a validator's response for the current entry is persisted
- **THEN** the session advances to the next entry in the order the server allocated

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