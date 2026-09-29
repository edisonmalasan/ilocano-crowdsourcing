# Tasks

## 1. Migrations

- [ ] 1.1 Author `supabase/migrations/0001_research_schema.sql` as plain PostgreSQL. No
  Supabase-managed extension, no `begin;`/`commit;`, and no `CREATE INDEX CONCURRENTLY` — the
  applier wraps each file in a transaction.
- [ ] 1.2 Create `dataset_entries`: source id primary key, category, instruction, origin,
  destination, transit mode, `source_payload jsonb not null`, `is_active`, `created_at`.
- [ ] 1.3 Create `validators`: anonymous id primary key, nullable proficiency, `created_at`,
  `last_active_at`, `total_validations`. No column may hold anything identifying.
- [ ] 1.4 Create `validation_sessions`, `validation_batches`, and `batch_entries` with only the
  columns their identity and foreign keys require. No behavior, and no row is written to them in
  this change.
- [ ] 1.5 Create `validations` with the ten columns of `ValidationResponse`, mapping
  `correctedInstruction`, `translationLanguage`, and `translationText` to snake_case columns.
- [ ] 1.6 Add the named constraint `UNIQUE (validator_id, dataset_entry_id)` on `validations`.
  Name it, so a failure can be identified rather than only detected.
- [ ] 1.7 Add check constraints for the approved vocabularies, using the **lowercase stored
  values** — `correct_natural`, `correct_unnatural`, `incorrect`, `cannot_evaluate`;
  `english`, `filipino`; the five proficiency values. A check written against the display label
  casing would reject every real write.
- [ ] 1.8 Add foreign keys with explicit `on delete` behavior, chosen so deleting a validator
  cannot silently orphan research responses.
- [ ] 1.9 Add the indexes: per-entry and per-validator validation lookups, per-batch and
  per-entry assignment lookups, and a partial index on active entries by category.
- [ ] 1.10 Enable Row Level Security on all six tables and create no policy for `anon` or
  `authenticated`.
- [ ] 1.11 Update `supabase/migrations/README.md`: the directory is no longer empty, and the
  `auth.uid()`-inside-policies-only rule should be restated in light of the fact that this schema
  does not use `auth.uid()` at all.

## 2. Schema verification against a real engine

- [ ] 2.1 Add an integration test that calls `applyMigrations(db)` with **no directory
  argument**, so the default `supabase/migrations/` path — dead code until now — actually runs.
- [ ] 2.2 Assert the exact applied filename list with `toEqual([...])`. A count check would pass
  on an empty directory, which is how the harness's own fixture test would have gone green for
  the wrong reason.
- [ ] 2.3 Assert the six tables exist and that no unexpected table was created.
- [ ] 2.4 Assert `UNIQUE (validator_id, dataset_entry_id)`: a duplicate is rejected, and a
  different validator's insert for the same entry succeeds.
- [ ] 2.5 Assert the vocabulary checks reject an out-of-vocabulary evaluation, proficiency, and
  translation language.
- [ ] 2.6 Assert a foreign key rejects an orphan `validator_id`, `dataset_entry_id`, and
  `batch_id`.
- [ ] 2.7 Assert a stored correction leaves `dataset_entries.instruction` byte-identical.
- [ ] 2.8 Assert the RLS posture using `asRole`, reaching the tables through `applyMigrations` so
  privileges actually exist. A `select` as `anon` and as `authenticated` must return **0 rows
  without an error**; an `insert` as `anon` must be **rejected with a Row Level Security error**.
  Never demonstrate a refusal using the privileged role — it has `bypassrls` and would pass
  regardless. Note that `createTestDatabase()` does not grant privileges and only
  `applyMigrations` does, so a test that builds its tables with `db.exec` sees `permission denied`
  for every role and mistakes a grant problem for an RLS result.
- [ ] 2.9 Assert the indexes exist, so a migration that silently omits one fails rather than
  leaving allocation to discover the gap by timing.

## 3. Dataset parsing

- [ ] 3.1 Implement `parseSyntheticDataset(raw: unknown)` as a pure function: no I/O, no
  database, no clock.
- [ ] 3.2 Map the source shape explicitly and by name — `id`, `instruction`,
  `output.origin`, `output.destination`, `output.transit_mode` — rather than by a generic
  transform, so a renamed source field fails loudly.
- [ ] 3.3 Make the parse non-strict: retain unrecognized top-level and `output` keys in
  `source_payload` and name them in the report, instead of rejecting or dropping them.
- [ ] 3.4 Reject a record whose id or instruction fails the shared domain schema, identifying
  the offending record. Do not repair, default, or skip it.
- [ ] 3.5 Return an import report carrying the counts and the list of preserved-but-unmodelled
  field paths.

## 4. Parsing verification

- [ ] 4.1 Unit-test the parser against the **real** 600-record source file: 600 entries, in
  source order.
- [ ] 4.2 Assert the id set is exactly `OD_0001`–`OD_0600` with no gaps or duplicates.
- [ ] 4.3 Assert every parsed instruction equals the source instruction exactly, so no
  normalization, trimming, or case change slipped in.
- [ ] 4.4 Assert `transit_mode` is `null` for every record, which is the honest reading of the
  source rather than a defaulted placeholder string.
- [ ] 4.5 Assert a record carrying an extra unknown field parses successfully, retains the field
  in the source payload, and reports it — the positive case for the preservation rule that the
  current dataset cannot exercise.
