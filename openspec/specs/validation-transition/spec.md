# validation-transition Specification

## Purpose

Makes validation pacing humane without touching methodology: a brief presentational transition skeleton between entries, and calm layout-stable skeletons wherever the participant genuinely waits on the server — so nobody answers a sentence they have not registered, and nobody stares at a spinner card that says nothing.

## Requirements

### Requirement: Each newly presented entry settles before accepting input

The platform SHALL present each validation entry immediately when it is available (prefetched entries with no added delay) while keeping that entry's interactive controls — evaluation options, correction input, translation-choice controls, translation inputs, and the Save and continue control — disabled for approximately 2 seconds after the entry is presented, so the participant registers the new sentence before answering. The sentence itself SHALL remain fully readable during the interval; no spinner SHALL cover it, no countdown SHALL be shown, and no wait-themed copy SHALL be presented.

The interval SHALL be presentation-only: the previous entry's background save SHALL have started at submit time (never deferred by the interval), and the interval SHALL NOT observe, gate on, or extend with persistence, prefetch, reservation, or server state. A save confirming before the interval ends SHALL NOT shorten it; a save still unresolved when it ends SHALL NOT extend it.

The interval SHALL belong to the presented entry: presenting another entry starts a fresh interval; re-rendering the same entry (including an interface-locale switch) SHALL NOT restart it; unmounting SHALL cancel the timer; a timer from an older entry SHALL NEVER enable a newer entry early. After the final entry is submitted the platform SHALL transition to the existing finished-batch checkpoint with no entry-settling timer.

**SUPERSEDED by `refine-validation-loading-transitions`, kept so the replacement is visible rather than silent.** The disabled-entry settling model above is replaced by the skeleton transition below: the next entry is no longer presented first and disabled, but revealed only after the transition skeleton, immediately interactive. The presentation-only timing rule, the per-entry timer ownership, the save-independence rule, and the final-entry rule carry over unchanged; only the interval length (2000ms to 1500ms) and what is on screen during it change. Its replacement is the requirement below.

#### Scenario: Submit starts the save and presents the next entry immediately

- **SUPERSEDED by `refine-validation-loading-transitions`, kept so the replacement is visible rather than silent.** Originally the already-prefetched next entry was presented at once with disabled controls. Now the save is still enqueued synchronously at submit, but the next entry is revealed only after the transition skeleton. Its replacement is "Submit starts the save and the transition skeleton" below.

#### Scenario: The new entry's controls are disabled, then enable after the interval

- **SUPERSEDED by `refine-validation-loading-transitions`, kept so the replacement is visible rather than silent.** No real control is ever presented disabled by a transition: the interval shows a skeleton, and the revealed entry is immediately interactive. Its replacement is "The revealed entry is immediately interactive" below.

#### Scenario: Persistence timing does not move the interval

- **WHEN** entry N's save confirms before the interval ends, or remains unresolved past it
- **THEN** entry N+1 is revealed at the same ~1500ms point either way

#### Scenario: Every presented entry gets its own full interval

- **WHEN** entry N+2 is due after entry N+1 ran its own transition
- **THEN** entry N+2's skeleton shows for its own full ~1500ms from submit, regardless of any earlier timer

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
- **THEN** no sixth-entry transition exists; the existing finished-batch checkpoint behavior proceeds unchanged

### Requirement: Skeletons stand in for genuine waits, never for failures

Where the participant genuinely waits on server work with a predictable layout — the `/validate` start orchestration and the validation session route resolution (initial open and next-batch navigation) — the platform SHALL show a calm validation-layout skeleton (neutral geometric blocks reserving space for the sentence card, evaluation options, and save-control areas) instead of a spinner card. The skeleton SHALL contain no sentence-like text and no fake research content, SHALL NOT be kept visible for any minimum duration, SHALL be replaced by the real entry the moment data resolves (no flash of skeleton when data is already ready beyond what the framework boundary inherently shows), and SHALL be replaced by the existing error state — never left standing — when the underlying work fails.

Skeletons SHALL be used for the entry-to-entry transition interval as well as for genuine server waits, and for audited loading states where real async work meets a predictable layout (recovery/resume loading, next-batch loading). Skeletons SHALL NOT be used for button-level submits, validation errors, confirmations, or states whose final shape is unknown.

The skeleton SHALL be built on shared layout primitives with the real validation UI — same container width, same card width, padding, borders, border radius, and shadow, same spacing, same option-card heights, same save-button height, same responsive behavior — so the skeleton cannot drift from the real form. Random-width or arbitrary placeholder boxes SHALL NOT be used where the real layout is fixed: the form skeleton SHALL read as the real form with its contents masked.

The sentence-card skeleton SHALL adapt to the upcoming sentence when that entry is already known (normally via prefetch): a deterministic length-based line approximation (line count, width, height) that never displays the sentence early and never invents knowledge the server has not returned. When the upcoming entry is not yet known — including the very first entry before the server answers — a stable generic sentence-card skeleton matching the normal card dimensions SHALL be used. Pixel-perfect text measurement SHALL NOT be attempted.

