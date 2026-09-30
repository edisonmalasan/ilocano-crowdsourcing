# Design

## Context

See `proposal.md` — Why, for motivation. This document records only the decisions that shaped the two
deltas, and one of them corrected a defect in this change's own first draft.

What constrains the approach:

- The behaviour being specified is **already implemented and already guarded**. See the proposal's
  impact table. This change describes reality; it does not create it. Every decision below is
  therefore constrained by a hard rule — *the delta must be satisfiable by the code that exists today*,
  or the change has silently become a behaviour change and stopped being a specification change.
- `thin-shell-call-sites` is archived, so its per-site findings are in
  `openspec/changes/archive/2026-10-01-thin-shell-call-sites/` and the ledger in `docs/ROADMAP.md`.
- The change's own predecessor carried a claim that its content was "already specified" when the
  verification pass found three of seven sites were not. **The lesson of that correction is why this
  design cites measured counts and refuses any delta it cannot point at an implementation for.**

## Goals / Non-Goals

**Goals:**

- Produce two deltas that the current implementation satisfies, each with at least one scenario that
  can fail if the behaviour regresses.
- Make the deltas precise enough that Phase 5 can be specified against them instead of inventing its
  own rules.
- Make any requirement in either delta that is **currently satisfied only vacuously** say so on its
  face, rather than reading as coverage.

**Non-Goals:**

- **Not** changing any file under `src/`. Enforced as a task by asserting
  `git diff main --numstat -- src/ tests/ supabase/` is empty.
- **Not** adding tests. The behaviour is guarded; a specification change that added tests would be
  changing the verification surface, which is a different change.
- **Not** closing the `RV-4` gap (a failed resume must report, guarded only by a source scan), or the
  un-guarded `Archived Changes` table. Both are recorded, both are separate work.
- **Not** creating a capability. Two requirements about existing components belong in the two
  capabilities that already govern them.

## Decisions

### D1 — The pending-state requirement applies to the control that *initiated* the action, not to controls made inert alongside it

**This decision corrected a defect in this change's own first draft of the `design-system` delta.**

The first draft opened with "an interactive control whose action has been accepted and has not yet
completed SHALL expose a pending state … it SHALL communicate that progress through text". Read
literally against the implementation, that is violated by the screening choices themselves.

While an enrollment is in flight, `AnswerGroup` receives `disabled={isPending}`, and
`answerOptionClasses` puts `disabled:opacity-50` on every option. The options therefore dim — and
**they do not change their text and carry no `aria-busy`.** They are inert during a write, yet they
perform no action of their own. A delta that requires an in-flight control to report progress in text
would have been **unsatisfiable by the code it describes**, which is the failure mode this whole
change exists to prevent: a specification that describes an intention rather than a behaviour.

The requirement is therefore scoped to **the control the participant activated to start the action**,
and separately mandates only inertness — never a text change — for controls disabled as collateral.

Chosen because it matches the implementation exactly, and because "which control started the work" is
the distinction Phase 5 needs anyway: its correction field and its two translation fields are *data
inputs* to one submit, not three actions.

*Alternative rejected:* require `aria-busy` on every disabled control including the options. It would
have meant editing `screening-form.tsx` and `AnswerGroup` in a change that declares no `src/` changes,
turning a specification change into an implementation change under a misleading name.

### D2 — The single-flight requirement is stated for the flow, not as a property of the write function

`onboarding-flow.ts` already documents that a participant holding an identity must not be issued a
second one, and `firstActionFor` resolves the stored value before enrolling. The hazard is not in the
decision function; it is that **nothing prevents a second request while the first is in flight**, and
the components are the only layer that can.

So the delta is stated against the controls the participant can reach during a write, and includes the
decline affordance explicitly. That second part is not padding: the decline is implemented as *a write
with a null answer*, not as a cancellation, so it is exactly as capable of duplicating an enrollment
as the submit button is. An earlier draft of the delta covered only "the submit affordance" in the
requirement text and would have left that unstated.

*Alternative rejected:* a server-side idempotency requirement. It is the stronger guarantee and it is
**not** in scope — it would need a migration and a schema decision, and this change may not touch
`supabase/`. Recorded as a Phase 4/5 question rather than smuggled in here.

### D3 — `/ready` is named, and what it must not show is specified

`/ready` appears in **0 of the 9** in-force specs. The route's own file comment explains why it renders
no identifier, proficiency, counter, or timestamp: a confirmation that echoes a stored profile is a
screen that must be kept correct as the profile changes.

