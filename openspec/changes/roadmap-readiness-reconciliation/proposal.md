# Proposal

## Why

The program-level ledger (`docs/ROADMAP.md`) and the standing tool record (`AGENTS.md`) both quote figures that are no longer true, and the last READY verdict (PR #223) was superseded by the gap-find directive without a replacement. Readers of either file right now inherit stale counts, a stale stage pointer, and no current readiness answer. The gap is documentation-only: no product behavior is wrong, so no spec changes and no code changes are proposed.

## What Changes

- Re-measure the three suite figures on the merge tip and rewrite the `AGENTS.md` tool rows to the measured values with their audit-trail convention preserved (prior records kept, not deleted).
- Re-derive the `ROADMAP.md` Project Status block against git: current change, lifecycle state, last merged stage (PR #231, not #229), and next eligible objective.
- Read-only deployment check: confirm whether the operational-monitoring migration (`operational_events`, `operational_alerts`) is applied on the hosted project and whether `OPS_ALERT_WEBHOOK_URL` is configured; record exactly what is found, configure nothing.
- Keep implementation, deployment, and readiness strictly separate in the ledger: what the code does, what production serves, and whether the platform may be distributed are three different claims with three different evidences.
- Record the evidence-backed READY / NOT READY verdict in the ledger with every supporting measurement named (main SHA, CI run ids read back from logs, production header read, spec count, ledger-guard result). No verdict is written that its evidence does not support.

## Capabilities

### New Capabilities

None. This change alters no product behavior.

### Modified Capabilities

None. No requirement text changes; the specs already describe the shipped behavior.

This change sets `skip_specs: true` in its `.openspec.yaml`: docs and read-only checks only, zero files under `src/`, `tests/`, `supabase/`, or `data/`.

## Impact

- `docs/ROADMAP.md` (Project Status block, and only that block plus any figure it quotes).
- `AGENTS.md` (the three stale suite-figure rows, and only those rows).
- `openspec/changes/roadmap-readiness-reconciliation/` (this change's own artifacts).
- No migration, no hosted writes, no research-data contact. The hosted database is touched at most by read-only presence checks; the production site by read-only header reads.
