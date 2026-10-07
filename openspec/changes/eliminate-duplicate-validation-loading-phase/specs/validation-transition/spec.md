# Spec Delta

## MODIFIED Requirements

### Requirement: Skeletons stand in for genuine waits, never for failures

Where the participant genuinely waits on server work with a predictable layout — the `/validate` start orchestration and the validation session route resolution (initial open and next-batch navigation) — the platform SHALL show a calm validation-layout skeleton (neutral geometric blocks reserving space for the sentence card, evaluation options, and save-control areas) instead of a spinner card. The skeleton SHALL contain no sentence-like text and no fake research content, SHALL NOT be kept visible for any minimum duration, SHALL be replaced by the real entry the moment data resolves (no flash of skeleton when data is already ready beyond what the framework boundary inherently shows), and SHALL be replaced by the existing error state — never left standing — when the underlying work fails.

Every skeleton-bearing state in the validating experience — `/validate` start loading, the session-route loading fallback, and the presenting session — SHALL render through one shared Validating page shell owning the main container width, page padding, "Validating" heading, description, spacing before content, and responsive behavior, so the three cannot drift. The session-route loading fallback SHALL render the heading and description above the skeleton, never a skeleton alone. The skeleton and the real session content SHALL occupy the same content slot, so replacing one with the other moves no heading, description, container, or padding.

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

#### Scenario: The session loading fallback keeps the Validating shell

- **WHEN** the session route genuinely waits (direct visit, reload, or next-batch navigation with an unresolved session)
- **THEN** the loading fallback shows the Validating heading and description above the skeleton in the shared shell geometry, never a skeleton alone

#### Scenario: Start, fallback, and presenting states share one geometry

- **WHEN** the start loading state, the session loading fallback, and the presenting session are compared at the same viewport
- **THEN** main container width, page padding, heading, description, spacing, and content slot are identical, so moving between them shifts no layout

## ADDED Requirements

### Requirement: The normal start handoff has exactly one loading phase

In the normal start flow — where the start orchestration already returned the first entry — the platform SHALL move from the start skeleton to the real first entry inside the same mounted shell with no second loading phase between them. The Validating heading and description SHALL remain mounted and visible from the initial skeleton through the first real entry; there SHALL be no frame in which the skeleton renders without them and no skeleton-only batch loading state in this flow. The skeleton content slot SHALL be replaced in place by the real session content.

This requirement covers the normal handoff only. Genuine session-route waits (direct visits, reloads, next-batch navigation with an unresolved session) still show the loading fallback, which itself carries the shared shell.

#### Scenario: The heading survives the handoff

- **WHEN** the start orchestration resolves in the normal flow
- **THEN** the Validating heading mounted during the initial skeleton is the same mounted heading above the first real entry, with no unmount between them

#### Scenario: The description survives the handoff

- **WHEN** the start orchestration resolves in the normal flow
- **THEN** the description mounted during the initial skeleton is the same mounted description above the first real entry, with no unmount between them

#### Scenario: No skeleton-only state in the normal flow

- **WHEN** the normal start handoff is observed frame by frame from Continue to the first real entry
- **THEN** no frame shows a skeleton without the Validating heading and description

#### Scenario: The first entry is not resolved twice

- **WHEN** the normal start handoff completes
- **THEN** exactly one first-entry resolution served the first render (the orchestration's), and no second session read ran before it
