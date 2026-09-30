# ROADMAP.md

# Sadino Crowdsourcing Validation Platform

## Project Status

> This block is a **progress ledger owned by the root orchestrator**, not a behavioral
> specification. `AGENTS.md` and `openspec/` remain the source of truth for rules and for
> specified behavior. Reconcile this block against Git, OpenSpec, and the repository before
> trusting it.

| Field | Value |
| --- | --- |
| Current roadmap phase | Phase 3 — Landing and Screening — **implementing**. The Propose stage is merged (PR #11, `d111a9d`) and the Apply stage is in progress on `feat/landing-and-screening`. Sync and Archive have not run |
| Current OpenSpec change | `landing-and-screening`, unarchived in `openspec/changes/`. All 4 planning artifacts complete; `openspec validate landing-and-screening --strict` exits 0 |
| Lifecycle state | `implementing` — Apply in progress on `feat/landing-and-screening`. Independent verification has NOT yet run. This change is not verified and not archived |
| Completed milestones | Repository + roadmap + synthetic dataset bootstrap (`main` @ `81b3115`); Project Status ledger + roadmap reference reconciliation (PR #1, `567ab42`); `project-foundation` proposal (PR #2, `f451a01`); `project-foundation` implementation, review, sync, archive (PR #4, `b2128a4`); line-ending fix (PR #5, `53754de`); `od-dataset-schema-and-import` proposal (PR #6, `f14c0bb`); `od-dataset-schema-and-import` implementation + verification repairs (PR #7, `d2eea22`); `od-dataset-schema-and-import` Sync + Archive (PR #8, `1ed3340`); roadmap ledger reconciliation (PR #9, `1736b0b`); ledger self-reference fix (PR #10, `3518514`); `landing-and-screening` proposal (PR #11, `d111a9d`) |
| Last merged OpenSpec stage | #11 — `Merge pull request #11 from edisonmalasan/docs/landing-and-screening-proposal` (`d111a9d`), the `landing-and-screening` Propose stage. This field tracks the last merged **OpenSpec stage**, deliberately *not* the newest commit on `main` — see the note below the table |
| Doc-only PRs since that stage | #9 (`c6c743c`, merged `1736b0b`) and #10 (`35cee22`, merged `3518514`) — both reconciled this block against its own merge. No code, spec, or test change. Any further documentation-only PR appends one line here and changes nothing else |
| Next eligible objective | Finish the `landing-and-screening` Apply stage: independent verification, PR, merge commit, then Sync + Archive. Phase 4 (`coverage-aware-allocation`) becomes eligible only once this change is archived |
| Blockers | **No Supabase project credentials** — all three of `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are absent, so `getServerEnv()` throws `ServerEnvError` on every real request and no Supabase client has ever been constructed. See "Active Blockers" below. **Plus one new open decision needing thesis-team input: the anonymous identifier carries 32 bits of entropy** (see "Open Decisions") |

> **Why this block splits "OpenSpec stage" from "PR".** A block that names "the last merged PR"
> is self-referential: the PR that corrects the number is itself a PR, and its own merge falsifies
> the correction. PR #8 recorded #7, and the PR that fixed it (#9) then made #8 the stale value.
> Chasing that regress produces an endless sequence of PRs whose only content is the previous PR's
> number. So this block reports the last merged **OpenSpec stage** — a stable fact — and lists
> documentation-only PRs separately, where appending a line is honest rather than contradictory.
> The trade-off is that "Doc-only PRs since that stage" is not self-updating; read git history for
> the authoritative commit list.

### Archived Changes

| Change | Archived | Merged as | Notes |
| --- | --- | --- | --- |
| `project-foundation` | `openspec/changes/archive/2026-09-30-project-foundation/` | PR #3, `f43d722` | Synced into `openspec/specs/`: `application-foundation` (5 req), `design-system` (5), `domain-contracts` (7), `data-access-boundary` (4). Verified with a `PASS WITH WARNINGS` review; every finding repaired before merge (task group 7 in the archived `tasks.md`). |
| `od-dataset-schema-and-import` | `openspec/changes/archive/2026-09-30-od-dataset-schema-and-import/` | Apply stage merged by PR #7, `d2eea22` (merge commit; proposal was PR #6, `f14c0bb`). Sync + Archive merged by PR #8, `1ed3340` | Synced into `openspec/specs/`: `dataset-import` (3 req, new), `research-schema` (6 req, new), `domain-contracts` (1 requirement modified — the at-most-once rule flipped from "not yet implemented" to implemented). Verified with an independent `PASS WITH FINDINGS` review carrying one CRITICAL; the CRITICAL and all seven warnings and eight notes were repaired before the Apply merge. `openspec validate --specs --strict` reports **6 passed, 0 failed**. |

### Phase 2 verification approach (executed; hosted half still outstanding)

There are no Supabase credentials, so the schema, the import, and the 600-record verification are
proven against a **real PostgreSQL engine** (PGlite, PostgreSQL compiled to WebAssembly), which
evaluates the same SQL for constraints, foreign keys, and RLS policies. This converts "we have no
database, so we can check nothing" into "we can check the schema; only the hosted deployment is
unverified".

The import was deliberately split into a **pure parse** and a thin idempotent write so that the
PGlite verification and a future hosted run execute the same parsed records. An importer that
talked to Supabase directly would have left the whole Phase 2 deliverable unverifiable.

What remains for Phase 2: applying `supabase/migrations/` to a hosted Supabase project and
repeating the 600-record verification there. That is a deployment step, not a code step.

The three Supabase repositories under `src/lib/repositories/supabase/` are the other half of what
PGlite cannot reach. They are unit-tested against a recording fake — the fake asserts the *query
shape*, so an explicit column list, `head: true` on a count, and `maybeSingle()` over `single()`
are all checked — and none of that is evidence about PostgREST. Specifically unverified until a
project exists: that `.in()`, `.range()`, and `count: "exact"` behave as the code assumes, that a
uniqueness violation actually arrives with `code === "23505"` (the code is written to the
documented SQLSTATE, not to an observed payload), and this project's maximum rows per request, which
two methods depend on in order to detect truncation. The repositories are deliberately not
constructed at runtime anywhere yet.



While filing the Phase 1 archive, `pnpm run format:check` failed on all 56 formatter-owned files.
It was pre-existing — a clean `main` checkout failed identically. The repository had no
`.gitattributes`, so line endings were decided by each contributor's local `core.autocrlf`;
`.editorconfig` declared `end_of_line = lf` but git does not read `.editorconfig`.

The larger consequence was found while probing: a fresh clone on a machine with
`core.autocrlf=true` produced `data/ilocano-synthetic-data.json` with CRLF and SHA-256
`152ae7e8…` against the guard's expected `39f757e6…`. The immutability guard hashes the
working-tree file, so it would fail for autocrlf users and pass on CI. PR #5 adds
`.gitattributes` (`* text=auto eol=lf`, `*.ico binary`) and states `endOfLine` explicitly in
`.prettierrc.json`. A fresh clone with `core.autocrlf=true` now yields 0 CRLF and the expected
dataset hash. `git add --renormalize .` produced no index changes, proving the committed bytes
were already LF.

### Sync was performed by the archive step, not as a separate stage

`AGENTS.md` describes Sync and Archive as separate stages. They were run as one here, deliberately:
the OpenSpec CLI exposes no sync-without-archive command, and `openspec/archive` writes
`openspec/specs/*.spec.md` from the change's deltas. Hand-writing the main specs to keep the stages
apart would mean editing generated files by hand, which `AGENTS.md` forbids and which risks the
main specs and the deltas drifting. The archive branch therefore carries both operations, and the
synced specs are validated with `openspec validate --specs --strict` — **6 passed, 0 failed** (the four capabilities above plus
`dataset-import` and `research-schema`).

### Local Verification Evidence — `project-foundation` (2026-09-30)

Recorded so the ledger reflects observed results rather than intent. Every command below was
executed and exited 0 on Windows/PowerShell, Node.js `v26.10.0`, pnpm `12.6.0`.

| Command | Observed result |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm run lint` | exit 0, no errors or warnings |
| `pnpm run format:check` | exit 0, "All matched files use Prettier code style!" |
| `pnpm run typecheck` | exit 0 |
| `pnpm run test:unit` | exit 0 — 12 files, **244 tests passed** |
| `pnpm run test:integration` | exit 0 — 2 files, **18 tests passed** (real PostgreSQL via PGlite/WASM) |
| `pnpm run build` | exit 0 — Next.js 16.3.6 (Turbopack), routes `/` and `/_not-found` prerendered static |
| `openspec validate project-foundation --strict` | exit 0, "Change 'project-foundation' is valid" |

What this evidence explicitly does **not** establish:

- No Supabase client has ever been constructed at runtime, and no migration has ever been
  applied to a real project. `data/ilocano-synthetic-data.json` is byte-identical to `main`
  (guarded by SHA-256 in `tests/integration/immutable-dataset.test.ts`).
- PGlite proves SQL, constraints, and Row Level Security **as the PostgreSQL engine evaluates
  them**. It does not prove Supabase Auth, Storage, Realtime, PostgREST behavior, or RLS as
  enforced by the Supabase API gateway.
- `.github/workflows/verify.yml` passed on run 36614647692 (PR #3, `ubuntu-latest`) with counts
  matching local at that commit, and the dataset-guard job was confirmed from that run's log to be
  scoped to `1 file / 7 tests`. The job-selection defect found in an earlier run is fixed. No
  *failing* CI run has ever been observed, so "a failing test blocks the PR" is still inferred.
- There is **no screenshot-based or human-eye visual verification** of the design. No desktop
  browser was connected. The design was verified through rendered-HTML assertions, emitted-CSS
  inspection, and component markup tests. A human still needs to look at the landing page.
- `getServerEnv()` / `getClientEnv()` are covered only by type-check and by tests of their pure
  `parse*(source)` functions; the `process.env`-reading wrappers are not executed by any test.
- No repository *implementation* exists yet. `src/lib/repositories/` is interfaces only by design,
  so no persistence semantics (the `UNIQUE (validator_id, dataset_entry_id)` constraint, RLS, or
  distinct-validator coverage counting) are proven by anything in this change.

### Post-Implementation Review — `project-foundation` (2026-09-30)

An independent verification pass compared the implementation against all four capability specs and
all 26 tasks. Verdict: **PASS WITH WARNINGS**, with one CRITICAL that was an artifact conflict
rather than a code defect. All findings were repaired before merge; the repairs are itemised as task
group 7 in `openspec/changes/project-foundation/tasks.md`. The three that changed behavior:

- **The supported Node range was not enforced.** The `application-foundation` spec claimed "the
  package manager emits an engine mismatch error", but pnpm 12 does not: a probe declaring
  `engines.node: ">=99 <100"` installed with exit 0, with and without `engine-strict=true`. The
  scenario was empirically false. Fixed by adding `devEngines.runtime` with `onFail: "error"`,
  which verifiably fails (exit 1, naming both versions), and by correcting the scenario wording.
- **Body prose rendered below the declared 1rem floor.** `--text-small` was 0.9375rem (15px) and the
  landing page used it for whole paragraphs, while the token file's own comment claimed the floor
  "is enforced here". The class-string tests could not catch this because the class resolved to a
  legitimately named token. Raised to 1rem, and a test now reads `globals.css` and asserts every
  prose role against the floor.
- **The uniqueness-constraint requirement contradicted the change's own scope.** The
  `domain-contracts` delta demanded a data-layer `UNIQUE (validator_id, dataset_entry_id)`
  constraint "independently of application code", which the proposal and the design's non-goals both
  exclude. Rather than archive with an unmet requirement, it was split: the repository-level
  contract stays, the constraint and its PGlite proof are deferred to `od-dataset-schema-and-import`
  and listed under `tasks.md` -> "Deferred".

Carried into `od-dataset-schema-and-import` as required work, not as loose ends: the
`UNIQUE (validator_id, dataset_entry_id)` constraint with a PGlite assertion; the `supabase/`
repository implementations; the "preserve unknown fields" rule, which was a documented contract
with no implementation to assert it against; and the default `supabase/migrations/` applier path,
which had never run end to end because that directory was empty. All four are now delivered — see
the evidence section below.


### Local Verification Evidence — `od-dataset-schema-and-import` (2026-09-30)

Executed on Windows/PowerShell, Node.js `v26.10.0`, pnpm `12.6.0`, on `feat/od-dataset-schema-and-import`.

| Command | Observed result |
| --- | --- |
| `pnpm run lint` | exit 0, no errors or warnings |
| `pnpm run format:check` | exit 0, **after** `prettier --write` on two files (see below) |
| `pnpm run typecheck` | exit 0 |
| `pnpm run test:unit` | exit 0 — 14 files, **312 tests passed** |
| `pnpm run test:integration` | exit 0 — 4 files, **69 tests passed** (real PostgreSQL via PGlite/WASM) |
| `pnpm run build` | exit 0 — Next.js 16.3.6 (Turbopack), routes `/` and `/_not-found` prerendered static |
| `openspec validate od-dataset-schema-and-import --strict` | exit 0, "Change 'od-dataset-schema-and-import' is valid" |

An independent verification pass (a separate agent with no stake in the implementation) returned
**PASS WITH FINDINGS, one CRITICAL**. The CRITICAL was a real defect in a *specification*: the
`research-schema` delta claimed a denied `update` or `delete` under Row Level Security "fails
loudly". Measured against a real engine, only `insert` raises — `select`, `update`, and `delete` are
all filtered to zero rows with no error. A throwaway probe test measured all four statement kinds
for all three roles and confirmed the data was untouched. The spec now carries the measured table
and a scenario that states the silent case plainly, and the migration's header comment was rewritten
to match rather than to sound better than it is. This is also the sharpest reason the repository
contract forbids reading an unremarkable write as success: `SupabaseValidatorsRepository
.touchLastActive` is an `update`.

The verification pass raised seven warnings and eight notes. All were repaired before this evidence
was written, and each is recorded in
`openspec/changes/archive/2026-09-30-od-dataset-schema-and-import/tasks.md`
against the task it corrects, because a reviewer who cannot see why a task was annotated cannot tell
a deliberate decision from an oversight:

- Three were **claims the code did not support**: task 4.7 was ticked although nothing asserted the
  source file is never *opened* for writing (the SHA-256 comparison proves the content, not the
  absence of a write path — a new source scan now does, proved load-bearing by injecting a
  `writeFile` import); task 7.8 described `countForEntry` as a count of *distinct* validators when
  it is a plain row count made equivalent by the uniqueness constraint; and the `dataset-import`
  spec said the stored record is "byte-equivalent in content" to the source, which `jsonb` cannot
  promise, since it preserves neither key order nor insignificant whitespace.
- Two were **spec-versus-implementation contradictions**: the structural tables
  (`validation_sessions`, `validation_batches`, `batch_entries`) carried `started_at`, `ended_at`,
  `requested_size` with a `1..50` check, `created_at`, `completed_at`, and `assigned_at` — all
  lifecycle claims the spec forbids and design D3 explains why. All were removed and two closed-set
  tests now pin the exact columns and assert via `pg_constraint` that these tables define no `CHECK`
  constraint at all. And every `expectRejected` pattern ended in `|check constraint`, so the wrong
  constraint firing would still have matched; each now names its constraint, which required probing
  the engine to learn that every violation message names it.
- One was **order dependence** in the import integration test: three tests only passed because of
  the order they ran in, including the one asserting "600 inserted". Each test now resets and
  imports for itself, verified by running the file under two different `--sequence.shuffle` seeds.

`format:check` failed twice on files this change had already committed — first on four files
(`synthetic-source.ts`, `migrations/README.md`, and both `dataset-import.test.ts` files), then on
the two integration test files after the verification repairs. Both times the cause was committing
without running the gate, which is the failure mode `AGENTS.md` warns about: a green build is not a
green format check. Fixed with `prettier --write` each time; the resulting diff was inspected, and
each touched file re-checked for a BOM, for CRLF, and for U+FFFD — the corruption signature that hit
`AGENTS.md` and `migrations/README.md` in an earlier change.

Assertions proved load-bearing by temporarily breaking the implementation, confirming the expected
tests go red, and restoring it. `openspec/changes/archive/2026-09-30-od-dataset-schema-and-import/tasks.md`
tasks 9.8,
9.9, and 9.12 record exactly which tests failed in each case; the source-write scan added during
verification was proved the same way. A test that has never failed is not known to test anything.

Dataset immutability re-confirmed on this branch: `git hash-object` reports
`acaaa05ac83c3a67f9eb1e81b4432d4b11da6263` (identical to `main`), SHA-256 is
`39F757E61B70386B87EC1BB9410E881DF342027BF580BED9C2F9BEEB2F2E8965`, and `git diff main -- data/` is
empty.

What this evidence explicitly does **not** establish:

- No Supabase client has ever been constructed at runtime and no migration has ever been applied to
  a real project. PostgREST behaviour — including whether a uniqueness violation reports
  `code === "23505"`, whether `.range()` and `count: "exact"` behave as the code assumes, and what
  this project's maximum rows per request is — remains written to documentation, not to observation.
- RLS is proved as the *PostgreSQL engine* evaluates it, through PGlite. Not as the Supabase API
  gateway enforces it. No `authenticated` policy exists yet, by design.
- The three cross-column consistency constraints on `validations` are proved against PGlite only,
  and their correspondence with `applyValidationIntegrityRules` in `@/schemas/validation` is held by
  review rather than by anything executable. They are the same rules stated twice, which is the
  duplication that it is, and the error direction is asymmetric: a constraint that drifts narrower
  lets an invalid row exist, one that drifts wider refuses a real research response. The vocabulary
  *acceptance* tests added during verification read their expected values from the shipped domain
  modules rather than retyping them, so a divergence between SQL and the domain is now caught for
  the accepted values too — but only for the values those modules currently declare.
- The repositories are exercised only against a recording fake. The fake asserts query *shape*; it
  cannot report what a server did with the query.
- `DatasetEntrySink` has no production implementation. The interface and both of its contract clauses
  are proven against a real engine by a test-local sink, but the repository contains no
  Supabase-backed one, so tasks 5.2 and 5.3 are a decided and proven *contract* rather than
  shipping code. Recorded in this change's `tasks.md` under "Explicitly not done here".
- There is still **no screenshot-based or human-eye visual verification** of the landing page, and
  no Vercel deployment — `next start` has never been run.


### Active Blockers

- **No Supabase project credentials.** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY` are absent from the environment and from the repository.
  Schema migrations and application code can be authored and reviewed, but migrations cannot
  be applied and database behavior cannot be verified end to end until a project exists.
  Required to unblock Phase 2+ runtime verification: a Supabase project the team controls,
  with migrations applied via the Supabase CLI or the hosted SQL editor.
- **No local container/PostgreSQL runtime.** `docker`, `psql`, and the `supabase` CLI are not
  installed on this machine, so `supabase start` (local Supabase) is not available as a
  substitute.
  - *Mitigation delivered in `project-foundation`:* a `@electric-sql/pglite` (real PostgreSQL
    compiled to WASM) integration harness now exists, so schema, constraint, and transactional
    logic can be applied and asserted in CI without a container.
    `pnpm run test:integration` exits 0 with 69 passing tests against a real engine, applied from
    the production `supabase/migrations/` directory. The remaining unverified surface is
    Supabase-managed behavior (Auth, Storage, Realtime, the `auth` schema, PostgREST, and RLS as
    enforced by the Supabase API gateway) and the first real migration deploy.
  - *Mitigated, with a caveat recorded:* CI can prove SQL and RLS, and `.github/workflows/verify.yml`
    passed on run 36628918700 (PR #8, `ubuntu-latest`): 14 files / 312 unit tests and 4 files / 69
    integration tests, matching the local counts of the same commit, plus "Compiled successfully"
    for the production build. The preceding run 36628108347 (PR #7) passed with identical counts.
    That run's dataset-guard job was read back from the log and confirmed scoped to
    `1 file / 7 tests` against the literal command
    `pnpm exec vitest run --project integration tests/integration/immutable-dataset.test.ts`. An
    earlier run had exposed a
    defect in the workflow itself — the guard job's path filter was dropped on Linux, so it ran the
    whole integration suite instead of the file it claimed to isolate. Green did not mean correct.
    No *failing* CI run has ever been observed, so "a failing test blocks the PR" remains inferred.

### Planned Change Sequence

The roadmap is executed as a sequence of bounded OpenSpec changes, one architectural step
each, in dependency order. Items 1 and 2 are delivered and archived; item 3 is next and has not
been proposed yet.

1. ~~`project-foundation`~~ — Phase 1: Next.js/TypeScript/Tailwind shell, design tokens, lint,
   test harness, Zod schemas, Supabase client boundary. **Delivered and archived.**
2. ~~`od-dataset-schema-and-import`~~ — Phase 2: migrations for the six tables, constraints,
   indexes, RLS, and import/verification of the 600 `OD_*` entries. **Delivered and archived**
   (spec-level only; the hosted half is still outstanding — see "Active Blockers").
3. `landing-and-screening` — Phase 3: landing, Ilocano proficiency screening, anonymous
   validator create/restore. **Next.**
4. `coverage-aware-allocation` — Phase 4: server-authoritative batch allocation engine.
5. `validation-experience` — Phase 5: per-entry validation, conditional correction, optional
   translation, immediate persistence.
6. `batch-continuation` — Phase 6: batch completion, continue-or-finish, interrupted-batch
   recovery.
7. `admin-dashboard` — Phase 7: protected researcher dashboard.
8. `export-system` — Phase 8: research-data export pipeline.
9. `quality-assurance` — Phase 9: cross-cutting QA/verification hardening.

### Open Decisions (do not block development)

These correspond to Phase 0 and require thesis-team/adviser input. The roadmap explicitly
allows development to proceed before they are finalized; they are not implemented as
assumptions and must be confirmed before production crowdsourcing (Phase 11):

- target independent validations per entry (planning default: 3, kept configurable);
- which proficiency levels count as *eligible* validations;
- whether `Conversational` validators are eligible;
- disagreement/adjudication rules;
- **anonymous-identifier entropy** (raised by Phase 3, needs a decision before Phase 11).
  The identifier is `VAL_` plus four random bytes, so 32 bits. `createAnonymousValidatorId` and
  the `validators` primary key both pin the 8-hex-character format, so widening it is a
  migration against an already-archived spec rather than a field to change quietly. 2^32 is
  brute-forceable by a determined party against a reachable enrollment surface. The identifier
  is not a credential — it grants no access beyond resuming an anonymous session — but a
  successful guess would let someone continue as another participant and contaminate that
  participant's research record. The right answer depends on the participation model (a
  link-shared pilot versus a public deployment) and on whether an enumeration rate limit is in
  scope, neither of which this repository can decide. Interim mitigation, in place since Phase 3:
  resume is the only surface that accepts a client-supplied identifier, and it answers a
  yes/no question with no distinguishing error;- whether optional translations enter the final dataset;
- whether any demographic data is academically required;
- whether ethics/consent language is required before participation.

### Local Verification Evidence — `landing-and-screening` (2026-09-30, Apply stage)

Recorded from the commands actually run on Windows/PowerShell, Node.js `v26.10.0`, pnpm `12.6.0`.
**This change is still in Apply. It has not been independently verified and is not archived.**

| Command | Observed result |
| --- | --- |
| `pnpm run lint` | exit 0, no errors, no warnings |
| `pnpm run format:check` | exit 0, "All matched files use Prettier code style!" |
| `pnpm run typecheck` | exit 0 |
| `pnpm run test:unit` | exit 0 — 20 files, **445 tests passed** (up from 14 files / 312) |
| `pnpm run test:integration` | exit 0 — 4 files, **69 tests passed** (unchanged; this change adds no migration) |
| `pnpm run build` | exit 0, "Compiled successfully"; `/`, `/_not-found`, `/ready`, `/start` all prerendered static |
| `openspec validate landing-and-screening --strict` | exit 0, "Change 'landing-and-screening' is valid" |
| `openspec validate --specs --strict` | "Totals: 6 passed, 0 failed (6 items)" — the six main specs are untouched by an unarchived change |

What this evidence explicitly does **not** establish:

- **No Supabase client has ever been constructed.** All three of `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are absent, so `getServerEnv()` throws
  `ServerEnvError` on every real request. The enrollment and resume logic is proven against an
  in-memory fake with exact-value assertions; the hop from the repository to PostgREST is
  unexercised, exactly as in Phase 2. The action logic was deliberately split into
  `onboarding-actions-core.ts` (pure, injected dependencies) and a `"use server"` wrapper precisely
  so that no test needs a database, and so that no test can be mistaken for one that reached one.
- **No browser ever rendered any of this.** `renderToStaticMarkup` produces the HTML a server
  render would. It does not run effects, does not fire click handlers, and does not execute the
  Server Action round trip. The submit-time resume check, the `localStorage` write, and the
  navigation to `/ready` are proven by pure decision functions and unit tests on
  `browser-identity`, not by anything that clicked a button.
- **A successful build is not a behavioural result.** It proves four routes compile. The 445
  unit tests and the probe run below are the behavioural evidence.
- **WCAG contrast is inferred from token values, not measured.** There is still no human visual
  review of any screen, and `next start` has still never been run.

#### Load-bearing proof

15 deliberate single-line breaks of this change's guarantees, each reverted immediately.
**14 turned the suite red in the expected file.** The one that did not is recorded rather than
hidden: removing the Server Action's identifier check changes no behaviour, because
`isAnonymousValidatorIdFormat` inside the service rejects the same values from the same
`ANONYMOUS_VALIDATOR_ID_PATTERN`. So the check is a duplicate, not a boundary. It was kept and
relabelled in `onboarding-actions-core.ts` as what it actually is — a narrowing parse from
`unknown` to the branded type, with no cast — and a new test
(`tests/unit/validators-identifier-format.test.ts`, 4 valid and 17 near-miss inputs) now pins
that the two format checks agree, so a future second pattern definition cannot make them diverge
silently.

Two defects in the probe harness itself were found and fixed, both of which had briefly produced
false evidence. Worth recording because both are easy to repeat:

1. The first harness restored files with `git checkout --`, which does nothing for an untracked
   file. Three breaks leaked into later probes and inflated the failure counts. Replaced with
   in-memory content restore.
2. The first harness scored a suite that failed to **collect** as "did not go red". A probe
   referencing an unimported component threw at collection time, Vitest reported "no tests", and
   the probe was recorded as a pass. The harness now reports collection failure as its own
   outcome, because *no tests* is not *passed*.

A residue check confirmed all nine probed files were byte-identical afterwards.

#### Phase 3 architecture decisions worth reviewing

- **Screening is answered before the identifier exists** and rides in the single `create` write.
  Creating first and recording proficiency second would need a repository method that does not
  exist, cost two writes, and leave a participant holding an identity with no screening answer if
  they abandoned the flow. This is why the change adds **no migration and no new
  `ValidatorsRepository` method**: the nullable `ilocano_proficiency` column already models the
  state, and this ordering makes it reachable only by *declining*, never by *abandoning*.
- **`localStorage`, not an httpOnly cookie.** A cookie would let the server render "welcome
  back" with no round trip, but it would transmit the identifier on every request to the origin
  — a worse fit for a project whose headline property is anonymity. The cost is that resume is
  an explicit client action, which also means a shared device never silently hands one person
  another's session.
- **Resume is checked at submit time, not revealed on load.** A load-time reveal needs a
  post-hydration `setState`, which the React lint rules rightly reject. Checking at submit time
  is a plain synchronous read and also closes a real hole: a participant who already holds an
  identity and submits the screening form must not be issued a second one, because that would
  split one person's research record in two with nothing in the stored data able to tell.

## 1. Project Goal

Build a lightweight crowdsourcing website for validating the synthesized Ilocano navigation dataset used by the Sadino thesis project.

The website will present synthetic Ilocano navigation instructions to human validators, collect structured judgments, request corrections when needed, optionally collect natural translations, and store all responses for later research analysis and final dataset construction.

The platform should be easy to deploy, easy to use on mobile devices, and simple enough that validators can complete repeated 10-item batches without fatigue.

---

## 2. Core Product Principles

### Research-first
The website exists to collect reliable validation data. Visual design should support accuracy, readability, and low cognitive load.

### Anonymous by default
Do not require personally identifying information unless the thesis methodology later requires it.

Each validator receives an anonymous identifier such as:

```json
{
  "validator_id": "VAL_a81d92c1"
}
```

### Small-batch participation
No validator is expected to review the full dataset.

Validators receive 10 entries per batch and may either:

- validate another batch of 10; or
- finish for the current session.

### Independent validation
The same dataset entry may be shown to multiple different validators.

The same validator should not receive the same entry more than once.

### Preserve raw synthetic data
Never overwrite the original synthesized dataset.

The platform stores validation responses separately and produces the final validated dataset only after research review or adjudication.

---

## 3. Approved Technology Stack

### Application
- Next.js
- TypeScript
- App Router

### Styling
- Tailwind CSS
- shadcn/ui where useful
- Custom soft neo-brutalist design system

### Backend and Database
- Supabase
- PostgreSQL
- Supabase server/client libraries

### Validation
- Zod

### Hosting
- Vercel

### Repository
- GitHub

### Intended Agent / Frontend Skills

Use the following skills when they are available in the coding environment:

- `industrial-brutalist-ui` — primary visual foundation for the soft neo-brutalist interface.
- `high-end-visual-design` — refinement layer for spacing, hierarchy, polish, restraint, and overall visual quality.
- `full-output-enforcement` — helps ensure implementation work is complete rather than placeholder-driven or partially finished.
- `design-taste-frontend` — optional and primarily intended for the public landing/introduction experience, not as the governing skill for the multi-step validation workflow.

#### Skill hierarchy

When multiple design skills are active, apply them in this order of responsibility:

1. **`industrial-brutalist-ui`** defines the core visual language.
2. **`high-end-visual-design`** softens and refines that language into a polished, accessible soft neo-brutalist experience.
3. **`full-output-enforcement`** governs implementation completeness.
4. **`design-taste-frontend`** may enhance the landing page, but must not override the approved validation flow or research UX constraints.

The implementation model must interpret these skills with the following project-specific instruction:

> Use `industrial-brutalist-ui` as the visual foundation and `high-end-visual-design` as the refinement layer. The target aesthetic is strictly **soft neo-brutalism**. Preserve creative freedom over layout, composition, component placement, spacing, responsive arrangement, visual rhythm, and decorative treatment. Do not mechanically copy a reference layout. Usability, accessibility, readability, and validation accuracy take priority over visual experimentation.

Do not let any skill override the approved product behavior in this roadmap. In particular, screening order, anonymous validator handling, batch allocation, validation choices, correction requirements, translation behavior, persistence rules, and batch continuation are product requirements rather than creative design decisions.

---

## 4. Visual Design Direction

The visual design is **strictly soft neo-brutalism**.

The implementation model should have creative freedom over:
- component placement;
- composition;
- spacing;
- responsive arrangement;
- visual rhythm;
- decorative treatment;
- exact landing-page composition;
- interaction presentation.

Do **not** prescribe a rigid pixel-by-pixel layout in advance.

The design must still follow these constraints:

- bold, visible borders;
- hard offset shadows;
- tactile buttons and controls;
- strong typographic hierarchy;
- warm or light neutral backgrounds;
- restrained accent colors;
- slightly softened corners;
- generous whitespace;
- clear focus states;
- mobile-first responsive behavior;
- subtle and fast motion;
- readable body text;
- accessible contrast;
- no chaotic or overly aggressive brutalist treatment.

Avoid:
- military or terminal aesthetics;
- excessive black/red styling;
- giant novelty typography for body content;
- unnecessary animation;
- excessive decorative noise;
- layouts that make validation harder;
- visual choices that bias users toward a particular answer.

The interface should feel playful and memorable without looking like a conventional Google Form.

---

## 5. Current Dataset

The first supported category is:

**Origin + Destination**

Current synthetic dataset file:

```text
data/ilocano-synthetic-data.json
```

Current record schema:

```json
{
  "id": "OD_0001",
  "instruction": "Synthetic Ilocano navigation instruction",
  "output": {
    "origin": "Origin Place",
    "destination": "Destination Place",
    "transit_mode": null
  }
}
```

The architecture must not be hard-coded only for `OD_*` records.

The long-term system should support all five dataset categories through a shared dataset-entry model.

---

# 6. User Flow

## 6.1 Landing Page

Purpose:
- explain what Sadino validation is;
- explain that participation is voluntary;
- explain that validators will review short Ilocano navigation sentences;
- explain that each round contains 10 entries;
- provide a clear Start Validation action.

Keep the explanation short enough to understand in a few seconds.

---

## 6.2 Validator Screening

Before receiving dataset entries, ask:

> **How comfortable are you with Ilocano?**
>
> This helps us understand the background of our validators.
>
> - Native / first-language speaker
> - Fluent
> - Conversational
> - Basic
> - Not confident

Store the answer as a self-reported validator attribute.

Example:

```json
{
  "validator_id": "VAL_a81d92c1",
  "ilocano_proficiency": "fluent"
}
```

Do not automatically treat proficiency as a quality score.

The thesis team will determine later which proficiency levels count toward the required number of independent validations.

---

## 6.3 Anonymous Validator Creation

When a new participant begins:

1. Generate an anonymous validator ID.
2. Store it in the database.
3. Store the ID locally in the browser.
4. Reuse the same ID on later visits when possible.
5. Do not ask for name, email, student ID, phone number, or other identifying information unless explicitly required by the research methodology.

---

## 6.4 Batch Assignment

Each batch contains:

```text
10 dataset entries
```

The backend, not the frontend, decides which entries are assigned.

Assignment should be **coverage-aware randomized distribution** rather than pure random selection.

### Allocation rules

For a validator requesting a batch:

1. Exclude entries already answered by that validator.
2. Exclude entries that have already reached the configured target number of eligible independent validations.
3. Prioritize entries with the lowest validation count.
4. Randomize entries within the lowest-count candidate pool.
5. Return up to 10 entries.
6. Reserve or assign those entries to the active batch.

Different validators are allowed and expected to receive the same dataset entry.

The same validator must not validate the same entry twice.

Recommended database constraint:

```text
UNIQUE (validator_id, dataset_entry_id)
```

### Initial validation target

Use a configurable target, initially:

```text
3 independent validators per entry
```

This value must be configurable because the final number should be approved by the thesis team/adviser.

---

## 6.5 Validation Screen

For each assigned entry, display:

- the Ilocano instruction;
- intended origin;
- intended destination;
- category if useful;
- batch progress;
- four evaluation choices.

Question:

> **Does the Ilocano sentence correctly express the intended information?**

Choices:

- Correct and natural
- Correct but sounds unnatural
- Incorrect
- Cannot confidently evaluate

The frontend model may creatively decide how to arrange these elements, provided the hierarchy remains clear and the interface stays accessible.

---

## 6.6 Conditional Correction

### If `Correct and natural`
No correction is required.

Proceed to the optional translation step.

### If `Correct but sounds unnatural`
Require:

> Provide a more natural Ilocano version.

The validator must enter a corrected/rephrased Ilocano sentence before continuing.

### If `Incorrect`
Require:

> Provide the corrected Ilocano version.

The validator must enter a corrected Ilocano sentence before continuing.

### If `Cannot confidently evaluate`
Do not require a correction.

Skip translation and proceed to the next dataset entry.

---

## 6.7 Optional Translation

Translation is optional.

Only show the translation step after the validator has completed the Ilocano validation path.

Ask:

> **Would you like to provide a natural translation?**

Choices:

- English
- Filipino
- Skip translation

If English or Filipino is selected, show a text field for the translation.

Translation should not replace the Ilocano validation. It is supplementary data.

---

## 6.8 Saving Strategy

Save progress after every completed entry.

Do not wait until all 10 entries are finished before persisting responses.

Benefits:
- browser closure does not lose completed work;
- mobile connection interruptions lose less data;
- partial sessions remain usable;
- batch recovery becomes possible.

---

## 6.9 Batch Completion

After 10 entries:

Show a completion state with:

- number validated in the batch;
- validator's total contribution count;
- option to validate another 10;
- option to finish.

Example behavior:

```text
Batch complete

You validated 10 sentences.
Total contributions: 30

[ Validate 10 More ]
[ Finish For Now ]
```

If the validator continues, request a new coverage-aware batch.

If the validator finishes, retain all submitted responses.

---

# 7. Recommended Data Model

## 7.1 `dataset_entries`

Stores imported synthetic data.

Suggested fields:

```text
id
category
instruction
origin
destination
transit_mode
created_at
is_active
```

Example:

```json
{
  "id": "OD_0123",
  "category": "origin_destination",
  "instruction": "...",
  "origin": "...",
  "destination": "...",
  "transit_mode": null
}
```

---

## 7.2 `validators`

Stores anonymous validator profiles.

Suggested fields:

```text
id
ilocano_proficiency
created_at
last_active_at
total_validations
```

Do not store personally identifying information by default.

---

## 7.3 `validation_sessions`

Represents one site session or one contribution run.

Suggested fields:

```text
id
validator_id
started_at
completed_at
status
```

Possible status values:

```text
active
completed
abandoned
```

---

## 7.4 `validation_batches`

Represents a batch of up to 10 assigned entries.

Suggested fields:

```text
id
validator_id
session_id
created_at
completed_at
status
```

---

## 7.5 `batch_entries`

Tracks which entries were assigned to a batch.

Suggested fields:

```text
batch_id
dataset_entry_id
position
assigned_at
completed_at
```

This prevents accidental reordering or reassignment while a validator is already working through a batch.

---

## 7.6 `validations`

Stores the actual human judgment.

Suggested fields:

```text
id
validator_id
session_id
batch_id
dataset_entry_id
evaluation
corrected_instruction
translation_language
translation_text
created_at
updated_at
```

Allowed `evaluation` values:

```text
correct_natural
correct_unnatural
incorrect
cannot_evaluate
```

Example:

```json
{
  "validator_id": "VAL_a81d92c1",
  "entry_id": "OD_0123",
  "evaluation": "correct_but_unnatural"
}
```

Expanded internal database representation may include correction and translation fields.

---

# 8. Validation Integrity Rules

Implement the following rules at both application and database levels where possible.

### Rule 1
A validator cannot validate the same dataset entry twice.

### Rule 2
A validation must reference an existing dataset entry.

### Rule 3
`correct_unnatural` requires a corrected Ilocano instruction.

### Rule 4
`incorrect` requires a corrected Ilocano instruction.

### Rule 5
`cannot_evaluate` must not require correction.

### Rule 6
Translation is optional.

### Rule 7
Translation language can only be:

```text
english
filipino
null
```

### Rule 8
Do not alter the original synthetic instruction when a validator submits a correction.

### Rule 9
Store each validator's correction separately.

### Rule 10
Completion counts must be based on unique independent validators, not raw duplicate submissions.

---

# 9. Validation Coverage Logic

For each dataset entry, the system should be able to determine:

```text
total validations
eligible validations
correct-natural count
correct-unnatural count
incorrect count
cannot-evaluate count
```

The site should distinguish between:

### Pending
The entry has not yet received the required number of eligible independent validations.

### Coverage complete
The entry has reached the configured target number of eligible independent validations.

### Requires research review
The entry has sufficient validations but contains meaningful disagreement or competing corrections.

Do not automatically create the final validated Ilocano sentence solely through majority voting unless the thesis methodology explicitly approves that rule.

---

# 10. Researcher / Admin Dashboard

Create a protected admin area for the thesis team.

Minimum dashboard features:

### Overview
- total synthetic entries;
- total validations;
- total validators;
- active dataset categories;
- overall completion percentage.

### Coverage
- entries with 0 validations;
- entries with 1 validation;
- entries with 2 validations;
- entries with target validation count;
- entries beyond target if manually allowed.

### Evaluation distribution
- correct and natural;
- correct but unnatural;
- incorrect;
- cannot confidently evaluate.

### Proficiency breakdown
- native / first-language speaker;
- fluent;
- conversational;
- basic;
- not confident.

### Entry review
Researchers should be able to inspect one dataset entry and see:

```text
Original synthetic instruction
Origin
Destination
Transit mode

Validator A
Proficiency
Evaluation
Correction
Translation

Validator B
Proficiency
Evaluation
Correction
Translation

Validator C
Proficiency
Evaluation
Correction
Translation
```

### Filters
Allow filtering by:

- category;
- validation status;
- validation count;
- evaluation;
- validator proficiency;
- entries requiring review.

### Export
Support export of:

- raw validation responses;
- per-entry validation summaries;
- final adjudicated dataset;
- JSON;
- CSV where useful.

---

# 11. Final Dataset Workflow

The platform should maintain a clear separation between:

```text
Synthetic dataset
       ↓
Human validation responses
       ↓
Research review / adjudication
       ↓
Final validated dataset
```

Never mutate the imported source dataset in place.

The final validated JSON should be generated only after the thesis team defines and applies its adjudication rules.

The final export should preserve the schema expected by the model-training pipeline.

---

# 12. Security and Privacy

### Public validation area
- no direct database credentials in the browser;
- validate all writes server-side;
- rate-limit suspicious submission patterns where practical;
- sanitize text input;
- use Zod schemas for request validation;
- use Supabase Row Level Security where appropriate.

### Admin area
- protected authentication;
- only approved research team members can access raw validation records and exports.

### Privacy
By default, do not collect:
- full name;
- email;
- student ID;
- phone number;
- address;
- social-media account.

If personally identifiable or demographic information is later required, update the methodology, consent flow, database schema, and privacy notice before collection.

---

# 13. Accessibility and UX Requirements

The site should be usable on:
- smartphones;
- tablets;
- laptops;
- desktop browsers.

Requirements:

- large tap targets;
- keyboard navigation;
- clear focus states;
- sufficient contrast;
- readable font sizes;
- semantic form controls;
- screen-reader labels;
- no essential information conveyed only by color;
- responsive layout;
- no forced hover interaction;
- no horizontal scrolling during validation;
- clear progress indication;
- confirmation before losing unfinished correction text where appropriate.

---

# 14. Suggested Application Routes

The exact page composition is intentionally left to the implementation model.

Suggested route responsibilities:

```text
/
Landing / introduction

/start
Screening and anonymous validator setup

/validate
Active validation batch

/complete
Batch completion / continue-or-finish state

/admin
Research dashboard

/admin/entries
Dataset coverage and entry review

/admin/validators
Anonymous validator statistics

/admin/export
Dataset and validation exports
```

Route naming may change if a cleaner implementation is discovered.

---

# 15. Recommended Project Structure

The implementation model may refine this structure.

```text
src/
  app/
    (public)/
    (validation)/
    admin/
    api/

  components/
    validation/
    screening/
    progress/
    admin/
    ui/

  lib/
    supabase/
    validation/
    allocation/
    datasets/
    exports/

  schemas/
    validator.ts
    validation.ts
    dataset.ts

  types/

  styles/

supabase/
  migrations/
  seed/

data/
  data/ilocano-synthetic-data.json
```

---

# 16. Development Phases

## Phase 0 — Methodology Confirmation

Before production crowdsourcing begins, confirm with the thesis team/adviser:

- target number of independent validators per entry;
- which Ilocano proficiency levels count toward the target;
- whether `Conversational` validators are considered eligible;
- disagreement/adjudication rules;
- whether optional translations will be used in the final dataset;
- whether any demographic information is academically required;
- whether ethics/consent language is required before participation.

Development may begin before all of these are finalized, but production data collection should not.

---

## Phase 1 — Project Foundation

Tasks:

- initialize Next.js + TypeScript project;
- configure Tailwind;
- configure shadcn/ui if used;
- configure Supabase project;
- configure environment variables;
- establish soft neo-brutalist design tokens;
- set up linting and formatting;
- define shared TypeScript types;
- define Zod schemas.

Deliverable:

```text
Deployable application shell
```

---

## Phase 2 — Database and Dataset Import

Tasks:

- create database migrations;
- create `dataset_entries`;
- create `validators`;
- create `validation_sessions`;
- create `validation_batches`;
- create `batch_entries`;
- create `validations`;
- add constraints and indexes;
- import `data/ilocano-synthetic-data.json`;
- verify all 600 records;
- add category support.

Deliverable:

```text
Supabase database containing the Origin + Destination dataset
```

---

## Phase 3 — Landing and Screening

Tasks:

- build public landing experience;
- explain crowdsourcing task;
- build Ilocano proficiency screening;
- generate anonymous validator IDs;
- persist validator ID locally;
- create or restore validator record;
- add basic participation/privacy notice.

Deliverable:

```text
User can start as an anonymous validator
```

---

## Phase 4 — Allocation Engine

Tasks:

- implement coverage-aware assignment;
- exclude previously answered entries;
- prioritize lowest validation count;
- randomize candidate selection;
- create 10-entry batch;
- reserve batch entries;
- prevent duplicate validator-entry assignments;
- make target validation count configurable.

Deliverable:

```text
A validator receives a valid randomized 10-entry batch
```

---

## Phase 5 — Core Validation Experience

Tasks:

- display one entry at a time;
- show instruction + intended origin + destination;
- show progress;
- implement four evaluation choices;
- implement conditional correction;
- implement optional translation;
- save each completed response immediately;
- support safe navigation between entries in the active batch;
- prevent invalid submissions.

Deliverable:

```text
Complete end-to-end human validation flow
```

---

## Phase 6 — Batch Completion and Continuation

Tasks:

- build batch-complete state;
- show contribution count;
- allow `Validate 10 More`;
- allow `Finish For Now`;
- create a new batch when continuing;
- restore interrupted active batches where practical.

Deliverable:

```text
Continuous voluntary crowdsourcing loop
```

---

## Phase 7 — Admin Dashboard

Tasks:

- protect admin routes;
- implement overview statistics;
- implement coverage visualization;
- implement entry-level review;
- show validator proficiency metadata;
- show submitted corrections;
- show translations;
- flag disagreement/review cases;
- add useful filters and search.

Deliverable:

```text
Research team can monitor validation progress and inspect responses
```

---

## Phase 8 — Export System

Tasks:

- export raw validations;
- export validation summaries;
- export category-specific data;
- add JSON export;
- add CSV export where useful;
- prepare final-dataset export pipeline;
- keep final adjudication logic configurable.

Deliverable:

```text
Research-ready dataset exports
```

---

## Phase 9 — Quality Assurance

Test:

### Dataset
- all imported records exist;
- IDs remain unique;
- categories are correct;
- source data is unchanged.

### Assignment
- same validator never receives duplicate entry;
- different validators can receive same entry;
- lowest-coverage entries are prioritized;
- completed entries stop being assigned when appropriate.

### Validation
- conditional fields work correctly;
- correction is required for unnatural/incorrect;
- translation remains optional;
- cannot-evaluate skips correction/translation;
- progress is saved after each item.

### UX
- mobile;
- tablet;
- desktop;
- keyboard;
- slow connection;
- page refresh;
- interrupted batch.

### Security
- unauthorized users cannot access admin;
- invalid writes are rejected;
- duplicate validation attempts fail;
- server-side validation is enforced.

Deliverable:

```text
Production candidate
```

---

## Phase 10 — Pilot Validation

Before full crowdsourcing:

1. Recruit a small pilot group.
2. Ask them to validate a limited number of entries.
3. Observe confusion points.
4. Review corrections and answer patterns.
5. Verify randomization and coverage.
6. Verify database integrity.
7. Review whether validators understand the four evaluation choices.
8. Review whether the visual design causes any answer bias.
9. Adjust copy or flow if necessary.
10. Freeze the production validation protocol.

Deliverable:

```text
Approved production validation workflow
```

---

## Phase 11 — Production Crowdsourcing

Tasks:

- deploy production site;
- distribute validation link;
- monitor coverage;
- monitor error logs;
- monitor suspicious duplicate behavior;
- monitor category balance;
- periodically export backups;
- stop assigning entries when target coverage is reached.

Deliverable:

```text
Collected crowdsourced validation dataset
```

---

## Phase 12 — Research Review and Finalization

After enough responses are collected:

- identify agreement cases;
- identify disagreement cases;
- review submitted corrections;
- apply thesis-approved adjudication rules;
- determine final validated Ilocano instruction;
- retain provenance linking final records to source entries and validator responses;
- export final validated dataset;
- document methodology and counts for the thesis.

Deliverable:

```text
Final validated Ilocano dataset
```

---

# 17. MVP Scope

The first usable MVP should include only:

- Origin + Destination dataset;
- anonymous validator creation;
- Ilocano proficiency screening;
- batch assignment;
- 10 entries per batch;
- four evaluation choices;
- conditional correction;
- optional translation;
- immediate response persistence;
- contribution count;
- continue or finish;
- minimal admin progress view.

Do not delay the MVP for:

- advanced gamification;
- public leaderboards;
- social features;
- badges;
- accounts for validators;
- complex analytics;
- AI-powered correction;
- automated adjudication;
- map rendering;
- navigation/routing features.

---

# 18. Post-MVP Expansion

After the Origin + Destination category is stable:

1. import the remaining dataset categories;
2. reuse the same validator workflow;
3. extend intended-information display per category;
4. balance allocation across categories;
5. add category-level completion tracking;
6. improve admin analysis;
7. add final adjudication workflow;
8. refine exports for the full thesis dataset.

---

# 19. Explicit Non-Goals

This crowdsourcing website is **not**:

- the final Sadino navigation application;
- a route planner;
- a map interface;
- a transport recommendation engine;
- a social network;
- a translation service;
- an AI correction service;
- a replacement for human validation.

Its purpose is specifically to support **human validation of synthesized thesis dataset entries**.

---

# 20. Definition of Success

The platform is successful when:

- validators can understand the task with minimal explanation;
- validators can complete a 10-item batch comfortably on mobile;
- the same person is not shown the same entry twice;
- entries are distributed fairly across validators;
- each record can reach the configured independent-validation target;
- corrections and translations are stored without altering source data;
- researcher progress is visible;
- raw data can be exported;
- the system supports later adjudication;
- the interface remains distinctly soft neo-brutalist without reducing usability.

---

# 21. Implementation Guidance for the Coding Model

The coding model should use this roadmap as the product and architecture contract.

For visual implementation:

> The visual design is strictly soft neo-brutalism. The model has creative freedom to determine where objects should be placed, how pages should be composed, and how the interface should visually express the design system. Do not mechanically recreate wireframes or force predetermined component positions. Maintain the approved validation flow, research requirements, accessibility, responsive behavior, and data rules.

For product behavior:

> Do not creatively reinterpret the validation protocol. Screening, batch allocation, evaluation choices, correction conditions, translation behavior, persistence rules, and batch continuation must follow this roadmap unless the specification is explicitly changed.

This separation is intentional:

```text
Visual composition
→ creative freedom

Validation protocol
→ strict implementation
```

---

# 22. Immediate Next Step

Begin with:

```text
Phase 0
Methodology confirmation
```

and in parallel:

```text
Phase 1
Project foundation
```

The first technical milestone should be:

> Import `data/ilocano-synthetic-data.json` into Supabase and successfully serve a coverage-aware randomized batch of 10 entries to one anonymous validator.
