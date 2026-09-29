# Tasks

## 1. Migrations

- [x] 1.1 Author `supabase/migrations/0001_research_schema.sql` as plain PostgreSQL. No
  Supabase-managed extension, no `begin;`/`commit;`, and no `CREATE INDEX CONCURRENTLY` — the
  applier wraps each file in a transaction.
- [x] 1.2 Create `dataset_entries`: source id primary key, category, instruction, origin,
  destination, transit mode, `source_payload jsonb not null`, `is_active`, `created_at`.
- [x] 1.3 Create `validators`: anonymous id primary key, nullable proficiency, `created_at`,
  `last_active_at`, `total_validations`. No column may hold anything identifying.
- [x] 1.4 Create `validation_sessions`, `validation_batches`, and `batch_entries` with only the
  columns their identity and foreign keys require. No behavior, and no row is written to them in
  this change.
  - Narrowed during root review. They were first created with `started_at` / `last_seen_at` /
    `ended_at`, `requested_size` (plus a `1..50` check mirroring `BATCH_SIZE_HARD_MAX`),
    `created_at` / `completed_at`, and `assigned_at`. All removed. Each is a claim about what a
    session or batch IS, and design D3's argument is that inventing column semantics in a phase
    that does not own the lifecycle leaves the owner to live with them or undo them. A timestamp
    looks free; a duplicate authority for a domain constant does not.
  - Pinned by two closed-set tests: one asserts the exact column list of each of the three tables,
    and one asserts via `pg_constraint` that each defines only its foreign keys and primary key,
    with no `CHECK` constraint at all. The second uses `pg_constraint.contype` rather than
    `information_schema.table_constraints` because the information schema reports `NOT NULL` as a
    `CHECK` — measured, not assumed.
- [x] 1.5 Create `validations` with the ten columns of `ValidationResponse`, mapping
  `correctedInstruction`, `translationLanguage`, and `translationText` to snake_case columns.
- [x] 1.6 Add the named constraint `UNIQUE (validator_id, dataset_entry_id)` on `validations`.
  Name it, so a failure can be identified rather than only detected.
- [x] 1.7 Add check constraints for the approved vocabularies, using the **lowercase stored
  values** — `correct_natural`, `correct_unnatural`, `incorrect`, `cannot_evaluate`;
  `english`, `filipino`; the five proficiency values. A check written against the display label
  casing would reject every real write.
- [x] 1.7a Add the cross-column checks a per-column constraint cannot express, so no row
  satisfies every column check while being a record the domain schema rejects: correction matches
  evaluation, translation language and text are present together or absent together, and
  `cannot_evaluate` carries no translation. Each is proved load-bearing by 2.10.
  - Found during root review, not by the original plan. The repository mapping already refused to
    read such a row back, which is a correct last line of defence but the wrong place to stop: the
    migration is the layer that must hold when application code is bypassed.
- [x] 1.8 Add foreign keys with explicit `on delete` behavior, chosen so deleting a validator
  cannot silently orphan research responses.
- [x] 1.9 Add the indexes: per-entry and per-validator validation lookups, per-batch and
  per-entry assignment lookups, and a partial index on active entries by category.
- [x] 1.10 Enable Row Level Security on all six tables and create no policy for `anon` or
  `authenticated`.
- [x] 1.11 Update `supabase/migrations/README.md`: the directory is no longer empty, and the
  `auth.uid()`-inside-policies-only rule should be restated in light of the fact that this schema
  does not use `auth.uid()` at all.

## 2. Schema verification against a real engine

- [x] 2.1 Add an integration test that calls `applyMigrations(db)` with **no directory
  argument**, so the default `supabase/migrations/` path — dead code until now — actually runs.
- [x] 2.2 Assert the exact applied filename list with `toEqual([...])`. A count check would pass
  on an empty directory, which is how the harness's own fixture test would have gone green for
  the wrong reason.
- [x] 2.3 Assert the six tables exist and that no unexpected table was created.
- [x] 2.4 Assert `UNIQUE (validator_id, dataset_entry_id)`: a duplicate is rejected, and a
  different validator's insert for the same entry succeeds.
- [x] 2.5 Assert the vocabulary checks reject an out-of-vocabulary evaluation, proficiency, and
  translation language.
