# Tasks

## 1. Dashboard figures

- [x] 1.1 Extend `DashboardOverview` in `src/lib/admin/dashboard.ts` with `totalResponses`,
  `cannotEvaluateCount`, `extraPackageEntries` (ids holding >1 qualifying package),
  `lateArrivalResponses` (count + entry ids, ordered by server `createdAt`), keeping every existing
  field. Verify: `pnpm run typecheck` exits 0.
- [x] 1.2 Extend the dashboard fixture so each new clause has a row that exercises it: a
  multi-package entry, a late arrival, an abstention-only entry. Assert every figure by hand-counted
  value, including that a two-package entry is still complete. Verify: the file passes.
- [x] 1.3 Prove the new figures can fail: bypass `isEntryComplete` in the overlap reduction and drop
  the lateness predicate, confirming each reds its own test by name. Restore byte-identical
  (sha256-checked) and record the counts.
- [x] 1.4 Render the new figures in `OverviewView` with the attempt-never-persons labels, and assert
  in `dashboard-views.test.tsx` that no figure is titled, hinted, or described as persons. Verify:
  the paired-label assertions cover every new card.

## 2. Validated dataset builder

- [x] 2.1 Add a pure `buildValidatedDataset(entries, sources)` in `src/lib/export/` returning one
  record per complete entry with exactly `id`, `validated_ilocano`, `english_translation`,
  `filipino_translation`, `output:{origin,destination,transit_mode}`, `source_validation_id`,
  `needs_review` — earliest qualifying package by server `createdAt`, tie by smallest validation
  id with the flag forced. Verify: `pnpm run typecheck` exits 0.
- [x] 2.2 Fixture with a discriminating corpus: multi-package entry with distinct timestamps,
  a timestamp tie, a disagreement entry, a correction-required earliest package, a
  correct-natural earliest package, an incomplete entry. Assert the supplying response per record,
  the tie-break, the flags, and the omission. Verify: the file passes.
- [x] 2.3 Prove the derivation can fail: substitute latest-wins and a vote, confirming each reds
  the supplying-response assertions by name. Restore byte-identical and record the counts.
- [x] 2.4 Assert no record carries a validator/attempt identifier and every record's
  `source_validation_id` names a row of the raw document. Verify: recomputability assertion
  comparing the validated set against `buildExportRecords` over the same sources.

## 3. CSV generalization and command wiring

- [x] 3.1 Generalize `buildCsv` to take its key set as a parameter; add the validated key set as a
  closed constant with the same parity tests as `EXPORT_RECORD_KEYS`. Verify: round-trip tests
  pass for both documents.
- [x] 3.2 Wire `renderDocuments`/`runExport` to write all five files and report all five names;
  update the "exactly N named files" assertions to five and the allow-list scan with the two new
  names. Verify: command tests pass and the scan still enumerates by name.
- [x] 3.3 Prove the wiring can fail: drop one validated file from the write set, confirming the
  exact-files assertion reds by name. Restore byte-identical.

## 4. Three-way agreement

- [x] 4.1 Extend `cross-consumer-consistency.test.ts` to fold the validated records into the
  partition shape and compare all three consumers over the same corpus, including the empty
  corpus. Verify: the file passes.
- [x] 4.2 Prove both-directions firing with the third consumer in play: bypass the dashboard
  partition and invert the validated flags, each reding the partition test by name. Restore
  byte-identical and record the counts.

## 5. Route-level and scan updates

- [x] 5.1 Update `admin-routes.test.tsx` and `entry-review-page.test.tsx` fixtures/assertions for
  the new figures only where the approved list changes them; no figure asserted today may be
  weakened. Verify: both files pass.
- [x] 5.2 Confirm `import-dataset-command.test.ts` still passes unchanged (no new script file) and
  the dashboard/export read-only scans pass with their extended enumerations. Verify: all three
  files pass.

## 6. Whole-project verification

- [x] 6.1 Run `pnpm run typecheck`, `pnpm run lint`, `pnpm run format:check`, `pnpm run test:unit`,
  `pnpm run test:dom`, `pnpm run test:integration`, and `pnpm run build`, recording real output.
  Verify: all exit 0 with the figures read back, not inferred.
- [x] 6.2 Confirm `openspec validate --specs --strict` is **still 19** — the deltas live only under
  `openspec/changes/`, so a rise before the Sync is a leak.
- [x] 6.3 Confirm no migration was added or edited and no route, action, or script file was added:
  `git diff --name-only` over the branch touches no file under `supabase/migrations/` and creates
  no file under `src/app/`, `src/lib/*/actions*`, or `scripts/`. Record the empty output.

## 7. Ledger

- [x] 7.1 Update `docs/ROADMAP.md` Project Status (`Current OpenSpec change`, `Lifecycle state`,
  `Next eligible objective`; archived count word untouched) and verify
  `tests/unit/ledger-integrity.test.ts` passes.
- [x] 7.2 Re-scan edited status rows for table shape (3 pipes), NUL bytes, and replacement
  characters before committing.
