# ROADMAP.md

# Sadino Crowdsourcing Validation Platform

## Project Status

> This block is a **progress ledger owned by the root orchestrator**, not a behavioral
> specification. `AGENTS.md` and `openspec/` remain the source of truth for rules and for
> specified behavior. Reconcile this block against Git, OpenSpec, and the repository before
> trusting it.

| Field | Value |
| --- | --- |
| Current roadmap phase | Phase 1 — Project Foundation |
| Current OpenSpec change | `project-foundation` |
| Lifecycle state | `verifying` — Apply implementation complete on `feat/project-foundation`; full local gate green; independent verification pass in progress |
| Completed milestones | Repository + roadmap + synthetic dataset bootstrap (`main` @ `81b3115`); Project Status ledger + roadmap reference reconciliation (PR #1, `567ab42`); `project-foundation` proposal authored, strictly validated, and merged (PR #2, `f451a01`) |
| Last merged PR / change | #2 — `docs: propose project foundation` (`f451a01`) |
| Next eligible objective | Merge Apply PR for `project-foundation`, then Sync and Archive it; advance the cursor to `od-dataset-schema-and-import` |
| Blockers | See "Active Blockers" below |

### Local Verification Evidence — `project-foundation` (2026-09-30)

Recorded so the ledger reflects observed results rather than intent. Every command below was
executed and exited 0 on Windows/PowerShell, Node.js `v26.10.0`, pnpm `12.6.0`.

| Command | Observed result |
| --- | --- |
| `pnpm install --frozen-lockfile` | exit 0 |
| `pnpm run lint` | exit 0, no errors or warnings |
| `pnpm run format:check` | exit 0, "All matched files use Prettier code style!" |
| `pnpm run typecheck` | exit 0 |
| `pnpm run test:unit` | exit 0 — 12 files, **235 tests passed** |
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
- `.github/workflows/verify.yml` passed on its first observed run (36612616260, PR #3,
  `ubuntu-latest`) with counts identical to local. It is not yet trusted as a *subset* runner: that
  run's dataset-guard job silently lost its path filter on Linux, which is fixed but not yet
  re-confirmed from a run log.
- There is **no screenshot-based or human-eye visual verification** of the design. No desktop
  browser was connected. The design was verified through rendered-HTML assertions, emitted-CSS
  inspection, and component markup tests. A human still needs to look at the landing page.
- `getServerEnv()` / `getClientEnv()` are covered only by type-check and by tests of their pure
  `parse*(source)` functions; the `process.env`-reading wrappers are not executed by any test.
- No repository *implementation* exists yet. `src/lib/repositories/` is interfaces only by design,
  so no persistence semantics (the `UNIQUE (validator_id, dataset_entry_id)` constraint, RLS, or
  distinct-validator coverage counting) are proven by anything in this change.

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
    `pnpm run test:integration` exits 0 with 18 passing tests against a real engine. The
    remaining unverified surface is Supabase-managed behavior (Auth, Storage, Realtime, the
    `auth` schema, and RLS as enforced by the Supabase API gateway) and the first real migration
    deploy.
  - *Partially mitigated:* CI can prove SQL and RLS, and `.github/workflows/verify.yml` passed on
    its first observed run (36612616260, PR #3, `ubuntu-latest`): 12 files / 235 unit tests and
    2 files / 18 integration tests, identical to the local counts. That same run exposed a defect
    in the workflow itself — the dataset-guard job's path filter was dropped on Linux, so it ran
    the whole integration suite instead of the file it claimed to isolate. Fixed to
    `pnpm exec vitest run --project integration <path>`.

### Planned Change Sequence

The roadmap is executed as a sequence of bounded OpenSpec changes, one architectural step
each, in dependency order:

1. `project-foundation` — Phase 1: Next.js/TypeScript/Tailwind shell, design tokens, lint,
   test harness, Zod schemas, Supabase client boundary.
2. `od-dataset-schema-and-import` — Phase 2: migrations for the six tables, constraints,
   indexes, RLS, and import/verification of the 600 `OD_*` entries.
3. `landing-and-screening` — Phase 3: landing, Ilocano proficiency screening, anonymous
   validator create/restore.
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
- whether optional translations enter the final dataset;
- whether any demographic data is academically required;
- whether ethics/consent language is required before participation.

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
