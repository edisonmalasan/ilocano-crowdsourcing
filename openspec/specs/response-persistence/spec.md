# response-persistence Specification

## Purpose

Gives every submitted validation response its own independent path from the participant's form to durable storage: a memory-only queue item with its own lifecycle, a same-origin POST transport, one versioned database RPC per response, bounded concurrent workers, typed retries, and a hard five-entry checkpoint that the finished card enforces before either completion control becomes usable.

## Requirements

### Requirement: Each submitted entry owns an independent response

Each entry a validator submits SHALL produce its own validation response with its own queue item, payload, persistence request, state, retry lifecycle, and database acknowledgement. One entry's response SHALL NOT overwrite, replace, consume, or share another entry's queued response. A batch still contains up to 5 entries; it is never one batch per sentence.

#### Scenario: Five rapid submissions occupy five queue positions

- **WHEN** a validator rapidly submits all 5 entries of a batch as cannot-confidently-evaluate
- **THEN** all 5 responses enter independent queue positions, none is overwritten, and none silently disappears

#### Scenario: Out-of-order acknowledgement keeps attribution

- **WHEN** the persistence requests for two entries complete out of order
- **THEN** each acknowledgement is attributed to its own entry and neither response is lost or swapped

#### Scenario: Duplicate submission of one entry stays single-flight

- **WHEN** the same entry is submitted twice (for example a double click)
- **THEN** exactly one queue item exists for that entry and exactly one persistence lifecycle runs for it

### Requirement: At most three response writes run concurrently

At most 3 response POST/RPC operations SHALL actively execute at the same time (`MAX_ACTIVE_SAVES = 3`). The limit governs active execution only: all 5 current-batch responses MAY exist independently in the queue, and queued work SHALL start immediately as a worker becomes free. The participant's advance from entry to entry SHALL NOT wait merely because all 3 workers are occupied.

#### Scenario: Fourth and fifth responses queue instead of being lost

- **WHEN** 3 response writes are active and a validator submits entries 4 and 5
- **THEN** both responses wait safely in the queue and neither is dropped or overwritten

#### Scenario: A freed worker takes the next queued item immediately

- **WHEN** one of 3 active writes confirms while queued responses wait
- **THEN** the next queued response starts without participant action and without re-submission

#### Scenario: Advancement does not wait for worker occupancy

- **WHEN** all 3 workers are occupied and a validator completes the current entry
- **THEN** the session still advances optimistically to the next entry

### Requirement: One response save uses one database RPC

Each response save SHALL persist through exactly one versioned PostgreSQL function that resolves the stored batch, derives the validator/attempt from that batch, verifies the submitted dataset entry belongs to it, inserts exactly one validation response, and releases that entry's reservation after successful persistence. The client SHALL supply only intent (batch id, dataset entry id, response payload) and SHALL NOT supply validator id, response id, timestamps, batch ownership, or dataset membership; those remain server-derived or server-minted.

The `UNIQUE (validator_id, dataset_entry_id)` guarantee is unchanged: a retry after a response was stored but its acknowledgement was lost SHALL resolve as `already_recorded` / confirmed rather than creating a second response. Reservation release happens only after successful persistence; a harmless reservation-cleanup problem SHALL NOT roll back or un-confirm an otherwise valid recorded response, and the existing reservation TTL remains the recovery backstop.

#### Scenario: A normal save costs one RPC

- **WHEN** a validator submits one entry
- **THEN** persistence completes in one database RPC rather than a read-then-insert-then-release chain

#### Scenario: A lost acknowledgement resolves as already recorded

- **WHEN** a response was stored but its acknowledgement was lost and the client retries
- **THEN** the retry resolves as already recorded, is treated as confirmed, and creates no second response

#### Scenario: A client cannot choose another validator

- **WHEN** a persistence request carries a validator id or batch ownership that disagrees with the stored batch
- **THEN** the server-derived values win and the client cannot store a response as another validator

### Requirement: Each queue item retries independently with bounded backoff

Each queue item SHALL retry independently with bounded retries and backoff. The typed distinction is preserved: `recorded` and `already_recorded` confirm; transient network/persistence failures retry; permanent refusals (invalid payload, unknown batch, entry not in batch, other deterministic refusals) are never retried indefinitely. One entry's temporary failure SHALL NOT block other independent queued entries from saving unless the failure means the whole batch is invalid. An exhausted item retains its complete response in memory and surfaces an actionable error.

#### Scenario: A transient failure retries while siblings proceed

- **WHEN** one entry's save fails transiently while other entries are queued
- **THEN** that item retries with backoff and the other entries continue saving on the free workers

