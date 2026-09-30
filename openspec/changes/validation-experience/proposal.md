# Proposal

## Why

The platform can allocate a coverage-aware batch and can store a fully-formed validation response, but
nothing specifies — or implements — the step in between: the screen where a human actually answers.
`openspec/specs/` is complete about the *rules* of validation at two layers and silent about the *flow*
that collects a human's answers to those rules. This is roadmap **Phase 5**, and it is the last piece
before the end-to-end MVP described in `AGENTS.md`: an anonymous, screened validator receiving a batch
of 10 and each completed validation being persisted correctly.

### The gap, re-derived rather than inherited

Enumerated from `openspec/specs/` alone — 9 capabilities, **52 requirements, 193 scenarios** — and each
claim carries a probe that must match, so a predicate which cannot fire reports `UNRESOLVED` instead of
a confident zero.

| | claim | result |
| --- | --- | --- |
| G1 | a capability exists for the per-entry validation experience | **0** — no such directory |
| G2 | exactly one entry is presented at a time | **0 of 193** |
| G3 | the entry displays its intended origin and destination | **0 of 193** |
| G4 | progress through the active batch is shown | **0 of 193** |
| G5 | the four evaluation choices are offered | **0 of 193** |
| G6 | a correction is offered and collected when required | **0 of 193** |
| G7 | both translations are offered and collected, no skip | **0 of 193** |
| G8 | each completed entry is persisted immediately | **0 of 193** |
| G9 | navigation between entries in the active batch is safe | **0 of 193** |
| G10 | an invalid submission is prevented before a request | **0 of 193** |

**10 of 10 hold, with all 10 probes verified to fire.** Alongside them, nine anchors were checked to
confirm the change does **not** re-specify what already exists: the four evaluations and the
conditional-correction and bilingual integrity rules, the definition of a qualifying validation,
at-most-once per validator and entry, the visual neutrality of answer controls, the database-level
enforcement, the bilingual column representation, server-authoritative writes, the batch's
server-derived order, and the in-flight pending state.

### The finding is three-layered, and the layer matters

G6 and G7 were **CONTRADICTED** on the first measurement, by 1 and 5 scenarios respectively. Reading
those six showed every one is phrased *"WHEN a response … is submitted / stored … THEN validation
fails / the database rejects it."* They constrain what a **response object** may contain, at the domain
layer and at the database layer. Not one mentions a person, a screen, a field, or a skip control.

So the rules are specified **twice** — in `domain-contracts` and again, independently, in
`research-schema` — and the third layer, the human-facing collection step, is specified at **neither**.
Adding a participant-facing term to those two predicates is what separates the layers; without it the
measurement reported a coincidence of vocabulary as a contradiction.

**This is a specification gap, not an implementation gap, and the distinction is load-bearing.**
`src/lib/domain/validation-response.ts` already exports `isCorrectionRequired`,
`requiresBilingualTranslations`, and `isQualifyingValidation`; `src/schemas/validation.ts` already
validates; `src/components/validation/answer-option.tsx` already renders a neutral `AnswerGroup` with
`value`, `onChange`, `disabled`, and `error`. Phase 5 is composition, not invention.

### One piece of independent evidence

`src/app/ready/page.tsx` is currently an honest dead end, and its comment says why: *"It deliberately
does NOT link to a batch route. Allocation is Phase 4, so there is nothing to link to yet."* That
reason is now **false** — `requestBatchAction` exists in `src/lib/allocation/actions.ts`. The screen
that was built to wait for Phase 4 is still waiting, which is the handoff this change supplies.

## What Changes

Adds one capability, `validation-experience`, covering the participant-facing per-entry flow. It
composes existing domain rules, schemas, repositories, and components; it changes none of them.

- **The active session.** A validator with an allocated batch enters a session that presents **one
  entry at a time**, showing the Ilocano sentence together with its **intended origin and intended
  destination**, and showing **progress** through the active batch.
- **The four evaluation choices**, offered through the existing neutral `AnswerGroup` so the
  already-specified visual neutrality actually reaches the screen where an answer is chosen.
- **The conditional correction.** A correction input is offered **exactly when** the chosen evaluation
  requires one, and the existing `isCorrectionRequired` decides which — never a duplicated rule.
- **Both research translations**, collected for every evaluable evaluation, describing the
  **validated** sentence (the correction where one was required), with **no skip affordance**;
  `cannot_evaluate` carries neither, decided by the existing `requiresBilingualTranslations`.
- **Immediate persistence.** Each completed entry is written through the existing
  `ValidationsRepository.insert` **as soon as it is complete**, never held until the batch ends, so a
  dropped connection cannot lose completed work.
- **Safe navigation** within the active batch, which cannot duplicate a response for an entry the
  validator has already completed — the participant-facing counterpart to the already-specified
  at-most-once rule.
- **Prevention of invalid submissions** before any request is made, with the server remaining
  authoritative regardless.

One of the two in-force requirements the previous change produced gains its first consumer outside
onboarding:

