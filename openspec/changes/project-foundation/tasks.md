# Tasks

## 1. Toolchain and scaffold

- [x] 1.1 Create `package.json` pinning `packageManager` to the installed pnpm version and `engines.node`, with `build`/`dev`/`lint`/`format`/`format:check`/`typecheck`/`test`/`test:unit`/`test:integration` scripts; verify `pnpm run` lists them and that `pnpm install` completes with a committed `pnpm-lock.yaml`
- [x] 1.2 Install runtime dependencies (`next`, `react`, `react-dom`, `zod`, `@supabase/supabase-js`, `@supabase/ssr`) and dev dependencies (`typescript`, `@types/*`, `tailwindcss`, `@tailwindcss/postcss`, `postcss`, `eslint`, `eslint-config-next`, `prettier`, `prettier-plugin-tailwindcss`, `vitest`, `@vitest/coverage-v8`, `@electric-sql/pglite`, `server-only`); verify `pnpm install` reports no unresolved peer dependency errors
- [x] 1.3 Add `tsconfig.json` (strict, `@/*` path alias to `src/*`), `next.config.ts`, `postcss.config.mjs`, `.prettierrc`, `.prettierignore`, `.editorconfig`, `.nvmrc`; verify `pnpm typecheck` runs and reports no config error
- [x] 1.4 Add `.env.example` with placeholder-only values for `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and confirm `.gitignore` ignores `.env*` except `.env.example`; verify `git status` stays clean and `git ls-files` lists no real secret
- [x] 1.5 Create the base route tree: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css` import path, `not-found.tsx`; verify `pnpm build` succeeds and the build output lists the `/` route

## 2. Design system

- [x] 2.1 Write `src/styles/globals.css` with a Tailwind v4 `@theme` block defining the full soft neo-brutalist token set (warm cream surface, raised surface, ink, ink-muted, copper accent, sage/clay status, 2px border, zero-blur offset shadow, 12px/10px radii, 4px spacing scale, motion durations, and a minimum 16px body size) and confirm via `pnpm build` that utilities generated from the theme resolve
- [x] 2.2 Load `Archivo`, `Public Sans`, and `JetBrains Mono` through `next/font/google` with explicit CSS variables and a `fallback` stack, exposed as `--font-display`, `--font-body`, `--font-mono`; verify no build-time font error and that `getComputedStyle`-equivalent class names appear in the built CSS
- [x] 2.3 Add the low-opacity fixed paper-grain overlay as a `pointer-events-none` fixed pseudo-element (no `backdrop-blur`, no scanlines, no halftone); verify the overlay is not attached to any scrolling container
- [x] 2.4 Implement `src/components/ui/button.tsx` with variants built only from tokens, `focus-visible` ring, pressed/disabled states, `aria-disabled` handling, and a minimum touch-target size; verify a unit test asserts no raw hex/pixel-shadow value appears in the class output
- [x] 2.5 Implement `src/components/ui/card.tsx`, `src/components/ui/progress.tsx`, `src/components/ui/badge.tsx`, and `src/components/ui/field.tsx` (label + control + description + error, wired with `id`/`aria-describedby`/`aria-invalid`); verify unit tests assert every field control has an associated accessible name
- [x] 2.6 Implement `src/components/validation/answer-option.tsx` using only the neutral answer tokens until selected, switching to the accent only when selected, with `role="radio"` inside a `role="radiogroup"`; verify a unit test asserts all unselected options share identical surface/border token classes and that exactly one carries the selected treatment after selection
- [x] 2.7 Document the resolved design system, including the explicit overrides of the `industrial-brutalist-ui` and `high-end-visual-design` directives, in `docs/DESIGN-SYSTEM.md`; verify the document names each overridden directive and its replacement

## 3. Domain contracts

