# batch-recovery Specification

## Purpose
A validator who abandons a batch part-way through currently has no way back to it. The batch exists,
server-side, with unanswered entries — but the only handle on it was the URL, and every route back into
the platform offers a *new* batch instead. This capability makes an interrupted batch discoverable to its
own owner, recognised from the work that remains rather than from any stored flag, and resumable in place.

This is a change to the participant's continuity of experience, not a rescue of lost research data. That
distinction is measured in `proposal.md` and is load-bearing: an abandoned batch's unanswered entries stay
**eligible for allocation**, because the only two conditions `selectBatchEntries` tests are that the
validator has already **answered** the entry and that it already holds a validating package. A third
exclusion applies equally to everybody and is not an effect of abandonment: an entry marked inactive is not
in the pool at all. **No completion is destroyed by abandonment**, and this capability must not be described
as though it recovers a package it never lost.

> **Edited by the `single-validation-package` change, which owns no delta for this capability because
> OpenSpec deltas cannot express a Purpose change.** The sentence above previously read "has already
> reached the coverage target" and "No coverage is destroyed by abandonment". Under the corrected
> methodology there is no target to reach: an entry is complete when one stored response establishes
> the complete bilingual package, and abandonment destroys no such package. No requirement in this
> capability changes — every one is untouched — so there is no delta file for it.

## Requirements

### Requirement: An interrupted batch is recognised from work remaining, never from a stored flag

The platform SHALL recognise a batch as interrupted when, and only when, the requesting validator owns it
and at least one of its assigned entries has no recorded response **by that validator**. Whether a
response exists is a question about the validator, not about the batch: a response recorded against the
same entry in a different batch of the same validator's answers it just as much, because the validator
will not be offered that entry again. Recognition SHALL be derived from the stored batch, its stored
entries, and the stored responses.

A batch that holds **no entries at all** SHALL be treated as not interrupted, and SHALL NOT cause the
lookup to fail. A batch row with no entries is a known residue of a non-transactional two-write create,
it cannot be worked through, and reporting it as interrupted would offer a participant work that does not
exist.

The platform SHALL NOT introduce a batch lifecycle column, a status flag, or an assignment timestamp used
solely to decide this question, and SHALL NOT offer a batch whose entries are all answered. A batch that
is finished is not interrupted, and the two conditions are complements derived from the same set of rows.

#### Scenario: An abandoned batch with work left is recognised as interrupted

- **WHEN** a batch owned by the validator has at least one assigned entry with no recorded response
- **THEN** that batch is recognised as interrupted for that validator

#### Scenario: An entry answered in another batch is not offered again

- **WHEN** an entry assigned to this batch was answered by the same validator in a different batch
- **THEN** it counts as answered for this batch too, and is not part of the remaining count

#### Scenario: A fully answered batch is never offered

- **WHEN** every entry assigned to a batch has a recorded response
- **THEN** that batch is not recognised as interrupted, however it was left, and is never offered for resumption

#### Scenario: An empty batch is not an interrupted batch

- **WHEN** a batch row holds no entries
- **THEN** it is not recognised as interrupted, and looking for an interrupted batch does not fail because of it

#### Scenario: Recognition is derived, not asserted

- **WHEN** an interrupted batch is recognised
- **THEN** the recognition is computed from the stored batch, its entries, and the validator's responses, and no lifecycle column is added to the batch table to record it

### Requirement: The most recently created interrupted batch is the one offered

The platform SHALL offer the most recently created interrupted batch belonging to the requesting validator,
and SHALL report that batch's remaining and total entry counts.

Where a validator owns more than one interrupted batch, the choice SHALL be total: no two batches may tie,
and the same stored data SHALL always yield the same choice — including for batches whose recorded
creation instant is identical, which is the case for every batch that predates the column. Where a
validator owns no interrupted batch, the platform SHALL offer none and SHALL behave exactly as it does
today.

#### Scenario: A single interrupted batch is offered with its counts

- **WHEN** the requesting validator owns exactly one interrupted batch
- **THEN** that batch is offered, reporting how many of its entries remain unanswered and how many it contains in total

#### Scenario: Several interrupted batches resolve to one

- **WHEN** the requesting validator owns more than one interrupted batch
- **THEN** the most recently created is the one offered

#### Scenario: The choice does not depend on how the rows came back

- **WHEN** two of the validator's batches carry the same recorded creation instant
- **THEN** the same one is offered every time, because the choice is broken by the batch identifier and not left to the order the rows arrived in

#### Scenario: No interrupted batch offers nothing

