# Design

## Context

See `proposal.md` — Why for motivation, and `specs/validation-experience/spec.md` for the requirements.
Only the current state that shapes the approach is here.

The pieces this change composes **already exist and are not being modified**:

- `src/lib/domain/validation-response.ts` — `isCorrectionRequired`, `requiresBilingualTranslations`,
  `isQualifyingValidation`, `countQualifyingValidations`.
- `src/schemas/validation.ts` — the Zod schema for a validation response.
- `src/lib/repositories/validations-repository.ts` — `insert`, `listEntryIdsForValidator`,
  `countForEntry`, and the rest.
- `src/components/validation/answer-option.tsx` — `AnswerGroup`, a neutral radiogroup already taking
  `value`, `onChange`, `disabled`, and `error`.
- `src/lib/allocation/actions.ts` — `requestBatchAction`, and `batch_entries.position` holding the
  server-derived order.
- `src/lib/server/write-intake.ts` — the write boundary every server action goes through.
- The `dom` Vitest project, which exists because `renderToStaticMarkup` can observe neither a handler
  nor a pending state.

Two constraints shape everything below. There are **no Supabase credentials**, so no Supabase client has
ever been constructed and none will be by this change. And **no browser has ever rendered any screen in
this repository** — `happy-dom` is synthetic, so the flow can be driven and asserted but not seen.

`src/app/ready/page.tsx` currently links only to `/start`, with the comment *"Allocation is Phase 4, so
there is nothing to link to yet."* That reason is now false, and this change supplies the missing handoff.

## Goals / Non-Goals

**Goals:**

- One route family that presents a batch one entry at a time and persists each completed response
  immediately.
- Every rule the flow enforces client-side comes from the rule already in force, not from a second
  implementation of it.
- Persistence reachable and testable through the repository seam, with no new migration.
- Behavioural coverage in the `dom` project, including the first non-onboarding consumer of the pending
  state and single-flight requirements.

**Non-Goals:**

- Batch completion, "request another batch", and interrupted-batch resumption — Phase 6. This change
  ends at the last entry of the current batch and states plainly that the batch is finished rather than
  pretending the next step exists.
- Any change to the four evaluation values, the correction rule, the bilingual rule, the qualifying
  definition, or at-most-once. Those are approved decisions, already specified, and consumed here.
- Any migration, new table, or new column.
- The missing `Archived Changes` ledger guard and `RV-4`'s behavioural guard. Both are recorded known
  gaps in `docs/ROADMAP.md`; neither is broadened in here.

## Decisions

### D1 — The cursor is not client state, and the browser never holds the un-evaluated entries

**Decision.** The route addresses a position within a server-allocated batch — `/validate/[batchId]` for
the current entry, with the next entry fetched from the server after a completed write. The server
resolves which entry a position means **from its own recorded `batch_entries.position`**.

**Alternatives considered.**

- *Load all ten entries into the route payload and page through them client-side.* Simplest, and makes
  refresh and back/forward free. Rejected: the browser would then hold nine un-evaluated sentences, so
  "one entry at a time" would be true of the rendering and false of the payload. For a research
  instrument the stronger property is worth one extra round trip.
- *A server-side session row holding the cursor.* Rejected: it needs a migration, and a cursor is
  derivable from state that already exists — the batch's own order plus which entries this validator has
  already completed.

**Consequence, stated precisely.** The URL may carry a position for *addressing and resume*. That is not
the client dictating order: the server maps a position to an entry through its recorded order, and no
client-supplied entry list is ever honoured. This is the same distinction
`pending-state-specification` settled with an exact key-set assertion, and the request type here is held
to the same standard — a position, and nothing else.

### D2 — Completion is derived server-side, never from client bookkeeping

**Decision.** Which entries are already completed is computed at request time from the existing
`listEntryIdsForValidator`, intersected with the batch's entries. A completed entry is not offered again.

**Alternative considered.** Tracking completion in client state as the session advances. Rejected: after
a refresh or a return visit that state is gone, and the validator would be offered an entry they had
already answered — the failure the at-most-once rule exists to prevent, arriving by a different door.
The database refuses the duplicate write, but by then the validator has already retyped their answer, so
a server-side refusal is the wrong place to discover it.

### D3 — Client-side prevention reuses the authoritative rule; it is never a second rule

**Decision.** Whether the form may be completed is decided by the **existing** validation schema and
domain helpers, imported into the form. The form does not re-implement "does this evaluation need a
correction" or "does this evaluation need translations".

**Why this is load-bearing rather than tidy.** Two implementations of one rule will eventually disagree,
and the disagreement is invisible: the client permits a response the server refuses, or the client
blocks a response the server would have accepted. The first wastes a validator's typed work; the second
is a research-integrity defect, because a validator is silently prevented from recording a legitimate
answer.

**The client is still not the enforcement point.** The spec says so, and it holds: the in-force
`research-schema` constraints reject a malformed response independently. Prevention is a courtesy to the
validator; the database is the rule.

### D4 — The write is a server action over a pure core, exactly like the existing ones

