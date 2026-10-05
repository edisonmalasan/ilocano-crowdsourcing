# Tasks

## 1. Rewrite the public catalog

- [x] 1.1 Rewrite stiff/formulaic English values in `ENGLISH_COPY` (failure strings, resume/screening/ready/validate-start/finished prose) keeping key sets, meanings, reason/subject taxonomy, sentence counts, and guard vocabularies intact. Verify: `rg` the rewritten keys against ENCOURAGEMENT/COVERAGE/recognition patterns before running the suite.
- [x] 1.2 Rewrite the matching Filipino mirrors with the same meaning, same per-key sentence counts, and natural Filipino (keep documented asymmetries like the `Filipino` endonym). Verify: no-empty, no-English-fallback, bilateral research-material guard green.
- [x] 1.3 Rewrite researcher dashboard + entry-review hardcoded strings (labels, empty states, reason copy) in plainer English; refusal/credential strings untouched. Verify: admin route/page tests green.

## 2. Verify and land

- [x] 2.1 Update pinned test expectations ONLY where approved wording intentionally moved (never to silence a guard); record each update in the Apply summary. Verify: full suite green — `lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`, `build`.
- [x] 2.2 Read the final diff pair-wise (old vs new per string) for meaning drift, especially failure taxonomy and pool/coverage promises. Verify: reviewer walkthrough recorded in the summary.