- [x] 2.6 Assert a foreign key rejects an orphan `validator_id`, `dataset_entry_id`, and
  `batch_id`.
- [x] 2.7 Assert a stored correction leaves `dataset_entries.instruction` byte-identical.
- [x] 2.8 Assert the RLS posture using `asRole`, reaching the tables through `applyMigrations` so
  privileges actually exist. A `select` as `anon` and as `authenticated` must return **0 rows
  without an error**; an `insert` as `anon` must be **rejected with a Row Level Security error**.
  Never demonstrate a refusal using the privileged role — it has `bypassrls` and would pass
  regardless. Note that `createTestDatabase()` does not grant privileges and only
  `applyMigrations` does, so a test that builds its tables with `db.exec` sees `permission denied`
  for every role and mistakes a grant problem for an RLS result.
- [x] 2.9 Assert the indexes exist, so a migration that silently omits one fails rather than
  leaving allocation to discover the gap by timing.
- [x] 2.10 Assert each cross-column constraint rejects the combination the domain refuses **and**
  accepts every combination the domain allows. A test that only proved the rejection would pass
  against a constraint that was accidentally far too strict, which is the failure mode that
  destroys real research responses.

## 3. Dataset parsing

- [x] 3.1 Implement `parseSyntheticDataset(raw: unknown)` as a pure function: no I/O, no
  database, no clock.
- [x] 3.2 Map the source shape explicitly and by name — `id`, `instruction`,
  `output.origin`, `output.destination`, `output.transit_mode` — rather than by a generic
  transform, so a renamed source field fails loudly.
- [x] 3.3 Make the parse non-strict: retain unrecognized top-level and `output` keys in
  `source_payload` and name them in the report, instead of rejecting or dropping them.
- [x] 3.4 Reject a record whose id or instruction fails the shared domain schema, identifying
  the offending record. Do not repair, default, or skip it.
- [x] 3.5 Return an import report carrying the counts and the list of preserved-but-unmodelled
  field paths.

## 4. Parsing verification

- [x] 4.1 Unit-test the parser against the **real** 600-record source file: 600 entries, in
  source order.
- [x] 4.2 Assert the id set is exactly `OD_0001`–`OD_0600` with no gaps or duplicates.
- [x] 4.3 Assert every parsed instruction equals the source instruction exactly, so no
  normalization, trimming, or case change slipped in.
- [x] 4.4 Assert `transit_mode` is `null` for every record, which is the honest reading of the
  source rather than a defaulted placeholder string.
- [x] 4.5 Assert a record carrying an extra unknown field parses successfully, retains the field
  in the source payload, and reports it — the positive case for the preservation rule that the
  current dataset cannot exercise.
- [x] 4.6 Assert a malformed id, a missing instruction, and a blank instruction each fail with
  the offending record identified.
- [x] 4.7 Assert the source file is not opened for writing by any importer code path.
  - The original tick was not supported by anything. The SHA-256 comparison in task 6.6 and the
    byte comparison in the integration test prove the file's **content** is unchanged; neither
    proves the file is never **opened** for writing, and a write that opens, truncates, and
    restores would leave the content identical while destroying the file's identity.
  - Now asserted three ways in `tests/unit/dataset-import.test.ts`: the scanned module list is
    checked to exist first (so a typo cannot make the scan vacuous); every module in the import path
    is scanned as source text for thirteen filesystem write/rename/delete APIs; and the documented
    read entry point is called and asserted to return all 600 records. The scan is textual rather
    than a monkey-patched `fs` on purpose — a patched module only observes paths the test happens to
    execute, and an unexecuted write path is exactly what is being looked for.
  - Proved load-bearing by temporarily adding a `writeFile` import to `import-dataset.ts`: the
    scan failed on `\bwriteFile(?:Sync)?\b` and the other 24 tests in the file stayed green, so the
    check is the only thing standing between the code and a silent source write.

## 5. Import

- [x] 5.1 Implement `importDatasetEntries(entries, sink)`, taking a writer so the same parsed
  records drive both the PGlite verification and the hosted import.
  - The `DatasetEntrySink` interface is production code in `src/lib/dataset/import-dataset.ts`, but
    its only implementation in the repository is test-local. See "Explicitly not done here" for why
    the Supabase-backed sink was deliberately not written in this change, and read tasks 5.2/5.3
    below as "the contract is declared and proven", not "shipping code enforces it".
