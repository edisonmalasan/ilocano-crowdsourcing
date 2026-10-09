# Tasks

## 1. Propose

- [x] 1.1 Measure the gap on `main` (no durable counter for six of seven signals, no threshold, no dispatch path) and confirm no authorized notification integration exists (no webhook/SMTP/Slack env, client, route, or table)
- [x] 1.2 Write proposal.md, design.md, the new-capability delta spec, and this tasks.md; validate strictly

## 2. Apply

- [x] 2.1 Add the migration (`operational_events` + `operational_alerts`, deny-all RLS, retention bound) with integration coverage against the production migration files
- [x] 2.2 Add the pure domain module (taxonomy, windows, thresholds, breach evaluation) with unit tests for accuracy and threshold boundaries
- [x] 2.3 Add the server-only recorder plus call sites at the existing failure points and the retry-exhaustion beacon; prove recorder failure cannot break a research write, with can-fire probes and byte-identical restores
- [x] 2.4 Add the webhook dispatch module (aggregate-only payload, configured-URL gating, failure handling) plus the researcher dashboard panel; document the exact remaining webhook configuration steps
- [x] 2.5 Add payload-privacy tests asserting the absence of every forbidden field by shape; run the full matrix with counts read back, plus strict OpenSpec validation

## 3. Verify

- [x] 3.1 Independent verification pass over the Apply branch against this change's artifacts; no CRITICAL findings open at merge

## 4. Sync

- [x] 4.1 Install `openspec/specs/operational-monitoring/spec.md` from the delta; spec count rises by exactly one at the Sync merge (27 → 28 if the CSP Sync landed first, else 26 → 27 — state which), strict validation green

## 5. Archive

- [x] 5.1 Move the change directory, update the roadmap ledger (count, table row, next-eligible row), extend the ledger-integrity WORDS table, merge by merge commit