- **WHEN** the requesting validator owns no batch with unanswered entries
- **THEN** no interrupted batch is offered and the start experience is unchanged

### Requirement: Resuming continues at the first unanswered entry, writes nothing, and asks nothing twice

Resuming an interrupted batch SHALL present the first entry in the batch's stored order that has no
recorded response. Resuming SHALL NOT present any entry for which a response is already recorded, and
SHALL NOT create, alter, or delete any batch, entry, or response row.

Resuming is navigation to the batch's own address and nothing more. Because no row is written on the way
in, resuming is not a lifecycle event, and the platform SHALL NOT record that a resumption happened.

#### Scenario: Resumption picks up at the first gap

- **WHEN** a validator resumes a batch whose entries in positions one to three have recorded responses
- **THEN** the entry in position four is presented

#### Scenario: An answered entry is never re-asked

- **WHEN** a validator reaches an entry for which they already have a recorded response
- **THEN** that entry is not presented as unanswered work

#### Scenario: Resuming writes nothing

- **WHEN** a validator follows the resumption affordance
- **THEN** the request that follows it issues no write operation of any kind — no create, no update, no delete — against any store

This scenario is about the **absence of a write path on the request**, not about the state of the database
afterwards. It is written that way on purpose: a batch row cannot be un-written by following a link, so a
test that asserted "the rows are unchanged afterwards" would pass whether or not the implementation ever
attempted a write. What can be observed — and what must be asserted — is that following the affordance
produces no write.

### Requirement: The recovery lookup is additive and can never withhold an option

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

### Requirement: The recovery offer introduces no identifier beyond the one it leads to

The recovery offer SHALL report only the interrupted batch's identifier, its remaining entry count, and its
total entry count. It SHALL NOT carry the validator's proficiency, screening answer, enrolment state, or
any timestamp of the validator's activity, and it SHALL NOT reveal the existence of any other batch.

The batch's own address embeds the validator's anonymous identifier, and following the offer necessarily
puts that address on screen. That is not a disclosure this requirement forbids, and pretending otherwise
would make the requirement unsatisfiable: the identifier is one the browser already holds and already
sends, so rendering the address it is about to navigate to discloses nothing it did not have. What the
requirement forbids is any identifier, figure, or fact **beyond** that — a second identifier, a count of
the participant's lifetime responses, or a hint that another batch exists.

#### Scenario: Only three fields are reported

- **WHEN** an interrupted batch is offered
- **THEN** the offer carries the batch identifier, the remaining entry count, and the total entry count, and no other field

#### Scenario: The offer adds nothing to the address it leads to

- **WHEN** the offer is rendered
- **THEN** the only identifier on it is the one embedded in the batch's own address, and no proficiency, no screening answer, and no timestamp of the validator's activity appears

### Requirement: The recovery offer is presented in both interface languages

The interrupted-batch sentence, its two counts, and its resumption affordance label SHALL be presented in
the active interface language, which is English or Filipino.

#### Scenario: Both interface languages carry the offer

- **WHEN** the active interface language is English, and separately when it is Filipino
- **THEN** the interrupted-batch sentence, its counts, and its affordance label are presented in that language

### Requirement: The lookup is keyed on the anonymous identifier and the batch is named by the server

The lookup SHALL be requested with the anonymous validator identifier the browser already holds, and the
server SHALL re-check that identifier against the enrolled validators exactly as every other validator-
keyed operation does. The lookup SHALL NOT accept a client-supplied batch identifier, and SHALL report a
batch only when the stored batch's own validator is the requesting validator.

A client therefore cannot ask the server to resume a particular batch, and cannot name one belonging to
somebody else. That the identifier is client-supplied is pre-existing and unchanged by this capability; the
additional property here is that a lookup discloses a batch only for an identifier the caller already held,
so it reveals nothing about anybody else.

It is **not** a claim that the identifier cannot be guessed or enumerated. It is 32 bits of entropy, and the
platform already answers the same question — does this identifier name an enrolled validator — through
`unknown_validator` on every validator-keyed operation. So this capability adds **no new kind of oracle**,
which is a weaker and accurate statement than saying it adds no oracle at all.

#### Scenario: An unknown identifier is refused

- **WHEN** the lookup is requested with an identifier that names no enrolled validator
- **THEN** it is refused the same way every other validator-keyed operation is refused, and no batch is reported

#### Scenario: A batch belonging to somebody else is not reportable

- **WHEN** the stored batch's validator is not the requesting validator
- **THEN** the lookup reports no interrupted batch, because the request cannot name a batch at all