#### Scenario: A permanent refusal is parked, not retried

- **WHEN** a save is refused as invalid, unknown batch, or entry-not-in-batch
- **THEN** it is parked with its complete response retained, never retried automatically, and the participant is told the answer was not stored

### Requirement: The finished card is the hard synchronization checkpoint

After the fifth entry is submitted the session SHALL transition in place to the existing finished-card visual state without unmounting the component that owns the response queue, and the mounted queue SHALL continue draining. After every client queue item is acknowledged, a fresh server-authoritative verification SHALL prove the attempt has stored responses for every one of the five batch placements; only then is the checkpoint passed. While verification is incomplete, Answer another batch and Finish for now SHALL stay unavailable (with `aria-busy` / disabled semantics for accessibility), no routine saving/synchronizing message SHALL appear, and no database confirmation SHALL be claimed. If an expected response is missing, the missing item SHALL be reconciled from its retained payload where available, otherwise a clear error surfaces instead of pretended completion. Finish SHALL NOT retire the attempt before the checkpoint passes.

#### Scenario: Controls wait for the queue drain

- **WHEN** the finished card is shown while responses are still unconfirmed
- **THEN** both completion controls are unavailable and no routine progress message is shown

#### Scenario: Controls wait for server verification after the drain

- **WHEN** all client queue items are acknowledged but server verification has not yet proven all 5 stored
- **THEN** both completion controls remain unavailable

#### Scenario: A missing response blocks completion honestly

- **WHEN** server verification finds one of the five placements without a stored response
- **THEN** completion stays blocked, the missing item is retried from its retained payload where available, and otherwise a clear actionable error is shown

#### Scenario: Verification of all five enables the controls

- **WHEN** server verification proves all 5 placements have stored responses
- **THEN** Answer another batch and Finish for now become usable

#### Scenario: Finishing never retires the attempt early

- **WHEN** a validator reaches the finished card with unconfirmed responses
- **THEN** the attempt identity is not cleared before the checkpoint passes

### Requirement: Answering another batch keeps the same attempt

Answer another batch SHALL keep the same anonymous validator/attempt identity, create or use a new batch identity, allocate up to 5 newly eligible entries, and never assign the same attempt an entry it already answered or was already assigned under the approved semantics, with reservation and concurrency protection intact. No new validator is minted because another batch was requested.

#### Scenario: Batch B follows batch A under one attempt

- **WHEN** a validator answers another batch after a passed checkpoint
- **THEN** the attempt identity is unchanged, the new batch holds newly allocated entries, and none repeats an entry already answered or assigned to that attempt

### Requirement: Background response writes travel by POST, not by Server Action

Individual background response writes SHALL travel from the browser to the server as same-origin HTTPS POST requests to a Route Handler, which validates the request and performs the single response-submission RPC. Client-called Server Actions SHALL NOT be the transport for individual high-frequency background response writes; they remain for one-shot application workflows. The Supabase service-role credential remains server-only and the browser never calls a privileged RPC directly.

#### Scenario: A background save is a POST

- **WHEN** the queue persists one queued response
- **THEN** it issues a same-origin POST carrying only batch id, dataset entry id, and response payload, and the server derives ownership and timestamps

#### Scenario: A malformed POST is refused before any database work

- **WHEN** a POST fails strict input parsing
- **THEN** it is refused with a typed reason and no persistence operation is attempted

### Requirement: Persistence timing is observable without logging response content

The platform SHALL record privacy-safe timing sufficient to diagnose response POST duration, response RPC duration, queue wait duration, active worker count, checkpoint verification duration, and start-session durations. It SHALL NOT log Ilocano response text, correction text, English or Filipino translation text, or credentials, and SHALL avoid logging anonymous validator ids except where an operator diagnostic genuinely requires it under the current logging policy.

#### Scenario: Timing is recorded without content

- **WHEN** a response save and checkpoint complete
- **THEN** durations and worker counts are available to operators with no response text among them

### Requirement: Queued responses live in memory only

Response payloads SHALL NOT be written to `localStorage`, `sessionStorage`, or `IndexedDB`. The queue remains memory-only, which is why the mounted queue is preserved through the finished-card transition. Only the anonymous attempt identifier may use browser storage under the current policy. Beforeunload protection SHALL remain while unconfirmed responses exist.

#### Scenario: No response payload reaches browser storage

- **WHEN** responses are queued, saved, and checkpointed
- **THEN** no response payload is written to any persistent browser store

#### Scenario: Leaving with unconfirmed work warns

- **WHEN** a validator attempts to leave while responses are unconfirmed
- **THEN** beforeunload protection engages
