# Tasks

## 1. Catalog copy (20 values, meanings and keys unchanged)

- [x] 1.1 Rewrite the 9 English catalog values per design D2 (periods/colon, no key/meaning/sentence-count change).
- [x] 1.2 Rewrite the 11 Filipino catalog values per design D2 (same constraints).
- [x] 1.3 Confirm both `meta.siteTitle` values byte-identical.

## 2. Non-catalog rendered literals (8 sites)

- [x] 2.1 Review: reason copy period, `None` placeholders (3), colon suffix.
- [x] 2.2 Overview: three sentences per design D2.

## 3. Guard + tests

- [x] 3.1 Add the em-dash copy guard (catalog scan with site-title exception + non-catalog enumeration) and the site-title regression test.
- [x] 3.2 Update test expectations that assert the old wording; record each as a copy change.
- [x] 3.3 Confirm the dataset file is byte-identical (SHA-256 unchanged) and no migration exists in this change.

## 4. Verification + lifecycle

- [x] 4.1 Full verification (format, lint, typecheck, unit, DOM, integration, build, guards, OpenSpec validation) with counts read from logs; CI green.
- [x] 4.2 Sync `interface-localization` and Archive; confirm final main/CI/Vercel and the production readiness report.
