# Tasks

## 1. Proposal verification (no implementation)

- [x] 1.1 Confirm measurements from current main are cited in the proposal
  (VAL 32-bit + fail-closed CSPRNG, `validatorId-timestamp` batch mint, batch
  ID alone opens, unauthenticated resume oracle, no DB format CHECKs, live
  hosted counts 35/93/39/275/177 + 4800 corpus) with file:line evidence.
- [x] 1.2 Run `openspec change validate attempt-and-batch-capability-hardening
  --strict` (exit 0) and `openspec validate --specs --strict` (count unchanged:
  no new top-level spec dir; delta lives only under `openspec/changes/`).
- [x] 1.3 Open the Propose PR into `main`, merge with a merge commit after
  required checks pass, delete branches, return to updated `main`. No Apply
  from the proposal branch.

## 2. Apply — identity + opaque batch mint (separate reviewable unit)

- [x] 2.1 Widen the attempt mint to 16 CSPRNG bytes (`VAL_` + 32 hex),
  fail-closed, server-side; widen accept patterns to legacy + new while the
  mint pins to new-only; unit tests incl. can-fire (restore 4-byte mint →
  red; mint legacy shape → red).
- [x] 2.2 Add the independent `BAT_` + 32-hex mint; retire
  `validatorId-timestamp` construction for new batches; allocation persists
  `validator_id`/`created_at` as separate facts; unit tests incl. can-fire
  (derive BAT from VAL → red; embed timestamp → red).
- [x] 2.3 Forward migration ONLY if required (accept both shapes, preserve all
  rows); re-measure hosted counts before migrating; PGlite integration proves
  legacy-seeded rows survive, RLS/RPC posture unchanged, no request-origin
  columns in research tables.

## 3. Apply — ownership gate + throttled resume (separate reviewable unit)

- [x] 3.1 Gate session open on `{ batchId, activeAttemptId }` with stored-owner
  comparison; unified redirect to `/`; neutral initial render with no
  sentence before proof; legitimate refresh works; submissions still derive
  ownership server-side; tests incl. can-fire (remove comparison → shared-link
  test red; distinct public messages → oracle test red).
- [x] 3.2 Throttle public resume/ownership checks with per-action buckets
  (short-lived hashed origin + per-attempt, generous human thresholds); no raw
  origin in research tables/exports; tests incl. can-fire (bypass throttle →
  abuse test red).
- [x] 3.3 Full AGENTS.md matrix on the Apply tip with log-read-back counts,
  independent verification with zero unresolved CRITICAL, Apply PR merged with
  a merge commit from a fresh branch off updated main.

## 4. Sync + Archive

- [x] 4.1 Sync deltas to `openspec/specs/` from updated main on a dedicated
  sync branch; specs count rises only at Sync; PR merged with merge commit.
- [x] 4.2 Archive the change; roadmap/status updated; Archive PR merged with
  merge commit; next change (abuse controls) starts only after this archive
  lands.