Normal loading SHALL be communicated visually by the skeleton alone. No loading copy SHALL be added: no "Preparing your sentences…", no "Loading next sentence…", no "Please wait…", no countdown, no duration text, and no routine saving/saved message. Actual errors SHALL still show real error messages.

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

#### Scenario: The skeleton matches the real layout geometry

- **WHEN** the skeleton and the real validation screen are compared at the same viewport (mobile narrow and desktop)
- **THEN** container width, card width, card padding, borders, border radius, shadow, spacing, option-card heights, and save-button height align, so revealing the real entry causes no noticeable layout jump

#### Scenario: The sentence skeleton adapts to the upcoming sentence

- **WHEN** the upcoming entry is already known and its sentence is short versus long
- **THEN** the sentence-card skeleton shows fewer/shorter lines for the short sentence and more/full-width lines for the long one, without displaying any of the sentence text

#### Scenario: An unknown upcoming sentence uses the stable generic skeleton

- **WHEN** the upcoming entry is not yet known, including the very first entry before the server answers
- **THEN** the sentence-card skeleton shows the stable generic shape at normal card dimensions rather than any length-derived shape

#### Scenario: No loading copy accompanies the skeleton

- **WHEN** a skeleton is shown in the normal flow
- **THEN** no preparing/loading/please-wait/countdown/saving text is presented alongside it

### Requirement: Settling and skeleton presentation stays accessible and calm

Transition and loading skeletons SHALL be presentation-only: skeleton containers MAY use `aria-busy` with route/page context preserved, and visual skeleton pieces SHALL be `aria-hidden`. When the real next entry is revealed after the transition, its controls SHALL be immediately usable, focus SHALL NOT be moved unexpectedly by the timer, and no stale disabled state SHALL remain. The sentence of a revealed entry SHALL stay readable; focus SHALL NOT be trapped. Any skeleton animation SHALL respect `prefers-reduced-motion` (static equivalent), and nothing SHALL use aggressive shimmer or motion to mark the transition — a calm static skeleton is preferred.

#### Scenario: Assistive technology meets meaning, not blocks

- **WHEN** a screen reader encounters the transition skeleton or the revealed form
- **THEN** skeleton blocks are not exposed as content, and the revealed controls are reported as usable at once with the sentence perceivable

#### Scenario: Reduced motion removes animation

- **WHEN** the participant prefers reduced motion
- **THEN** skeletons render statically (or without movement) and the transition involves no animated indicator

### Requirement: Entry transitions show a layout-matched skeleton, never a disabled entry

When a validator submits a locally-valid response for entry N, the platform SHALL enqueue that response for background persistence synchronously at submit time and SHALL then show a transition skeleton for approximately 1500ms before revealing entry N+1. During the interval the platform SHALL NOT render entry N+1's real sentence, real form, or real controls in any state — neither enabled nor disabled. The skeleton is the transition state.

The interval SHALL be presentation-only: it SHALL NOT observe, gate on, or extend with persistence, prefetch, reservation, or server state. A save confirming before the interval ends SHALL NOT shorten it; a save still unresolved when it ends SHALL NOT extend it; if the background save takes longer than the interval, the next entry is still revealed on the interval under the existing background-save architecture, and saves are never serialized by this delay.

The interval SHALL belong to the transition: submitting for another entry starts a fresh interval; re-rendering the same entry (including an interface-locale switch) SHALL NOT restart a running interval; unmounting SHALL cancel the timer; a timer from an older transition SHALL NEVER reveal a newer entry early or reveal the wrong entry.

#### Scenario: Submit starts the save and the transition skeleton

- **WHEN** a validator submits a locally-valid response for entry N
- **THEN** the response is enqueued for background persistence synchronously and a transition skeleton is shown; entry N+1's real sentence and form are not rendered during the interval

#### Scenario: The revealed entry is immediately interactive

- **WHEN** the ~1500ms transition ends and entry N+1 is revealed
- **THEN** its controls are enabled at once with no further waiting, no stale disabled state, and no focus moved by the timer

#### Scenario: An early save does not shorten the transition

- **WHEN** entry N's save confirms before the 1500ms transition ends
- **THEN** the skeleton still shows for the full interval and entry N+1 is revealed at the ~1500ms point

#### Scenario: A late save does not extend the transition

- **WHEN** entry N's save is still unresolved when the 1500ms transition ends
- **THEN** entry N+1 is still revealed at the ~1500ms point while the save continues its own lifecycle independently

#### Scenario: A stale timer reveals nothing

- **WHEN** a transition timer from an older submit fires after a newer transition has begun
- **THEN** it changes nothing on screen: it neither reveals an entry early nor reveals the wrong entry