- [x] 5.2 Key on the source dataset entry id so a re-run updates rather than duplicates.
- [x] 5.3 Exclude `instruction` from the update path, so a re-run cannot rewrite what a validator
  was shown.
- [x] 5.4 Return a report of parsed, inserted, and updated counts.

## 6. Import verification

- [x] 6.1 In the integration test, insert all 600 parsed records into the migrated database.
- [x] 6.2 Assert the stored count is 600, the stored id set equals the source id set, and each
  stored instruction equals the source instruction.
- [x] 6.3 Assert each typed column agrees with the corresponding field of the stored
  `source_payload`, so the projection and the archival copy cannot silently diverge.
- [x] 6.4 Re-run the import and assert the count is still 600 — idempotency proven, not assumed.
- [x] 6.5 Assert the comparison reads `data/ilocano-synthetic-data.json` itself, so the check
  cannot pass by comparing the import against another derived artifact.
- [x] 6.6 Assert `data/ilocano-synthetic-data.json` is unchanged by the whole test, by SHA-256.

## 7. Repository implementations

- [x] 7.1 Create `src/lib/repositories/supabase/` — the path `eslint.config.mjs` already lists in
  `PRIVILEGED_SPECIFIERS`, so the boundary is enforced the moment code lands.
- [x] 7.2 Implement one class per interface: `DatasetEntriesRepository`,
  `ValidatorsRepository`, `ValidationsRepository`.
- [x] 7.3 Each file imports `"server-only"` as its first import, so a client-component import
  fails at runtime rather than by convention.
- [x] 7.4 Translate rows to domain types in both directions. No PostgREST envelope, `snake_case`
  column name, or join shape may reach a caller.
- [x] 7.5 Raise `RepositoryError` with an operation name from the `RepositoryOperation` union on
  every failure. Never return an empty result to mean "the query failed".
- [x] 7.6 Map a uniqueness violation on `(validator_id, dataset_entry_id)` to a `RepositoryError`
  naming `validations.insert`, so "already validated" reaches the service as a distinguishable
  outcome.
- [x] 7.7 Reconcile `RepositoryOperation` with the interface method names. Pick one authority and
  make the mismatch impossible rather than leaving it to a reader.
  - The union keeps the persistence verb, because it is public API already asserted by name in
    `tests/unit/repositories.test.ts`. The link is a type-level
    `satisfies Record<keyof <Interface>, RepositoryOperation>` per interface, so an unlisted method
    or an unlisted operation name is a compile error.
  - There are **two** divergences, not one: `create` -> `"validators.insert"` and `listActive` ->
    `"dataset_entries.list"`. The original task text named only the first.
- [x] 7.8 Implement `countForEntry` so that a duplicate cannot inflate coverage.
  - The original wording said "a count of **distinct** validators", which overstates what the code
    does. The query is a plain `count` of matching rows with no `distinct`, and it is correct —
    but for a reason the task text did not give. The database enforces
    `UNIQUE (validator_id, dataset_entry_id)`, so for one fixed entry there is at most one row per
    validator and the row count IS the distinct-validator count. The distinctness is a property of
    the migration, proven by task 2.4, not of this method.
  - The rejected alternative is recorded in the method's own comment: fetching `validator_id`s and
    counting a `Set` in JavaScript would be self-evidently correct and would also be wrong in
    production, because PostgREST caps a response at a configured maximum and the deduplication
    would silently under-count any entry past that cap. A count the database computes is not
    truncated.

## 8. Documentation and status

- [x] 8.1 Update `docs/ROADMAP.md` → `## Project Status`: lifecycle `implementing`/`verifying`,
  the change name, and the outstanding Supabase-credentials blocker.
- [x] 8.2 Record the hosted-import step as the remaining Phase 2 deliverable, with what is and is
  not verified.
- [x] 8.3 Update `AGENTS.md` only with commands that actually exited 0, each with what it proves
  and what it does not prove.
- [x] 8.4 Add a repository-tooling note that the PGlite harness provides only `auth.uid()` and
  `auth.role()` and no `auth.users`, so a future migration cannot reference one.

## 9. Verification and review

