# AGENTS.md

## Project overview

**Sadino Crowdsourcing Validation Platform** is a research-focused web application for crowdsourced validation of synthesized Ilocano local-navigation dataset entries for the Sadino thesis project.

The project is currently greenfield. The starting research artifact is the synthesized **Origin + Destination** dataset, `data/ilocano-synthetic-data.json`, containing 600 Ilocano navigation instructions with stable external IDs such as `OD_0001` through `OD_0600`. `docs/ROADMAP.md` is the program-level development plan. The source synthetic dataset is reference research material and must remain immutable during validation; human responses are stored separately.

The target architecture is a Next.js web application deployed on Vercel with Supabase PostgreSQL as the persistence layer. Validators participate anonymously, complete a self-reported Ilocano-proficiency screening, receive coverage-aware randomized batches of 10 entries, submit structured judgments and corrections together with the required bilingual research translations, and may continue with additional batches. Researchers use a protected admin area to monitor coverage, inspect disagreements, and export research data. The architecture must support additional dataset categories without hard-coding behavior to `OD_*` records.

The primary research data flow is:

    Immutable synthetic dataset
        →
    Dataset import / canonical dataset entries
        →
    Anonymous validator screening
        →
    Coverage-aware batch assignment
        →
    Per-entry validation + conditional correction
        →
    Required bilingual research translation (English + Filipino)
        →
    Bilingual interface (ENG/FIL) - presentation only, not a research step
        →
    Persisted validation responses
        →
    Research review / adjudication
        →
    Final validated dataset export

---

## Stack

- Language(s): TypeScript; SQL for Supabase/PostgreSQL migrations and policies; JSON for dataset import/export; Markdown for project/specification documentation
- Framework(s): Next.js App Router; React; Tailwind CSS; shadcn/ui where useful; Zod for runtime/schema validation
- Runtime(s): Node.js for Next.js/server tooling and modern web browsers for the client; exact versions must be pinned by the repository when initialized
- Frontend / client: Next.js React UI, mobile-first and responsive, with a strictly soft neo-brutalist visual direction
- Backend / server: Next.js server-side boundaries (Server Components, Server Actions and/or Route Handlers as appropriate) for authoritative allocation, validation submission, admin operations, and exports
- Database / storage: Supabase PostgreSQL; browser-local storage may retain only the anonymous validator identifier/session convenience state and is never authoritative research storage
- ORM / data access: Supabase client libraries and explicit repository/domain access modules; do not add an ORM unless an approved change requires one
- Package manager: Not yet fixed; use the package manager and lockfile established during repository bootstrap and do not mix package managers
- Build tooling: Next.js build pipeline and Tailwind CSS; exact commands must be documented only after they are executed successfully
- Testing: Frameworks not yet selected/verified; the roadmap requires appropriate unit, integration, and end-to-end/browser verification before production crowdsourcing
- Infra / deploy: Vercel for the Next.js application; Supabase for managed PostgreSQL and associated backend services
- External services: Supabase; GitHub for repository/PR workflow; no other production dependency is assumed unless added by an approved change
- Specification workflow: OpenSpec
- Optional later infrastructure: Rate limiting, error monitoring/observability, and privacy-conscious analytics only when justified by production needs

---

## Architecture rules


- Follow the project's primary architectural sequence: **immutable source dataset → server-authoritative allocation → validation persistence → research review/adjudication → export**.
- Keep the existing/reference implementation operational until its required behavior has verified replacements when performing migration or replacement work.
- Do not rewrite multiple major system boundaries simultaneously unless the approved change explicitly requires it.
- `browser/client-component` code must depend on `Next.js server/domain service boundary`, never directly on `direct Supabase service-role access, raw SQL, or persistence internals`.
- Build `explicit import/compatibility adapter` before `canonical dataset/validation domain implementation` when staged replacement is required.
- Preserve externally meaningful IDs; modern storage may add internal IDs but must retain `source dataset entry ID (for example `OD_0001`)` where compatibility requires it.
- Separate static definitions from runtime/player/entity state where applicable, e.g. ``DatasetEntry`` vs ``Validation`, `ValidationBatch`, or `BatchEntry``.
- Production server actions are authoritative when the architecture is server-authoritative: clients send intent, never trusted resource/XP/HP/result deltas.
- Standard HTTPS/JSON is the default for ordinary request/response APIs. Add WebSockets or another real-time transport only for genuinely real-time behavior.
- Archived/reference assets or runtimes may remain under preservation paths but must never silently become modern runtime dependencies.
- Keep transport, domain logic, persistence, and presentation boundaries explicit.
- Do not bypass an established abstraction merely because direct access is easier.
- Avoid shared mutable global state unless explicitly required and documented.
- Cross-cutting services must stay focused on their defined responsibility.


```python
# Good: client sends intent.
perform_action(actor_id, action_id, target_id)

# Bad: client dictates authoritative outcome.
apply_client_state(resource=999999, progress=5000)
```

---

## Durable product & UX constraints

- The public validation experience must follow the approved sequence: **landing/introduction → Ilocano proficiency screening → anonymous validator setup → coverage-aware batch of 10 → per-entry validation → correction when required → required bilingual English and Filipino research translation → batch completion → continue or finish**.
- The approved screening question is **“How comfortable are you with Ilocano?”** with the choices: `Native / first-language speaker`, `Fluent`, `Conversational`, `Basic`, and `Not confident`.
- Treat proficiency as self-reported research metadata. Do not silently convert it into a quality score or weighting rule; eligibility rules belong to the approved methodology/OpenSpec.
- Validators are anonymous by default. Do not collect name, email, student ID, phone number, address, or other identifying information unless an approved research requirement explicitly adds it.
- Each batch contains up to 10 entries. Validators may stop after a completed batch or request another batch.
- Batch assignment is coverage-aware, randomized within the eligible lowest-coverage pool, and server-authoritative.
- A validator must never validate the same dataset entry twice. Different validators are expected to receive overlapping entries for independent validation.
- The coverage target is configurable. The current planning target is **3 qualifying completed validations from 3 distinct validators per dataset entry**, subject to thesis-team/adviser approval. A *qualifying* validation is an evaluable evaluation with any required correction present, both translations non-empty, and every integrity check satisfied. `Cannot confidently evaluate`, a partial response, and any response missing either translation all count **zero**, and the raw validation-row count is never used as a proxy for coverage.
- A validator must never validate the same dataset entry twice. `Cannot confidently evaluate` responses **do not count toward qualifying coverage**, so an entry may receive more than three responses while still not being finished.
- Save each completed entry promptly; do not wait for all 10 items before persisting research responses.
- Never overwrite or mutate the imported synthetic instruction when a validator submits a correction. Corrections and research translations are separate response data, and neither is ever written onto the dataset entry.
- `Correct but sounds unnatural` and `Incorrect` require a corrected Ilocano version before continuing.
- `Cannot confidently evaluate` requires no correction and carries **neither** research translation.
- **Research translations are required, bilingual, and never skipped.** For every evaluable validation (`Correct and natural`, `Correct but sounds unnatural`, `Incorrect`) the validator supplies **both** an English and a Filipino translation of the **validated** Ilocano sentence, which is the correction where one was required and the original synthetic instruction where none was. There is no skip option for an evaluable response, and the database rejects an evaluable response missing either translation or carrying a blank one. `Cannot confidently evaluate` carries neither.
- **Never merge "research translation" with "interface localization".** They share the word and nothing else. *Research translations* are validator-authored response data about a dataset entry, stored in validation records. *Interface localization* is the ENG/FIL switcher for the public validator website: English by default, browser-local, presentation state only. Localization must never mutate a stored research value, translate the synthetic dataset, or imply that a Filipino interface indicates lower English proficiency. They are specified and implemented as separate changes.
- Final validated records are produced only after thesis-approved review/adjudication. Do not silently resolve disagreement by majority vote unless the methodology explicitly approves that rule.
- The architecture must support all planned dataset categories through shared abstractions; do not build category-specific assumptions into generic allocation, persistence, or admin logic.

### Visual design

- The visual design is **strictly soft neo-brutalism**.
- The implementation model has creative freedom over component placement, page composition, spacing, responsive arrangement, visual rhythm, and decorative treatment.
- Do not freeze the frontend to a rigid wireframe unless an approved design artifact explicitly requires it.
- Preserve soft neo-brutalist characteristics: bold visible borders, hard offset shadows, tactile controls, strong typography, warm/light neutral surfaces, restrained accents, slightly softened corners, generous whitespace, and clear interaction states.
- Usability, accessibility, readability, and validation accuracy take priority over visual novelty.
- Keep the interface mobile-first and comfortable for repeated 10-item validation batches.
- Do not use excessive animation, chaotic composition, military/terminal aesthetics, aggressive visual noise, or answer styling that nudges validators toward a particular evaluation.
- Do not add competitive leaderboards, timers, streak pressure, or other mechanics that encourage speed over careful validation unless an approved research/product requirement explicitly introduces them.

---

## Setup & commands

> Status: the application was bootstrapped by the `project-foundation` change. Every command listed
> below was executed successfully on 2026-09-30 against the developer machine in the versions
> recorded here. Each entry states what it proves and what it does **not** prove.

Verified local environment:

```text
Operating system:  Windows (PowerShell)
Node.js:           v26.10.0
npm:               12.1.0
pnpm:              12.6.0
Git:               2.55.0
GitHub CLI (gh):   2.101.0 (authenticated)
OpenSpec CLI:      1.13.2
```

Not available locally: `docker`, `psql`, and the `supabase` CLI. There is therefore no local
Supabase runtime, and **no Supabase project credentials are configured**
(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are all absent). This is the
open blocker recorded in `docs/ROADMAP.md` -> `## Project Status`. Database verification against
Supabase-managed services (Auth, Storage, Realtime, and Row Level Security as enforced by the
API gateway rather than by the database engine) cannot be performed until a real project exists.

Current entry point:

```text
pnpm run dev
```

Runs `next dev`. Verified on 2026-09-30 only as a local server on port 3001; see the runtime check
below. No public deployment has been performed.

Current dependency manifest / install command:

```text
pnpm install --frozen-lockfile
```

`pnpm-workspace.yaml` pins `pnpm@12.6.0`, and `package.json` pins `packageManager` and
`engines.node: ">=24 <27"`. Do not mix package managers or regenerate the lockfile with another
tool.

Current baseline syntax / compile check:

```text
pnpm run typecheck
```

Important:

- The supported development/runtime environment is `Next.js/Node.js server runtime plus modern evergreen browsers`. Verified versions: Next.js `16.3.6`, React `19.2.8`, TypeScript `5.9.3`, Node.js `v26.10.0`, pnpm `12.6.0`, on Windows with PowerShell.
- Executed dependency/package consistency check: `pnpm install --frozen-lockfile`, exit 0.
- Run risky, state-mutating, legacy, or preservation checks in an appropriate disposable environment when required.
- No verified automated test, lint, type-check, build, or runtime command exists unless it is explicitly listed in this section.
- Do not invent commands in this file.
- When new tooling is added, update this section only with commands that were actually executed successfully.
- Document what each verification command proves and what it explicitly does **not** prove.
- Do not convert a successful syntax/build command into a claim that behavior or tests passed.
- `AGENTS.md` is listed in `.prettierignore` and is never formatter-owned. Prettier's Markdown
  printer rewrites inline code spans in this file and would corrupt the backtick-quoted references.

### Verified project tools

All entries below were executed on 2026-09-30 on Windows/PowerShell, Node.js `v26.10.0`,
pnpm `12.6.0`, and are re-run by `.github/workflows/verify.yml` on `ubuntu-latest`.

#### Static checks

| Command | Result | Proves | Does **not** prove |
| --- | --- | --- | --- |
| `pnpm run lint` | exit 0, no errors or warnings | ESLint (including the custom `sadino/no-privileged-imports` boundary rule) accepts every file, and no client component imports `server-only`, `@supabase/supabase-js`, or the service-role env module. | That the boundary rule would still catch a *new* violation in a file not yet written. The rule was separately proved to fire on a temporary violating import during the `project-foundation` change; that probe file was deleted. |
| `pnpm run format:check` | exit 0, "All matched files use Prettier code style!" | Every formatter-owned file matches the committed Prettier configuration. | Nothing about correctness. `.prettierignore` intentionally excludes `AGENTS.md`, `openspec/`, `docs/`, `data/`, and `.agents/`. |
| `pnpm run typecheck` | exit 0 | `tsc --noEmit` over `src/`, `tests/`, and config files under `strict`. This is what enforces the type-level separation assertions in `tests/unit/domain-types.test.ts`, which use `@ts-expect-error` directives that fail type-check if they ever become unnecessary. | Any runtime behavior. A type-check is not a test. |

