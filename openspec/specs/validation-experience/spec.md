# validation-experience Specification
## Purpose

Defines the participant-facing per-entry validation flow: how a validator works through an allocated
batch one entry at a time, how their evaluation, conditional correction, and two required research
translations are collected, and when each completed response is persisted.

## Requirements

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

### Requirement: Each evaluable response offers a translation language choice

For every evaluable evaluation the session SHALL offer a translation choice — English, Filipino,
both, or skip — for translations of the **validated** Ilocano sentence: the correction where one
was required, and the original sentence where none was. Any translation the validator supplies
SHALL be non-blank before the response can be completed; a blank value is refused, never stored
as an empty translation.

The session SHALL NOT require any translation. Skipping carries no penalty, implies no judgment
about the validator, and SHALL NOT be presented as a lesser contribution.

For *cannot confidently evaluate* the session SHALL offer **neither** translation input and no
language choice, and a response carrying either SHALL NOT be accepted as though the evaluation
were translatable.

#### Scenario: A validator translates into one language only

- **WHEN** a validator has chosen *correct and natural* and then chooses English only
- **THEN** a single English translation input is offered, it is required to be non-blank, and
  the response completes with no Filipino translation

#### Scenario: A validator translates into both languages

- **WHEN** a validator chooses both languages
- **THEN** both inputs are offered and both are required to be non-blank before the response
  can be completed

#### Scenario: A validator skips translation without penalty

- **WHEN** a validator chooses skip after an evaluable evaluation (and any required correction)
- **THEN** the response completes with neither translation, and no control suggests the
  contribution counts for less

#### Scenario: The translations describe the validated sentence, not the pre-correction wording

- **WHEN** a validator has chosen *incorrect*, supplied a corrected Ilocano sentence, and chosen
  a language
- **THEN** each supplied translation is of the corrected Ilocano sentence, not of the original
  wording

#### Scenario: A cannot-confidently-evaluate choice offers no translation input

- **WHEN** a validator chooses *cannot confidently evaluate*
- **THEN** neither an English translation input nor a Filipino translation input is offered, and
  no language choice is presented

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

### Requirement: A contention-short batch presents its actual persisted size

A batch that allocation persisted short under contention SHALL present its
actual persisted size everywhere a size appears internally: the session total, the
position bookkeeping, and the completion counts SHALL all derive
from the batch's own persisted entries rather than from the configured batch
size. A 4-entry persisted batch is served by positions 1 through 4.
No entry SHALL be repeated merely to satisfy the configured size of 5, and a
completed entry SHALL NOT be presented again for validation within the same
batch. Allocation SHALL still collapse to the short batch within its existing
bounded claim rounds rather than waiting indefinitely for exactly 5, and
exclusive reservation semantics are unchanged by this requirement.

