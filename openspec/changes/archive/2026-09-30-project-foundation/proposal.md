# Proposal

## Why

The repository currently contains only the immutable synthetic dataset, the roadmap, and
governing documents. There is no application, no type system, no validation contracts, and no
verification harness. Every subsequent roadmap phase (database schema, screening, allocation,
validation, admin, export) depends on a stable, category-agnostic foundation, so that foundation
must exist and be verified before any product behavior is built on top of it.

## What Changes

- Bootstrap a Next.js (App Router) + TypeScript application with React, Tailwind CSS, and
  `next/font`-managed typography, pinned by a committed lockfile and `package.json` engines
  field.
- Establish a strict **soft neo-brutalist** design system as code-level design tokens
  (color, type scale, border, offset shadow, radius, spacing, motion), with WCAG-AA contrast
  and a visible focus treatment baked into the token definitions.
- Define shared, category-agnostic domain types and Zod schemas for the pieces the whole
  platform depends on: dataset entries, dataset categories, Ilocano proficiency screening,
  the four validation evaluations, conditional corrections, optional translations, batch
  requests, and anonymous validator identity. Validation integrity rules are expressed as
  pure, testable domain functions rather than being left to the UI.
- Establish the explicit **server/domain/persistence boundary**: Supabase clients
  (browser, server, service-role) and repository *interfaces* live behind `src/lib/supabase`
  and `src/lib/repositories`; no client component imports Supabase or persistence internals.
- Add environment-variable validation so a misconfigured deployment fails fast and loudly
  instead of surfacing a confusing runtime error.
- Add a verification harness: unit tests for pure domain logic, an in-memory PostgreSQL
  (PGlite) integration harness for real SQL, plus lint, formatting, and type-check scripts.
  Only the harness and the schemas it proves are added here; database *migrations* are out of
  scope and belong to the next change.
- Add CI that runs the verification commands actually defined here.
- Establish a minimal application shell (root layout, global styles, a placeholder home
  route) that renders without touching any database, so the shell is deployable and reviewable
  before the schema exists.

**BREAKING** (pre-release): none — there is no prior implementation to break.

## Capabilities

### New Capabilities

- `application-foundation`: the deployable application shell, pinned toolchain, environment
  configuration contract, and the verified build/lint/type-check/test command surface.
- `design-system`: the soft neo-brutalist token set and the accessible primitive components
  that every public and admin screen is built from.
- `domain-contracts`: the category-agnostic domain types, Zod schemas, and pure validation
  integrity functions shared by server and client code.
- `data-access-boundary`: Supabase client construction and the repository interface contracts
  that keep privileged access server-side and keep client components off persistence internals.

### Modified Capabilities

None — no existing capabilities are defined yet.

## Impact

- **New application code**: `src/`, plus Next.js/TypeScript/Tailwind configuration at the
  repository root.
- **New dependencies**: `next`, `react`, `react-dom`, `typescript`, `tailwindcss`, `zod`,
  `@supabase/supabase-js`, `@supabase/ssr`, Vitest, PGlite, ESLint, Prettier. No ORM is
  introduced, per the approved stack.
- **New infrastructure**: a GitHub Actions workflow running lint, type-check, unit tests, and
  integration tests.
- **Unaffected**: `data/ilocano-synthetic-data.json` is read-only reference material and is
  not modified. No database migration, no Supabase project, and no product behavior is part
  of this change.
- **Environment**: five required variables are declared in `.env.example`:
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for the browser client, and
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for the server and
  privileged clients. The `NEXT_PUBLIC_*` pair is a separate set of names rather than a re-export
  because those values are inlined into the client bundle at build time and the service-role key
  must never be in that bundle; no secret is committed.
