# Design

## Context

The motivation is in `proposal.md`; this section is only the state that shapes the approach.

The two components under repair are the entire client shell:

- `src/app/start/screening-form.tsx` (12 177 bytes) — enrollment, resume, screening answer.
- `src/components/onboarding/resume-validator.tsx` (5 852 bytes) — resume from the landing page.

Three constraints from the existing repository shape the work, and all three are prior art rather
than discoveries:

1. **No DOM environment exists, deliberately.** `vitest.config.ts` states it: *"`react-dom/server`
   is used for component assertions instead of a DOM environment, so the accessibility contracts …
   are verified against real rendered markup without adding a browser-like runtime to the unit
   project."* No `happy-dom`, `jsdom`, `@testing-library/*`, or `user-event` appears in
   `package.json` or `pnpm-lock.yaml` — all five were checked, and all five are absent.

2. **The limitation of that choice is already written down.**
   `tests/unit/onboarding-routes.test.tsx:446`: *"`renderToStaticMarkup` can only ever see the idle
   state, so the pending behaviour is asserted where it is actually decided."* And at `:567`:
   *"replacing this title with a placeholder passed every behavioural assertion here, because
   `renderToStaticMarkup` never emits the metadata object."*

3. **The established fallback is to assert the source of truth, not the rendering.** At `:573` the
   route title is asserted by calling `generateMetadata()` directly — *"Asserted against the import,
   which is the only place it exists."*

Put together, these mean the four critical gaps cannot be closed by anything the project already
has. Each is an **event-handler or wiring** fact:

| Site | The fact that must hold | Can `renderToStaticMarkup` see it? |
| --- | --- | --- |
| SF-4 | the payload carries the participant's answer | **No** — it lives in an `onSubmit` handler |
| RV-1 | the component reads the stored identifier | **No** — inside `handleClick` |
| RV-2 / SF-5 | the component navigates to `/ready` | **No** — inside `handleClick` / `apply` |
| SF-2 / SF-3 | the button binds the pending state | **No** — `isPending` is always `false` on first render |

`submitControlState(true, EN).disabled === true` is already asserted three times
(`onboarding-routes.test.tsx:448`, `:456`, `:466`). What is unobserved is that **the button binds
it** — `submitState` has **0** hits across all of `tests/unit`, and `router.push` has **0** hits.

That gap is exactly what the extracted-decision pattern cannot close. `decideResume`,
`decideEnrollment`, `firstActionFor`, and `submitControlState` were all extracted precisely so they
could be tested, and all four are tested. The remaining facts are the *wiring between a handler and
those decisions*, and extraction does not reach wiring.

## Goals / Non-Goals

**Goals:**

- Make each of the seven sites fail the suite under the exact mutation that closes it, and state
  plainly which layer catches it.
- Add no more than the minimum capability needed to observe handler behaviour.
- Leave the change reusable for Phase 5, whose surface is the same kind of problem at roughly ten
  times the size (a conditional correction field and two required translations, both handler-driven).

**Non-Goals:**

- No product behaviour changes. Every site currently behaves correctly.
- No new runtime abstraction, no state-management library, no component rewrite.
- Not re-litigating `validator-onboarding`'s 24 scenarios; they are correct and untouched.
- Not touching `interface-localization`, the copy catalog, the database, or Server Actions.

## Decisions

### D1 — Add a `dom` Vitest project, on `happy-dom`, with no test-renderer dependency

**Decision.** Add `happy-dom` as the single new dev dependency and a third Vitest project named
`dom` with `environment: "happy-dom"`, keeping `unit` on `node` for everything that does not need a
DOM. Drive components with `createRoot` + React 19's `act` from `react` directly. **No
`@testing-library/react`, no `user-event`.**

**Why.** The four critical sites are handler facts. A guard that cannot observe them is a
decoration, and this repository has now found six vacuous guards by asking exactly one question:
*what would it take to make this assertion fail?* For `router.push("/ready")` the honest answers
are "delete it" and "change the route". A source scan catches the first and not the second; a DOM
test that clicks the button catches both, because it asserts on the effect.

**Alternatives considered.**

| Alternative | Why not |
| --- | --- |
| More structural source scans, matching the existing `screening-form-wiring.test.ts` style | Cheapest, and it catches the exact mutation. But a scan answers "is this text present", and every prior finding in this repo was a scan that could not fail: a bare substring satisfied by a comment, `Object.keys({ en: 1, fil: 1 })` built inside its own test, a marker matching zero of 600 real records, a "loss guard" probing its own input. Adding a fourth scan to close a *critical* research-integrity site would be the same mistake at a higher stake. |
| Extract each site into a pure function | Does not work for wiring. `const stored = readStoredValidatorId()` has no decision to extract; a `buildEnrollmentPayload(answer)` wrapper would be a function whose only body is the thing being asserted, i.e. a test wearing a hat. |
| Assert the *effect* of each handler through the already-extracted decision functions | Already done, and it is why those four functions are tested. It cannot see that `handleClick` calls them, or what it does with the result. |
| `@testing-library/react` | Better ergonomics, and it is the conventional choice. Rejected as a second dependency for one component: its queries are `screen.getByRole`, which is a convenience over what `createRoot` + `act` already provides, and `act` is exported by `react` 19 with no extra package. Adding it would also import `user-event`'s opinion about click synthesis, which is one more thing to reason about when a guard goes unexplained. |

**Cost, stated.** One dev dependency, a third Vitest project, and a slower suite for the files in
it. Bounded to files that need a DOM; `unit` and `integration` are unaffected.

### D2 — Where extraction *is* the honest fix, extract; otherwise do not

