# Proposal

## Why

Participant- and researcher-facing interface prose uses the Unicode em dash (U+2014) in about 28 rendered strings. That punctuation style is not wanted in the product copy. The Sadino website title's em dash is intentional typography and stays.

## What Changes

- Rewrite the 20 catalog values in `src/lib/i18n/copy.ts` that contain U+2014 (9 English, 11 Filipino) in plain words: periods, commas, or colons where each reads naturally. No key added, removed, or renamed; no meaning changed; no sentence-count change.
- Rewrite 8 rendered literals outside the catalog: the researcher review's disqualify reason (`Marked cannot confidently evaluate. Abstentions never count toward coverage.`), the `Does not count` suffix (colon), the three absent-field `—` placeholders (`None`), and the three researcher overview sentences (comma/period).
- Keep `meta.siteTitle` in both languages byte-identical (`Sadino — validate Ilocano navigation data`, `Sadino — suriin ang datos ng nabigasyon sa Ilocano`), pinned by a regression test.
- Add a copy guard test that fails on any U+2014 in localized product-copy values except the two site-title values, plus coverage for the non-catalog literals. Developer comments, docs, migrations, archived history, and test fixtures unrelated to product copy are untouched.
- Inventory result: `data/merged-ilocano-synthetic-data.json` holds zero U+2014, so the dataset stays byte-identical (SHA-256 unchanged) and no Supabase work happens in this change.

## Capabilities

### New Capabilities

(none — this restyles strings behind existing capabilities)

### Modified Capabilities

- `interface-localization`: English and Filipino product copy carries no em dash except the intentional site titles; the catalog contract (key sets, sentence counts, guards) is unchanged.

## Impact

- `src/lib/i18n/copy.ts` (20 values), `src/app/researcher/(protected)/entries/[id]/entry-review.tsx` (5 sites), `src/app/researcher/(protected)/overview.tsx` (3 sentences), `tests/` (copy-guard additions plus expectation updates where tests assert the old wording).
- No methodology change, no export schema change, no database migration, no Supabase reset, no research-data change.