- The `design-system` scenario *"a control whose action is in flight exposes a pending state"* and the
  `validator-onboarding` single-flight rule both acquire a **consumer** here: the validation write is the
  first write in this project that is neither an onboarding write nor a locale write.

**The companion scenario does *not* gain a witness, and this proposal originally claimed that it did.**
The scenario *"Pending is distinguishable from unavailable"* becomes observable only when some control is
*disabled for unavailability* rather than busy. The design decision in `design.md` D5 is to **hide**
conditional inputs rather than render them disabled, because hiding is strictly better for the validator
than an inert field they might retype into. Hiding is not disabling, so the scenario **remains vacuous**
after this change. A requirement gaining an implementation is not a scenario gaining a witness, and only
the second one is coverage. The ledger's `Next eligible objective` row said the same wrong thing and is
corrected in this change rather than left standing.

**Why the correction is recorded here and not made silently.** The error was in a direction that flatters
the change — it claimed this work closes a known gap — which is the shape of claim that survives review
precisely because nobody wants to be the person who reduces a deliverable. The measurement behind it was
fine; the inference from it was not.

### Explicitly not in scope

- **Batch completion, continuation, and requesting another batch** — roadmap Phase 6. This change ends
  at the last entry of the current batch.
- **The admin area, export, adjudication** — Phases 7, 8, 12.
- **Fixing `RV-4`**, which is an onboarding concern belonging to its own change, for the reason given
  in Impact.
- **Building the missing `Archived Changes` ledger guard.** Both are recorded in `docs/ROADMAP.md` as
  known gaps; neither is broadened in here.
- **Any new persistence, migration, or schema column.** The six research tables and their constraints
  are in force and unchanged; Phase 5 writes rows through the existing repository interface.
- **Any change to the four evaluation values, the correction rule, or the bilingual rule.** Those are
  approved thesis-leader decisions, already specified, and this change consumes them.

## Capabilities

### New Capabilities

- `validation-experience`: the participant-facing per-entry validation flow — one entry at a time with
  its origin, destination, and progress; the four evaluation choices offered neutrally; the conditional
  correction offered exactly when required; both required research translations with no skip
  affordance; immediate persistence per completed entry; safe navigation within the active batch; and
  prevention of invalid submissions before a request is made.

### Modified Capabilities

**None.** Every existing requirement stays in force and unchanged. In particular, the rules this flow
collects answers to are specified in `domain-contracts` and enforced in `research-schema`; the handoff
out of `/ready` is a behaviour of this new capability rather than a change to `validator-onboarding`,
whose requirement correctly ends at `/ready`.

## Impact

**New:** a validation route, its client shell, the server action and action core that persist one
completed response, the per-entry form, and its copy in **both** catalogs — English and Filipino, as
`interface-localization` requires of every localized string.

**Extended:** `src/lib/i18n/copy.ts` for the new interface strings in both languages;
`src/app/ready/page.tsx`, whose "nothing to link to yet" comment is now false and which must offer the
first batch.

**Reused unchanged:** `src/lib/domain/validation-response.ts`, `src/schemas/validation.ts`,
`src/lib/repositories/validations-repository.ts` and its Supabase implementation,
`src/components/validation/answer-option.tsx`, `src/lib/allocation/actions.ts`, and the design tokens.

**Data:** no migration. Rows are written through the existing repository interface and remain subject
to the in-force `research-schema` constraints, which reject a malformed response independently of the
application.

**Tests:** the change extends the existing `dom` Vitest project (3 files / 15 tests), which exists
precisely because `renderToStaticMarkup` cannot observe a handler or a pending state — both of which
this flow is made of.

**On `RV-4`, stated precisely rather than generously.** An earlier draft of this section claimed the
change "gives `RV-4` the behavioural home it has been missing". That overstates it. `RV-4` — the
failed-resume path in `src/components/onboarding/resume-validator.tsx` — is an **onboarding** concern,
and fixing it means changing an onboarding component and the onboarding tests, which is a different
capability. `AGENTS.md` is explicit that a change must not be broadened because a related opportunity
turned up. So `RV-4` is **not** fixed here, and `git diff -- src/components/onboarding/` is required to
be empty at the end of this change. What this change does provide is a **worked example**: a real click
driven through `act` in the `dom` project, asserting an effect and a pending state, which is the shape
the `RV-4` repair needs. The item stays open, recorded in `docs/ROADMAP.md` as open, and now has
something to copy.

### Open question for the Sync stage

**No spec requirement covers the handoff out of `/ready`.** `/ready` must become able to offer the first
batch, which is participant-visible and therefore arguably belongs in a capability. It is **not** added
here, because `validator-onboarding`'s requirement correctly ends at `/ready` and adding to it would
modify a capability this change declares it does not touch. Recorded here so the Sync stage **reviews**
the decision instead of discovering an omission, and so a reviewer who disagrees has the argument in
front of them rather than a silent gap. It also gives `RV-4` the behavioural home it has been missing.

**Environment:** unchanged. There are still **no Supabase credentials**, so no Supabase client has ever
been constructed and none will be by this change. The flow's persistence is exercised through the
repository seam and PGlite, not a hosted database.
