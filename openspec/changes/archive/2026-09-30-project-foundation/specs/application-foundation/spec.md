# Spec Delta

## Purpose

Defines the deployable application shell for the Sadino crowdsourcing validation platform:
the pinned toolchain, the environment configuration contract, and the command surface that
proves the shell builds, type-checks, and lints cleanly before any product behavior exists.

## ADDED Requirements

### Requirement: Pinned, reproducible toolchain

The repository SHALL pin the Node.js major version, the package manager, and a committed
lockfile. The application SHALL declare an `engines.node` constraint that is consistent with
that pinned major version, so a mismatched runtime fails fast rather than failing obscurely
during a build.

#### Scenario: Fresh clone installs deterministically

- **WHEN** a contributor starts from a clean checkout and runs the recorded install command
- **THEN** dependencies resolve from the committed lockfile and the tree is byte-identical to
  the committed manifest set

#### Scenario: Unsupported Node major version is detected

- **WHEN** the toolchain runs under a Node.js version outside the declared supported range
- **THEN** the package manager refuses to install, emitting a version-check error naming the
  required and actual versions, before any build step begins

> Enforcement note. This is implemented with `devEngines.runtime` carrying `onFail: "error"`, not
> with `engines` alone. pnpm 12 does **not** fail on an `engines` mismatch — verified empirically:
> a project declaring `engines.node: ">=99 <100"` still installed with exit 0, with and without
> `engine-strict=true` in `.npmrc`. `devEngines.runtime.onFail: "error"` does fail, with exit 1 and
> the message "This project requires Node.js >=99 <100. Your current Node.js is v26.10.0". The
> original wording of this scenario said "the package manager emits an engine mismatch error",
> which was empirically false as written.

### Requirement: Environment configuration is validated and fails fast

The application SHALL read all deployment configuration from environment variables and SHALL
validate them through a single schema at startup. When a required variable is missing,
malformed, or a secret-like value is supplied to a public (client-exposed) variable, the
application SHALL fail with an explicit, named error rather than a generic `undefined` failure
later in the request path.

The required variables SHALL be: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY`.

#### Scenario: Required variable missing

- **WHEN** `SUPABASE_URL` is absent and configuration is read
- **THEN** validation fails with an error that names `SUPABASE_URL` as the missing variable

#### Scenario: Malformed Supabase URL

- **WHEN** `SUPABASE_URL` is set to a value that is not an `http`/`https` URL
- **THEN** validation fails with an error that names `SUPABASE_URL` as invalid

#### Scenario: Complete configuration

- **WHEN** all three required variables are present and well-formed
- **THEN** validation returns the parsed configuration and no error is raised

#### Scenario: No secret committed to the repository

- **WHEN** the repository is inspected at any commit
- **THEN** no real Supabase URL, anon key, or service-role key is present, and only a
  `.env.example` file with placeholder values is tracked

### Requirement: Application shell renders without a database

The application SHALL render its root layout and home route using only static code, with no
database, network, or session dependency. This makes the shell deployable and reviewable
before the persistence layer exists.

#### Scenario: Home route renders in a database-free environment

- **WHEN** the home route is requested in an environment with no database reachable
- **THEN** the route returns a successful response containing the application's primary
  heading and no unhandled error

#### Scenario: Production build succeeds

- **WHEN** the production build command is executed
- **THEN** it completes without error and reports the generated route table

### Requirement: Verified command surface

The repository SHALL expose separate, individually runnable commands for: dependency
installation, development server, production build, linting, formatting, type-checking, unit
tests, and integration tests. Each command SHALL be recorded in `AGENTS.md` together with what
it proves and what it explicitly does not prove, and SHALL only be recorded after being
executed successfully.

#### Scenario: Type-check reports a real type error

- **WHEN** a deliberate type error is introduced and the type-check command is run
- **THEN** the command exits non-zero and identifies the offending file

#### Scenario: Undocumented command is not treated as verified

- **WHEN** a command is not listed in `AGENTS.md` under a verified tool entry
- **THEN** the repository documentation makes no claim that the command passes

### Requirement: Continuous verification on every change

The repository SHALL run lint, formatting check, type-check, and the full test suite on every
push and pull request targeting the integration branch, so that a change cannot merge while a
verified command is failing.

#### Scenario: Failing test blocks the pull request

- **WHEN** a pull request introduces a failing test
- **THEN** the verification workflow reports a failure and the pull request is not green

#### Scenario: Passing change is verified

- **WHEN** a pull request is opened with no lint, type, or test failures
- **THEN** every step in the verification workflow reports success
