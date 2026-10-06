# Proposal

## Why

The protected researcher dashboard can say how many attempts submitted responses (`totalValidators`) but cannot say how many anonymous attempts enrolled in total or how many enrolled and then never answered — the onboarding drop-off is invisible. Researchers need three attempt-level participation diagnostics derived from real stored rows.

## What Changes

- The dashboard overview gains `enrolledAttempts` (COUNT of `validators` rows), `attemptsWithResponses` (distinct `validations.validator_id`), and `zeroResponseAttempts` (enrolled minus responding), with the invariant `enrolled === withResponses + zeroResponse` pinned by tests.
- `totalValidators` is renamed to `attemptsWithResponses` comprehensively (same value, clearer name) through the typed domain, view, tests, and specs; no second name for the same value survives.
- Two minimal read-only repository reads: `ValidatorsRepository.listAllIds` (paged, id-ordered) and `ValidationsRepository.listAllValidatorIds` (whole-table single-column projection, paged, PK-ordered). No migration, no export change, no hosted writes.
- A compact "Participation attempts" section on the overview with the three figures and the subtle note "Attempts are anonymous study sessions, not unique people." No red/warning styling for zero-response attempts.
- Proficiency breakdown semantics unchanged (responding attempts only). Completion, coverage, review, allocation, and validated derivation untouched.

## Capabilities

### New Capabilities

(none — this extends the dashboard behind an existing capability)

### Modified Capabilities

- `researcher-dashboard`: three attempt-level figures added to the approved overview set (13 → 15 figures), `totalValidators` renamed, read-only posture kept.

## Impact

- `src/lib/admin/dashboard.ts`, `src/app/researcher/(protected)/overview.tsx`, `ValidatorsRepository` + `ValidationsRepository` interfaces, both Supabase implementations, `operations.ts` + `errors.ts` union, in-memory test fakes, dashboard/repository/read-only/consistency/DOM tests, `openspec/specs/researcher-dashboard/spec.md`.
- No migration, no export change, no Supabase reset, no research-data write, no hosted mutation (read-only hosted verification only).
