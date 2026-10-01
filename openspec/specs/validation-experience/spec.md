# validation-experience Specification
## Purpose

Defines the participant-facing per-entry validation flow: how a validator works through an allocated
batch one entry at a time, how their evaluation, conditional correction, and two required research
translations are collected, and when each completed response is persisted.

## Requirements
### Requirement: An active validation session presents one entry at a time

A validator holding an allocated batch SHALL be able to work through it as a session that presents
**exactly one** dataset entry at a time. The presented entry SHALL show the Ilocano sentence together
with the entry's **intended origin** and **intended destination**, and the session SHALL show the
validator's **progress** through the active batch.

The session SHALL NOT require the validator to hold the whole batch in view to know where they are, and
progress SHALL be derived from the batch the server allocated rather than from client-side bookkeeping.

> **Scoped deliberately.** Displaying an entry is not the same as rendering it read-only. What may be
> *entered* for the presented entry is specified by the requirements below, and this requirement says
> nothing about it on purpose — a reader must not infer from "one entry at a time" that any particular
> field is available.

#### Scenario: A validator with an allocated batch sees a single entry with its origin and destination

- **WHEN** a validator opens an allocated batch
- **THEN** exactly one dataset entry is presented, showing its Ilocano sentence, its intended origin,
  and its intended destination

#### Scenario: The session shows progress through the active batch

- **WHEN** a validator is partway through an allocated batch
- **THEN** the session shows their progress through that batch, derived from the server-allocated batch

#### Scenario: A second entry is not presented alongside the current one

- **WHEN** a validator is viewing an entry in an allocated batch
- **THEN** no other entry's sentence is presented for evaluation at the same time

### Requirement: The four evaluation choices are offered neutrally

For the presented entry the session SHALL offer **all four** approved evaluation choices — *correct and
natural*, *correct but sounds unnatural*, *incorrect*, and *cannot confidently evaluate* — through the
same visually neutral control, and SHALL NOT favour any one of them through wording, order, position,
emphasis, or default selection.

No choice SHALL be pre-selected, and the set SHALL NOT be presented with one option visually promoted as
the expected or recommended answer.

> **This is the first point at which the already-specified visual neutrality of answer controls reaches
> a screen where an answer is actually chosen.** `design-system` specifies that answer controls are
> neutral; this requirement states that the control carrying a validator's evaluation is one of them, so
> a research-integrity property that currently has no participant-facing consequence acquires one.

#### Scenario: All four evaluation choices are offered for the presented entry

- **WHEN** a validator evaluates a presented entry
- **THEN** all four approved evaluation choices are offered

#### Scenario: No evaluation choice is pre-selected

- **WHEN** the evaluation choices are presented for an entry
- **THEN** no choice is pre-selected and no choice is presented as the expected answer

#### Scenario: The choice set is not ordered to favour an answer

- **WHEN** the evaluation choices are presented
- **THEN** no choice is given wording, order, position, or emphasis that favours it over another

### Requirement: A correction is offered exactly when the evaluation requires one

The session SHALL offer a corrected Ilocano sentence **exactly when** the chosen evaluation requires a
correction — *correct but sounds unnatural* and *incorrect* — and SHALL require a non-blank corrected
sentence before that response can be completed.

For *correct and natural* and *cannot confidently evaluate* the session SHALL NOT offer a corrected
sentence, and a response carrying one SHALL NOT be accepted as though the evaluation allowed it.

Which evaluations require a correction SHALL be decided by the single rule already in force in
`domain-contracts`, and this capability SHALL NOT restate it as a second rule that could disagree.

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

### Requirement: Both research translations are collected for an evaluable response, with no skip affordance

For every evaluable evaluation the session SHALL collect **both** an English translation and a Filipino
translation of the **validated** Ilocano sentence — the correction where one was required, and the
original sentence where none was — and SHALL require both to be non-blank before the response can be
completed.

The session SHALL NOT offer any control that skips, defers, or postpones a research translation
of an evaluable response.

For *cannot confidently evaluate* the session SHALL offer **neither** translation input, and a response
carrying either SHALL NOT be accepted as though the evaluation were translatable.

