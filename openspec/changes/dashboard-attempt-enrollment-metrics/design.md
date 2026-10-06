# Design

## Context

`loadDashboardOverview` reads entries, their validations, and the responding validators' profiles. It cannot see enrolled-but-silent attempts: `listByIds` discovers IDs from stored responses, so an attempt with no response is unreachable. `totalValidators` (distinct responding IDs) is the only attempt figure, and its name invites a person-count reading the module header explicitly forbids.

## Goals

- Three figures from stored rows, always satisfying `enrolled === withResponses + zeroResponse`, with attempt-not-person terminology on screen.
- Same read-only posture, same repository layering (UI → dashboard service → repository interface → Supabase), no migration, no export change.

## Non-goals

- No proficiency-breakdown change, no completion/coverage/review/allocation/export change, no retention/deletion policy, no attempt-identifier exposure, no person deduplication.

## Decisions

### D1: Two new reads, both IDs-only and paged

- `ValidatorsRepository.listAllIds(): Promise<AnonymousValidatorId[]>`: every enrolled attempt ID, paged at 1000 by `id` order with per-page exact-count agreement (the `listAllActive` pattern). IDs only — counts need no profiles, and profiles would widen the privacy surface for nothing.
- `ValidationsRepository.listAllValidatorIds(): Promise<AnonymousValidatorId[]>`: every stored response's author ID, whole-table single-column projection, paged by PK order with exact-count agreement. Duplicates are kept and deduped in the service via `Set`; a DB-side distinct would need PostgREST-specific headers and is rejected.
- Rejected: (B) `countAll` — a bare count cannot yield zero-response MEMBERSHIP, and the invariant needs the sets, not just the total. (C) dedicated aggregate RPC — a new privileged function for two counts the existing tables already answer is heavier than two paged reads at study scale.
- Rejected: deriving "with responses" from the existing active-pool `listForEntries` read. Equivalent today (no retired entries exist), but it would silently reclassify attempts as zero-response the day an entry retires. The whole-table read preserves the ANY-stored-response definition by construction.

### D2: Service derivation and the orphan rule

- `responding = new Set(allValidatorIds)`; `enrolled = listAllIds()`; `zero = enrolled minus responding`; `attemptsWithResponses = responding.size`; `enrolledAttempts = enrolled.length`.
- `totalValidators` is renamed to `attemptsWithResponses` (identical value) across domain, view, tests, and specs — one name, no alias pair.
- Orphan responses (author ID with no profile row): counted in `attemptsWithResponses` (the response is stored evidence), never silently dropped; the service logs a namespaced warning with the orphan COUNT only (never IDs) and still renders the literal definitions. The partition invariant is asserted for consistent corpora; the orphan path has its own test asserting the log plus the literal figures.
- Proficiency breakdown keeps reading `listByIds(responding)` — responding attempts only, unchanged.

### D3: Presentation

- New `aria-label="Participation attempts"` section after Coverage totals: three `Figure`s (Enrolled attempts, Attempts with responses, Zero-response attempts) plus the subtle note "Attempts are anonymous study sessions, not unique people." Reuses `Figure`/grid; no new card chrome, no red styling for zero-response.
- Researcher area is English chrome (no catalog change, consistent with the existing no-half-localization rule).

### D4: Read-only enforcement

- New methods are reads: operation names `validators.listAllIds`, `validations.listAllValidatorIds` added to the maps and the `RepositoryOperation` union (the bidirectional test forces both). The dashboard `Pick` widens to the two reads; `dashboard-read-only.test.ts` needs no change (it forbids write calls, and none are added) but gains an assertion that the dashboard surface calls no `create`/`touchLastActive`/validation-write — already covered generically.
- In-memory fakes (`repositories.test.ts` and per-test dashboard fakes) gain the two reads; the compiler forces every fake (untyped literals checked against `DashboardRepositories`).

## Risks / trade-offs

- Two extra reads per overview load (both paged, IDs only). At study scale (thousands of rows) this is two cheap queries; the alternative (counter columns) would need a migration plus trigger discipline for the same numbers.
- `totalValidators` rename touches cross-consumer and view tests; each is a mechanical rename verified by typecheck plus updated assertions.

## Open questions

- None blocking. Hosted read-only verification after Apply measures COUNT(validators), distinct response authors, and the derived zero, compared against the dashboard.
