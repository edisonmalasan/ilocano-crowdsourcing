# validation-transition Specification

## Purpose

Makes validation pacing humane without touching methodology: a brief presentational settling interval after each newly presented entry, and calm layout-stable skeletons wherever the participant genuinely waits on the server — so nobody answers a sentence they have not registered, and nobody stares at a spinner card that says nothing.

## Requirements

### Requirement: Each newly presented entry settles before accepting input

The platform SHALL present each validation entry immediately when it is available (prefetched entries with no added delay) while keeping that entry's interactive controls — evaluation options, correction input, translation-choice controls, translation inputs, and the Save and continue control — disabled for approximately 2 seconds after the entry is presented, so the participant registers the new sentence before answering. The sentence itself SHALL remain fully readable during the interval; no spinner SHALL cover it, no countdown SHALL be shown, and no wait-themed copy SHALL be presented.

The interval SHALL be presentation-only: the previous entry's background save SHALL have started at submit time (never deferred by the interval), and the interval SHALL NOT observe, gate on, or extend with persistence, prefetch, reservation, or server state. A save confirming before the interval ends SHALL NOT shorten it; a save still unresolved when it ends SHALL NOT extend it.

The interval SHALL belong to the presented entry: presenting another entry starts a fresh interval; re-rendering the same entry (including an interface-locale switch) SHALL NOT restart it; unmounting SHALL cancel the timer; a timer from an older entry SHALL NEVER enable a newer entry early. After the final entry is submitted the platform SHALL transition to the existing finished-batch checkpoint with no entry-settling timer.

#### Scenario: Submit starts the save and presents the next entry immediately

- **WHEN** a validator submits a locally-valid response for entry N
- **THEN** the response is enqueued for background persistence synchronously and the already-prefetched entry N+1 is presented without waiting for the save to confirm

#### Scenario: The new entry's controls are disabled, then enable after the interval

- **WHEN** entry N+1 is presented
- **THEN** its interactive controls are initially disabled while its sentence stays readable, and they become enabled approximately 2000ms after presentation

#### Scenario: Persistence timing does not move the interval

- **WHEN** entry N's save confirms before the interval ends, or remains unresolved past it
- **THEN** entry N+1 enables at the same ~2000ms point either way

#### Scenario: Every presented entry gets its own full interval

- **WHEN** entry N+2 is presented after entry N+1 ran its own interval
- **THEN** entry N+2's controls stay disabled for their own full ~2000ms from presentation, regardless of any earlier timer

#### Scenario: Same-entry re-renders and locale switches keep the running interval

- **WHEN** the presented entry re-renders without changing, or the interface locale switches
- **THEN** no new save is created, the queue is untouched, the entry does not advance or duplicate, and the running interval is neither restarted nor shortened

#### Scenario: Unmount cancels the timer

- **WHEN** the session component unmounts mid-interval
- **THEN** the timer is cleaned up and fires no state update

#### Scenario: Double activation still submits once

- **WHEN** Save and continue is activated twice for the same entry before any re-render
- **THEN** exactly one response is enqueued (existing single-flight behavior preserved)

#### Scenario: The final entry creates no further interval

- **WHEN** the final entry of the batch is submitted
- **THEN** no sixth-entry settling interval exists; the existing finished-batch checkpoint behavior proceeds unchanged

### Requirement: Skeletons stand in for genuine waits, never for failures

Where the participant genuinely waits on server work with a predictable layout — the `/validate` start orchestration and the validation session route resolution (initial open and next-batch navigation) — the platform SHALL show a calm validation-layout skeleton (neutral geometric blocks reserving space for the sentence card, evaluation options, and save-control areas) instead of a spinner card. The skeleton SHALL contain no sentence-like text and no fake research content, SHALL NOT be kept visible for any minimum duration, SHALL be replaced by the real entry the moment data resolves (no flash of skeleton when data is already ready beyond what the framework boundary inherently shows), and SHALL be replaced by the existing error state — never left standing — when the underlying work fails.

Skeletons SHALL NOT be used for button-level submits, short local transitions, validation errors, confirmations, or states whose final shape is unknown.

#### Scenario: Start shows the validation skeleton, not a preparing card

- **WHEN** the start orchestration is working in the normal flow
- **THEN** a validation-layout skeleton is shown and no "Preparing your sentences…" card is presented

#### Scenario: Real content replaces the skeleton on resolve

- **WHEN** the waited-on session data resolves
- **THEN** the real first entry replaces the skeleton with no large duplicate layout rendered alongside it

#### Scenario: Failure replaces the skeleton with the error state

- **WHEN** allocation, session resolution, or recovery fails while a skeleton is shown
- **THEN** the skeleton is removed and the existing participant-facing error state is shown

#### Scenario: Next batch shows a skeleton only while genuinely pending

- **WHEN** Answer another batch is pressed and the next session is not yet ready
- **THEN** the validation skeleton is shown until it resolves; when the next session is already ready the first entry renders without a skeleton flash beyond the framework boundary

#### Scenario: The skeleton carries no fake research content

- **WHEN** the skeleton is inspected as text and as assistive-technology output
- **THEN** no Ilocano-like sentence or place-name text is present and purely visual blocks are hidden from assistive technology

### Requirement: Settling and skeleton presentation stays accessible and calm

Settling controls SHALL use real disabled semantics (not opacity alone); the sentence SHALL stay readable; focus SHALL NOT be trapped and SHALL NOT be forcibly moved on a timer. Skeleton containers MAY use `aria-busy` with route/page context preserved; visual skeleton pieces SHALL be `aria-hidden`. Any skeleton animation SHALL respect `prefers-reduced-motion` (static equivalent), and nothing SHALL use aggressive shimmer or motion to mark the settling interval.

#### Scenario: Assistive technology meets meaning, not blocks

- **WHEN** a screen reader encounters the settling form or the skeleton
- **THEN** controls report disabled honestly, the sentence remains perceivable, and skeleton blocks are not exposed as content

#### Scenario: Reduced motion removes animation

- **WHEN** the participant prefers reduced motion
- **THEN** skeletons render statically (or without movement) and the settling interval involves no animated indicator
