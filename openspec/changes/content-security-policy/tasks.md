# Tasks

## 1. Propose

- [x] 1.1 Measure the gap on `main` (resolved `headers()` carries no CSP; live production read returns no CSP) and map the app surface (routes, same-origin networking, self-hosted fonts, zero author inline code, Next.js inline requirement)
- [x] 1.2 Write proposal.md, design.md, the new-capability delta spec, and this tasks.md; validate strictly

## 2. Apply

- [x] 2.1 Add the enforced `Content-Security-Policy` header to the global `/:path*` block in `next.config.ts`, leaving the five existing headers and the researcher block byte-identical; confirm `pnpm run build` still compiles (Compiled successfully; served from `next start` on 3101: `/` carries all five plus the policy, `/researcher/sign-in` carries the policy plus `Cache-Control`/`X-Robots-Tag`, `/validate` carries the policy)
- [x] 2.2 Add the resolved-config probe suite (`content-security-policy-headers.test.ts`, 5 tests) plus the preserved-headers update in `security-headers.test.ts`; confirmed red on the old config (drop-CSP mutant: 3 failed / 2 passed) and green on the new (9 passed across both files), plus a can-fire wildcard-in-value mutant (3 failed / 2 passed) with byte-identical restore
- [ ] 2.3 Run the full matrix (lint, format:check, typecheck, unit, dom, integration, build) with counts read back from output, plus strict OpenSpec validation; observe the served header sets once on local dev and on the preview deployment via read-only header reads
- [ ] 2.4 Exercise the production build over public routes, researcher sign-in, and validation flows watching the browser console for CSP violations; fix regressions rather than weakening the policy

## 3. Verify

- [ ] 3.1 Independent verification pass over the Apply branch against this change's artifacts; no CRITICAL findings open at merge

## 4. Sync

- [ ] 4.1 Install `openspec/specs/content-security-policy/spec.md` from the delta; spec count 26 → 27 at exactly the Sync merge, strict validation green

## 5. Archive

- [ ] 5.1 Move the change directory, update the roadmap ledger (count, table row, next-eligible row), extend the ledger-integrity WORDS table, merge by merge commit
