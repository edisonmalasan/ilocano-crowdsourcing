# Migrations

Plain PostgreSQL migration files named \YYYYMMDDHHMMSS_description.sql\, applied in lexical
filename order.

Two rules, both load-bearing:

1. **A migration must be plain PostgreSQL.** It is applied to a real PostgreSQL instance
   (\@electric-sql/pglite\) by \ ests/integration/\ in CI, not only to a hosted Supabase
   project. It therefore must not depend on a Supabase-managed extension that the test harness
   does not provide.
2. **\uth.uid()\ may only appear inside an RLS policy.** The harness stubs the \uth\ schema so
   policies run verbatim. A migration that calls \uth.uid()\ in a constraint, index, or default
   will fail in CI.

Supabase provisions the \non\, \uthenticated\, and \service_role\ roles with schema usage and
table privileges in \public\. The harness reproduces those grants; a migration does not need to.

This directory is currently empty. The research schema lands in the \od-dataset-schema-and-import\
change.
