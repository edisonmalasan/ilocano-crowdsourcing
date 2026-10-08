# Tasks

## 1. Propose

- [x] 1.1 Measure the defect on Windows (directive-less violating fixture exits 0) and the control (identical fixture with `"use client"` exits 1 naming the rule); delete both fixtures and confirm a clean tree
- [x] 1.2 Write proposal.md, design.md, the one-scenario delta spec, and this tasks.md; validate strictly

## 2. Apply

- [x] 2.1 Normalize separators before the components test in `eslint.config.mjs` and export the plugin object; confirm `pnpm run lint` still exits 0 on the clean tree
- [x] 2.2 Add the five-case `Linter.verify` probe suite (eslintrc harness — flat mode refuses inline configs for named files); confirm it is red on the old line (case 1 silent, 1 failed / 4 passed) and green on the new line (5 passed) with byte-identical restore of the config between (`dc431d77…`)
- [x] 2.3 Correct the repair-prescription paragraph (lives in `docs/ROADMAP.md`, not `AGENTS.md` as design D5 misnamed it) with one measured sentence recording the landed repair
- [x] 2.4 Run the full matrix (lint, format:check, typecheck, unit, dom, integration, build) with counts read back from output, plus strict OpenSpec validation

## 3. Verify

- [x] 3.1 Independent verification pass over the Apply branch against this change's artifacts; no CRITICAL findings open at merge (two WARNINGs repaired on the branch: rule-seen filename recording + D5 file reference)

## 4. Sync

- [x] 4.1 Append the ADDED scenario to `openspec/specs/data-access-boundary/spec.md`; spec count unchanged at 24 capabilities, strict validation green (merged as PR #213)

## 5. Archive

- [x] 5.1 Move the change directory, update the roadmap ledger (count, table row, next-eligible row), extend the ledger-integrity WORDS table, merge by merge commit
