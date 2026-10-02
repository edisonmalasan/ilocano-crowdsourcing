# Tasks

## 1. Apply the migration to the hosted project — this is an ENTRY CONDITION, not a task

- [ ] 1.1 Record the hosted project's current state before any change: `dataset_entries` row count,
      and the current PostgREST relation-path list. Print counts and names only, never values.
- [ ] 1.2 Confirm the PGlite integration test for the new migration is green **before** touching the
      hosted project, so a failure on the real project is attributable to the environment rather than
      to SQL that was never executed locally.
- [ ] 1.3 Apply `supabase/migrations/20261003120000_dataset_entries_import.sql` to the hosted project
      unchanged, in filename order, one request per file, through the Supabase Management API using
      `SUPABASE_ACCESS_TOKEN`. Do not paste into the SQL Editor and do not rewrite migration history.
- [ ] 1.4 Confirm the function is deployed by **calling** it, not by looking for it in an OpenAPI
      document. A missing relation path (`PGRST202`) means *absent*, which is not a denial and must
      never be scored as one.

## 2. The migration

- [ ] 2.1 Write the migration with a precondition block, matching the convention of the five
      existing migrations: it asserts the state it depends on and raises **by name** if it does not
      hold, rather than proceeding from a schema it did not find.
- [ ] 2.2 `public.dataset_entries_import(...)` with `security invoker` and `set search_path = ''`.
      Repeat, in this file, why invoker is load-bearing: a definer function runs as `postgres` on a
      hosted project and therefore bypasses row-level security.
- [ ] 2.3 The statement is `INSERT … ON CONFLICT (id) DO UPDATE` with `category`, `origin`,
      `destination`, `transit_mode`, `is_active` in the update list and **not** `instruction`,
      `source_payload`, or `created_at`. Comment each omission with why, because an omission is
      invisible to a reader who does not know to look for it.
- [ ] 2.4 The conflict update carries `WHERE dataset_entries.instruction = excluded.instruction`, and
      a zero-row `RETURNING` raises an exception naming the entry id and **not** either instruction.
- [ ] 2.5 `revoke all on function … from public` and `grant execute on function … to service_role`.
      Grant nothing on the table, matching the existing migrations and their reasoning.
- [ ] 2.6 The return value is the engine's discriminator (`xmax = 0`), so "inserted" versus "updated"
      is decided by the same statement that wrote the row.

## 3. Production sink

- [ ] 3.1 Move the RPC slice of the narrow client interface into a module without
      `import "server-only"`, and have `supabase/client.ts` re-export it, so there is one definition
      rather than a copy. Prove the narrow interface still type-checks against the real client.
- [ ] 3.2 `src/lib/dataset/supabase-sink.ts` — `SupabaseDatasetEntrySink implements DatasetEntrySink`.
      One method. It calls the function by name and maps the returned value onto
      `DatasetEntryWriteOutcome` with an exhaustive switch, so an unrecognised return value is a
      refusal rather than a default.
- [ ] 3.3 The sink MUST NOT import `server-only`, because the operator command loads it in plain
      Node and that package throws there. Verify by actually loading the module in plain Node, not
      by reading the source.
- [ ] 3.4 An error from the gateway maps to the repository's error vocabulary through the existing
      mapping helpers, never to a silent partial success.

## 4. Privileged client construction

- [ ] 4.1 `src/lib/supabase/admin-client.ts` — `createSupabaseAdminClient(url, key)`, the single
      `createClient(…, SERVICE_ROLE_KEY)` call in the repository. It carries no `server-only` marker
      because it must be loadable by a command; it is instead protected by the ESLint boundary rule.
- [ ] 4.2 `src/lib/supabase/admin.ts` keeps its `import "server-only"`, keeps reading the environment,
      and delegates. The existing unit test that asserts the marker must still pass unchanged.
- [ ] 4.3 Add the new specifiers to `PRIVILEGED_SPECIFIERS` in `eslint.config.mjs`.
- [ ] 4.4 A unit test enumerates every `createClient` call site under `src/` and asserts that
      **exactly one** passes a service-role key. Prove it fires: adding a second construction must
      turn the test red.

## 5. The operator command

- [ ] 5.1 Add `tsx` as a devDependency and a `import:dataset` script. Record in `design.md` D2 that
      this is the reason; do not let it become an unexplained dependency.
- [ ] 5.2 `scripts/import-dataset.ts` reads the source file, runs `importDatasetEntries` with the
      production sink, and prints parsed/inserted/updated/refused counts and progress.
- [ ] 5.3 Exit non-zero when anything was refused, and name the refused record.
- [ ] 5.4 A `scripts/` file must not be able to write the source dataset. Add the same source-text
      scan the importer already has, applied to the command, and prove the scan fires by pointing it
      at a file that does contain a write.
- [ ] 5.5 No credential is printed, logged, or placed in an error message. Verify by name and length.

## 6. Tests

- [ ] 6.1 Integration, from the production migration directory: the inserted/updated discriminator,
      that `instruction`/`source_payload`/`created_at` survive a re-run unchanged, the named refusal
      on a differing instruction, and the EXECUTE grants.
- [ ] 6.2 Integration: **all 600 records** through the production sink against a real engine, stored
      instructions byte-identical to the source, and a second run leaving them byte-identical to the
      first.
- [ ] 6.3 Unit: the sink against a fake — function name, argument shape, outcome mapping including
      an unrecognised return value, and error mapping.
- [ ] 6.4 Unit: the migration's precondition, with the negative control that actually fires.
- [ ] 6.5 Prove the can-fire for every new guard in this change, each with a green control before
      and after and a byte-identical restore. A guard that has never been seen red is not a guard.

## 7. Verification against the hosted project — GATE ITEM 3

- [ ] 7.1 Run the command against the hosted project and record the report.
- [ ] 7.2 Record, from the real wire: `dataset_entries` holds 600 rows; the stored id set equals the
      source id set; each stored instruction equals the source instruction byte for byte.
- [ ] 7.3 Record that `anon` and `authenticated` are **refused** by the real gateway, distinguishing
      a refusal from an absent function, and print before/after row counts around the probe so an
      empty table cannot masquerade as a denial.
- [ ] 7.4 Re-run the command and record `0 inserted / 600 updated`, the row count still 600, and all
      600 stored instructions byte-identical to the first run.
- [ ] 7.5 Correct the header of `src/lib/repositories/supabase/factory.ts`: state which claims are now
      backed by the real wire and which remain proved only against fakes. Do not write "verified"
      about `.insert()`, `.update().eq()`, or `.range()` unless a task in this change ran them.
- [ ] 7.6 Record honestly whether the repository's query builders have now reached a real PostgREST,
      and which of them have.

## 8. Close out

- [ ] 8.1 `pnpm run lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`, `test:integration`,
      `build` — all run, all reported with the figures they actually produced.
- [ ] 8.2 `openspec change validate hosted-dataset-import --strict` exits 0.
- [ ] 8.3 Update `docs/ROADMAP.md` `## Project Status` and `### Active Blockers`: gate item 3 closed,
      the two residuals updated, next objective moved to the dashboard slice.
- [ ] 8.4 Independent verification pass. No CRITICAL finding may survive, and no WARNING may be
      silently waived.
- [ ] 8.5 Merge with a merge commit only after 7.4 is green.
