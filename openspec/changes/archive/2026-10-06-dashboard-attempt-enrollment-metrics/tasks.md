# Tasks

## 1. Repository reads

- [x] 1.1 Add `ValidatorsRepository.listAllIds` (paged, id-ordered, exact-count agreement) and `ValidationsRepository.listAllValidatorIds` (whole-table single-column projection, paged, PK-ordered).
- [x] 1.2 Add operation names to the maps and the `RepositoryOperation` union; update the bidirectional operation-name test lists.
- [x] 1.3 Implement both in the Supabase repositories; extend in-memory fakes; repository unit tests (empty table, paging past the cap, failure-vs-zero distinguishable).

## 2. Dashboard domain

- [x] 2.1 Derive `enrolledAttempts`, `attemptsWithResponses`, `zeroResponseAttempts` in `loadDashboardOverview`; rename `totalValidators` comprehensively; orphan rule (count + namespaced warning, literal definitions render).
- [x] 2.2 Unit tests for all §17 cases: 0/0/0, 1/0/1, 1/1/0, 1×many→1/1/0, 3/2/1, same-attempt non-inflation, partition invariant, proficiency unchanged, completion unchanged, zero-response not counted as responses, orphan path.

## 3. Presentation

- [x] 3.1 `OverviewView` participation section with the three figures and the attempt-not-person note; no error styling.
- [x] 3.2 DOM tests: three dynamic figures from the domain result, exact labels, no person-count wording, zero-response not an error.

## 4. Guards + specs

- [x] 4.1 Read-only guard still green; operation-name lists reconciled.
- [x] 4.2 Sync `researcher-dashboard` spec (15 figures, renamed field, new scenarios); archive.

## 5. Verification + hosted

- [x] 5.1 Full verification (format, lint, typecheck, unit, DOM, integration, build, guards, OpenSpec validation) with counts from logs; CI green; independent verification before Apply merge.
- [x] 5.2 Read-only hosted verification (counts + invariant vs dashboard); no hosted writes.
