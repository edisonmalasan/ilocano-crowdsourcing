# Tasks

## 1. Propose

- [x] 1.1 Measure the gap on `main` (resolved `headers()` carries only the `/researcher/:path*` block; no global browser-security header on any route) and confirm no in-force spec names response headers
- [x] 1.2 Write proposal.md, design.md, the new-capability delta spec, and this tasks.md; validate strictly

## 2. Apply

- [ ] 2.1 Add the global `/:path*` five-header block to `next.config.ts`, leaving the researcher block byte-identical; confirm `pnpm run build` still compiles
- [ ] 2.2 Add the resolved-config probe suite; confirm it is red on the old config (global block absent) and green on the new with byte-identical restore between
- [ ] 2.3 Advance the roadmap's `Next eligible objective` row with one measured sentence recording the landed guardrail
- [ ] 2.4 Run the full matrix (lint, format:check, typecheck, unit, dom, integration, build) with counts read back from output, plus strict OpenSpec validation; observe the merged header sets once on local dev and record it as an observation

## 3. Verify

- [ ] 3.1 Independent verification pass over the Apply branch against this change's artifacts; no CRITICAL findings open at merge

## 4. Sync

- [ ] 4.1 Install `openspec/specs/browser-security-headers/spec.md` from the delta; spec count 24 → 25 at exactly the Sync merge, strict validation green

## 5. Archive

- [ ] 5.1 Move the change directory, update the roadmap ledger (count, table row, next-eligible row), extend the ledger-integrity WORDS table, merge by merge commit
