# Spec Delta

## MODIFIED Requirements

### Requirement: The anonymous identifier is kept in browser-local storage

The browser SHALL retain the anonymous validator identifier in **session-scoped** browser-local
storage as the only value persisted on the client, and SHALL be able to clear it. A stored value
SHALL be validated against the shared identifier format before it is used for anything, and a stored
value that is malformed SHALL be discarded rather than sent to the server.

Session-scoped storage holds a convenience token, not authority. Nothing about a participant's
status, proficiency, or progress SHALL be read from it, and it SHALL NOT hold a screening answer, a
batch, or any research response.

The identifier SHALL NOT be written to storage that outlives the browser session, and no attempt
SHALL be recovered from such storage. Storage that survives the session is the wrong lifetime for
this value: the corrected methodology makes a participation attempt the unit of interest, and an
identifier that outlived every session would silently turn one browser profile into one
never-ending validator — the model the methodology correction removes.

> **Amended during Apply.** This requirement originally read "kept in **local** storage" throughout,
> and it is modified rather than replaced so that its other properties — exactly one client-held
> research value, format validation on read, discard rather than send on a malformed value, and no
> authority derived from storage — survive the amendment unchanged. Only the storage's LIFETIME
> changes. `participation-attempt` owns the attempt lifecycle this lifetime now serves; this
> requirement owns what the stored value is allowed to be.
>
> **One scenario name is retained verbatim even though its wording no longer matches the behaviour:
> "Local storage is not a source of authority".** That is not an oversight. `openspec validate` refuses
> a MODIFIED block that drops or renames a scenario the current spec already has, so renaming it to
> "Browser-local storage is not a source of authority" would have made this change unvalidatable. The
> scenario's subject is unchanged — storage is not authority either way — and its body was edited to
> say "browser-local storage". The stale word is left visible rather than worked around.

#### Scenario: The identifier is stored after enrollment

- **WHEN** enrollment succeeds
- **THEN** the identifier is written to session-scoped browser-local storage and is the only
  research-related value held on the client

#### Scenario: A malformed stored value is discarded, not sent

- **WHEN** browser-local storage holds a value that does not match the identifier format
- **THEN** the value is discarded and no request carrying it is made

#### Scenario: Local storage is not a source of authority

- **WHEN** a stored identifier is recognised
- **THEN** the profile, including the screening answer and any progress, is obtained from the server
  rather than from browser-local storage

#### Scenario: Nothing is written to storage that outlives the session

- **WHEN** the identifier is written after enrollment
- **THEN** no storage area that survives the browser session receives it, and an identifier left in
  such an area by an earlier version of the platform is never read back

### Requirement: A returning validator is restored without their screening answer being overwritten

A visitor who presents a previously stored identifier **within the same browser session** SHALL be
restored as the same anonymous validator when the server confirms that identifier exists. An existing
screening answer SHALL NOT be overwritten, and the platform SHALL NOT persist a screening answer
supplied alongside a successful restore.

A stored identifier the server does not recognise SHALL NOT be treated as an error and SHALL NOT be
reused. The platform SHALL discard it and mint a new identity, because a validator must never be
handed an identifier that belongs to nobody.

**A stored identifier from an earlier browser session does not exist for this platform**, so there is
nothing to restore across a session boundary and no participant to recognise across one.

> **Amended during Apply.** This requirement originally restored a "returning visitor" — a person
> recognised across visits — and its scenarios were written in those terms. **The previous "Amended
> during Apply" note on this requirement is retained in full below because it records a real
> correction rather than a superseded one:** the requirement originally read "The screening question
> SHALL NOT be asked again", and its first scenario repeated that the question "is not presented
> again". Both were **not achievable**, and the design record explains why at D2: the identifier
> lives in browser-local storage, so the server cannot know who they are at render time. The client
> *can* read it — `useSyncExternalStore` does so cleanly, and an earlier version of this note wrongly
> said otherwise — but a stored identifier is not a recognised one, so resolving before the server
> answers would enroll a participant whose identifier has expired with no screening answer at all.
> See design.md D2 for the check that falsified the original justification. A participant who
> navigates directly to `/start` therefore does see the question.
>
> What replaces it is the property that actually protects the research data and is actually
> testable: a second screening answer is never *stored*. The restore path performs no write, so the
> original self-reported answer survives untouched, and an answer typed on `/start` by an
> already-enrolled participant is discarded rather than persisted over the first one. The original
> wording was correct as an aspiration and wrong as a specification; this is the accurate contract.
>
> **What this amendment adds** is the bound. "Returning" is now scoped to one participation attempt
> rather than to a browser or a person: the same identifier may be restored across reloads and
> navigation, and nothing may be restored once the browser session that held it has ended. The
> property the previous note established is unchanged and still holds within that bound.

#### Scenario: An existing validator is restored

- **WHEN** a participant presents a stored identifier from the current browser session that the server
  confirms exists
- **THEN** the same anonymous validator is resumed, and no new validator record is created

#### Scenario: Nothing is restored across a browser session

- **WHEN** a participant reaches the flow in a browser session that holds no attempt identity
- **THEN** no attempt is restored, no validator record is created, and they are screened as a new
  participant

#### Scenario: The original screening answer is preserved

- **WHEN** a validator is restored whose profile already carries a screening answer
- **THEN** that answer is unchanged by the restore

#### Scenario: An answer given alongside a successful resume is not stored

- **WHEN** a participant selects a screening answer and submits, and the server confirms their stored
  identifier exists
- **THEN** the newly selected answer is discarded, and the stored answer from the original enrollment
  is left in place

#### Scenario: An unrecognised identifier is replaced, not reused

- **WHEN** a stored identifier is not found on the server
- **THEN** it is discarded and a new anonymous validator is created instead

#### Scenario: An answer given before an unrecognised identifier is discovered is kept

- **WHEN** a participant selects a screening answer and submits, and the server reports that their
  stored identifier names nobody
- **THEN** the new identity is created carrying **the answer just selected**, and the discarded
> identifier is not reused

> This scenario was added during Apply in response to a real defect, not a speculative one. The
> first implementation routed the stale-identifier fallback through a decision that hardcoded
> `answer: null`, so a participant who selected "Fluent" and whose stored identifier had expired
> was enrolled as having **declined**. Their research datum was silently replaced by a different
> one. The code carried a documented `answer` field on that branch whose comment explained it
> existed so callers would not have to re-derive the rule — while the only producer of the field
> hardcoded `null`. A field that is always `null` reads as though something is using it, which is
> what let the defect survive a full green suite.

## ADDED Requirements

### Requirement: The resume affordance describes a session, not a returning person

The landing page's resume control SHALL ask the approved question about continuing within the current
browser session, and its copy SHALL NOT state or imply that the platform remembers a person from a
previous visit, because under session-scoped storage it holds nothing from a previous session.

The copy for this control SHALL exist in both interface languages with the same meaning, and neither
language SHALL be the weaker or shorter rendering of the other.

#### Scenario: The resume copy claims only what session-scoped storage can deliver

- **WHEN** the resume control and its explanation are rendered
- **THEN** they refer to continuing in this browser session and make no claim about having taken part
  on this browser before

#### Scenario: The resume copy exists in both languages with the same meaning

- **WHEN** the interface is switched to either supported language and the resume control is rendered
- **THEN** the title, explanation, and every outcome message are present and readable, and neither
  version claims recognition across browser sessions