#### Scenario: An evaluable evaluation offers both translation inputs and requires both

- **WHEN** a validator has chosen *correct and natural*
- **THEN** an English translation input and a Filipino translation input are both offered, and both are
  required before the response can be completed

#### Scenario: The translations describe the validated sentence, not the pre-correction wording

- **WHEN** a validator has chosen *incorrect* and supplied a corrected Ilocano sentence
- **THEN** both translations are of the corrected Ilocano sentence, not of the original wording

#### Scenario: A single supplied translation does not complete an evaluable response

- **WHEN** a validator has supplied an English translation and no Filipino translation
- **THEN** the response cannot be completed

#### Scenario: A cannot-confidently-evaluate choice offers no translation input

- **WHEN** a validator chooses *cannot confidently evaluate*
- **THEN** neither an English translation input nor a Filipino translation input is offered

#### Scenario: No control skips a required research translation

- **WHEN** an evaluable evaluation is chosen
- **THEN** the session offers no control that skips, defers, or postpones either research translation

### Requirement: A completed entry is persisted immediately and the session advances

When a validator completes an entry, the session SHALL persist that response immediately, and SHALL
NOT hold completed responses until the batch is finished. Completing one entry SHALL advance the session
to the next entry in the server-allocated order without depending on the rest of the batch.

The write SHALL be single-flight: while a response is being persisted, the control that initiated it
SHALL expose a pending state and SHALL NOT begin a second write, and controls made inert alongside it
SHALL change appearance uniformly.

Whether a persisted response counts toward qualifying coverage SHALL be decided by the definition
already in force in `domain-contracts`, and this capability SHALL NOT restate it.

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
> never permanently skipped and can still reach its coverage target. A reviewer who prefers the other
> rule should reject this scenario **and** change the implementation, not merely the scenario.

#### Scenario: The write that persists a response is single-flight

- **WHEN** a response is being persisted
- **THEN** the control that initiated it exposes a pending state and cannot begin a second write

#### Scenario: A control inert alongside the write changes appearance uniformly

- **WHEN** a response is being persisted and other controls are made inert alongside it
- **THEN** those controls change appearance uniformly, and none of them claims to be in progress

### Requirement: Navigation within the active batch is safe and cannot duplicate a response

A validator SHALL be able to move between entries of the active batch without losing a completed
response and without a completed response being submitted twice. An entry the validator has already
completed SHALL NOT be presented again for validation within the same batch.

> **This is the participant-facing counterpart to an existing rule, not a new one.** `domain-contracts`
> already requires that a validator never validates the same entry twice, and the database enforces it
> independently. This requirement is about the session not *offering* a duplicate in the first place,
> which is a different failure from the write being refused: a refused write has already cost the
> validator their typed answer.

#### Scenario: Moving between entries does not lose completed work

- **WHEN** a validator has completed an entry and moves to another entry in the active batch
- **THEN** the completed response remains persisted and is not discarded

#### Scenario: An already-completed entry is not presented again in the same batch

- **WHEN** a validator returns to an entry they have already completed in the active batch
- **THEN** that entry is not presented again for validation

#### Scenario: Leaving and returning to the session does not offer a completed entry again

- **WHEN** a validator leaves the session and later returns to the same batch
- **THEN** the entries they had already completed are not presented again for validation

### Requirement: An invalid response is prevented before a request is made

The session SHALL prevent a response from being sent while it is invalid — missing an evaluation,
missing a required correction, or missing either required research translation — and SHALL state which
input is required.

This prevention SHALL NOT be treated as the enforcement of the rule. The server SHALL remain
authoritative, and a response that is invalid SHALL be refused on the server regardless of what the
client allowed, because the in-force database constraints reject a malformed response independently of
the application.

#### Scenario: An incomplete response is not sent

- **WHEN** a validator attempts to complete a response with a required input missing
- **THEN** no request is made and the missing input is identified

#### Scenario: Prevention does not replace server enforcement

- **WHEN** a response that is invalid reaches the server
- **THEN** the server refuses it, independently of any client-side prevention