That reasoning is a real design decision and it is currently **undocumented in any requirement**. The
delta states it, because `/ready` becomes load-bearing in Phase 5 — the first place a participant sees
it — and "confirm without echoing" is a constraint a future implementer would otherwise have to
rediscover.

*Alternative rejected:* requiring `/ready` to link onward to the batch. Allocation is Phase 4 and
`batch-allocation` already owns that route; this capability has no business specifying another
capability's destination.

### D4 — The vocabulary used to count requirement blocks is stated, because the count is definition-dependent

Re-deriving the gap surfaced something the retraction did not: **a bare count of "3" is
under-specified, and two definitions of "mentions the pending-state vocabulary" produce two DIFFERENT
sets of 3.** Measured against all 50 in-force requirement blocks:

| Vocabulary | Matches | Members |
| --- | --- | --- |
| `pending`, `in flight`, `in progress`, `writing`, `submitting`, `saving`, `busy` | **3** | `domain-contracts` *dataset is not mutated*, `interface-localization` *English by default*, `validator-onboarding` *the onboarding sequence* |
| `disable`, `disabled`, `inert` | **1** | `design-system` *accessible interactive states* |

The ROADMAP retraction names `design-system` and not `interface-localization`. Both counts are
legitimate answers to different questions — `interface-localization` matches on the phrase *"the
response in progress"* in a scenario about switching language, which is a different thing entirely from
a control being inert during a write, while `design-system` matches on *"and disabled states"* which is
much closer to the question. **Two instruments agreeing on 3 over different sets is worse than a
mismatched count, because it reads as confirmation.**

So the deltas do not cite a bare count. They cite **0 scenarios** — which is definition-independent,
re-derives exactly under every vocabulary tried, and is the number the finding actually rests on — and
they name the requirement blocks individually where a count is given at all.

### D5 — Each delta cites the measurement that established the gap, inline

Both deltas carry a block quote recording that **0 of 181 scenarios** mandate an inert control during a
write, and that `/ready` appears in 0 of 9 specs.

This is deliberate and it is the one place a spec file is allowed to be unusual. The inherited figure
carried by `thin-shell-call-sites` — "15 requirement blocks" — **did not reproduce** under any of six
definitions tried; the highest count reached was 3. The load-bearing number, 0, re-derived exactly. The
next reader of these deltas deserves to know the count was measured, that one supporting figure in the
predecessor was wrong, and which of the two numbers the finding actually rests on.

## Risks / Trade-offs

- **[A delta can drift from the implementation without anything noticing]** → Both deltas are additive
  and both were read against the code before being written; the requirement bodies name no internal
  function, and the consequence of drift is a sync-time review rather than a runtime failure. Mitigated
  by making the change's tasks include re-reading each delta against its implementation.
- **[The `design-system` requirement is a cross-cutting primitive specified by one flow's worth of
  evidence]** → Accepted. `design-system` already governs primitives used by every screen, and Phase 5
  is the second consumer. The alternative — duplicating a pending-state requirement into
  `validator-onboarding` alone — was rejected because it would leave Phase 5 with no primitive rule to
  build a correction field against.
- **[The "pending is distinguishable from unavailable" scenario may be vacuously satisfied today]** →
  Recorded as a risk **rather than left for a reader to assume coverage**. Measured: no control in
  `src/` is currently disabled for unavailability as opposed to in-flight work — the screening choices
  are disabled *only* during a write. The scenario is therefore correct and forward-looking, and it
  becomes observable in Phase 5, where a conditional correction field and two translation fields will
  be absent for reasons unrelated to timing. It should not be cited as existing coverage.
- **[This change produces no behavioural improvement, so merging it can look like churn]** → Stated in
  the proposal rather than left for a reviewer to discover. The test of whether it was worth doing is
  narrow and stated there: Phase 5 inherits requirements instead of inventing them.
- **[Specifying a flow whose runtime is unverified against a real database]** → The pending state is
  client-side and is covered by a DOM guard; no Supabase credential exists and nothing in this change
  depends on one. Not a blocker, but the claim stops at the specification.

## Migration Plan

None. Additive spec requirements, no schema change, no runtime change. Rollback is reverting the merge
commit, and the change touches no file whose contents a rollback would invalidate.

## Open Questions

**None that can be deferred safely.** The one question this design raises — whether single-flight
enforcement should be server-side idempotency rather than client-side inertness — would change the
specs and is deliberately answered as out of scope (D2) rather than left open. If Phase 5 finds
client-side inertness insufficient, that is a change with a schema decision attached, and it belongs in
its own proposal.