#### Automated tests

| Command | Result | Proves | Does **not** prove |
| --- | --- | --- | --- |
| `pnpm run test:unit` | exit 0 — **45 files, 1179 tests passed** (re-measured 2026-10-01 during the `interrupted-batch-recovery` Apply, on the branch tip, and again after the independent verification pass's repairs; CI run `36869877479` carries the pre-repair `1176`. The row previously read `41 files, 1126 tests`, and **this row had been stale for two changes** — the Phase 5 Apply and then `batch-completion` each added files without re-measuring. This change added **four** files and **53** tests: `recovery-actions.test.ts`, `recovery-actions-wrapper.test.ts`, `recovery-flow.test.ts`, and the recovery portion of the repaired `validation-routes.test.ts`, and the verification repairs **moved the total by three**: one duplicated test in `recovery-flow.test.ts` deleted, and four added — the intent key-set assertion, the creation-instant assertion, and two for the recovery read's ordering and validator scoping. The count is `1176 - 1 + 4 = 1179`, and it was **measured after the reformat**, not before it, because prettier touched two of the four files) | Domain contracts, the seven evaluation/correction/translation integrity rules, the batch and allocation-configuration contracts, anonymous identity generation and browser-local storage, env validation, the Supabase client construction paths, the repository interface seam, the dataset source parser against the real 600-record file, a source-text scan proving the import path contains no filesystem write/rename/delete call, the row-to-domain and error-mapping logic of the three Supabase repositories, the write-intake boundary, the design-token contract, rendered-markup accessibility assertions, the onboarding **pure** decision functions, the Server Action **core** against injected fakes, the Server Action **wrapper** driven with the environment module throwing, rendered-markup assertions on the three public routes including the neutrality of every screening option's **rendered** class, source-text assertions on the screening form's write wiring, and — added by `batch-completion` — the finished batch screen's two labelled figures as a **closed key set** pinned at the type layer, the continue intent's key set, the continue control's decision and control-state flow, the finished screen's rendered-markup figures and its exact control counts, and catalog key-set parity **derived from the English catalog** rather than from keys the test invented. **Added by `interrupted-batch-recovery`:** the recovery lookup's **core** against injected fakes including the identity re-check, the **real Server Action wrapper** driven with the environment module throwing (the only path that can run here, since all three `SUPABASE_*` are absent), the pure start-screen decision including its exhaustive variant switch, the two repaired `/validate` guards, and the closed offer key set at the type layer **with a runtime half** — **and the correction this row needed after the independent verification pass, which is the useful part of it.** It used to claim "**two** type-layer pins that make a fourth offer field or a second recovery-intent key fail `typecheck`", and **neither pin enforced anything**: both were exported aliases with no assertion site anywhere, so the compiler never evaluated them. Measured, not assumed — adding an optional fourth field to `InterruptedBatchOffer` produced the **identical** `tsc` failure with the alias present and with it deleted, and adding a Zod optional key to `recoveryIntentSchema` left `tsc` at **exit 0** outright. A type alias nobody names is decoration, and a ledger that reports a pin as enforcement is worse than one that reports nothing, because a reader weighs `typecheck` as evidence. So the offer's alias was **deleted** rather than bolted to — `tests/unit/batch-recovery.test.ts` already closed that key set at the type layer *and* read it off a real offer at runtime, which is strictly better — while the intent's pin was **given an assertion site** in `tests/unit/recovery-actions.test.ts` (`const assertion: RecoveryIntentKeysAreIdentifierOnly = true`, plus a second spelling and the schema's `strictObject` runtime half), and now fires: a Zod optional key produces `TS2322: Type 'true' is not assignable to type 'never'` at that line. **The mutation that matters is the OPTIONAL one**: a *required* fourth field breaks every object literal with `TS2741` and the key-set check is never reached, so a probe using it appears to prove the pin fires when it has only proved the interface widened | Anything requiring a database, a network, or a browser. `server-only` cannot be imported under Vitest, so `env`, `write-intake`, and the route tests stub that module marker; `supabase-clients.test.ts` deliberately does **not** stub it and instead asserts that importing the admin client rejects. No Supabase client has ever been *constructed* at runtime, because no project exists. `repositories-supabase.test.ts` stubs the `server-only` marker, so it proves the translation and error-mapping logic against a recording fake and nothing at all about PostgREST, the wire protocol, or whether `.in()`/`.range()`/`.neq()`/`.eq()` behave as assumed. The filesystem scan and `screening-form-wiring.test.ts` are **textual** scans of named files: they prove a string is or is not present, not that the code behaves as the string suggests, and a cosmetic rename will fail them. Nothing here clicked a button, ran an effect, or started a transition — `renderToStaticMarkup` cannot — so the submit-time resume check, the `localStorage` write, and navigation to `/ready` are proven by pure functions and source assertions, never by an executed flow. **A measured caveat on the type pins, restated because the number of them changed:** a `const pin: SomeNeverType = true` assertion catches an *incidental* extra key and is defeatable by a deliberate edit that widens the excluded list. This row previously said "**both**" pins and there is now **one**, because the offer's was deleted as redundant; the caveat therefore applies to the intent pin and to `batch-recovery.test.ts:256`, not to a pair. Neither has a runtime half that a deliberate edit could satisfy quietly — which is why the prose assertion beside each (`satisfies`, and an exact `Object.keys` set read off a **real** offer) is the half a reader should weigh alongside it, and why the `strictObject` parse assertion is there at all. |
| `pnpm run test:dom` | exit 0 — **6 files, 72 tests passed** (re-measured 2026-10-01 during the `interrupted-batch-recovery` Apply, on the branch tip and again on CI run `36869877479`; the row previously read `5 files, 57 tests` — accurate as of the `batch-completion` Apply — and this change added one file and 15 tests) | That a client component's **event handlers** and its **pending state** are observable at all. `renderToStaticMarkup` provably cannot do either — it never fires a handler and can only ever see the idle state — and every one of the four critical call sites behind the `thin-shell-call-sites` change is a handler or wiring fact. The project drives components with `createRoot` + React's own `act` inside a `happy-dom` document, so a real click's effect and the window *during* a write are both asserted. Both bars were proved red before any guard depended on them: removing the click, and letting the action resolve immediately, each turned this file red and each was attributed to a named test. `batch-completion` added the fifth file, covering the finished screen's two controls: that a click on **Continue** reaches the Server Action and its pending state is observable while the request is in flight, and that **Finish** is a link with no handler, so no write is issued — asserted by observing that nothing left the component, since `happy-dom` performs no navigation and no form submission. **The WARNING 1 repair added the sixth thing this row proves, and it is the only mechanism in `batch-completion` that had no failing mutation:** `pressMany(el, n)` dispatches all `n` clicks inside ONE `act`, so a **single-flight latch is observable at all**. Measured: control green at `17 passed (17)`; deleting `inFlight.current`'s guard and its assignment turns this project **red — `1 failed`, `16 passed`, of 17 — naming `makes exactly ONE request for two presses dispatched in the same task`**; restore byte-identical at sha `3c410b94…`. The two-press arrangement it replaced **passed with the latch deleted**, because `press` opens and closes its own `act` and React committed `disabled` between the two clicks, so the second click was always stopped by `disabled` and never by the latch. A companion `CAN FIRE` test mounts a deliberately latch-less button and proves `pressMany` counts **2** against it, so the real component's count of 1 is a measurement and not a limitation of the instrument. **`interrupted-batch-recovery` added** the sixth file, `start-batch.test.tsx`, and its 15 tests are the ones `happy-dom` is actually needed for here: the resume offer appears only **after** a Server Action resolves in a `useEffect`, so `renderToStaticMarkup` can observe neither the in-flight state nor the offer's arrival. It asserts the link is a `next/link` with **no handler** (a click leaves the component without issuing a request), that pressing the start control still issues its allocation request **while an offer is on screen**, that the button is never disabled by anything the lookup does, that `none` and **every** failure reason render byte-identical markup, that the markup is identical mid-flight, that the catalog contains no string describing a failure, that the validator's identifier is rendered **once** and only inside the href, and that no proficiency, screening answer, activity timestamp, or other batch's existence appears. **Can-fire measured twice:** deleting only the `<Link>` gives `4 failed / 11 passed (15)` and deleting the whole conditional branch gives `5 failed / 10 passed (15)`, each after a negative control and each restored byte-identical | Anything about a real browser. `happy-dom` is a synthetic DOM, so this proves a click reaches a handler and that `disabled`/`aria-busy` track `isPending` — it proves nothing about layout, contrast, focus order, or a real viewport's 44px target. **No human has ever rendered any screen in this project**, and this row does not change that. It is not a substitute for opening the app. **A CORRECTION TO THIS ROW'S OWN PRIOR TEXT, which claimed a regression guard that does not exist:** it used to say the `unit` count "is asserted unchanged at 32 files / 881 tests so the DOM runtime cannot silently leak in". The figure was stale by two changes, and there is **no automated assertion of the `unit` count anywhere**. Measured, with a control: every file under `tests/` was searched for `tests/unit` occurring in **32 lines across 18 files**, and **not one of them opens the directory** — the only filesystem read of any `tests/` path in the whole suite is `guard-weakness-audit.test.ts:199` reading the single file `tests/dom/feasibility-spike.test.tsx`, which is the control that distinguishes "no test counts the unit project" from "no test touches test files at all". So the count was **measured by running the command**, never asserted. What actually holds is a **configuration** fact: `vitest.config.ts` scopes `environment: "happy-dom"` to `tests/dom/**` and leaves `unit` on `environment: "node"`. Nothing here would fail if a future edit widened the `dom` project's `include` to `tests/**`. **A claim of coverage is not coverage**, and this row asserted one for as long as it carried that sentence. Building the assertion is outstanding work, deliberately not smuggled into a change whose subject is a finished screen. **One caveat added with the latch witness, stated rather than assumed:** `act()` flushes React between calls, so an ordinary two-press arrangement **cannot** distinguish a latch from `disabled` and will pass with either one deleted. Only the same-task `pressMany` can, and that is a property of the harness's batching — it *models* the browser race where two clicks land before the first re-render, and it is not a measurement of one. `happy-dom` still performs no real event-loop scheduling. |
| `pnpm run test:integration` | exit 0 — **9 files, 129 tests passed** (re-measured 2026-10-01 during the `interrupted-batch-recovery` Apply, on the branch tip and again on CI run `36869877479` at `128`, and **again after the independent verification pass's repairs at `129`** — the verification repairs reworked three tests in `batch-recovery-migration.test.ts` and net-added one; CI's `128` describes the pre-repair tree and this figure is not being carried into a run that has not reported it. The row previously read `8 files, 109 tests` — accurate as of the `batch-completion` Apply — and this change added one file and 20 tests) | A real PostgreSQL engine (PGlite/WASM) boots, applies SQL in filename order inside per-file transactions, and rolls back. Applied from the production `supabase/migrations/` directory, it proves the six research tables with closed column sets, the named `UNIQUE (validator_id, dataset_entry_id)` constraint, the vocabulary checks in **both** directions (each approved value accepted, each unapproved one rejected, and each rejection matched against the named constraint), the not-blank and cross-column consistency checks, the foreign keys and their `on delete` behavior, the indexes, and the measured deny-all RLS posture (a `select`, `update`, or `delete` as `anon`/`authenticated` returns or affects zero rows **without an error**; an `insert` is rejected with an RLS error; `service_role` still reads). It also proves that all 600 parsed records import idempotently into that schema with each stored instruction byte-identical to the source, that the stored `source_payload` matches the source record as a value, and that `data/ilocano-synthetic-data.json` is unchanged by the whole run by record count, ID set, and SHA-256, with the guard proved to fail on a deliberately altered copy. **`batch-completion` added the seventh and eighth files for a reason a fake cannot serve**, and the reason is the point rather than the padding: the two research-integrity claims on this screen are properties of *data*, not of a query string. `lifetime-figure.test.ts` inserts a real `cannot_evaluate` row through the production schema — subject to both directional bilingual constraints, so a hand-written fixture could not have stood in — and proves a `COUNT(*)` filtered only on `validator_id` returns it. Its negative control runs the **same** query with the one forbidden `evaluation` predicate appended, in the same database against the same rows, so the difference between `2` and `1` is attributable to that predicate and nothing else. `finish-writes-nothing.test.ts` re-reads **row state** after the finish path rather than asserting a function was not called: a "not called" assertion passes just as well when the call is renamed or inlined. **The ninth file** is `batch-recovery-migration.test.ts`, and it exists because the recognition rule is a **query** over real rows: the migration adding `validation_batches.created_at`, its backfill into a database that already held batches, and the recovery read's ordering are applied from the production `supabase/migrations/` directory, so `created_at DESC, id DESC` is the **engine's** answer rather than a string in a query builder. **Its ordering guard is proved to fire in both directions** — control GREEN at `80 passed (80)`, swapping the two sort terms RED `1 failed / 79 passed`, and ordering ascending RED — because an ordering assertion that passes either way is the same vacuity recorded twice below. The `NOT NULL` with no default is what broke **four** seeds, one of which then had to be split into `seedCurrentSchema` and `seedPreInstantSchema`. One **measured redundancy**: the repository's `entryIds.length === 0` early return is kept for legibility, and deleting it leaves 14/14 green. **The verification repairs changed what this file proves, and the correction belongs here rather than only in the diff.** The backfill test used to hand-write its own `alter table … add column created_at` and its own `update … set created_at = now()`, so **the migration's own `update` statement was executed by no test at all** — the entire justification for the `id DESC` tiebreaker was resting on SQL nothing ran, and the test was asserting the test author's SQL rather than the shipped SQL. It now applies the production file through a new `applyMigrationByName` helper (`applyMigrationsUntil` cannot be used here: it always applies from the first migration, so on an already-migrated database it dies with `42P07 relation "dataset_entries" already exists`). Measured on the repaired file: control GREEN at `20 passed (20)`; **deleting the migration's backfill statement is RED — `3 failed / 17 passed (20)`, `23502 column "created_at" … contains null values`, naming the backfill test**; reverting the test to hand-writing its own setup is RED — `1 failed / 19 passed (20)`, naming `leaves the database exactly as it found it`. **And one arm is legitimately GREEN, which is why that test was renamed rather than deleted:** rewriting the migration's `now()` as `clock_timestamp()` leaves the suite GREEN, because two `clock_timestamp()` calls inside one statement execute microseconds apart and `timestamptz::text` renders milliseconds. So the test proves the statement RUNS and reaches every row, and the rows come out identical *at the precision the column is read at* — it does **not** prove which clock function was used, and the old title "one IDENTICAL instant" asserted that it did. | That this is Supabase. PGlite is PostgreSQL compiled to WebAssembly: it proves SQL, constraints, and RLS *as the database engine evaluates them*. It does **not** cover Supabase Auth, Storage, Realtime, PostgREST behaviour, or RLS as enforced by the Supabase API gateway, and it is not a substitute for verifying against a real project. **And what the two new files add is a property of PostgreSQL, not of the application's own query builder** — `countForValidator` is still proven only against the mock in `repositories-supabase.test.ts`, which asserts the *filters* it was handed and cannot show what those filters mean on the wire. Each integration test file manages its own state: the import tests reset and import per test, verified by running the file under two different `--sequence.shuffle` seeds, so no result depends on test order — but each still shares one database per file, not one per test, and `pglite-harness.test.ts` is known order-dependent under a shuffle (pre-existing, 4 of its 11 tests). |

