# Spec Delta

## MODIFIED Requirements

### Requirement: Each entry can be inspected in full

For each dataset entry, a researcher SHALL be able to inspect the original Ilocano instruction,
origin, destination, transit mode, and every stored response with the validator's proficiency,
evaluation, correction, English translation, Filipino translation, and whether the response
qualifies toward coverage. A Double Transit Mode pair SHALL render as both modes (for example `jeepney + walking`), never as `[object Object]` and never as one mode. Corrections and translations SHALL be shown per validator, side by
side, and SHALL NOT be merged, voted, or collapsed. Proficiency SHALL be shown as stored
self-reported metadata, never as a score.

#### Scenario: Entry inspection shows source and every response

- **WHEN** a researcher opens an entry's review view
- **THEN** the original instruction, origin, destination, and transit mode are shown together
  with every stored response for that entry

#### Scenario: A Double Transit Mode pair renders both modes

- **WHEN** a researcher opens `DTM_1` carrying `["jeepney", "walking"]`
- **THEN** the transit-mode field shows both modes and discards neither

#### Scenario: Each response shows its research content separately

- **WHEN** a response is shown
- **THEN** the validator's proficiency, evaluation, correction (when supplied), English
  translation, Filipino translation, and qualifying-toward-coverage status are each shown as
  that validator's own values

#### Scenario: Non-qualifying responses say why not

- **WHEN** a shown response does not qualify toward coverage
- **THEN** the view states that it does not qualify and why (unevaluable, missing correction,
  or missing translation)

### Requirement: Dashboard figures cover all active categories

Dashboard totals SHALL be derived over every active dataset entry regardless of category, and
completion SHALL be summarizable per category: total entries, per-category totals, per-category
completion, and the overall percentage. Responses SHALL be traceable to their category and
source-local id, and review links SHALL use globally unique canonical ids so entry 1 of one
category can never be confused with entry 1 of another. Per-category summaries SHALL include all six categories with 800 entries each.

#### Scenario: Totals reflect the full corpus

- **WHEN** the corpus holds 4,800 active entries across six categories with no responses
- **THEN** the dashboard derives 4,800 entries, 0 responses, 0 complete, 4,800 incomplete, and 0%

#### Scenario: Completion is summarized per category

- **WHEN** coverage exists in some categories and not others
- **THEN** each category reports its own total and complete count from the same shared rule, including Double Transit Mode

### Requirement: Dashboard figures cover the 4000-entry corpus

Dashboard totals SHALL be derived over all 4,800 active entries regardless of category:
4,800 entries, 0 responses, 0 complete, 4,800 incomplete, and 0% at pristine zero state.
Per-category totals SHALL be 800 each wherever per-category summaries are displayed, across all six categories.
Review links SHALL use globally unique canonical ids so `D_42` can never be confused with
`OD_42` or `DTM_42`.

#### Scenario: Totals reflect the full revised corpus

- **WHEN** the corpus holds 4,800 active entries across six categories with no responses
- **THEN** the dashboard derives 4,800 entries, 0 responses, 0 complete, 4,800 incomplete, and 0%