- [ ] 4.6 Assert a malformed id, a missing instruction, and a blank instruction each fail with
  the offending record identified.
- [ ] 4.7 Assert the source file is not opened for writing by any importer code path.

## 5. Import

- [ ] 5.1 Implement `importDatasetEntries(entries, sink)`, taking a writer so the same parsed
  records drive both the PGlite verification and the hosted import.
- [ ] 5.2 Key on the source dataset entry id so a re-run updates rather than duplicates.
- [ ] 5.3 Exclude `instruction` from the update path, so a re-run cannot rewrite what a validator
  was shown.
- [ ] 5.4 Return a report of parsed, inserted, and updated counts.

## 6. Import verification

- [ ] 6.1 In the integration test, insert all 600 parsed records into the migrated database.
- [ ] 6.2 Assert the stored count is 600, the stored id set equals the source id set, and each
  stored instruction equals the source instruction.
- [ ] 6.3 Assert each typed column agrees with the corresponding field of the stored
  `source_payload`, so the projection and the archival copy cannot silently diverge.
- [ ] 6.4 Re-run the import and assert the count is still 600 — idempotency proven, not assumed.
- [ ] 6.5 Assert the comparison reads `data/ilocano-synthetic-data.json` itself, so the check
  cannot pass by comparing the import against another derived artifact.
- [ ] 6.6 Assert `data/ilocano-synthetic-data.json` is unchanged by the whole test, by SHA-256.

## 7. Repository implementations

- [ ] 7.1 Create `src/lib/repositories/supabase/` — the path `eslint.config.mjs` already lists in
  `PRIVILEGED_SPECIFIERS`, so the boundary is enforced the moment code lands.
- [ ] 7.2 Implement one class per interface: `DatasetEntriesRepository`,
  `ValidatorsRepository`, `ValidationsRepository`.
- [ ] 7.3 Each file imports `"server-only"` as its first import, so a client-component import
  fails at runtime rather than by convention.
- [ ] 7.4 Translate rows to domain types in both directions. No PostgREST envelope, `snake_case`
  column name, or join shape may reach a caller.
- [ ] 7.5 Raise `RepositoryError` with an operation name from the `RepositoryOperation` union on
  every failure. Never return an empty result to mean "the query failed".
- [ ] 7.6 Map a uniqueness violation on `(validator_id, dataset_entry_id)` to a `RepositoryError`
  naming `validations.insert`, so "already validated" reaches the service as a distinguishable
  outcome.
- [ ] 7.7 Reconcile `RepositoryOperation` with the interface method names. The union says
  `"validators.insert"` while the method is `create`, and nothing links the two. Pick one
  authority and make the mismatch impossible rather than leaving it to a reader.
- [ ] 7.8 Implement `countForEntry` as a count of **distinct** validators. Counting rows would
  let a duplicate inflate coverage.

## 8. Documentation and status

- [ ] 8.1 Update `docs/ROADMAP.md` → `## Project Status`: lifecycle `implementing`/`verifying`,
  the change name, and the outstanding Supabase-credentials blocker.
- [ ] 8.2 Record the hosted-import step as the remaining Phase 2 deliverable, with what is and is
  not verified.
- [ ] 8.3 Update `AGENTS.md` only with commands that actually exited 0, each with what it proves
  and what it does not prove.
- [ ] 8.4 Add a repository-tooling note that the PGlite harness provides only `auth.uid()` and
  `auth.role()` and no `auth.users`, so a future migration cannot reference one.

## 9. Verification and review

- [ ] 9.1 `pnpm run lint`
- [ ] 9.2 `pnpm run format:check`
- [ ] 9.3 `pnpm run typecheck`
- [ ] 9.4 `pnpm run test:unit`
- [ ] 9.5 `pnpm run test:integration`
- [ ] 9.6 `pnpm run build`
- [ ] 9.7 `openspec validate od-dataset-schema-and-import --strict`
- [ ] 9.8 Prove the uniqueness assertion is load-bearing by temporarily dropping the constraint
  and confirming the test goes red, then restoring it. A test that has never failed is not known
  to test anything.
- [ ] 9.9 Prove the RLS assertion is load-bearing the same way: temporarily granting a policy to
  `anon`, confirm the test goes red, then removing it.
- [ ] 9.10 Confirm `data/ilocano-synthetic-data.json` is byte-identical to `main` and that
  `git diff main -- data/` is empty.
- [ ] 9.11 Read the final diff against `main` before opening the PR.

## 10. Carried over from `project-foundation`

Explicitly deferred to this change in the archived `tasks.md`:

- [ ] 10.1 `UNIQUE (validator_id, dataset_entry_id)` — task 1.6, proven by 2.4.
- [ ] 10.2 Repository implementations — task group 7.
- [ ] 10.3 "Unknown fields are preserved and surfaced" — task 3.3, proven by 4.5 and 6.3.
- [ ] 10.4 The default `supabase/migrations/` applier path, exercised end to end — task 2.1.

## Explicitly not done here

Recorded so a later phase inherits the decision rather than rediscovering it:

- Writing any row to `validation_sessions`, `validation_batches`, or `batch_entries`.
- Any allocation logic, any user-facing route, the admin area, or export.
- Row Level Security policies for `authenticated`; those arrive with admin authentication.
- Applying the migrations to a hosted Supabase project, which is blocked on credentials.