- [x] 3.1 Add `src/schemas/dataset.ts` with `datasetCategorySchema` (open identifier, not a closed enum), `datasetEntryInputSchema`, and inferred `DatasetEntry`/`DatasetEntryInput` types preserving the source ID; verify `dataset.test.ts` covers a valid `OD_0001` record, empty instruction, missing category, unknown category, and `null` transit mode
- [x] 3.2 Add `src/schemas/validator.ts` with `ilocanoProficiencySchema` mapping the five approved labels to stable machine identifiers, `anonymousValidatorIdSchema` (`VAL_` + 8 lowercase hex chars), and `validatorProfileSchema` exposing no personally identifying field; verify `validator.test.ts` covers all five labels, a rejected sixth value, the id format, and asserts the profile has no identifying key
- [x] 3.3 Add `src/schemas/validation.ts` with `evaluationSchema` (exactly the four values), `translationLanguageSchema` (`english` | `filipino`), and `validationResponseSchema` encoding the seven integrity rules from the `domain-contracts` spec via `superRefine`; verify `validation-response.test.ts` runs the full 4×correction×translation matrix and asserts each rule's specific failure path
- [x] 3.4 Add `src/schemas/batch.ts` with `batchRequestSchema` and an allocation-configuration schema holding a configurable `batchSize` (default 10) and independent-validation target (default 3), each with a hard upper bound; verify `batch.test.ts` covers the defaults, over-maximum request capping, and rejection of zero/negative/over-bound configuration
- [x] 3.5 Add `src/lib/domain/` pure helpers: `createAnonymousValidatorId()` using `crypto.getRandomValues`, and `isCorrectionRequired(evaluation)` / `isTranslationAllowed(evaluation)`; verify unit tests assert the id matches the opaque format, carries no meaningful component, and that the two predicates return the exact expected results for all four evaluations
- [x] 3.6 Assert the separation between static dataset definition and runtime response state in the type layer (a `Validation` is not assignable to a `DatasetEntry`); verify a type-level test in `domain-types.test.ts` fails to compile if the two shapes are merged, and passes as written

## 4. Data access boundary

- [x] 4.1 Add `src/lib/env/server.ts` validating `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` with named errors, and `src/lib/env/client.ts` exposing only `NEXT_PUBLIC_*` values and rejecting a service-role-shaped public value; verify `env.test.ts` covers missing, malformed, complete, and secret-leak cases
- [x] 4.2 Add `src/lib/supabase/browser.ts` (public-safe key only), `src/lib/supabase/server.ts` (public-safe key, cookie-backed), and `src/lib/supabase/admin.ts` (`import 'server-only'`, service-role key); verify a unit test asserts the browser module's construction arguments contain no service-role value
- [x] 4.3 Add repository *interfaces* only in `src/lib/repositories/` for dataset entries, validators, and validations, each returning domain types and raising typed `RepositoryError` on failure rather than returning empty results; verify `repositories.test.ts` asserts the interfaces compile, that an in-memory fake can satisfy them, and that a failing fake surfaces a named error
- [x] 4.4 Add ESLint boundary rules restricting `src/lib/supabase/server`, `src/lib/supabase/admin`, and `src/lib/repositories/supabase` from being imported by `src/components/**` and client `src/app/**` modules; verify the rule fires on a temporary violating import and the violation is reported with the offending file path, then that the temporary file is removed
- [x] 4.5 Add the shared client/server input-normalization entry point that re-parses any write payload with its schema before persistence; verify a unit test asserts a malformed payload is rejected before the repository is called, with the repository recording zero calls

## 5. Verification harness

- [x] 5.1 Add `vitest.config.ts` with `unit` and `integration` projects and add `@electric-sql/pglite`; verify `pnpm test:integration` boots PGlite, applies a trivial schema, and rolls it back
- [x] 5.2 Add `tests/integration/support/pglite.ts` providing a real-Postgres sandbox plus a stub `auth` schema so RLS policies referencing `auth.uid()` can be exercised, and `tests/integration/support/migrations.ts` as a migration applier that reads `supabase/migrations/*.sql` in filename order; verify the harness applies a fixture migration containing a table, a unique constraint, and an RLS policy
- [x] 5.3 Add a guard test that reads `data/ilocano-synthetic-data.json` and asserts the immutable research source is unchanged by any change in this repository (record count, ID set, and a content hash); verify the guard passes and fails when the fixture is intentionally altered in the test's temporary copy

