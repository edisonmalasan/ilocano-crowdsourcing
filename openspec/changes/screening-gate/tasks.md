# Tasks

## 1. Allocation gate (the choke point)

- [ ] 1.1 Extend `AllocationFailureReason` with `"screening_required"` plus its
  doc entry. Verify: `typecheck` fails at every consumer until handled (the
  closed union is the enforcement).
- [ ] 1.2 Guard `allocateBatch`: after the validator-exists check, before any
  pool read, refuse a null-proficiency requester with `screening_required`.
  Verify: only the profile read occurs (no pool read, no batch persisted, no
  claim attempted); approved answers unaffected.
- [ ] 1.3 Map the reason in `decideStartBatch` (new `screening_required`
  decision kind: restart, no retry) and `decideContinueBatch` (dedicated
  finished-screen message; existing Finish retires). Verify: pure-decision
  tests for both mappings.

## 2. Restart UI + copy (both languages)

- [ ] 2.1 Orchestration `screening_required` phase: message plus one restart
  control (`clearStoredValidatorId` then `/start`), no retry button, single
  allocation request per mount. Verify: DOM effect tests incl. StrictMode
  single-issuance and no-request-without-identity.
- [ ] 2.2 Add `validateStart.screeningRequired`, `validateStart.restart`, and
  `validate.finished.failure.screeningRequired` in EN+FIL together. Verify:
  `locale-copy` parity green; typecheck fails on a half-localized key.

## 3. Regression coverage for the trace

- [ ] 3.1 Prove the label honest (already pinned by LA-0; extend nothing) and
  prove the hole closed: null-profile allocation refused end-to-end at the
  service layer; restart clears and navigates without a server write.
  Verify: green, and red on reverted guard (temporarily restore
  allocation-without-check in a scratch run — never the committed file).
- [ ] 3.2 Confirm `openspec validate --specs --strict` is **still 19** and no
  migration file was added or modified.

## 4. Ledger

- [ ] 4.1 Update `docs/ROADMAP.md` Project Status rows and verify
  `tests/unit/ledger-integrity.test.ts` passes.
