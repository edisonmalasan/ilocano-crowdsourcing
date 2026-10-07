# batch-routing Specification

## Purpose
Defines how a stored batch identifier travels into a URL and back out of it unchanged, so that a batch
which exists on the server can actually be opened by the person it belongs to. This capability exists
because that did not hold: a batch could be in storage and still be unreachable, which is a failure no
amount of correct allocation, persistence, or export can compensate for.

## Requirements

### Requirement: A stored batch identifier round-trips through the route unchanged

A batch identifier read from storage SHALL enter a route in exactly the form it is stored, and the value
the server derives from that route SHALL be **equal to the stored identifier** before any lookup uses it.
Encoding for transport SHALL be the transport's business: no producer SHALL pre-encode an identifier, and
the consumer SHALL apply exactly one decoding step rather than none and rather than as many as it takes
to look plausible.
A batch identifier is opaque to this rule. It SHALL hold for an identifier containing no reserved
characters and for one containing them, and a stored batch SHALL remain openable by its own address
whether or not any producer was rewritten first.
> **The measured reason this requirement exists rather than a preference.** A batch identifier embeds an
> ISO instant, so it contains colons. Measured against Next.js 16.3.6 on this repository's own route, the
> dynamic route parameter arrives **percent-encoded even when the request path spelled the colons
> literally**, and the identifier also reached the client already encoded at three of the four producers —
> so the two mechanisms compose into `%253A`. Both halves were measured separately, because fixing only
> the half a report happens to name leaves the other in place.

Because a producer emits the identifier RAW, the address it builds is the route prefix followed by the
identifier itself, and an identifier containing a path separator would therefore address a different
route. **A batch identifier accepted anywhere in the platform SHALL NOT contain a path separator.**
This is a consequence of removing the pre-encoding rather than a new restriction on the identifier
scheme: the pre-change producers happened to block such an identifier as a side effect of
`encodeURIComponent`, and a "non-empty string" schema does not.

#### Scenario: An identifier containing reserved characters survives the round trip

- **WHEN** a stored batch identifier contains characters that a URL must encode, and the platform
  navigates to it and the dynamic route then reads it back
- **THEN** the value the route derives is exactly equal to the stored identifier, with the same characters
  in the same places, and the batch is opened rather than reported as not found

#### Scenario: An identifier that could address a different route is refused

- **WHEN** a value containing a path separator is offered as a batch identifier
- **THEN** it is refused as an identifier, and no address the platform builds can leave the batch route
- **AND** every identifier the platform's own mint produces is still accepted, because a rule that
  rejected real identifiers would be a worse failure than the one it prevents

#### Scenario: A stored batch is openable by its own address

- **WHEN** a batch that already exists in storage is addressed by a URL built from its stored identifier
- **THEN** the platform finds that batch and presents it, rather than reporting that no such batch exists
- **AND** the value the batch lookup receives is character-for-character the identifier that was stored

#### Scenario: An identifier with no reserved characters is unchanged by the round trip

- **WHEN** a batch identifier contains no character a URL must encode
- **THEN** the value the route derives is exactly equal to the stored identifier, and the round trip is
  the identity rather than merely a successful lookup

### Requirement: A route segment that cannot be decoded is refused rather than repaired

Recovering a batch identifier from a route SHALL apply exactly one decoding step. A segment that is not a
valid single decoding SHALL be reported through the route's existing not-found or invalid-address state
and SHALL NOT be decoded again, guessed at, trimmed, or otherwise repaired into a candidate identifier.
A doubly encoded segment SHALL NOT resolve to the batch it appears to name, and the platform SHALL NOT
expose the repair as a fallback that would let a second, differently encoded spelling of the same batch
address open it.

#### Scenario: A doubly encoded segment is refused

- **WHEN** a request addresses a batch with a segment in which the encoding has been applied twice
- **THEN** the platform reports its existing not-found or invalid-address state and performs no lookup
  against the repeatedly decoded value

#### Scenario: A malformed segment is refused rather than throwing

- **WHEN** a request addresses a batch with a segment that is not valid percent-encoding
- **THEN** the platform reports its existing not-found or invalid-address state, and the route renders
  rather than failing

