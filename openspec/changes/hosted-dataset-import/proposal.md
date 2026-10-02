# Proposal

## Why

The hosted Supabase project has the full research schema applied — five migrations, verified in
force against the real gateway — and `dataset_entries` holds **zero rows**. Every one of the other
gated platform capabilities is therefore blocked on a table with no data in it: coverage-aware
allocation would draw an empty pool, and a validator's first batch would be unanswerable.

The importer already exists and is already proven. `importDatasetEntries` in
`src/lib/dataset/import-dataset.ts` parses the 600-record source dataset and writes through a
one-method `DatasetEntrySink` interface, and `tests/integration/dataset-import.test.ts` proves the
whole thing against a real PostgreSQL engine: all 600 records, byte-identical instructions,
idempotent re-runs.

What does not exist is a **production `DatasetEntrySink`**. The interface has exactly one
implementation and it lives in the test file. `importDatasetEntries` has no production caller —
measured, not assumed: the only two call sites in the repository are
`tests/integration/dataset-import.test.ts:110` and `:280`.

So the gap is not the import logic. It is the last hundred metres between a verified importer and a
populated production table, and it is precisely the hundred metres this project distrusts: the
repository's own query builders have still never run against a real PostgREST, and the write path is
the one place where a mistake is a **corrupted research dataset** rather than a wrong number on a
screen.

There is a design constraint that rules out the obvious answer, and it is not mine:

> There is no write method on purpose. `DatasetEntriesRepository` is a read interface: imported
> entries are written by the importer's own upsert path, which is a different concern and is not
> allowed to be reachable from a request path.
> — `src/lib/repositories/supabase/dataset-entries.ts:101-103`

The citation names all three lines because the sentence wraps across them. A single line number for a
three-line quote is not wrong, but it sends the next reader to the middle of the thought, and this
repository has spent a great deal of effort on exactly that class of small wrongness.

That sentence is the reason this change is a **command an operator runs** and not a button in the
researcher area. The alternative would have been far less work.

## What Changes

- **A forward migration adding one database function**, `public.dataset_entries_import`, which
  performs the entry upsert. This is where the immutability guarantee moves. It does not live in
  TypeScript that a future caller could forget to use; it lives in the statement, and the statement's
  update list does not contain `instruction`.
- **A production `DatasetEntrySink`** — `SupabaseDatasetEntrySink` — that calls that function through
  the repository's existing narrow RPC surface and maps its return value onto
  `DatasetEntryWriteOutcome`. Its own contract is unchanged: one method, idempotent, never
  overwriting an instruction.
- **An operator command**, `pnpm run import:dataset`, which reads the immutable source file, runs the
  importer, reports parsed/inserted/updated/refused counts, and exits non-zero if anything was
  refused. It is not a request path and no HTTP route reaches it.
- **One construction site for the privileged client.** `createAdminSupabaseClient` keeps its
  `server-only` guard and delegates to a new un-guardable module, so the command and the server
  repositories share a single `createClient(…, SERVICE_ROLE_KEY)` call that a test can count.
- **A false header corrected.** `src/lib/repositories/supabase/factory.ts` currently states that no
  Supabase project and no credential exist. Both were false as of 2026-10-02 and this is the change in
  which the remaining half — that no query in this file has reached PostgREST — stops being true.
- **A devDependency, `tsx`,** with a measured and specific reason given in `design.md` D2.

## What is deliberately NOT in this change

- **No dashboard, no coverage figures, no disagreement views.** Those are the next Phase 7 slice and
  remain blocked on the thesis team's decisions about which figures are required.
- **No `dataset_entries` write method on `DatasetEntriesRepository`.** The read interface stays read.
- **No validator-facing change of any kind.** The public routes, the screening, and the validation
  experience are untouched.
- **No repair path for a mutated instruction.** If the source file and the stored row disagree, this
  change refuses and says which entry. Deciding what a dataset revision means for entries validators
  have already seen is a research question for the thesis team, and answering it here would be
  answering it without them.

## Impact

- **Closes GATE ITEM 3** of the six-item hosted-environment gate, which is the only one not satisfied.
  The gate's remaining five were measured on 2026-10-03.
- **Closes both residuals** recorded in the archived `researcher-admin-access` `design.md` D9: no
  screen has ever been rendered in a desktop browser, and the repository's query builders have never
  reached a real PostgREST. The second residual closes for the write path here.
- **Schema change: one forward migration.** Existing migration history is untouched; the fix is always
  to apply migration files, never to rewrite them.
- **One new credential capability.** The command reads `SUPABASE_SERVICE_ROLE_KEY`, the same
  credential the server already requires. No new secret, no new `.env` variable.