## 6. Continuous verification and documentation

- [x] 6.1 Add a GitHub Actions workflow running `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:unit`, and `pnpm test:integration` on push and pull request to `main`; verify the workflow YAML parses and each referenced script name exists in `package.json`
- [x] 6.2 Run the full verification sequence locally — `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm build` — and record the actual observed results; verify each command exits zero and the observed test counts are captured verbatim
- [x] 6.3 Update `AGENTS.md` "Setup & commands" and "Verified project tools" with only the commands that exited successfully, each annotated with what it proves and what it explicitly does not prove (including that PGlite is real Postgres but not Supabase, and that no Supabase project has been provisioned); verify no command is listed that was not actually executed
- [x] 6.4 Run `openspec validate project-foundation --strict` and confirm it reports no error; verify the exit code is zero

## 7. Post-implementation review repairs

Raised by the independent verification pass on 2026-09-30. Each item is a repair to the
implementation or to this change's own artifacts — none is a new capability.

- [x] 7.1 Enforce the supported Node range with `devEngines.runtime` + `onFail: "error"`, after proving empirically that pnpm 12 does **not** fail on an `engines` mismatch (a probe declaring `engines.node: ">=99 <100"` still installed with exit 0, with and without `engine-strict`). Correct the `application-foundation` scenario wording, which claimed behavior that did not exist
- [x] 7.2 Raise `--text-small` to the 1rem body floor. It was 0.9375rem (15px) and the landing page rendered whole paragraphs in it, while the token file's own comment claimed the floor "is enforced here". Add a test that reads `globals.css` and asserts every prose role is at or above the floor, since class-string tests cannot see token *values*
- [x] 7.3 Declare `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.example`; the template previously listed only the three server names, so copying it produced a `ClientEnvError` naming two variables the template never mentioned
- [x] 7.4 Split the at-most-one-validation requirement. The spec delta demanded a data-layer uniqueness constraint that this change's own non-goals exclude; see the correction note in `design.md`. The constraint and its PGlite proof are deferred to `od-dataset-schema-and-import`
- [x] 7.5 Rewrite `supabase/migrations/README.md`, whose backticks had been corrupted into backslashes with characters dropped — the file that documents the migration naming convention and the `auth.uid()`-in-policy-only rule
- [x] 7.6 Correct `tasks.md` 5.2 to name the harness files that actually exist (`tests/integration/support/pglite.ts` and `tests/integration/support/migrations.ts`)
- [x] 7.7 Strengthen the runtime half of the dataset/response separation test: it used `id: "val-1"`, which the source-ID regex rejects, so it passed for the wrong reason. Use a source-shaped ID and assert the failing field paths
- [x] 7.8 Add a test that the viewport `themeColor` literal equals `--color-paper`. Next.js requires a literal there, so it silently duplicates the token and nothing reported the drift
- [x] 7.9 State the exact scope of the answer-option neutrality claim, including the `className` escape hatch on the exported function, instead of implying the guarantee is total
- [x] 7.10 Correct the `design-system` motion wording, which named only opacity and transform while the implementation also transitions colour, border colour, and shadow

## Deferred — not delivered by this change

- **`UNIQUE (validator_id, dataset_entry_id)` on `validations`.** Requires a migration, which this
  change excludes. Owned by `od-dataset-schema-and-import`, which must assert it in the PGlite
  integration harness and not only in application tests. `ValidationsRepository.insert` documents
  the expectation at the seam so it is inherited rather than rediscovered.
- **Repository implementations** (`src/lib/repositories/supabase/**`). Interfaces only, by design
  decision D6. Added by `od-dataset-schema-and-import`; nothing may depend on the path until then.
- **"Unknown fields are preserved and surfaced" (data-access-boundary rule 3).** Documented as a
  contract, but there is no implementation to assert it against until the repository
  implementations land.
- **Client components calling a server-side service boundary.** No write path exists yet; the
  `parseWriteIntent` boundary is in place and tested, but nothing calls it.