> **Renumbered by this change, recorded rather than silently edited.** The earlier
> text described a 9-entry batch against a configured size of 10 ("1 of 9
> through 9 of 9", "no tenth row", "completed count of 9"). The batch size of 10
> is SUPERSEDED by the batch size of 5; the rule is unchanged and only the
> numbers move. The original scenarios are kept below with their original titles
> so the renumbering is visible, followed by the current 4-entry scenarios.

#### Scenario: A 9-entry batch reports a total of 9

- **SUPERSEDED by this change, kept so the renumbering is visible rather than silent.**
  Originally: a validator opening a batch whose persisted entries numbered 9 saw a session
  total of 9. The configured size is now 5; the current form is "A 4-entry batch reports a
  total of 4" below.

#### Scenario: Positions run 1 of 9 through 9 of 9

- **SUPERSEDED by this change, kept so the renumbering is visible rather than silent.**
  Originally: each presented entry carried its persisted 1-based position with a readout
  advancing from 1 of 9 to 9 of 9. Visible position readouts are removed entirely by this
  change; positions survive only as internal server-authorized bookkeeping. The current form
  is "Positions run 1 through 4" below.

#### Scenario: No entry is repeated to reach 10

- **SUPERSEDED by this change, kept so the renumbering is visible rather than silent.**
  Originally: contention leaving 9 granted entries of 10 requested persisted 9 entries with
  9 distinct ids and no tenth row. The current form is "No entry is repeated to reach 5" below.

#### Scenario: Progress and completion counts use the actual size

- **SUPERSEDED by this change, kept so the renumbering is visible rather than silent.**
  Originally: completed and remaining counts summed to 9 and completing all 9 reported the
  batch finished with a completed count of 9. Visible progress and completion counts are
  removed by this change; internal counts still sum to the actual size. The current form is
  "Completion counts use the actual size" below.

#### Scenario: A completed entry in a short batch is not presented again

- **WHEN** a validator returns to a position whose entry they already completed
  in the same short batch
- **THEN** that entry is not presented again for validation

#### Scenario: Allocation does not wait indefinitely for exactly 10

- **SUPERSEDED by this change, kept so the renumbering is visible rather than silent.**
  Originally: claim rounds granting fewer entries than requested still reported the short batch
  within the existing round bound rather than retrying indefinitely for exactly 10. The rule is
  unchanged; only the number moves. The current form is "Allocation does not wait indefinitely
  for exactly 5" below.

#### Scenario: A 4-entry batch reports a total of 4

- **WHEN** a validator opens a batch whose persisted entries number 4
- **THEN** the session total is 4, derived from those persisted entries

#### Scenario: Positions run 1 through 4

- **WHEN** a validator works through a 4-entry batch in the server-allocated
  order
- **THEN** each presented entry carries its persisted 1-based position

#### Scenario: No entry is repeated to reach 5

- **WHEN** contention leaves a batch with 4 granted entries of 5 requested
- **THEN** the persisted batch contains 4 entries with 4 distinct dataset
  entry ids and contiguous positions 1 through 4, and no fifth row

#### Scenario: Completion counts use the actual size

- **WHEN** a validator has completed entries in a 4-entry batch
- **THEN** the completed and remaining counts sum to 4, and completing all 4
  reports the batch finished with a completed count of 4

#### Scenario: Allocation does not wait indefinitely for exactly 5

- **WHEN** claim rounds grant fewer entries than requested and bounded
  backfill still leaves the batch short
- **THEN** the short batch is reported as allocated (or `exhausted` when none
  could be granted) within the existing round bound, and the request is not
  retried indefinitely

### Requirement: An active validation session presents one sentence at a time

A validator holding an allocated batch SHALL be able to work through it as a session that presents
**exactly one** dataset entry at a time. The presented entry SHALL show the Ilocano sentence and
nothing else of the entry: neither the intended origin, nor the intended destination, nor the
travel mode, nor the dataset entry identifier is shown to the validator. The session SHALL NOT
show per-entry progress: no sentence x-of-y readout, no saved count, no progress bar or segments,
no percentage, and no remaining count. The participant focuses on the current sentence and its form.

The client MAY hold at most one server-prefetched future entry so transitions feel instant, but it
SHALL NOT present, render, or otherwise expose that entry's sentence before the current entry is
completed. Prefetching is a presentation cache for the transition, never research storage, and the
server alone decides which entry comes next.

Internally the application still tracks the current batch, the server-authorized placement, queued
responses, active response saves, confirmed responses, and failed responses. Removing the visible
progress does not remove internal correctness or accounting.

> **The progress display is removed by this change, recorded rather than silently deleted.** The
> earlier text read "The session SHALL show the validator's **progress** through the active batch"
> with progress derived from the server-allocated batch. That display is withdrawn: it pressured
> pace rather than aiding judgement. The server still derives placement and counts; they are
> simply no longer presented.

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

- **SUPERSEDED by this change, kept so the removal is visible rather than silent.**
  Originally: when a validator was partway through an allocated batch, the session showed their
  progress through that batch derived from the server-allocated batch. The visible progress
  display is withdrawn; internal placement and counts are still derived server-side but no longer
  presented. Its replacement is the scenario below.

#### Scenario: The session shows no progress through the active batch

- **WHEN** a validator is partway through an allocated batch
- **THEN** no sentence x-of-y readout, saved count, progress bar, percentage, or remaining count
  is shown

#### Scenario: A second entry is not presented alongside the current one

- **WHEN** a validator is viewing an entry in an allocated batch
- **THEN** no other entry's sentence is presented for evaluation at the same time

#### Scenario: A prefetched entry is never exposed before its turn

- **WHEN** the client holds a prefetched next entry while the current entry is
  still being answered
- **THEN** nothing of the prefetched entry's sentence is rendered, readable in
  the markup, or choosable, until the current entry is completed

### Requirement: Each presented entry begins with a fresh validation form

When the session presents a dataset entry for validation, its form SHALL hold no state from any previously answered entry: no evaluation selected, no correction text, no English or Filipino translation text, the translation choice at its default, no field errors, and no pending submission. Advancing after a successful submit, arriving at an entry by position, or returning to an unanswered entry SHALL all present the same empty form. The reset SHALL clear the submitted payload as well as the visible inputs — hiding stale values while keeping them submittable is not a reset.

The participant's attempt/session identity and internal batch accounting SHALL NOT be cleared by the reset; only per-entry form state is entry-scoped. (Visible progress was removed by this change, so there is no progress display for the reset to preserve; the internal completed count is unchanged.)

#### Scenario: Submitting entry 1 leaves entry 2 empty

- **WHEN** a validator fills entry 1 completely, submits it successfully, and entry 2 renders
- **THEN** no evaluation is selected, every text input is empty, the translation choice is unmade, no error is shown, and submitting immediately is refused as an incomplete response rather than sending entry 1's answer again

#### Scenario: Errors do not survive an advance

- **WHEN** a validator triggers a field error on entry 1 and then reaches entry 2
- **THEN** entry 2 shows no error from entry 1

#### Scenario: Identity and progress survive the reset

- **WHEN** the form resets for a new entry
- **THEN** the attempt identifier, the batch, and the completed count are unchanged, and only entry-scoped state is cleared