**Decision.** A thin `src/lib/validation/actions.ts` over a pure `validation-actions-core.ts` that takes
its repositories injected, going through `write-intake`.

**Alternatives considered.** A route handler returning JSON — rejected, because the existing write
surface is server actions and a second transport for the same boundary is the sort of parallel pattern
`AGENTS.md` warns against. Direct repository calls from a component — rejected, and already forbidden by
the `sadino/no-privileged-imports` lint rule that the existing client shells respect.

### D5 — Conditional inputs are **hidden** until the evaluation that requires them is chosen

**Decision.** The correction input is not rendered at all unless the chosen evaluation requires one, and
neither translation input is rendered for *cannot confidently evaluate*.

**Alternative considered, and it is the more interesting one.** Render the inputs always and make them
**disabled** when not applicable, with a neutral appearance distinct from the in-flight pending state.
That would make the `design-system` scenario *"Pending is distinguishable from unavailable"* observable
in this change.

**This design does not do that, and the reason is that the scenario is not worth contorting the flow
for.** Hiding is strictly better for the validator — a disabled field invites retyping into something
that will be discarded. So **the scenario remains vacuous after this change**, and the honest consequence
is that `proposal.md` and the `Next eligible objective` row in `docs/ROADMAP.md` **overstate** what
Phase 5 does for it. That wording is corrected in this change rather than left standing. A specification
gaining an implementation is not the same as a scenario gaining a witness, and only the second is
coverage.

### D6 — A refused duplicate write advances the session, because the row already exists

**Decision.** If completing an entry is refused as a duplicate for this validator and entry, the session
treats the entry as complete and advances.

**Why this is needed.** The write and the advance are two effects. If the row is written and the response
to the client is lost, the validator sees a failed submit, clicks again, and is refused — and a plain
refusal would tell a validator who *did* the work correctly that their answer was rejected, which is both
false and corrosive to the data. The refusal is in fact the system confirming the row is present.

**The bound on this decision.** It applies **only** to a duplicate refusal, identified by the
already-specified conflict code. Any other failure is reported as a failure. And it never discards
anything: the row the validator's first attempt wrote is the row that stands, so advancing loses nothing.
This is a stated interpretation, not an inference from an error code, and it belongs in the spec's
reviewer attention at Sync.

### D7 — Tests are behavioural, in `dom`, and the pure core is tested without a database

**Decision.** Two layers. The pure action core is unit-tested against injected fakes — no network, no
`server-only`. The client shell is driven with `createRoot` and React's own `act` inside `happy-dom`, so
a real click's effect, the `disabled` and `aria-busy` tracking of `isPending`, and the advance after a
resolved write are all asserted as behaviour rather than as source text.

**Why not source scans.** The recorded lesson is that a source scan proves a string is present and never
that the code behaves as the string suggests; the `screening-form-wiring.test.ts` file exists because
that approach has limits worth naming. This flow is made almost entirely of handler and pending-state
facts, which is precisely what static markup cannot see.

**What the tests will not establish.** `happy-dom` is synthetic, so nothing here is visual
verification, and there is still no human-eye check of any screen in this project.

## Risks / Trade-offs

**[The write succeeds but the client does not learn of it]** → D6 turns the resulting duplicate refusal
into an advance rather than a false rejection. The residual case is a genuine write failure, which is
reported as one.

**Client-side prevention drifts from the server's rules** → D3 single-sources both from the existing
schema and domain helpers, and a test asserts the form and the schema agree on a set of representative
responses rather than trusting the import.

**[Losing immediacy to a later refactor]** → the spec states immediacy as a requirement rather than an
implementation note, and a test asserts a completed entry is persisted **while other entries remain
unanswered** — the case a batch-end implementation would fail.

**[Payload cost from on-demand fetching]** → accepted deliberately; one round trip per entry against a
guarantee that the browser never holds un-evaluated sentences. No prefetching, so nothing is claimed
that is not measured.

**[No visual verification]** → unchanged and unresolved. The flow will be driven and asserted, never
seen, until a human opens it. This risk is **not** mitigated by this change and must not be reported as
mitigated.

**[No hosted database]** → unchanged. Persistence is exercised through the repository seam and PGlite.
PostgREST behaviour and RLS as the Supabase API gateway enforces it remain unverified, and no test in
this change will claim otherwise.

**[Vocuous scenario stays vacuous]** → accepted, per D5, and the ledger's claim about it is corrected
rather than left to imply coverage that does not exist.

## Migration Plan

None. No schema change, no new table, no new column, no backfill.

Rows written by this flow are ordinary research rows subject to the in-force constraints. **Rollback is
not a data rollback:** withdrawing the route stops new writes, and any rows already written are valid
research data that must be preserved — `AGENTS.md` forbids deleting research data as part of ordinary
feature work. If the flow is later found to have written malformed rows, the correct response is
adjudication under the existing review process, not deletion.

## Open Questions

None. Every question that would have changed the specs, the approach, or the task breakdown was resolved
above. The one question that remains open — whether a control is ever *disabled* for unavailability
rather than busy — is answered in D5 as "not in this change", which is a decision, not a deferral.
