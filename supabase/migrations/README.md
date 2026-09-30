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

Applied in this order, both in CI and on a hosted project.

| File                                                 | What it creates                                                                                                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20260930120000_research_schema.sql`                 | The six research tables, their constraints and indexes, and Row Level Security enabled on all six with no policy granting access to `anon` or `authenticated`. |
| `20260930160000_required_bilingual_translations.sql` | Replaces the single optional translation pair with two required ones, and drops the superseded columns. See the operational note below.                        |

The research schema is anonymous by design: validators have no Supabase Auth session, so nothing
in it references `auth.uid()` or `auth.users`, and primary keys are domain identifiers rather
than `uuid` surrogates. The change that introduced it was `od-dataset-schema-and-import`, now
archived at `openspec/changes/archive/2026-09-30-od-dataset-schema-and-import/`. Its requirements
are synced into the main specs and are the current source of truth:
`openspec/specs/research-schema/spec.md` for the schema itself, and
`openspec/specs/dataset-import/spec.md` for the import that fills it.

## Operational note: the bilingual migration refuses rather than repairs

`20260930160000_required_bilingual_translations.sql` **raises an exception and does not apply** if
the database already holds a validation whose evaluation is anything other than `cannot_evaluate`.

**Why.** The previous schema made the single translation pair optional, so an evaluable validation
with no translation was perfectly legal. The new requirement makes both translations mandatory for
every evaluable evaluation. The two rules collide on exactly the rows that already exist, and the
migration is written to stop rather than resolve it. It will not delete the rows, will not fabricate
translations to satisfy the new constraint, and will not weaken the constraint to accommodate them.
All three would be worse than failing.

**What an operator should do if it fires.** The resolution is a research decision, not a mechanical
one, so it belongs to the thesis team:

1. Export the affected rows and decide, per row, whether a translation exists anywhere trustworthy.
   If it does, populate `english_translation` and `filipino_translation` from it, under the old
   column names, before reapplying.
2. If no trustworthy translation exists, the response is not qualifying coverage and the correct
   record is one carrying no translations. That is representable **only** if the row is
   `cannot_evaluate`. An evaluable row with no translations is not storable under the new rules, by
   design.
3. Reapply once no evaluable row is missing its translations. The migration is idempotent in the
   sense that matters: on a table with no evaluable rows it applies cleanly, and it is safe to
   retry after resolving the rows because a failed file is rolled back in its entirety.

**Why it is safe.** The precondition runs **before** the column drop, and that ordering is the
argument rather than a stylistic choice. If the precondition passes, every pre-existing row is
`cannot_evaluate`, and such a row held no translation data at all — so dropping
`translation_language` and `translation_text` discards nothing. Dropping first and checking second
would be lossy.

The ordering is also enforced _in the SQL_, not merely asserted here: the precondition first checks
that `translation_language` still exists and raises by name if it does not, so a file that dropped
first fails loudly instead of proceeding from a schema that has already lost the columns holding the
data. That matters because the ordering is **not** verifiable from the outside — the harness applies
each migration file inside a transaction, so a `raise exception` rolls the file back and an earlier
drop is undone with it. A test asserting "the columns are still there after the refusal" therefore
passes either way. See `design.md` section 3 in the `required-bilingual-translations` change.

**Two independent guards, not one.** It is worth knowing that the migration would refuse even
without the precondition: `ADD CONSTRAINT ... CHECK` validates existing rows. The precondition is
what makes the failure _explanatory_ — it names the conflict and states what the migration will not
do, so an operator can tell a deliberate refusal from a bug worth retrying. Both behaviours are
measured in `tests/integration/migration-precondition.test.ts`, including a negative control that
deletes the precondition block and confirms the message changes.

**Not yet done:** these migrations have never been applied to a hosted Supabase project. They are
verified against a real PostgreSQL engine via PGlite, which evaluates the same SQL for
constraints, foreign keys, and RLS — but that is not the same as verifying against Supabase, and
applying them to a project is a separate deployment step recorded in `docs/ROADMAP.md`.