- [x] 9.1 `pnpm run lint`
- [x] 9.2 `pnpm run format:check`
- [x] 9.3 `pnpm run typecheck`
- [x] 9.4 `pnpm run test:unit`
- [x] 9.5 `pnpm run test:integration`
- [x] 9.6 `pnpm run build`
- [x] 9.7 `openspec validate od-dataset-schema-and-import --strict`
- [x] 9.8 Prove the uniqueness assertion is load-bearing by temporarily dropping the constraint
  and confirming the test goes red, then restoring it. A test that has never failed is not known
  to test anything.
- [x] 9.9 Prove the RLS assertion is load-bearing the same way: temporarily granting a policy to
  `anon`, confirm the test goes red, then removing it.
- [x] 9.10 Confirm `data/ilocano-synthetic-data.json` is byte-identical to `main` and that
  `git diff main -- data/` is empty.
- [x] 9.11 Read the final diff against `main` before opening the PR.
- [x] 9.12 Prove each of the three cross-column constraints load-bearing the same way 9.8 and 9.9
  do, by replacing one at a time with `check (true)` and confirming the expected tests go red.
  Observed: disabling `validations_translation_pair` failed exactly the 2 tests that assert it,
  disabling `validations_correction_matches_evaluation` failed exactly its 2, and disabling
  `validations_translation_requires_evaluable_content` failed exactly its 1. Nothing else moved.

## 10. Carried over from `project-foundation`

Explicitly deferred to this change in the archived `tasks.md`:

- [x] 10.1 `UNIQUE (validator_id, dataset_entry_id)` — task 1.6, proven by 2.4.
- [x] 10.2 Repository implementations — task group 7.
- [x] 10.3 "Unknown fields are preserved and surfaced" — task 3.3, proven by 4.5 and 6.3.
- [x] 10.4 The default `supabase/migrations/` applier path, exercised end to end — task 2.1.

## Explicitly not done here

Recorded so a later phase inherits the decision rather than rediscovering it:

- Writing any row to `validation_sessions`, `validation_batches`, or `batch_entries`.
- Any allocation logic, any user-facing route, the admin area, or export.
- Row Level Security policies for `authenticated`; those arrive with admin authentication.
- Applying the migrations to a hosted Supabase project, which is blocked on credentials.
- **A `DatasetEntrySink` implementation outside the test suite.** The interface is declared in
  production code (`src/lib/dataset/import-dataset.ts`) and the PGlite test supplies a sink that
  honours both of its contract clauses — keyed on the source id, and excluding `instruction` from
  the conflict update — so tasks 5.2 and 5.3 are proven against a real PostgreSQL engine. But the
  only implementation of that interface in the repository is the test-local one. A
  Supabase-backed sink is deliberately **not** written here: `upsert` is absent from
  `SupabaseClientLike` by design (see the `validators.create` rationale in `client.ts`), so adding
  one is a design decision about the conflict-resolution path, not a mechanical adapter. It belongs
  to the hosted-import step, which is credential-blocked. **Consequence for a later phase: the
  guarantees in tasks 5.2 and 5.3 are currently enforced by a contract and its test, not by
  shipping code.** Read that as "the shape is decided and proven, the implementation is not written".
- **A `data-access-boundary` spec delta.** The preservation rule is satisfied as the main spec
  already states it, with no narrowing and no exclusion needed: every read names an explicit column
  list, so a column the domain does not model is never fetched and there is nothing to discard; and
  the genuinely unknown SOURCE fields live in `dataset_entries.source_payload` and are surfaced by
  the importer's report. The proposal records this under "Carried over from
  `project-foundation`" as satisfying existing requirements. The rule in
  `src/lib/repositories/index.ts` is therefore **unchanged** — the narrowing the reviewer flagged
  was in an explanatory comment in `rows.ts`, which describes the mechanism rather than redefining
  the rule. A delta was added only where behavior actually changed.
- **An `updated_at` writer, and any writer that increments `validators.total_validations`.** Both
  columns exist because the domain contracts model them (`ValidationResponse.updatedAt`,
  `ValidatorProfile.totalValidations`), and the repository writes `updated_at` from the supplied
  value on insert. What does not exist is code that *advances* either counter, because advancing
  `total_validations` is coverage bookkeeping and editing a stored response is not a behavior this
  platform has. The columns are read and written correctly and are never stale in a way that
  misleads today; a later phase that owns those transitions owns the writer.