**Decision.** Do not refactor these components for testability. The two components stay as they
are, because their logic is already extracted (`decideResume`, `decideEnrollment`,
`firstActionFor`, `submitControlState`) and the residue is wiring, which D1 observes directly.

**Why.** The temptation in a change like this is to reshape code until the old test style can
reach it. That trades a small, well-understood defect for a larger, less-understood one, and it is
the "while I am here" refactor `AGENTS.md` prohibits. The only exception is a site where a DOM test
is genuinely impossible; none of the seven is.

### D3 — Every guard names its own weakest mutation

**Decision.** Each new test carries a comment stating the mutation it does *not* catch. A DOM test
that clicks Continue and observes the navigation does not catch a rewording of the route constant;
a source scan does not catch a behavioural change. Stating the gap in the file is what stops the
next reader from over-trusting it, which is how the six prior vacuous guards survived review.

### D4 — The re-derivation procedure is committed, not re-run from prose

**Decision.** Commit the probe script that produced the table in `proposal.md`, under
`tests/`, with the reproduction command in its header, and record the procedure (not the numbers
alone) in `AGENTS.md`.

**Why.** The ledger's "21 … two critical" survived five merged changes precisely because the
*number* was carried and the *method* was not. A committed script means the next person re-derives
rather than trusts. It is read-only and touches no source tree.

### D5 — The ledger is corrected in the same change that found it wrong

**Decision.** `docs/ROADMAP.md`'s Project Status is corrected from "21 unguarded … two critical" to
the measured result, with the scope and date of the measurement attached. `AGENTS.md` gains the two
methodological lessons (D6 below).

**Why.** Leaving a known-false figure in a root-owned ledger that the roadmap reads is how the
false figure steers five more changes. A correction recorded later is a correction nobody reads.

### D6 — Two lessons from this investigation's own first hour go to `AGENTS.md`

**Decision.** Record both, because both nearly produced a confident wrong finding:

1. **A probe scoped to one test file reports the rest of the suite as silent.** The first run
   scoped to `screening-form-wiring.test.ts` and called S20 **unguarded**. At full scope it is
   guarded — by `onboarding-routes.test.tsx:208`, a file the probe never executed. Before
   concluding anything from a scoped run, enumerate what actually reads the file. This is the same
   defect as the CI step that claims to run a subset and reports green: the step ran a subset, and
   the green said nothing about the rest.
2. **An inherited enumeration's labels can name a different site than its text.** The archive calls
   `screening-form.tsx:232` "the PRIMARY submit". In the current file `disabled={isPending}`
   occurs **once** and belongs to the `AnswerGroup`; both buttons bind
   `disabled={submitState.disabled}`. A probe anchored on the archived label mutates the skip
   affordance and reports it as the primary submit — a wrong experiment wearing a right one's name.
   Anchor on text, assert its occurrence count, and label from the code.

### D7 — `skip_specs: true`, stated as a decision rather than left implicit

**Decision.** `.openspec.yaml` sets `skip_specs: true`. No product behaviour changes, which is the
criterion the flag answers to; `openspec instructions specs` forbids inventing a requirement to satisfy
a validator.

**The supporting rationale was corrected during Apply, and the correction is load-bearing.** This
decision originally read "`validator-onboarding` already specifies **all seven** behaviours". That was
**false**: an independent verification pass enumerated the requirement blocks of all nine in-force
specs and found that the three **pending-state bindings** (`SF-1`, `SF-2`, `SF-3` D the options,
Continue, and skip controls disabled while a write is in flight) are specified **nowhere**, and that
**0 scenarios** mandate a control be disabled mid-write. Fifteen requirement blocks use the
vocabulary; none require the binding. `SF-5`/`RV-2`'s route `/ready` is likewise named in **0** specs.

The flag survives because it never depended on that claim: it depends on `src/` being untouched,
which `git diff main --numstat -- src/` confirms is empty. See `proposal.md` for the full per-site
table. **Recorded rather than papered over, because a rationale that overstates its own coverage is
the same defect class this change exists to repair** D and it was written here, in this change.

**Open question, not blocking.** Whether "specified client-shell behaviour must be pinned by an
assertion that can fail" should itself be a requirement — most plausibly in `application-foundation`,
which already specs verification concerns. That would be a broader, repository-wide commitment than
repairing seven call sites, so it is raised here and not decided here. See `proposal.md`.

## Risks / Trade-offs

- **[`happy-dom` cannot drive `useTransition` + an async handler cleanly, and D1 fails]** → Task 1.1
  is a feasibility spike that must *prove* a click produces an observed effect before any guard
  depends on it. If it fails, D1 is not implemented; the change falls back to structural scans and
  **states the fallback's weakness on each site** rather than claiming behavioural coverage. D3
  exists for this branch.
- **[A structural scan creeping in beside a DOM test, and being believed]** → Task 3.4 audits every
  guard in the two files and names its weakest mutation. A scan may coexist with a DOM test only
  where the DOM test genuinely cannot reach the fact.
- **[`act()` warnings or unhandled rejections flake in CI]** → The `dom` project runs with
  `environment: "happy-dom"` and its own include glob; if warnings prove unstable the project is
  isolated rather than allowed to affect `unit`. Never widen `unit`'s environment — D1's whole
  premise is that the DOM runtime is opt-in.
- **[Correcting the ledger invites re-litigating Phase history]** → Only the false figure and the
  measurement are touched. No archived change, spec, or historical row is rewritten.
- **[The count could change under the next unrelated change]** → Inherent, and why D4 commits the
  script. The ledger states the scope and date of the measurement so a stale figure is recognisable
  as stale rather than authoritative.
- **[No human has ever seen any screen in this project]** → Unchanged by this change and still
  true. Nothing here is a visual verification, and none of these seven findings is a visual defect.
