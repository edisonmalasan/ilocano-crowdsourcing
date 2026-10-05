# Spec Delta

## ADDED Requirements

### Requirement: Dashboard figures cover the 4000-entry corpus

Dashboard totals SHALL be derived over all 4,000 active entries regardless of category:
4,000 entries, 0 responses, 0 complete, 4,000 incomplete, and 0% at pristine zero state.
Per-category totals SHALL be 800 each wherever per-category summaries are displayed.
Review links SHALL use globally unique canonical ids so `D_42` can never be confused with
`OD_42`.

#### Scenario: Totals reflect the full revised corpus

- **WHEN** the corpus holds 4,000 active entries across five categories with no responses
- **THEN** the dashboard derives 4,000 entries, 0 responses, 0 complete, 4,000 incomplete, and 0%