#### Build and runtime

| Command | Result | Proves | Does **not** prove |
| --- | --- | --- | --- |
| `pnpm run build` | exit 0 — Next.js 16.3.6 (Turbopack), "Compiled successfully", routes `/` and `/_not-found` both prerendered static | The application compiles for production under the committed TypeScript and Tailwind configuration, and the design tokens resolve into generated utilities. | That any test passed. A successful build is not a behavioral result. No route in this change is data-backed, so nothing is exercised end to end. |
| `pnpm run dev` (port 3001) | `GET /` returned 200 on three consecutive requests | The landing page serves in a development runtime, and its rendered HTML contains the expected single `h1`, the skip link, the document title, `robots` noindex, and `main`/`header`/`footer` landmarks. The emitted stylesheet contains every `@theme` token, including a zero-blur hard offset shadow. | Visual quality. No desktop browser was connected, so there is **no screenshot-based or human-eye visual verification** of the design. The design was verified through rendered-HTML assertions, emitted-CSS inspection, and component markup tests. A human still needs to look at the page. |

#### Specification validation

| Command | Result | Proves | Does **not** prove |
| --- | --- | --- | --- |
| `openspec validate project-foundation --strict` | exit 0, "Change 'project-foundation' is valid" | The active change's proposal, design, and capability deltas satisfy the OpenSpec schema strictly. | That the implementation matches the change. That is verified by inspecting the code and tests, not by this command. |
| `openspec validate od-dataset-schema-and-import --strict` | exit 0, "Change 'od-dataset-schema-and-import' is valid" | The active change's proposal, design, and capability deltas satisfy the OpenSpec schema strictly. | That the implementation matches the change. That is verified by inspecting the code and tests, not by this command. |
| `openspec change validate batch-completion --strict` | exit 0, "Change 'batch-completion' is valid" | The `batch-completion` proposal, design, and its one capability delta (6 requirements, 18 scenarios) satisfy the OpenSpec schema strictly. **This row described `batch-completion` as "the active change" until this change's Apply began; it was archived by PR #46 and the live change is now `interrupted-batch-recovery`, which has its own row below.** `openspec validate batch-completion --strict` now exits 1 with **not found**, because the change is archived; use `openspec change validate`. Both `change …` and `spec …` print a deprecation warning recommending verb-first commands — **that warning is expected and is not a failure**; judge by the exit code and the verdict line. | That the implementation matches the change. That is verified by inspecting the code and the tests, not by this command. Note also that a delta validates as a *document*: it proves the requirement text is well-formed and the scenarios are well-formed, and nothing about whether any of the 18 scenarios has an implementation behind it. |
| `openspec change validate interrupted-batch-recovery --strict` | exit 0, "Change 'interrupted-batch-recovery' is valid" — **measured while the change was active; it now exits 1 with `not found`, see the third column** | The change's proposal, design, and its one capability delta (7 requirements, 20 scenarios, every one ADDED, **zero** MODIFIED) satisfied the OpenSpec schema strictly. `openspec validate interrupted-batch-recovery --strict` exits 1 with **not found**, because while a change is active the `validate <name>` form only resolves in-force *specs*; use `openspec change validate`. The deprecation warning recommending verb-first commands is **expected and is not a failure**. Re-run after the verification repairs, since two of those repairs edited `design.md`'s prose-adjacent claims rather than the delta. **ARCHIVED 2026-10-01, and the command's behaviour changed with it — measured, not assumed:** `openspec change validate interrupted-batch-recovery --strict` now exits 1 with `Error: Change "interrupted-batch-recovery" not found at …\openspec\changes\interrupted-batch-recovery`, and the date-prefixed name does not resolve either. The delta file itself is still on disk at `openspec/changes/archive/2026-10-01-interrupted-batch-recovery/specs/batch-recovery/spec.md`. **So the OpenSpec CLI cannot re-validate an archived change, and the in-force copy at `openspec/specs/batch-recovery/spec.md` is what `openspec validate --specs --strict` checks** — that is the command to use for an archived change, and it now reports 12. | That the implementation matches the change. That is verified by inspecting the code and the tests, not by this command — and for this change an independent verification pass has now done exactly that, reporting all 20 scenarios implemented, 18 with a named test, and **three CRITICAL findings that were claims of enforcement which did not hold** rather than missing behaviour. A delta that validates as a document is exactly as silent about that distinction as it is about the 18 scenarios. |
| `openspec validate --specs --strict` | exit 0, "Totals: **12** passed, 0 failed (12 items)" | All twelve **main** capabilities in `openspec/specs/` — `application-foundation`, `batch-allocation`, `batch-completion`, `batch-recovery`, `data-access-boundary`, `dataset-import`, `design-system`, `domain-contracts`, `interface-localization`, `research-schema`, `validation-experience`, `validator-onboarding` — satisfy the OpenSpec schema strictly. Six were synced by the `od-dataset-schema-and-import` archive; `batch-allocation` by `coverage-aware-allocation`, `interface-localization` by its own sync, `validator-onboarding` by `landing-and-screening`, `validation-experience` by its own sync, `batch-completion` by PR #46, and **`batch-recovery` by the `interrupted-batch-recovery` archive, which is the rise from 11 to 12 measured on 2026-10-01.** The list is re-derived from this command's own output, so when it rises again this row is the one that will be stale — which is exactly what happened **three times**: it read **9 items** until the `batch-completion` Apply found it, having risen during the Phase 5 Sync without the row being re-measured; it read **10** until the `interrupted-batch-recovery` verification pass found it, having risen again with PR #46; and it then read **11** until the archive stage found it, because the Apply deliberately held it at 11. **It also serves as the leak check on an active change's delta, and that is why the hold at 11 was a real measurement and not a stale row.** While `interrupted-batch-recovery` was active, its delta lived only under `openspec/changes/`, so a new directory appearing under `openspec/specs/` during the Apply would have meant the delta had been written to the wrong place. Checked at the Propose stage, at the end of the Apply, and after the verification repairs — **11 every time**, with `batch-recovery` correctly absent, so that staleness was **not** a leak. It is now 12, and the direction of the change is the evidence that the archive synced what it was supposed to sync. | That the implementation matches the specs. The per-change rows above still apply to any *new* unarchived change — and there is now **six** of them, not three, because the rows above name **archived** changes (`project-foundation`, `od-dataset-schema-and-import`, `batch-completion` since PR #46, and **`interrupted-batch-recovery` since this archive**) whose `openspec validate <name> --strict` form no longer resolves. **No change is live as of 2026-10-01.** The sentence previously read "**Only `interrupted-batch-recovery` is live**, and it has its own row", which is now false, and it is corrected here rather than deleted so the staleness is visible. Note that a change name becomes **ambiguous** the moment its capability is synced — `openspec validate interface-localization --strict` exits 1 with *"Ambiguous item … matches both a change and a spec"* — which is a naming collision and not a defect; use `openspec change validate` / `openspec spec validate`, both of which print an expected deprecation warning, and judge by the exit code and verdict line, never by the warning. |

`project-foundation` and `od-dataset-schema-and-import` are both archived
(`openspec/changes/archive/`), so `openspec validate <change> --strict` no longer accepts their
names. Use the archived copies when reading their deltas, and the `--specs` command above to check
what is currently in force.