### Requirement: The route contract is defined once and used by every producer, including the auto-orchestrator, and by the one consumer

There SHALL be exactly one definition of how a batch identifier becomes a path and of how the dynamic
route parameter becomes a batch identifier. Every place that navigates to a batch SHALL obtain its address
from that definition, and the route SHALL obtain the identifier from it, so that no site can hold a
private copy of either operation.
The producers are the start screen's interrupted-batch resume address, the start screen's navigation to a
newly allocated batch, the validation form's navigation after a response is stored, the finished
screen's navigation to another batch, and the post-enrollment auto-orchestrator's navigation to a
resumed or newly allocated batch. No other route, island, or helper may construct a batch address or
read the dynamic route parameter directly.

#### Scenario: Every producer goes through the one definition

- **WHEN** any control or effect that navigates to a batch produces an address
- **THEN** the address it navigates to is the one the single definition produces for that identifier, and
  the address contains no encoding that the definition did not itself produce

#### Scenario: All five named producers are accounted for

- **WHEN** the resume, allocation, post-submit, continue, and auto-orchestration navigations each build
  an address
- **THEN** all five addresses are equal to the single definition's output for their own identifier, and
  none of them performs its own encoding

#### Scenario: No other site builds a batch address or reads the route parameter

- **WHEN** every site that produces or consumes a batch address is enumerated across the whole
  application
- **THEN** each one is either the single definition itself or a caller of it, and no site builds an
  address or reads the dynamic route parameter on its own

### Requirement: New batch identifiers are independent opaque capabilities

Newly minted batch identifiers SHALL be cryptographically random and
independent of the attempt identity, in the shape `BAT_` followed by 32
lowercase hex characters (at least 128 bits of CSPRNG entropy), using
URL-safe characters, generated server-side. A new batch identifier SHALL NOT
contain, encode, hash, or derive from the validator ID, the creation instant,
entry IDs, or a batch number/counter. The `validatorId-timestamp` mint is
retired for new batches. `batch_id`, `validator_id`, and `created_at` remain
separate stored facts.

Legacy stored batch identifiers SHALL remain readable only through the
ownership authorization; new batches SHALL mint only `BAT_` identifiers. No
primary-key or foreign-key rewrite of research history is performed to
normalize identifiers.

#### Scenario: New batch IDs contain no validator identity

- **WHEN** a new batch identifier is inspected
- **THEN** it does not contain the owning attempt's identifier in any encoded
  or hashed form

#### Scenario: New batch IDs contain no timestamp

- **WHEN** a new batch identifier is inspected
- **THEN** it carries no creation instant, counter, or entry reference

#### Scenario: Legacy batches stay readable through the ownership gate

- **WHEN** a legacy batch is opened by its owning session with proof of
  attempt
- **THEN** it resolves exactly as before, subject to the same ownership check
  as a new batch

### Requirement: A batch address alone grants nothing

The server SHALL return batch sentence content only when the stored batch
owner equals the browser's currently supplied active attempt identity. The
check SHALL require both the requested batch identifier and the active
attempt identity; a batch identifier alone SHALL NOT open a batch.

The initial server render of a batch address SHALL reveal no participant
sentence data before ownership is proven. A direct refresh by the legitimate
owning session SHALL continue to work.

#### Scenario: Owner with matching attempt resumes

- **WHEN** the supplied active attempt equals the stored batch owner
- **THEN** the approved session projection is returned

#### Scenario: Foreign attempt reveals nothing and redirects home

- **WHEN** the supplied active attempt differs from the stored batch owner
- **THEN** no sentence, batch metadata, validator identity, or existence
  distinction is revealed, and the participant-facing outcome is a redirect to
  `/`

#### Scenario: No attempt reveals nothing and redirects home

- **WHEN** no active attempt is supplied
- **THEN** no sentence or metadata is revealed, no validator is created, and
  the participant-facing outcome is a redirect to `/`

#### Scenario: Unknown batch is indistinguishable from foreign

- **WHEN** the batch identifier names no stored batch
- **THEN** the participant-facing outcome is the same redirect to `/` with no
  existence signal
