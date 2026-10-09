# Tasks

## 1. Propose

- [x] 1.1 Measure the gaps on `main` (AGENTS.md suite rows stale by three changes; ROADMAP stage pointer at PR #229 with #230 and #231 merged; PR #223 READY superseded) and confirm the change is docs-only with no authorized notification or migration work inside it
- [x] 1.2 Write proposal.md, design.md, and this tasks.md; set `skip_specs: true`; validate strictly

## 2. Apply

- [x] 2.1 Re-measure the full matrix on the Apply tip (lint exit 0, format clean, typecheck exit 0, unit 112/2105, dom 12/137, integration 18/305 passed with exit 1 from one systematic Windows worker-RPC artifact, build re-measured below) plus `openspec validate --specs --strict`, reading every figure out of tool output, and rewrite the three `AGENTS.md` suite rows with the audit-trail convention (stale head becomes dated prior record; unit delta reconciled added:27 deleted:0 via `git diff --name-status f9f5254..HEAD -- tests/unit/`; dom added:3 deleted:0 via `1c74627..HEAD -- tests/dom/`; integration +3 net named files)
- [x] 2.2 Re-derive the `ROADMAP.md` Project Status block on the Apply tip (archive count from the directory, current change, lifecycle state, last merged stage, next eligible objective), keeping implementation, deployment, and readiness claims separate with each claim's evidence named — done: current change, lifecycle, last-merged-stage (PR #231, CI run 37874186817 read back), and next-eligible rows rewritten; count sentence untouched at 54
- [x] 2.3 Run the read-only deployment checks (hosted `operational_events` / `operational_alerts` presence via service-role GET only; production header re-read via HEAD only; webhook configuration status) and record exactly what is found; configure nothing, migrate nothing — done: `dataset_entries` 200, both ops tables 404, production HEAD 200 with byte-identical CSP plus five headers, `OPS_ALERT_WEBHOOK_URL` empty in example and absent locally
- [x] 2.4 Record the evidence-backed READY / NOT READY verdict in the ledger with every supporting measurement named (main SHA, CI run ids read back from logs, header bytes, spec count, ledger-guard result); verify `tests/unit/ledger-integrity.test.ts` passes and strict validation is green — done: DRAFT NOT READY with three named operator-side gaps in `Next eligible objective`; ledger-guard and strict validation re-verified below

## 3. Verify

- [ ] 3.1 Independent verification pass over the Apply branch against this change's artifacts (every rewritten figure re-derived from its instrument, no inherited numbers, no new unverified claims); no CRITICAL findings open at merge

## 4. Archive

- [ ] 4.1 Move the change directory, update the roadmap ledger (count, table row, next-eligible row), extend the ledger-integrity WORDS table, merge by merge commit