**Run 36675360024 (PR #12, `e510912`, 2026-09-30) passed on `ubuntu-latest`**: both jobs green,
`22 files / 510 tests` unit and `4 files / 69 tests` integration — matching the local counts of the
same commit — "All matched files use Prettier code style!", and "Compiled successfully" for the
production build. Every one of those numbers was read back out of the run log, not inferred from a
green checkmark. The dataset-guard job was read back too: it ran the literal command `pnpm exec
vitest run --project integration tests/integration/immutable-dataset.test.ts` and reported
`1 file / 7 tests`, naming only that one file.

**Run 36686768916 (PR #12, `7647179`, 2026-09-30) passed on `ubuntu-latest`**: `22 files / 514
tests` unit, `4 files / 69 tests` integration, "All matched files use Prettier code style!",
"Compiled successfully", and the dataset-guard job scoped to `1 file / 7 tests`. The unit count is
**514 and not 510** even though the run before it read 510, because `7647179` is the sixth-round
repair commit and carries the four tests added by it. That distinction was not obvious and was
settled by tooling rather than by inference — see the reader below.

**Run 36687010926 (PR #12, `e0f93d2`, 2026-09-30) passed on `ubuntu-latest`** and is the run
current at the merge of this change: the same six figures, `22 files / 514 tests` unit and `4 files
/ 69 tests` integration with the guard job at `1 file / 7 tests`, read back off the log by a reader
that **exits non-zero rather than printing a partial answer**.

That reader has itself been wrong three times, and each failure is documented in its own header
because a reader that silently mislabels a number is worse than no reader. It first read vitest's
summaries **positionally**, assuming the order unit, integration, guard; nothing orders the jobs,
and on `36687010926` the guard job printed first, so the reader refused rather than mislabelling
the numbers. It then assumed multiple spaces between the job, step, and timestamp fields when
`gh run view --log` separates them with **tabs**, and it looked for `Test Files` and `Tests` on one
line when vitest prints them on **separate** lines. Each of those three would have produced a
confident wrong number, and only the first was caught, because the second and third reported
"nothing found" rather than something plausible.

The rule this establishes, and the reason the reader attributes counts by **step name** and only
then checks the numbers: matching on the expected numbers and declaring success would be circular.
The step name is the independent evidence; the number is what is checked against it. Every summary
line in the log must be accounted for, or the reader refuses — something it did not understand is
exactly the condition under which it must not report.

Reading CI output has failed silently here in five further ways, all still guarded: a UTF-16LE
BOM that makes every regex match nothing; `gh run view --log` rendering ESC as the literal `^[`
rather than 0x1b; per-line job and ISO-timestamp prefixes that make `^\s*Tests` match nothing; an
empty capture being written into this ledger as a measurement; and a transcribed dash. The three
silent empty matches in one read are the worst of them, because **an empty capture is
indistinguishable from a run that reported nothing** — which is exactly the failure mode that once
wrote a blank into the test-count row.

**Reading that log back took three attempts, each of which failed silently rather than loudly,
and the pattern is worth keeping.** The first returned an empty match because the log had been
captured with PowerShell's `>` redirection, which writes UTF-16LE with a BOM — read as UTF-8, every
regex matched nothing. The second fixed the encoding and *still* matched nothing, because
`gh run view --log` renders ESC as the two literal characters `^[` rather than the 0x1b byte, so a
regex anchored on a real escape byte can never match this output. The third failed because each
log line is prefixed with the job name and an ISO timestamp, so `^\s*Tests` anchored at line start
matched nothing. An empty capture is indistinguishable from a run that reported nothing, which is
exactly the failure mode that once wrote a blank into this ledger; the reader now detects the BOM,
strips both escape notations, and **exits non-zero rather than reporting a partial answer**.

#### Continuous integration — observed runs

`.github/workflows/verify.yml` defines a `verify` job (install, lint, format check, type-check,
unit tests, integration tests, build) plus an `immutable-research-source` job that runs the dataset
guard on its own. **Run 36662964607 (PR #12, `feat/landing-and-screening`, 2026-09-30) passed on
`ubuntu-latest`**: both jobs green, `20 files / 445 tests` unit and `4 files / 69 tests` integration
— matching the local counts of the same commit — "All matched files use Prettier code style!", and
"Compiled successfully" for the production build. **Every one of those numbers was read back out of
the run log**, not inferred from a green checkmark, because the earlier defect below is precisely a
job that was green and not doing what its name said. The dataset-guard job was read back too: it ran
the literal command `pnpm exec vitest run --project integration
tests/integration/immutable-dataset.test.ts` and reported `1 file / 7 tests`, naming only that one
file. That run predates the independent review; the post-review counts on the merged branch differ
and are re-verified by the run for the final PR.

**Run 36628918700 (PR #8, 2026-09-29) passed** with `14 files / 312 tests` unit and
`4 files / 69 tests` integration, and the same read-back confirming the guard job was genuinely
scoped. Run 36628108347 (PR #7, the same day, the preceding commit) passed with identical counts.
An earlier green run of the same workflow (36614647692, PR #3) reported `12 files / 244 tests` unit
and `2 files / 18 tests` integration on what was then the whole suite, and is superseded by the
counts above.

An earlier run of the same workflow (36612616260) exposed a defect in the workflow itself. The
dataset job used `pnpm run test:integration -- <path>`, and on Linux the `pnpm run` layer dropped
the path filter, so the job that claims to isolate the immutability guard silently executed all 18
integration tests. It was green either way, so nothing would have failed — the checkmark was real
and the job was still not doing what its name said. It is now `pnpm exec vitest run --project
integration <path>`.

Two lessons, both worth keeping: **a CI step that claims to run a subset must be read back from the
run log to confirm it actually did**, and **a green job is not proof that the workflow can go red.**
No failing run has ever been observed, so "a failing test blocks the pull request" is still inferred
from the check being required on `pull_request` rather than demonstrated.

The same two lessons have a local twin, and the `landing-and-screening` review made it concrete.
**A probe harness that reports "no failures" is indistinguishable from a probe harness that cannot
detect failures.** Three separate harness defects produced false evidence there, and the third is
the one to remember: an ANSI-stripping regex written as `/\[[0-9;]*m/` without the escape character
left a literal `\x1b` in front of every `[2m`, so the `^\s*Tests … failed` pattern never matched and
**every probe was scored green, including probes that were genuinely red.** It was caught only
because one probe was re-checked by hand outside the harness and went red while the harness claimed
it did not. Two more: `git checkout --` silently does nothing for an untracked file, so restored
state leaked between probes; and a suite that fails to *collect* reports "no tests", which must be
scored as a distinct outcome rather than folded into "did not go red". **Always confirm at least one
harness result independently.**

And a harness must not be trusted with the working tree. The `landing-and-screening` verifier ran
its probes in a throwaway copy under `%TEMP%`; all 13 direct dependency junctions in the *real*
`node_modules` ended up pointing into that copy, and deleting the copy left them dangling —
`pnpm run typecheck` then failed with `Cannot find module node_modules/typescript/bin/tsc`, which
reads exactly like a code problem and is not one. **`pnpm install --frozen-lockfile` repairs it, and
`git status` plus a dataset hash confirm the source tree was untouched.** A `readFile`/`writeFile`
probe harness with an in-memory restore never touches a junction and cannot cause this.

**A probe harness that cannot spawn its own command will score every probe green, and the failure
mode is identical to a working one.** This is the fourth occurrence of the defect recorded above and
the first in this project's own repair work, so it is worth stating exactly what happened. Six
absence probes were run to confirm that the guards added to
`tests/integration/migration-precondition.test.ts` and `tests/unit/domain-helpers.test.ts` go red on
reversal. All six reported `exit=-1` and `CONFIRMED`. **None of them ran.** On Windows,
`execFileSync('pnpm', ...)` without a shell cannot spawn the `pnpm` shim and fails with `ENOENT`, so
`error.status` is `undefined`, and the harness scored "the command never ran" as "the test went red".
The tell was in the output the harness did print: every probe reported `<no summary line>`, because a
command that never started produces no vitest summary to capture. That is the same signature as the
three silent empty matches recorded above, and the lesson is the same one: **an empty capture is
indistinguishable from a run that reported nothing, so the harness must distinguish the two.**

The rebuilt harness does three things, all load-bearing. It spawns with `shell: true`, which is the
only way `pnpm` runs here at all. It returns a **three-way** outcome — `GREEN`, `RED`, or
`DID-NOT-RUN` — and **`DID-NOT-RUN` is refused rather than scored as red**. And it runs a **negative
control** before every probe: the un-mutated file must be `GREEN`, or a red-after-mutation result
means nothing. Re-run that way, all six probes confirmed with real summaries (`9 passed` -> `1
failed`, `17 passed` -> `1 failed`, `155 passed` -> `1 failed`), and the two hash-guard probes pass
for different reasons on purpose: renaming an index proves the guard catches a semantic edit, and
adding a comment line proves it measures **bytes** rather than meaning.

**That entry originally said `DID-NOT-RUN` covers "any exit status other than 0 or 1", and it was
wrong in a way that only a run could reveal: `tsc --noEmit` exits `2` on a type error, not `1`.** A
probe written to that rule classified a textbook RED — `[ELIFECYCLE] Command failed with exit code
2` — as `DID-NOT-RUN` and printed `INCONCLUSIVE` for a probe that had in fact worked. The refusal
was the *correct response to a broken predicate*, which is the only reason this became a finding
rather than a false negative buried in a report. **The discriminator is not the exit code; it is
whether the process ran at all.** `err.status === undefined` is what a spawn failure looks like
(`ENOENT` on the `pnpm` shim without a shell, or a signal). A *defined* status means the process ran
and returned a verdict, whatever that verdict is. There is also a **fourth shape** worth naming
separately: a non-zero exit with **no** expected diagnostic is neither RED nor DID-NOT-RUN, it is
"the tool failed for some other reason and this result proves nothing" — which looks identical to
success-with-a-predicate if you only read the code. Verified by re-running with the corrected
classifier: control GREEN at exit 0, probe RED at exit 2 with one `error TS2741` ("property is
missing in type"), catalogue restored byte-identical at `0d237be8599e67b1`.

**The console will lie to you about file content, and a clean file looks exactly like a corrupt
one.** Reviewing a comment reading `` `Record<IlocanoProficiency, …>` ``, the obvious reading is
mojibake from a PowerShell write — which this repository has produced before, in an archived
proposal. Reading the bytes in Node showed `U+2026`, a horizontal ellipsis, **perfectly valid and
intentional**: PowerShell's console rendering had mangled a legitimate character into three
replacement glyphs. A character-class enumeration over every codepoint above `U+007F` in the
changed files found **no** `U+FFFD`, no `â€` sequence, no C1 control, and no CR bytes at all, and
catalogued the seven legitimate codepoints (middle dot, em dash, right single quote, ellipsis,
rightwards arrow, bullet, check mark) so that "clean" is a measurement rather than an absence of
complaint. **This is the same failure as `git show HEAD:<path> | node -e …` re-encoding the blob
through a pipe** — the measurement instrument, not the file, is what is wrong — and the two
instances now sit in the same record deliberately. Judge a file by its bytes read in Node, never by
what a PowerShell pipeline printed, and never "fix" an encoding artefact that exists only in the
terminal.

**And this paragraph's own copy of the character was corrupt, which is worth stating because it is
the third instance of one lesson and the first recorded against a ledger rather than a source file.**
Re-measured on 2026-10-01 from the blob with `git cat-file` spawned from Node: three `U+FFFD` sat in
the committed bytes of the quote above, at `ef bf bd` three times — one per byte of a three-byte
character, which is the shape of a single `U+2026` lost in transit. The **subject** of the paragraph
may well have been clean, as claimed; what was not clean was `AGENTS.md`'s quotation of it. Two
reasons that is the more useful place for the instance to sit. First, the file carrying the standing
instruction *judge a file by its bytes* was itself carrying three replacement glyphs, and a reader
who trusts that file has every reason to trust the paragraph and skip the check. Second, nothing
would ever have repaired it: `AGENTS.md` is listed in `.prettierignore` and is never formatter-owned,
so no tool in this repository revisits its bytes.

The measurement is the part worth keeping. `git show HEAD:AGENTS.md | node -e ...` reports **744**
`U+FFFD` on this file, `git cat-file -p` piped nowhere reports **3**, and a hex dump settles which of
the two describes the repository. **A large count is the tell that the instrument is at fault** — the
same signature this file records three times for an empty capture, and the reason a single plausible
number must never be written into a measurement without the bytes behind it.

One **false positive of my own detector**, recorded because a checker that flags a legitimate
character teaches its reader to ignore it. Line 373 below contains a literal `U+00E2` inside
`no `â€` sequence`, quoting the mojibake that sentence claims is absent. That one is correct,
intentional, and left alone. The detector that flagged it was counting codepoints, and "is not ASCII"
is not the same question as "is wrong".

**A probe that cannot build its own mutation must report INCONCLUSIVE, and it will.** The first
ordering probe tried to locate the drop statement by the shape of the comment above it, matched
nothing, and correctly reported `INCONCLUSIVE` rather than reporting a pass — the outcome to insist
on when a probe cannot do its job. Rewritten to locate the drop by its own two-line statement, it
built a real reversal (drop moved from offset 12130 to 4691, ahead of the precondition at 5333) and
the suite went red on the ordering guard by name.

What CI still does not prove: nothing about Supabase, and nothing about visual rendering.

#### Repository tooling notes

**An export that closes a named spec scenario is not speculative, and the difference is
criterion.** `countQualifyingValidations` in `src/lib/domain/validation-response.ts` has no
production caller yet, in the same commit that removed `isTranslatableContent` for having none — an
asymmetry worth naming rather than leaving to inference. The test is whether a *spec* requires it.
Two `domain-contracts` scenarios in this change's ADDED block name coverage-over-a-set, and no
function satisfies them without it; `docs/ROADMAP.md` names Phase 4 as the consumer. The removed
export satisfied nothing and no scenario named it. "No caller" is therefore not the criterion —
**an uncalled export that a spec scenario requires is an unfinished task, and one that nothing
requires is dead weight.** Both errors look identical in a grep.

**`--sequence.shuffle` takes a boolean here, not a seed, and the seed form is a startup error.**
`--sequence.shuffle=4821` and `--sequence.shuffle 4821` both die with `Startup Error: TypeError:
input.replace is not a function` inside `pathe@2.0.3` via vitest 3.2.7's CAC. The working form is
`--sequence.shuffle --sequence.seed=N`. This matters because a shuffle verification that errors out
looks identical to one that passed if only the exit code is read.

**A "RED" probe is not self-validating, because a mutation can break the file in a way the guard
never sees.** The verification subagent's first ordering reversal used `String.replace` with a
*string* replacement containing `do $$`. JavaScript expands `$$` in a replacement to a literal `$`,
so the mutated migration became `do $` — a syntax error. The probe scored RED, twice, **for a reason
entirely unrelated to the guard it was written to test.** It was caught only because one result
contradicted a documented claim, and both probes were then rewritten to use replacer *functions*.
The general form: a mutation that corrupts the artefact will make almost any assertion fail, so a
red result is only attributable after confirming the mutation broke the thing under test and nothing
else. **Assert the mutation is well-formed before trusting what it proved.**

**A measurement that is implausible is a broken measurement, not a finding.** The same round's first
run of the constraint-overlap measurement reported that 107 of 108 rows were rejected by *every*
constraint and 106 of 108 by both bilingual constraints. That is impossible — the bilingual pair is
non-overlapping by construction — and the cause was one reused primary key per table, so only the
first cell was ever really tested. Rewritten with a unique id per cell and a hard requirement that
every failure name a `check` constraint, it produced the real **80 of 108**, and **0** cells rejected
by both bilingual constraints. **When a number comes back that the design says is impossible, the
harness is wrong before the design is.**

**Retracting a claim inside the comment that made it defeats a naive absence check — make the check
precise instead.** Repairing the header that asserted the falsified ordering required *quoting* that
claim in order to retract it, so the phrase legitimately still appeared in the file and a
`not.toContain` check reported a violation on a correctly repaired file. There are two ways out and
both are wrong: reword the header until the phrase disappears, which hides the retraction to satisfy
a checker, or weaken the check until it passes. The third is to assert what is actually forbidden —
**the phrase may appear, but only as a quoted past-tense attribution**, requiring both the quotation
mark and an `earlier version` / `claimed` / `falsified` marker on the same line. A check that
enumerates what *is* allowed is nearly as informative as one that forbids what is not.

**A GREEN predicate that asks for a string the reporter never prints fails every control, and that
looks like "the repo is broken" rather than "my predicate is wrong."** A verification round scored
all five of its negative controls RED against a baseline of `Tests 9 passed (9)`, because the
predicate required the literal `0 failed` — which vitest does not print on a passing run. The
correct predicate is **"the Tests line contains no `failed`, and zero test names are reported as
failed"**, not "the Tests line says zero failed". The same round's `-t` filters matched nothing
because a quoted filter name passed through `cmd /d /s /c` is not quoted when it reaches the child,
so every control reported `9 skipped` — a shape indistinguishable from "no tests matched" and, again,
from a pass if only the exit code is read. **A control that reports a shape you did not expect is
evidence about your harness, not about the code under test.**

**A probe that cannot state which mutation it performed cannot be used to correct a claim about a
different one.** This is the mirror image of every lesson above, and it is the one that produced a
confident *wrong finding*. The `coverage-aware-allocation` migration comment states a measured
`Tests 2 failed | 11 passed (13)`. A probe removed only the emptiness precondition — a strict subset
of what the comment describes, which says "deleting this `do` block" — got `1 failed | 12 passed (13)`,
and concluded the comment had misattributed its figure. It had not: removing the whole
`do $$ … end $$;` block reproduces `2 failed | 11 passed` exactly, down to both received messages. The
narrower mutation was simply a different experiment, and the difference between one guard and two is
one failing test. **Before reporting that a documented number is wrong, reproduce it with the mutation
the document describes — and say in the report which mutation you performed, so the next reader does
not have to guess whether a discrepancy is a finding or a different experiment.** An independent
verification pass caught this by re-deriving rather than inheriting, which is the whole argument for
treating an enumeration as a claim.

**A behavioural test cannot pin a guarantee that is the ABSENCE OF A PARAMETER, and the type layer
can.** The spec scenario "a client cannot dictate the batch order" was enforced only by no such field
existing, and the two-file mutation that adds a `clientOrder` field *and honours it* left the suite
green at `51 passed (51)` against a `51 passed (51)` control. The obvious repair — smuggle a client
order into the request and assert it is ignored — was written, measured, and **does not work**: the
mutation honours a field named `clientOrder`, a test smuggling `order` and `positions` never triggers
it, and the suite was still `52 passed (52)`. Enumerating plausible key names cannot close the gap,
because a mutation may name its field anything. What does: an **exact key-set assertion on the
interface**, so any third key — whatever it is called — fails `pnpm run typecheck`. Measured: control
`exit=0 / 0 errors`; with `clientOrder` added, `exit=2`, `TS2322: Type 'true' is not assignable to
type 'never'`. **Put the pin at the layer that can see a key which does not exist yet.**

**A bare-substring anchor is satisfied by a comment, and a test that APPEARS to be a guard while not
being one is worse than no test.** A forward-migration assertion read
`expect(contents).toContain("alter table public.batch_entries")`; replacing the real
`add column position integer;` statement with a comment naming it left the file GREEN at
`13 passed (13)`. The whole-project run did catch the reversal in three other integration files, so it
was not the *only* guard — but the assertion that looked like the guard was not one, and it was
reporting coverage it was not providing. The fix is the one already used elsewhere in this repository:
anchor on the statement's own terminator (`create table public.${table} (`) or on the verb plus its
newline. Re-probed after the fix: the same reversal is `1 failed | 12 passed (13)`.

**A marker that encodes an assumption about the DATA is a guard that has already failed, silently,
and the only evidence is a measurement of how often the marker actually occurs.** A copy-catalog
test asserted the catalogs held no Ilocano instruction via
`expect(values).not.toMatch(/naka|paglakbay|mankagat|nang\s+ako|ang\s+ako\s+ay/)`. Extending it to
the second catalog made it match **legitimate copy** — *"Walang naka-save na pagkakakilanlan"*,
*"Hindi ka pa naka-sign up"* — because `naka` is both an Ilocano root and the Filipino productive
prefix `na-` + `ka-`. That false positive turned out to be the least interesting part: **every one of
those markers matches ZERO of the 600 real instructions.** The synthetic OD dataset is Ayta/Itao
with place-name-first constructions — *"Iti Baguio Athletic Bowl ti ayanko ita; masapulko a
makadanon iti Baguio Convention Center"* — not the `Pumunta sa …` / `Naka-…` shapes the markers
assume. The guard could never fail, and had been reporting coverage it was not providing since the
day it was written; the root review had called that file strong without noticing.

Three things generalise past this instance.

**Measure the marker before trusting the guard.** Count how many of the real records each candidate
matches and how many catalog values it collides with, then keep only what clears both bars. The
measurement is cheap and it is the only thing that distinguishes a guard from a decoration: of the
candidates tried, `\biti\b` hits 531/600 with zero collisions, `ayanko` 100/600, `makadanon` 96/600,
and a seven-marker set covers 568/600 with **zero** collisions in either language — while the
original five cover **nothing**. Note that a marker can fail in *both* directions at once, which is
what happened here: too broad to be trusted on Filipino text, too narrow to fire on the data.

**Prefer a data-driven comparison to a marker whenever the data is readable.** The rewrite reads all
600 records through the project's own `parseSyntheticDataset` and compares them directly —
bilateral containment, both catalogs, plus the 40 distinct place names, every one a proper noun of
at least ten characters and therefore free of the false-positive risk the marker had. It has no
opinion about what Ilocano looks like, so a phrasing change cannot silently disarm it. Proved in both
directions with the control green at `23 passed`: a real instruction pasted into the **Filipino**
catalog gives `2 failed | 21 passed` naming `Filipino key "meta.siteTitle" contains the whole
instruction of OD_0001`, and a real place name pasted into the **English** catalog gives
`2 failed | 21 passed`. **Assert that the guard read a non-empty set** (`expect(entries.length).toBe(600)`),
because a guard that silently read nothing passes every one of its own checks.

**A can-fire control must use the real record, not a sample.** The companion test was built on
`records[0]` deliberately: a hand-written sample would have reproduced the original defect in a
smaller size, since the old markers matched neither the sample nor the data. This is the
same lesson as *"before reporting a documented number is wrong, reproduce it with the mutation the
document describes"* — a control drawn from a fixture tests the fixture.

**And the corollary for review: a reviewer reading a guard must ask what it would take to make it
fail.** Two separate vacuous guards have now been found by exactly that question in this
repository — this one and the `Object.keys({ en: 1, fil: 1 })` literal built inside the test that was
the sole evidence for a research-integrity scenario. Neither was caught by running the suite, by
reading the diff, or by asking whether the tests passed. Both were caught by asking what would have
to be true for the assertion to fail, which is a different question and the one worth asking.

**A required check that reports `success` may have run NO tests at all, and only a reader that
refuses will notice.** This has now happened **four times, and to both jobs**, so treat it as a
property of this repository's CI rather than as a one-off. Run 36726456200 (Sync for
`coverage-aware-allocation`) reported both jobs green and `gh pr checks` said pass while the
`lint, types, and tests` job's step list contained only *Install pnpm* and *Type-check* — **Lint,
Check formatting, Unit tests, Integration tests, and Production build absent from the step list
entirely**, not failed and not skipped. Run 36729647153 (Propose for
`research-schema-guarantee-coverage`) truncated the OTHER job: `immutable research source` reported
`success` while its log contained **only** the *Install pnpm* step — *Check out*, *Install
dependencies* and *Verify the synthetic dataset is unchanged* produced no output, and the log held
**zero** occurrences of `ilocano-synthetic` and zero of any sha-256, which the guard's own output must
contain. **The immutability guard is the one check that can never be skipped, and it is the one that
reported success without running.** `gh run rerun` fixed every instance; the first attempt of run
36730070192 was also truncated and only attempt 2 verified 1 file / 7 tests. The workflow itself has
no matrix, no `if:`, and no conditions, so nothing in the file explains it. What caught it every
time was the reader **refusing** to attribute a summary, which is the same property that has already
saved this project four other times. **Merge on the log, never on the checkmark; treat a refused
reader as a stop; and when a job looks truncated, count the step list against a known-good run
before assuming the code is at fault.**

- `pnpm-workspace.yaml` sets `allowBuilds: { esbuild: true, sharp: false, unrs-resolver: false }`. `esbuild` **must** stay `true` or Vitest cannot start; `sharp` and `unrs-resolver` install scripts are deliberately disabled because nothing in this project uses them.
- `.gitattributes` sets `* text=auto eol=lf` (and `*.ico binary`). This is load-bearing, not cosmetic. `.editorconfig` already declared `end_of_line = lf`, but `.editorconfig` only configures editors and **git does not read it**. Before this file existed, line endings were decided by each contributor's local `core.autocrlf`, which broke two things on a machine with `core.autocrlf=true`: `pnpm run format:check` failed on all 56 formatter-owned files, and a fresh clone produced `data/ilocano-synthetic-data.json` with CRLF and SHA-256 `152ae7e8…` against the guard's expected `39f757e6…`. **The immutability guard hashes the working-tree file, so without this file it fails for autocrlf users and passes on CI.** If your local checks suddenly disagree with CI, check your line endings before suspecting the code.
- Line endings were normalized after `.gitattributes` was added, so **an existing checkout created before that commit still has CRLF working-tree files and will keep failing `format:check` until it is re-normalized**: `git add --renormalize .` then re-checkout the affected files, or simply re-clone. A `git pull` alone will not rewrite the working tree.
- **Ask `git ls-files --eol`, never pipe `git show` through PowerShell, to settle a line-ending question.**
  A check of mine reported 137 CR bytes in a committed blob and nearly triggered a repair to a
  non-problem. The pipeline was the lie: `git show HEAD:<path> | node -e …` hands the blob to
  PowerShell, which re-encodes it as CRLF, so the count reflects the pipe and not the repository.
  `git ls-files --eol` reports the index blob and the working-tree copy separately and is the
  authoritative answer. It showed every index blob in this repository is LF, `data/` is LF so the
  immutability guard is safe, and exactly one working-tree file differed — a file inside the
  prettier-ignored `openspec/` directory, so `format:check` was unaffected either way. The
  underlying cause is `core.autocrlf=true` on this machine, which is the documented condition the
  `.gitattributes` entry above exists to neutralise; the neutralisation protects the *committed*
  content, and a CRLF working-tree copy on an autocrlf machine is cosmetic unless the file is
  formatter-owned or is hashed by a guard.
- **A change name becomes AMBIGUOUS the moment its capability is synced, and the error reads like a broken change.** Syncing `interface-localization` created `openspec/specs/interface-localization/`, and `openspec validate interface-localization --strict` then exited 1 with `Ambiguous item 'interface-localization' matches both a change and a spec.` That is a naming collision, not a defect, and the tempting "fix" — deleting or renaming the spec — destroys the thing that was just synced correctly. Use `openspec change validate <name> --strict`. Both `change …` and `spec …` print a deprecation warning recommending verb-first equivalents, so **the warning is expected and is not a failure**; judge by the exit code and the verdict line. Verify a sync landed by the item count instead: `openspec validate --specs --strict` must rise by exactly one, and here 8/8 → **9/9**.
- **A "loss guard" on a file generated from its own source is true by construction, and calling it a guard overstates it.** The `interface-localization` sync derives the in-force spec from the delta, so `delta body === spec body` cannot fail unless the *transformation* is buggy. Probing it by tampering with the delta still exits 0, because the derived file is then wrong in exactly the same way — the guard confirms a false fact. What it genuinely catches is a bad transform and any later hand-edit of the written spec. The honest claim is "the transformation is faithful", not "no requirement was lost"; the second only becomes true when the *delta* is compared against what was approved, which is what Sync review is for. **Probing a guard with its own input proves nothing about the input.**
- `vitest.config.ts` declares two projects, `unit` and `integration`. `fileParallelism` is not a valid key inside a project config and must not be added there.
- The PGlite harness stubs only `auth.uid()` and `auth.role()`, in a stubbed `auth` schema, and provides **no `auth.users` table**. A migration that references `auth.users` fails in CI. It also grants the `anon`/`authenticated`/`service_role` privileges only *after* the migration files run, so a test that builds its own tables with `db.exec` sees `permission denied for table` for every role including `service_role` and mistakes a grant problem for an RLS result. See `supabase/migrations/README.md`.
- The Supabase repositories are typed against a narrow hand-written client interface rather than `SupabaseClient`, and `factory.ts` presents the real client as that interface with a documented cast. The cast is forced, not stylistic: assigning `AdminSupabaseClient` to the interface fails with `TS2589: Type instantiation is excessively deep` (verified on TypeScript 5.9.3 with `@supabase/postgrest-js` 2.117.2), because relating the real generic builder to a recursive interface exhausts the instantiation budget. What *is* enforced is name-level, by a compile-time check that the real builder still declares every member. Do not "clean up" the cast by typing the repositories against the concrete client: that makes every method in the directory untestable without a network, and there is still no credential that would allow one.
- ESLint has no `varsIgnorePattern`, so the destructure-to-omit idiom (`const { a: _unused, ...rest }`) produces warnings and the project documents zero warnings. Use an explicit object literal, or delete a key.
- **Measure a claim about database behavior instead of asserting it.** A deny-all Row Level Security
  policy is *not* uniform across statement kinds, and the intuitive version is wrong: on the
  PGlite engine, `select`, `update`, and `delete` all complete against zero rows with **no error**,
  and only `insert` raises `new row violates row-level security policy`. Every violation message
  also names the offending constraint, which is why `expectRejected` in
  `tests/integration/research-schema.test.ts` matches a constraint *name* rather than the generic
  phrase `check constraint` — a generic pattern passes when the wrong constraint fires. Two more
  consequences: use `pg_constraint.contype`, not `information_schema.table_constraints`, when you
  want to know what a table actually declares (the information schema reports `NOT NULL` as a
  `CHECK`); and a `truncate` of a single table fails when another table holds a foreign key into
  it, so use the `truncateAll` helper. A `pnpm run test:integration -- <path>` path filter is
  dropped on Linux; use `pnpm exec vitest run --project integration <path>`.
- **Split a bilingual rule across two `CHECK` constraints, never one equivalence, and never two
  overlapping ones.** The tempting single form is
  `(evaluation = 'cannot_evaluate') = (english is null and filipino is null)`, and it is **wrong**: with
  `correct_natural` and only the English translation populated, both sides are false, the equality
  *holds*, and the half-translated row is accepted. An equivalence says two conditions agree; it
  cannot say either is individually required. The fix is one constraint per *direction*
  (`required_when_evaluable`, `absent_when_unevaluable`), and those two must be **non-overlapping**
  so that at most one *of them* rejects a given bad row. PostgreSQL does not promise the order
  `CHECK` constraints are evaluated in, so with two constraints rejecting the same row the name in
  the error message is whichever the planner reached first — and every test that matches a
  constraint *by name* would then be asserting an accident. This was measured, not reasoned: the
  first draft used the equivalence, and the test for "an evaluable row with no translations" failed
  because the wrong constraint fired. **Scope the claim to those two constraints**: 80 of the 108
  `(evaluation x correction x english x filipino)` cells are in fact rejected by more than one
  constraint, because the per-column `not_blank` checks and the correction constraint overlap them
  freely. Nothing depends on those being unique, and every name-matched rejection test was checked
  against the overlap list and sits on a cell where exactly one constraint fires. An earlier draft
  of this entry claimed uniqueness across *all* constraints, which is false.
- **A test that asserts "no data was lost" inside a transaction cannot detect statement order.** The
  PGlite harness applies each migration file inside one transaction, so a `raise exception` rolls
  the whole file back and a `drop column` that had already executed is undone with it. A test
  asserting "the superseded columns are still there after the refusal" therefore passes with the
  drop moved *above* the precondition — confirmed by probe, not by reasoning. The lesson generalises
  past SQL: **inside a transaction, rollback erases the evidence of everything before the failure**,
  so no post-failure assertion can distinguish "the check ran first" from "the drop ran first".
  When order matters, the order must be enforced *in the artefact* — here the precondition asserts
  that `translation_language` still exists and raises by name if it does not, so a drop-then-check
  file fails loudly instead of proceeding from a schema that has already lost the data. A test for
  that is genuinely red-on-reversal. It has **three** witnesses in
  `tests/integration/migration-precondition.test.ts` under a real reversal, not the one an earlier
  draft of this entry implied: the ordering test, plus both of the "applies cleanly" tests, which
  go red because the columns are gone before the precondition looks. Removing the assertion while
  keeping the reversal still goes red on exactly one test — the ordering test — and with an
  **unexplained** error (`column "translation_language" of relation does not exist`) arriving after
  the data is already lost. That last measurement is the one that shows what the assertion buys.
- **A content-hash guard must compare against a FIXED constant, never against a mutated copy of the
  file under test.** An earlier version of `tests/integration/migration-precondition.test.ts`
  computed `sha256(contents)` and then asserted `sha256(contents.replace(...)) !== digest`. That is
  satisfied by construction for *any* file content; it proved only that SHA-256 is not the identity
  function. A probe confirmed it: renaming an index inside `20260930120000_research_schema.sql` left
  all 7 tests green. Derive the expected digest from the base branch with
  `git cat-file -p main:<path> | node -e "..."` and paste it in as a constant, exactly as
  `immutable-dataset.test.ts` already does for the dataset blob. **A PowerShell pipeline in the
  middle re-encodes the bytes** — the same blob produced three different hashes through `git show >`
  (UTF-16LE with a BOM) versus `git cat-file`. Do the hashing in Node with no shell in the path.
- **`ADD CONSTRAINT ... CHECK` validates existing rows, so a schema-level guard is not the same as a
  migration-level precondition.** `supabase/migrations/20260930160000_required_bilingual_translations.sql`
  raises explicitly when pre-existing evaluable rows are present, and the obvious negative control —
  delete the precondition block, watch the refusal tests go red — *fails*, because the migration
  still refuses on the constraint. The precondition's real value is that the failure is
  **explanatory**: it names the conflict and states the migration will not discard or fabricate data.
  Both behaviours are measured in `tests/integration/migration-precondition.test.ts`. The lesson
  generalises: a guard that has a second, incidental guard behind it cannot be validated by
  "remove it and watch it break" — measure what it actually *changes*, or the control proves
  nothing while appearing to.
- **`tests/integration/pglite-harness.test.ts` is order-dependent and fails under
  `--sequence.shuffle`.** Four of its eleven tests fail at a shuffled seed, because the file shares
  one database across its tests with no `beforeEach` reset: the uniqueness, foreign-key, and RLS
  tests all depend on rows inserted by *other tests in the same file* and on the fixture migration
  having been applied by a test that may not have run yet. This is **pre-existing** and unrelated to
  the translations work — confirmed by `git diff main -- tests/integration/pglite-harness.test.ts`
  returning empty. The default (unshuffled) run passes, and the file is excluded from shuffle
  verification. Fix it by giving each test its own database or adding a `beforeEach` reset; do not
  "fix" it by removing the shuffle check.
- **A probe scoped to ONE test file reports the rest of the suite as silent, and the report is
  indistinguishable from a finding.** A mutation probe was run as `vitest run --project unit
  tests/unit/screening-form-wiring.test.ts` and returned three sites "unguarded". Re-run at
  `--project unit` with no path filter, one of those three is **guarded** — by
  `tests/unit/onboarding-routes.test.tsx:208`, a file the narrow probe never executed. The site
  is fine; the *scope* was wrong, and the wrong scope produced a confident wrong claim. This is
  the same defect as the CI step that claims to run a subset and reports green: **the step ran a
  subset, and the green said nothing about the rest.** Before concluding anything from a scoped
  run, **enumerate what actually reads the file under test** — `Select-String -Path
  tests/unit/*.ts,tests/unit/*.tsx -Pattern '<basename>' -List` — and run at that scope, or state
  in the report that the scope is partial. A probe may narrow scope for *speed* only if it says
  so and the full-scope run also happens.
- **An inherited remediation figure in the status ledger is a CLAIM, and this repository already
  contains the record that contradicts it.** The ledger carried "21 unguarded client-shell call
  sites, two of them critical" as the next objective through **five** merged changes. Re-deriving
  it gave **7 unguarded of 10 probed, 4 critical** — wrong in both directions: the count was far
  too high, *and* four critical research-integrity sites were open that the old figure never
  described. Three parts of why it survived so long, each worth checking: the number was carried
  and the *method* was not; its **line numbers** had all moved across four changes; and its
  **labels no longer matched its own text** — the archive calls `screening-form.tsx:232` "the
  PRIMARY submit", but `disabled={isPending}` occurs exactly once in the current file and belongs
  to the `AnswerGroup`, while *both* buttons bind `disabled={submitState.disabled}`. A probe
  anchored on the archived label therefore mutates the skip affordance and reports it as the
  primary — a wrong experiment wearing a right one's name. **Anchor on text, assert the
  occurrence count, and label from the code.** The archived change that produced the enumeration
  said the right thing itself: *an enumeration in this project is a claim to be re-derived, not a
  fact to be inherited.*
- **The ANSI-strip-without-the-escape-byte bug has now appeared a FOURTH time, in a new form, and
  the new form is worse.** Written as `/\[[0-9;]*[A-Za-z]/g` — no `\u001b` — the `[` matches
  literally, every strip leaves a bare U+001B in front of the text, and any `^\s*` anchored
  pattern matches **nothing**. Previously that made a `Tests … failed` predicate miss a genuinely
  red run and **score it green**. This time it matched no `FAIL` line at all, so three real reds
  were captured as **zero** names. An empty capture is the more dangerous sibling: the red was
  real, and the harness would have let it pass unexamined while reporting nothing. Ground truth,
  read in Node and never off a console: `\u001b[41m\u001b[1m FAIL \u001b[22m\u001b[49m …` — after a
  correct strip the line begins ` FAIL `. **Refuse to score `named=false` as anything but NOT
  ATTRIBUTABLE**, and keep both notations (`0x1b` for real output, the two literal characters `^[`
  for `gh run view --log`).
- **A probe that cannot run at all must be distinguishable from one that ran and refused — and a
  syntax error is not distinguishable from a refusal if only the exit code is read.** A probe
  shipped with a stray `)` in a `while` condition: it printed nothing, ran nothing, and exited
  **1**, which is byte-for-byte the same signal a scored red would give. Four shapes, not three,
  and the fourth is the dangerous one: `GREEN` / `RED` / `DID-NOT-RUN` / **`DID-NOT-PARSE`**. Run
  `node --check <probe>` first and require exit 0 before trusting any verdict from it. A second
  defect in the same probe: it printed each mutation's replacement through a multiline template
  literal, and the `+` lines came out **empty**, so the probe could not state which mutation it
  performed — and a probe that cannot state its mutation cannot be used to correct a claim about a
  different one. Print the **common prefix/suffix delta** between original and mutant, plus the
  mutant's sha256, instead of the replacement text.
- **Your own display pipeline will eat your own output, and it looks exactly like an instrument
  defect.** `Select-String -NotMatch '^\s*\+'` — written to strip PowerShell's `+ CategoryInfo`
  noise — silently deleted the probe's own `+ mutation` lines from every report, making a
  **correct** report look like it had printed nothing. Two of four "defects" investigated in one
  round were the console, not the code. The same failure as the `git show` pipe and the `U+2026`
  mis-render already recorded here: **judge a run by the bytes, not by what a PowerShell pipeline
  printed.**
- **An intermittent failure whose cause stays unknown must be recorded as unresolved — but check
  first whether your reproduction method can produce the condition, because "cannot be reproduced"
  is a statement about the method.** The entry this one replaces read, in the earlier version of
  this file, that a `test:unit` failure was *"never named"* because *"both readers built to name it
  were broken"*, and that its *"cause is unknown"*. **Both halves of that were falsified**, and the
  mistake was the method rather than the flake.

  The cause was `Test timed out in 5000ms` — Vitest's **default** `testTimeout`. This repository
  declared one for `dom` and for `integration` and left `unit` on the library default, while `unit`
  contains tests that do real work. It affected **four** files, not one.

  It was load-dependent, and that is the whole entry. **One sequential run produced it never; four
  concurrent full suites produced it in 10 runs of 12.** Thirty sequential reproduction attempts
  were thirty attempts with the cause removed. The `2 in ~30 on the branch against 0 in 10` control
  was measuring nothing, because both arms removed the cause — so *"a negative result from a
  reproduction method that cannot produce the condition is not a negative result"*, which is the
  sharper form of the *"a negative result is not a cause"* this file already recorded. Before
  concluding a flake is unreproducible, ask what condition produces it and **create that condition**:
  saturate the CPU, run suites concurrently, run on a slower machine. A flake that never appears on
  your machine and would appear on CI is not a flake you have disproved.

  Two further generalisations from the fix:

  - **A declared timeout is a design decision, and an undeclared one is too — the library default
    is not a neutral choice.** Per-project `testTimeout` values that differ by 12x (`dom` 15 000,
    `integration` 60 000, `unit` 5 000) meant one project was held to a limit nobody wrote down.
    Audit the project that got the default, not the ones someone tuned.
  - **Fix the source before granting the time.** The dominant offender made **204,000** individual
    `expect()` calls (2 catalogs x 85 keys x 600 entries x 2 directions). Raising the timeout would
    have concealed that and reported a fix. Collecting the violations and asserting once per
    catalog was orders of magnitude faster **and reported strictly more** — the cell-by-cell form
    stopped at the first violation, while the collected form named all 29 in one failure. **A
    timeout raised to stop a flake is a diagnosis deferred; measure what the test is doing.**

  And the standing rule this entry originally got right, kept: **record a rate, and do not attribute
  an intermittent failure to whichever change happened to be open.** What was ruled out by search
  rather than assumption, and remains true — `Date.now` 0, `performance.now` 0, `Math.random` 3 (all
  in comments asserting a random source has no default), `randomUUID` 0, `getRandomValues` 0,
  `os.tmpdir`/`mkdtemp` 0, `process.env` 1 (in a comment), and the single `setTimeout` sits inside a
  promise its test awaits, so it is deterministic. **A negative result is not a cause** — and neither
  is thirty of them from a method that could not have produced one.
- **A `RegExp.exec` index taken from `src.slice(a, b)` is relative to the slice, and splicing it
  back into the un-sliced string corrupts the artefact.** A probe intended to edit one catalog's
  first entry wrote `"meta.siteTitle": "…",ort type { InterfaceLocale } from "@/lib/domain/locale";`
  at **line 5** of the file, splicing the replacement into the middle of an import. The suite then
  reported `Failed Suites` and `no tests` — and the `DID-NOT-PARSE` refusal is the only reason that
  was not scored as evidence that the guard fires. The general form: **an offset is only meaningful
  relative to the string it was computed from**, so any code that searches a slice and writes into
  the original must add the base offset back. A probe that finds an anchor with
  `src.slice(FROM, TO)` and then splices into `src` should be read as a bug until the offset
  addition is visible. Note the related trap one line away: `indexOf("FILIPINO_COPY")` matched an
  earlier *mention* of the name rather than its `export const` declaration, so a probe labelled
  "Filipino" edited the English catalog — and the guard, firing correctly, named the wrong language.
  **Anchor on the declaration (`^export const NAME`) and assert the declaration offsets are in the
  expected order**, or the probe will be honest about the wrong file.

- **A classifier whose expected argument shape differs from what its caller passes reports an EMPTY
  CAPTURE, and an empty capture is the one result indistinguishable from a clean run.** A probe written to
  settle `tasks.md` 1.4 — does the migration's precondition actually produce the *named* refusal — went
  through three harness defects before it measured anything, and **all three would have been reported as
  findings had the control not been run first.**
  1. It shelled out via `cmd.exe /d /s /c` **with** `shell: true`, and the explicit `/d /s /c` arguments
     were then quoted a *second* time by the shell `shell: true` already invokes. The control came back
     with no vitest summary. The fix is the pattern already proven in this project's probes: spawn
     `process.execPath` with `["node_modules/vitest/vitest.mjs", "run", ...]` and **no shell at all**, so
     the argv-quoting hazard has no path to the command. `shell: true` is for the `pnpm` shim; it is wrong
     for `node`, and it is worse than wrong when combined with explicit `cmd.exe` arguments.
  2. `classify()` was written against the `execFileSync` **result object** (`result.stdout`,
     `result.stderr`); the rewritten runner passed it a **string**. Both property reads yielded
     `undefined`, the function concatenated two empty strings, and every run classified
     `NOT-ATTRIBUTABLE` with no output. **This is the empty-capture failure recorded four times above,
     reached by a route nobody would have predicted: not a bad regex, not an encoding, but a function whose
     parameter type drifted from its caller's.** `String(undefined ?? "")` is the quietest way to
     manufacture a blank measurement, because it is not a crash and not a wrong number — it is nothing.
  3. The reporter then did `for (const n of r.failedNames)`, which **threw `TypeError: r.failedNames is
     not iterable` on exactly the path the reporter existed to report.** A harness that dies on an
     unexpected outcome reports nothing, so the defensive `r.failedNames ?? []` is not decoration.

  **The generalisation, and it is about the order of operations rather than about any of the three:** the
  control is what turns a broken instrument into a refusal instead of a result. A green control and a green
  probe are indistinguishable without it, so a harness that cannot produce a green control has not
  measured anything — it has only failed to notice. Two smaller lessons from the same round: an encoding
  census tool that ran `node --check` on a Markdown file reported `ERR_UNKNOWN_FILE_EXTENSION` on a
  perfectly clean file and exited 1, which is the *false positive that teaches its reader to ignore it*
  recorded above, now committed by this repository's own instrument — so an absent check must be reported
  as absent, never as a pass and never as a failure; and a probe that rewrites a source file must print
  **the removed text, the inserted text, and the mutant's own sha256** rather than its replacement, or
  the next reader cannot tell a finding from a different experiment.

---

## Code style


- Prefer small domain modules over giant dispatchers or god objects.
- Use explicit names and domain types; avoid untyped dictionaries/objects crossing modern domain boundaries.
- Keep transport, domain logic, persistence, and presentation separate.
- Prefer pure functions for reusable calculations where practical.
- Handle failures explicitly; never silently swallow exceptions.
- Do not leave dead compatibility code after its replacement is verified and the related migration explicitly retires it.
- Use consistent import conventions in new application packages.
- Keep scenes/components/modules focused; do not create giant global managers.
- Limit global/autoload/singleton services to genuine cross-cutting concerns such as ``Supabase/data access``, ``anonymous validator identity``, ``batch allocation``, ``validation persistence``, ``admin authorization``, and ``dataset export``.
- Match the existing formatter/linter conventions when they are already established.
- Prefer existing project abstractions over introducing parallel competing patterns.
- Avoid speculative abstractions that are not needed by the active task.
- Keep public interfaces small and explicit.
- Prefer composition over deep inheritance unless the framework or domain clearly benefits from inheritance.
- Keep framework-specific code at system boundaries where practical rather than spreading it through domain logic.

---

## Testing

- Every migrated or replaced legacy behavior must have a captured fixture or equivalent behavioral evidence before replacement when parity matters.
- Prefer golden fixtures containing `request`, `before`, `response`, and `after` state when applicable.
- Bug fixes require a regression test when the affected system has test infrastructure.
- Server-authoritative actions must test invalid ownership, insufficient resources, duplicate requests, stale revisions, and invalid state where applicable.
- Runtime/asset changes must not reintroduce retired or prohibited runtime dependencies.
- Run every relevant available check before finishing.
- Do not claim tests passed unless they were actually run.
- If a required check cannot be run, report exactly why.
- Never convert “code compiles” into “tests pass.”
- Test behavior at the narrowest useful layer first, then add integration/E2E coverage where system boundaries matter.
- Do not weaken existing tests simply to make a change pass.
- Do not delete failing tests without determining whether the implementation or the test is wrong.
- When a test is intentionally changed because behavior changed, ensure the approved requirement/specification supports that change.
- Verification evidence must distinguish automated tests, static checks, manual inspection, runtime checks, and inferred conclusions.

---

## Boundaries — do not touch


- Never delete original/reference/source material merely because a replacement exists unless its retirement is explicitly approved.
- Never overwrite raw source assets during conversion; write generated/converted/runtime assets separately.
- Never silently drop unknown legacy/data fields during migration; preserve them for migration analysis when applicable.
- Never manually edit generated files under `.agents/skills/`.
- Never commit `.env`, `.env.*`, credentials, tokens, private keys, or production secrets.
- Never hardcode production secrets.
- Never package prohibited/retired runtimes or dependencies into the final application.
- Do not modify reference/legacy behavior merely to make modern implementation easier; document and reproduce it first when parity is required.
- Never modify generated artifacts by hand when a canonical generator owns them.
- Never bypass security boundaries for convenience.
- Never weaken authentication, authorization, validation, sandboxing, permission checks, or trust boundaries without explicit requirements.
- Never delete user data, migration data, production data, or preservation material as part of ordinary feature work.
- Do not modify CI/CD, deployment, infrastructure, security, or repository governance unless the active task requires it.
- Do not touch `raw source datasets under `data/` (especially `data/ilocano-synthetic-data.json`) and any other explicitly designated immutable research-source files` unless the active task explicitly requires it.

---

## Change scope

- Make the smallest coherent change that satisfies the active task/OpenSpec change.
- Do not perform unrelated refactors or cleanup.
- Do not modify unrelated files.
- Do not upgrade dependencies without a concrete reason.
- Do not reorganize existing files during feature work unless the active change requires it.
- Use `git mv` when relocating preserved repository files where practical.
- Preserve existing behavior unless the task or approved spec explicitly changes it.
- Do not alter unrelated product behavior during parity, migration, or focused feature work.
- Prefer one domain/vertical slice at a time.
- Avoid “while I am here” changes.
- Separate required cleanup from optional cleanup.
- When additional work is discovered outside scope, record/report it rather than silently expanding the current change.
- Do not broaden an OpenSpec change simply because related opportunities are discovered during implementation.

---

## Migration order


Unless an approved OpenSpec change intentionally requires otherwise:

    Project foundation
        ↓
    Database schema and Origin + Destination dataset import
        ↓
    Landing page, screening, and anonymous validator setup
        ↓
    Coverage-aware allocation engine
        ↓
    Core per-entry validation experience
        ↓
    Batch completion, continuation, and interrupted-batch handling
        ↓
    Protected researcher/admin dashboard
        ↓
    Research-data export pipeline
        ↓
    Quality assurance and security/accessibility verification
        ↓
    Pilot validation and protocol refinement
        ↓
    Production crowdsourcing and coverage monitoring
        ↓
    Research review, adjudication, and final validated dataset export

The first major target is `an end-to-end MVP where an anonymous screened validator receives a coverage-aware batch of 10 imported Origin + Destination entries and each completed validation is persisted correctly`, not `advanced gamification, complex analytics, automated adjudication, map/routing features, or other post-MVP infrastructure`.

---

## Git / PR workflow

`main` is the integration branch. Never perform planned work directly on `main`.

Every repository-mutating OpenSpec stage must use a remote branch and PR. Local-only working branches are not allowed.

### Branch naming

Branch names describe the technical work, not the raw OpenSpec change name.

- Proposal/docs: `docs/<technical-scope>-proposal`
- Feature: `feat/<technical-scope>`
- Fix: `fix/<technical-scope>`
- Refactor: `refactor/<technical-scope>`
- Tests/validation: `test/<technical-scope>`
- Technical spike: `spike/<technical-scope>`
- Spec sync: `docs/<technical-scope>-spec-sync`
- Archive: `chore/archive-<technical-scope>`

Examples:

- `docs/<technical-scope>-proposal`
- `feat/<technical-scope>`
- `fix/<technical-scope>`
- `docs/<technical-scope>-spec-sync`
- `chore/archive-<technical-scope>`

Do not use the OpenSpec change ID as the branch name unless it is also the clearest technical description.

### Branch lifecycle

Before starting any repository-mutating stage:

1. Check `git status`.
2. Switch to `main`.
3. Pull the latest `origin/main`.
4. Create a new branch from the updated `main`.
5. Immediately push the new branch to `origin` and set upstream tracking.
6. Only then begin modifying files.

Never leave active repository work only on a local branch.

Recommended pattern:

    git switch main
    git pull --ff-only origin main
    git switch -c <branch-name>
    git push -u origin <branch-name>

### OpenSpec Git lifecycle

#### Explore

`/openspec-explore` is normally read-only.

If no repository files change, no branch or PR is required.

If exploration intentionally modifies tracked documentation, treat it as a normal repository-mutating stage and use a branch + PR.

#### Propose

For `/openspec-propose`:

1. Start from updated `main`.
2. Create a technical proposal branch such as `docs/<scope>-proposal`.
3. Immediately push the branch to `origin`.
4. Create/update the OpenSpec proposal, design, specs, tasks, and roadmap status.
5. Review the diff.
6. Commit using Conventional Commits.
7. Push all proposal commits to the remote branch.
8. Open a PR into `main`.
9. After required checks pass, merge the PR using a **merge commit**.
10. Delete the merged local and remote branch.
11. Return to `main` and pull the merged result before starting Apply.

Proposal artifacts should be committed and pushed so the exact remote PR diff can be reviewed.

Do not reuse the proposal branch for Apply.

#### Apply

For `/openspec-apply-change`:

1. Ensure the proposal PR has already been merged.
2. Return to `main`.
3. Pull the latest `origin/main`.
4. Create a new implementation branch from `main`.
5. Immediately push the new branch to `origin`.
6. Apply only the approved OpenSpec tasks.
7. Commit coherent implementation steps using Conventional Commits.
8. Push commits regularly to the remote branch.
9. Run all required verification.
10. Review the final diff and test results.
11. Open or update the PR into `main`.
12. Merge after required checks pass.
13. Merge using a **merge commit**.
14. Delete the merged local and remote branch.
15. Return to updated `main`.

Do not reuse the proposal branch for Apply.

Do not begin Sync or Archive from an unmerged Apply branch.

#### Sync

If `/openspec-sync` modifies repository files:

1. Ensure the Apply PR has already been merged.
2. Return to `main` and pull latest `origin/main`.
3. Create `docs/<scope>-spec-sync`.
4. Immediately push it to `origin`.
5. Run the approved OpenSpec sync.
6. Review the diff.
7. Commit using Conventional Commits.
8. Push the commit(s).
9. Open a PR into `main`.
10. Merge using a **merge commit** after required checks pass.
11. Delete the local and remote branch.
12. Return to updated `main`.

Skip this stage when no spec synchronization is required.

#### Archive

For `/openspec-archive`:

1. Archive only after Apply and any required Sync are merged.
2. Return to `main`.
3. Pull latest `origin/main`.
4. Create `chore/archive-<technical-scope>`.
5. Immediately push the branch to `origin`.
6. Run the OpenSpec archive workflow.
7. Update Project Status, roadmap references, and archive links where required.
8. Review the diff.
9. Commit using Conventional Commits.
10. Push the archive commit(s).
11. Open a PR into `main`.
12. Merge after required checks pass.
13. Merge using a **merge commit**.
14. Delete the local and remote branch.
15. Return to `main` and pull latest `origin/main` before beginning the next roadmap phase.

### Commit conventions

Use Conventional Commits:

- `feat:` new product capability
- `fix:` bug fix
- `refactor:` behavior-preserving restructuring
- `test:` tests or technical validation
- `docs:` documentation/specification
- `chore:` repository/tooling/archive maintenance

Examples:

- `docs: propose <technical scope>`
- `test: add <technical validation>`
- `feat: add <product capability>`
- `fix: prevent <bug>`
- `docs: sync <technical scope> requirements`
- `chore: archive <technical scope>`

Keep commits coherent and scoped.

Do not bundle unrelated changes into one commit.

### PR / merge conventions

- Every Propose, Apply, Sync, and Archive stage that changes repository files must go through a PR into `main`.
- Never silently commit completed stage work directly to `main`.
- Keep one coherent OpenSpec stage per branch.
- Open the PR from the remote branch, not from local-only work.
- Use **merge commits only** for OpenSpec and development PRs.
- Do **not** squash merge.
- Do **not** rebase merge.
- Preserve branch topology and individual branch commits in Git history.
- When using GitHub CLI, merge with:

      gh pr merge <PR_NUMBER> --merge --delete-branch

- Do not use:

      gh pr merge <PR_NUMBER> --squash

  or:

      gh pr merge <PR_NUMBER> --rebase

- Do not replace the default GitHub merge-commit title unless there is a specific reason.
- Prefer preserving the normal GitHub merge message, for example:

      Merge pull request #123 from owner/feat/<technical-scope>

- Delete local and remote branches only after the PR has successfully merged.
- The PR and merge commit are the permanent historical record after branch deletion.
- Never begin the next OpenSpec stage from an unmerged branch.
- After every merge, switch back to `main` and update it from `origin/main` before creating the next branch.

### Expected OpenSpec branch flow

For one OpenSpec change, the normal flow is:

    main
      │
      ├── docs/<scope>-proposal
      │      ↓ push remote immediately
      │      ↓ /openspec-propose
      │      ↓ commit + push
      │      ↓ PR
      │      ↓ merge commit
      │
      ├── feat|spike|test/<scope>
      │      ↓ push remote immediately
      │      ↓ /openspec-apply-change
      │      ↓ implementation
      │      ↓ verification
      │      ↓ commit + push
      │      ↓ PR
      │      ↓ merge commit
      │
      ├── docs/<scope>-spec-sync
      │      ↓ only if sync is required
      │      ↓ /openspec-sync
      │      ↓ PR
      │      ↓ merge commit
      │
      └── chore/archive-<scope>
             ↓ /openspec-archive
             ↓ update roadmap/status
             ↓ PR
             ↓ merge commit
             ↓ delete branch
             ↓ return to updated main

### Git safety

- Check `git status` before significant work.
- Inspect `git diff` before every commit.
- Inspect the final diff before opening a PR.
- Never discard existing user changes.
- Never force-push unless explicitly authorized.
- Never use destructive Git operations unless explicitly authorized.
- Never rewrite history unless explicitly authorized.
- Never merge a PR with failing required checks unless explicitly authorized.
- Never claim a branch was pushed, a PR was opened, or a merge occurred unless it actually happened.

---

## Source of truth

When deciding what the project should do, use this order:

1. Explicit user/task requirements
2. Approved active OpenSpec change
3. `openspec/specs/`
4. `docs/ROADMAP.md`, approved product/design/data contracts, and immutable research-source datasets when applicable
5. Existing implementation and architecture
6. Tests
7. Repository documentation
8. Agent assumptions

When sources conflict, investigate the conflict. Do not silently invent a resolution.

For preservation/parity work, observed reference behavior is evidence; an accidental implementation difference is not automatically an improvement.


---

## Existing / brownfield project rules


Before modifying an existing capability:

- Inspect its implementation.
- Search ``src/app/`, `src/components/`, `src/lib/`, `src/schemas/`, `supabase/`, `data/`, `openspec/`, `docs/ROADMAP.md`, and related tests` as applicable.
- Read the relevant OpenSpec spec/change.
- Check `openspec/changes/` for active work.
- Identify the current request → state mutation → response/output behavior.
- Capture or locate behavioral fixtures before replacing existing behavior when parity matters.
- Do not assume undocumented means unused.
- Do not rewrite working systems merely because they are unfamiliar.
- Classify obscure systems explicitly as implemented, parity-verified, retired, deprecated, experimental, or out-of-scope.
- Identify consumers before changing public interfaces.
- Search for tests, documentation, migrations, fixtures, generated code, and external contracts connected to the capability.
- Preserve backwards compatibility when required by the active specification.
- Distinguish accidental implementation details from externally observable behavior before reproducing them.

---

## Spec-driven development — OpenSpec

This project uses OpenSpec for nontrivial behavioral and architectural changes.

Expected structure:

    openspec/
    ├── config.yaml
    ├── specs/
    └── changes/

Rules:

- Check `openspec/changes/` before starting nontrivial implementation.
- Continue an existing relevant change instead of creating a duplicate.
- Read the relevant `openspec/specs/` capability before modifying it.
- Create/propose a change before implementing new nontrivial behavior when no appropriate change exists.
- Keep implementation aligned with the active change's requirements, design, and tasks.
- If implementation reveals a missing or incorrect requirement, update the change instead of silently diverging.
- Do not expand an active change with unrelated work.
- Sync approved behavior back into main specs and archive completed changes using the installed OpenSpec workflow.
- Do not manually edit generated `.agents/skills/`; use `openspec update` when regeneration is required.

Typical workflow:

    Explore → Propose → Apply → Verify → Sync → Archive

Use exploration for investigation only; it is not permission to implement.

OpenSpec owns feature requirements and change artifacts. This file owns durable repository-wide engineering rules.

---

## Reconstruction workflow


For each migrated/reconstructed/replaced feature:

    1. Inspect the existing/reference implementation and related resources.
    2. Identify interfaces/endpoints/state/dependencies involved.
    3. Capture or locate reference fixtures/evidence when applicable.
    4. Read/create the OpenSpec change.
    5. Implement the smallest complete behavior.
    6. Add/update tests.
    7. Replay/compare against reference behavior when parity matters.
    8. Perform visual/runtime verification when relevant.
    9. Update migration/project status and documentation.
    10. Inspect diff and report checks actually run.

Do not mark an existing/reference feature replaced until parity has been verified or an approved spec explicitly changes its behavior.

---

## Orchestration mode

For nontrivial OpenSpec changes, the root Codex agent acts as the orchestrator.

- Use real Codex subagents when work can be divided into concrete, independent tasks without overlapping file ownership.
- The root orchestrator owns the active OpenSpec artifacts and task status.
- Implementation subagents must not independently edit `proposal.md`, `design.md`, specs, or `tasks.md` unless explicitly assigned that responsibility.
- Assign each worker a bounded task, owned files/directories, requirements, dependencies, and required verification.
- Do not parallelize tasks that depend on unfinished interfaces or behavior.
- Do not have multiple agents edit the same files unless intentionally coordinated.
- Worker agents must report files changed, checks run, results, and unresolved concerns.
- The root orchestrator must review worker diffs/results before accepting them.
- After implementation, use a separate verification pass or verifier subagent to compare the actual implementation against the active OpenSpec artifacts.
- Do not trust checked task boxes as evidence; inspect the implementation.
- Run OpenSpec strict validation and the installed OpenSpec verification workflow before considering the change complete.
- Any unresolved CRITICAL verification issue blocks completion.
- Any unresolved WARNING blocks completion unless explicitly accepted by the user or active specification.
- If verification fails, create bounded repair tasks, delegate when useful, then rerun verification.
- Only the root orchestrator may declare the OpenSpec change complete.
- Worker subagents should not spawn additional subagents unless the root explicitly authorizes nested delegation.

### Subagent

- Default to at most two active subagents per root session.
- Preferred roles are:
  1. implementation agent
  2. verification agent
- The root agent remains the orchestrator and owns OpenSpec artifacts, architectural decisions, integration, and final acceptance.
- Do not spawn additional agents merely because work can technically be parallelized.
- Prefer sequential delegation when the verifier depends on implementation output.
- Spawn additional agents beyond this default only when the task has clearly independent workstreams and the expected benefit outweighs duplicated context/token cost.
- Give subagents only the context necessary for their assigned task; do not require every subagent to rediscover the entire repository.

### OpenSpec bootstrap and resume

The root orchestrator must support both bootstrap and resume workflows.

Before creating a new OpenSpec change:

- Inspect `openspec/changes/` and the project status recorded in the development roadmap.
- If a relevant active change already exists, resume it instead of creating a duplicate.
- If a completed but unverified or unarchived change exists, finish its verification/lifecycle before creating another dependent change.
- If no active change exists, use the development roadmap and current repository state to determine the smallest coherent next change.
- Use OpenSpec exploration before proposing a new change when repository investigation, existing/reference behavior, architecture, dependencies, or scope need confirmation.
- Exploration must not implement code.
- After exploration is sufficiently resolved, create the change with the installed OpenSpec propose workflow.
- Validate the generated change before implementation.
- Do not create an OpenSpec change for the entire development roadmap. The roadmap is the program-level plan; OpenSpec changes are bounded implementation units.
- Do not skip ahead to a later roadmap milestone while required exit criteria or dependencies of the current milestone remain incomplete.
- Default to completing one OpenSpec change per orchestration run unless the user explicitly requests continuous milestone execution.

### Development roadmap ownership

The development roadmap contains a root-orchestrator-owned `Project Status` block.

- Only the root orchestrator may update the roadmap's `Project Status` block.
- Implementation and verification subagents must not modify the roadmap unless explicitly assigned.
- Treat the status block as a progress ledger, not as the behavioral source of truth.
- OpenSpec specs and active change artifacts remain the source of truth for specified behavior.
- Repository implementation and tests provide implementation evidence.
- Reconcile the roadmap status against Git, OpenSpec, and the repository before trusting stale status from a previous session.
- Update project status whenever the active change enters a meaningful lifecycle transition: proposed, implementing, verifying, blocked, verified, archived, or completed.
- Record blockers and unresolved verification findings rather than hiding them.
- After archiving a verified change, update the roadmap cursor to the next eligible objective but do not automatically begin that change unless the current orchestration request allows it.
