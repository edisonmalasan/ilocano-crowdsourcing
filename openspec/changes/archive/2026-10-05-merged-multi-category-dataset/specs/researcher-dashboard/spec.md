# Spec Delta

## ADDED Requirements

### Requirement: Dashboard figures cover all active categories

Dashboard totals SHALL be derived over every active dataset entry regardless of category, and
completion SHALL be summarizable per category: total entries, per-category totals, per-category
completion, and the overall percentage. Responses SHALL be traceable to their category and
source-local id, and review links SHALL use globally unique canonical ids so entry 1 of one
category can never be confused with entry 1 of another.

#### Scenario: Totals reflect the full corpus

- **WHEN** the corpus holds 3,000 active entries across five categories with no responses
- **THEN** the dashboard derives 3,000 entries, 0 responses, 0 complete, 3,000 incomplete, and 0%

#### Scenario: Completion is summarized per category

- **WHEN** coverage exists in some categories and not others
- **THEN** each category reports its own total and complete count from the same shared rule
