# Migrations

Plain PostgreSQL migration files named `YYYYMMDDHHMMSS_description.sql`, applied in lexical
filename order, one transaction per file.

Three rules, all load-bearing:

1. **A migration must be plain PostgreSQL.** It is applied to a real PostgreSQL instance
   (`@electric-sql/pglite`) by `tests/integration/` in CI, not only to a hosted Supabase
   project. It therefore must not depend on a Supabase-managed extension that the test harness
   does not provide. In particular the harness provides only `auth.uid()` and `auth.role()` in a
   stubbed `auth` schema, and **no `auth.users` table** — a reference to one fails in CI.
2. **`auth.uid()` may only appear inside an RLS policy.** The harness stubs the `auth` schema so
   policies run verbatim. A migration that calls `auth.uid()` in a constraint, index, or default
   will fail in CI. (The current research schema does not use it at all — see below.)
3. **No transaction control, and no `CONCURRENTLY`.** Each file is applied inside a transaction
   by `tests/integration/support/migrations.ts`, so a file must not contain `begin;`/`commit;`,
   and `CREATE INDEX CONCURRENTLY` cannot run there. Create indexes inside the migration.

Supabase provisions the `anon`, `authenticated`, and `service_role` roles with schema usage and
table privileges in `public`. The harness reproduces those grants, and it does so _after_ the
migration files run — which is why a test that builds its own tables with `db.exec` sees
`permission denied for table` for every role, including `service_role`, and can easily mistake a
missing grant for an RLS result.

## Current contents

| File                                 | What it creates                                                                                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260930120000_research_schema.sql` | The six research tables, their constraints and indexes, and Row Level Security enabled on all six with no policy granting access to `anon` or `authenticated`. |

The research schema is anonymous by design: validators have no Supabase Auth session, so nothing
in it references `auth.uid()` or `auth.users`, and primary keys are domain identifiers rather
than `uuid` surrogates. The change that introduced it is `od-dataset-schema-and-import`; until it
is archived it lives at `openspec/changes/od-dataset-schema-and-import/`, with its requirements
in that change's `specs/research-schema/spec.md` and, after the archive stage, in
`openspec/specs/research-schema/spec.md`.

**Not yet done:** these migrations have never been applied to a hosted Supabase project. They are
verified against a real PostgreSQL engine via PGlite, which evaluates the same SQL for
constraints, foreign keys, and RLS — but that is not the same as verifying against Supabase, and
applying them to a project is a separate deployment step recorded in `docs/ROADMAP.md`.
