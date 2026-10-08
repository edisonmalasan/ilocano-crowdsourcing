# Tasks

## 1. Propose

- [x] 1.1 Measure the gaps on `main` (seven probing-indicative refusal sites with no log line; `csvField` passes `=1+1`/`+2+2`/`-3+3`/`@SUM(...)` through bare; 0 of 4,800 source records start dangerous) and confirm no in-force spec names public-refusal logging or CSV formula safety
- [x] 1.2 Write proposal.md, design.md, the new-capability delta spec, and this tasks.md; validate strictly

## 2. Apply

- [ ] 2.1 Add the pure diagnostic module plus the seven log call sites with injected sinks, leaving every outward refusal message byte-identical; confirm `pnpm run build` still compiles
- [ ] 2.2 Harden `csvField` with the single-quote prefix rule; keep the existing round-trip test byte-identical and add the per-character neutralization test with byte-identical restore between red and green
- [ ] 2.3 Advance the roadmap's `Next eligible objective` row with one measured sentence recording the landed guardrail (done on the branch: Change 5 named as in-Apply)
- [ ] 2.4 Run the full matrix (lint, format:check, typecheck, unit, dom, integration, build) with counts read back from output, plus strict OpenSpec validation

## 3. Verify

- [ ] 3.1 Independent verification pass over the Apply branch against this change's artifacts; no CRITICAL findings open at merge

## 4. Sync

- [ ] 4.1 Install `openspec/specs/privacy-safe-security-observability/spec.md` from the delta; spec count 25 → 26 at exactly the Sync merge, strict validation green

## 5. Archive

- [ ] 5.1 Move the change directory, update the roadmap ledger (count, table row, next-eligible row), extend the ledger-integrity WORDS table, merge by merge commit
