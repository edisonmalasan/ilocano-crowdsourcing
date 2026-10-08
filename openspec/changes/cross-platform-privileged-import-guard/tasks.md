# Tasks

## 1. Propose

- [x] 1.1 Measure the defect on Windows (directive-less violating fixture exits 0) and the control (identical fixture with `"use client"` exits 1 naming the rule); delete both fixtures and confirm a clean tree
- [x] 1.2 Write proposal.md, design.md, the one-scenario delta spec, and this tasks.md; validate strictly

## 2. Apply

- [ ] 2.1 Normalize separators before the components test in `eslint.config.mjs` and export the plugin object; confirm `pnpm run lint` still exits 0 on the clean tree
- [ ] 2.2 Add the four-case `Linter.verify` probe suite; confirm it is red on the old line (case 1 silent) and green on the new line with byte-identical restore of the config between
- [ ] 2.3 Correct the AGENTS.md repair-prescription paragraph with one measured sentence recording the landed repair
- [ ] 2.4 Run the full matrix (lint, format:check, typecheck, unit, dom, integration, build) with counts read back from output, plus strict OpenSpec validation

## 3. Verify

- [ ] 3.1 Independent verification pass over the Apply branch against this change's artifacts; no CRITICAL findings open at merge

## 4. Sync

- [ ] 4.1 Append the ADDED scenario to `openspec/specs/data-access-boundary/spec.md`; spec count unchanged at 24 capabilities, strict validation green

## 5. Archive

- [ ] 5.1 Move the change directory, update the roadmap ledger (count, table row, next-eligible row), extend the ledger-integrity WORDS table, merge by merge commit
