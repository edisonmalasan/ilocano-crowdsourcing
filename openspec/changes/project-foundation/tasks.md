# Tasks

## 1. Toolchain and scaffold

- [ ] 1.1 Create `package.json` pinning `packageManager` to the installed pnpm version and `engines.node`, with `build`/`dev`/`lint`/`format`/`format:check`/`typecheck`/`test`/`test:unit`/`test:integration` scripts; verify `pnpm run` lists them and that `pnpm install` completes with a committed `pnpm-lock.yaml`
- [ ] 1.2 Install runtime dependencies (`next`, `react`, `react-dom`, `zod`, `@supabase/supabase-js`, `@supabase/ssr`) and dev dependencies (`typescript`, `@types/*`, `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `eslint`, `eslint-config-next`, `prettier`, `prettier-plugin-tailwindcss`, `vitest`, `@vitest/coverage-v8`, `@electric-sql/pglite`, `server-only`); verify `pnpm install` reports no unresolved peer dependency errors
- [ ] 1.3 Add `tsconfig.json` (strict, `@/*` path alias to `src/*`), `next.config.ts`, `postcss.config.mjs`, `.prettierrc`, `.prettierignore`, `.editorconfig`, `.nvmrc`; verify `pnpm typecheck` runs and reports no config error
- [ ] 1.4 Add `.env.example` with placeholder-only values for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and confirm `.gitignore` ignores `.env*` except `.env.example`; verify `git status` stays clean and `git ls-files` lists no real secret
- [ ] 1.5 Create the base route tree: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css` import path, `not-found.tsx`; verify `pnpm build` succeeds and the build output lists the `/` route

## 2. Design system

- [ ] 2.1 Write `src/styles/globals.css` with a Tailwind v4 `@theme` block defining the full soft neo-brutalist token set (warm cream surface, raised surface, ink, ink-muted, copper accent, sage/clay status, 2px border, zero-blur offset shadow, 12px/10px radii, 4px spacing scale, motion durations, and a minimum 16px body size) and confirm via `pnpm build` that utilities generated from the theme resolve
- [ ] 2.2 Load `Archivo`, `Public Sans`, and `JetBrains Mono` through `next/font/google` with explicit CSS variables and a `fallback` stack, exposed as `--font-display`, `--font-body`, `--font-mono`; verify no build-time font error and that `getComputedStyle`-equivalent class names appear in the built CSS
- [ ] 2.3 Add the low-opacity fixed paper-grain overlay as a `pointer-events-none` fixed pseudo-element (no `backdrop-blur`, no scanlines, no halftone); verify the overlay is not attached to any scrolling container
- [ ] 2.4 Implement `src/components/ui/button.tsx` with variants built only from tokens, `focus-visible` ring, pressed/disabled states, `aria-disabled` handling, and a minimum touch-target size; verify a unit test asserts no raw hex/pixel-shadow value appears in the class output
- [ ] 2.5 Implement `src/components/ui/card.tsx`, `src/components/ui/progress.tsx`, `src/components/ui/badge.tsx`, and `src/components/ui/field.tsx` (label + control + description + error, wired with `id`/`aria-describedby`/`aria-invalid`); verify unit tests assert every field control has an associated accessible name
- [ ] 2.6 Implement `src/components/validation/answer-option.tsx` using only the neutral answer tokens until selected, switching to the accent only when selected, with `role="radio"` inside a `role="radiogroup"`; verify a unit test asserts all unselected options share identical surface/border token classes and that exactly one carries the selected treatment after selection
- [ ] 2.7 Document the resolved design system, including the explicit overrides of the `industrial-brutalist-ui` and `high-end-visual-design` directives, in `docs/DESIGN-SYSTEM.md`; verify the document names each overridden directive and its replacement

## 3. Domain contracts

- [ ] 3.1 Add `src/schemas/dataset.ts` with `datasetCategorySchema` (open identifier, not a closed enum), `datasetEntryInputSchema`, and inferred `DatasetEntry`/`DatasetEntryInput` types preserving the source ID; verify `dataset.test.ts` covers a valid `OD_0001` record, empty instruction, missing category, unknown category, and `null` transit mode
- [ ] 3.2 Add `src/schemas/validator.ts` with `ilocanoProficiencySchema` mapping the five approved labels to stable machine identifiers, `anonymousValidatorIdSchema` (`VAL_` + 8 lowercase hex chars), and `validatorProfileSchema` exposing no personally identifying field; verify `validator.test.ts` covers all five labels, a rejected sixth value, the id format, and asserts the profile has no identifying key
- [ ] 3.3 Add `src/schemas/validation.ts` with `evaluationSchema` (exactly the four values), `translationLanguageSchema` (`english` | `filipino`), and `validationResponseSchema` encoding the seven integrity rules from the `domain-contracts` spec via `superRefine`; verify `validation-response.test.ts` runs the full 4×correction×translation matrix and asserts each rule's specific failure path
- [ ] 3.4 Add `src/schemas/batch.ts` with `batchRequestSchema` and an allocation-configuration schema holding a configurable `batchSize` (default 10) and independent-validation target (default 3), each with a hard upper bound; verify `batch.test.ts` covers the defaults, over-maximum request capping, and rejection of zero/negative/over-bound configuration
- [ ] 3.5 Add `src/lib/domain/` pure helpers: `createAnonymousValidatorId()` using `crypto.getRandomValues`, and `isCorrectionRequired(evaluation)` / `isTranslationAllowed(evaluation)`; verify unit tests assert the id matches the opaque format, carries no meaningful component, and that the two predicates return the exact expected results for all four evaluations
- [ ] 3.6 Assert the separation between static dataset definition and runtime response state in the type layer (a `Validation` is not assignable to a `DatasetEntry`); verify a type-level test in `domain-types.test.ts` fails to compile if the two shapes are merged, and passes as written

## 4. Data access boundary

- [ ] 4.1 Add `src/lib/env/server.ts` validating `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` with named errors, and `src/lib/env/client.ts` exposing only `NEXT_PUBLIC_*` values and rejecting a service-role-shaped public value; verify `env.test.ts` covers missing, malformed, complete, and secret-leak cases
- [ ] 4.2 Add `src/lib/supabase/browser.ts` (public-safe key only), `src/lib/supabase/server.ts` (public-safe key, cookie-backed), and `src/lib/supabase/admin.ts` (`import 'server-only'`, service-role key); verify a unit test asserts the browser module's construction arguments contain no service-role value
- [ ] 4.3 Add repository *interfaces* only in `src/lib/repositories/` for dataset entries, validators, and validations, each returning domain types and raising typed `RepositoryError` on failure rather than returning empty results; verify `repositories.test.ts` asserts the interfaces compile, that an in-memory fake can satisfy them, and that a failing fake surfaces a named error
- [ ] 4.4 Add ESLint boundary rules restricting `src/lib/supabase/server`, `src/lib/supabase/admin`, and `src/lib/repositories/supabase` from being imported by `src/components/**` and client `src/app/**` modules; verify the rule fires on a temporary violating import and the violation is reported with the offending file path, then that the temporary file is removed
- [ ] 4.5 Add the shared client/server input-normalization entry point that re-parses any write payload with its schema before persistence; verify a unit test asserts a malformed payload is rejected before the repository is called, with the repository recording zero calls

## 5. Verification harness

- [ ] 5.1 Add `vitest.config.ts` with `unit` and `integration` projects and add `@electric-sql/pglite`; verify `pnpm test:integration` boots PGlite, applies a trivial schema, and rolls it back
- [ ] 5.2 Add `tests/integration/pglite-harness.ts` providing a real-Postgres sandbox plus a stub `auth` schema so RLS policies referencing `auth.uid()` can be exercised, and a migration applier that reads `supabase/migrations/*.sql` in filename order; verify the harness applies a fixture migration containing a table, a unique constraint, and an RLS policy
- [ ] 5.3 Add a guard test that reads `data/ilocano-synthetic-data.json` and asserts the immutable research source is unchanged by any change in this repository (record count, ID set, and a content hash); verify the guard passes and fails when the fixture is intentionally altered in the test's temporary copy

## 6. Continuous verification and documentation

- [ ] 6.1 Add a GitHub Actions workflow running `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:unit`, and `pnpm test:integration` on push and pull request to `main`; verify the workflow YAML parses and each referenced script name exists in `package.json`
- [ ] 6.2 Run the full verification sequence locally — `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build` — and record the actual observed results; verify each command exits zero and the observed test counts are captured verbatim
- [ ] 6.3 Update `AGENTS.md` "Setup & commands" and "Verified project tools" with only the commands that exited successfully, each annotated with what it proves and what it explicitly does not prove (including that PGlite is real Postgres but not Supabase, and that no Supabase project has been provisioned); verify no command is listed that was not actually executed
- [ ] 6.4 Run `openspec validate project-foundation --strict` and confirm it reports no error; verify the exit code is zero
