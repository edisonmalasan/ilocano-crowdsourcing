# Design

## Context

See `proposal.md` — Why. The state this design builds on:

- Phase 2 delivered the `validators` table, whose `ilocano_proficiency` column is **nullable**, and
  a three-method `ValidatorsRepository` seam: `create`, `findById`, `touchLastActive`.
- `@/schemas/validator` already owns the anonymity invariant as a `strictObject` with exactly five
  fields, the approved screening question and supporting copy as exported string constants, and the
  five approved choices as a `readonly` tuple that derives the Zod enum.
- `createAnonymousValidatorId()` in `@/lib/domain/anonymous-validator-id` mints `VAL_` plus four
  random bytes, and its header states the authority to mint must sit server-side.
- `parseWriteIntent()` in `@/lib/server/write-intake` is the shared re-validation boundary for
  every server write.
- `AnswerGroup` in `@/components/validation/answer-option` already renders a `role="radiogroup"`
  with a neutral-before-selected treatment, and its header documents that the unselected class
  string is a single frozen constant taking no per-option input.

The gap this design closes: nothing connects those pieces, and the landing page's start action is
hard-disabled.

## Goals / Non-Goals

**Goals**

- One server-authoritative enrollment write, with every authoritative value derived server-side.
- Screening collected before identity creation, so the answer rides along in the `create` write and
  no second write method is needed.
- All decision logic in a server-only module that is unit-testable with an in-memory fake and no
  database, no network, and no Supabase credential.
- Reuse `AnswerGroup` for screening so option neutrality is structural, not a convention repeated in
  a second component.

**Non-Goals**

- **No migration and no new repository method.** The nullable proficiency column already models
  "screened" and "not screened"; `create` already persists it. Adding a `recordProficiency` method
  would be a second write path for a value the first write can carry.
- **No batch allocation, no session record, no `validation_sessions` row.** Those are Phase 4 and
  later. `/ready` confirms enrollment and stops.
- **No re-screening, no answer editing, no proficiency eligibility rule.** Eligibility is an
  unapproved methodology decision and belongs to the allocation change as a server-side
  configuration.
- **No analytics, no rate limiting, no consent cookie.** Phase 9+.
- **No change to the identifier format.** See D5 and Risks.

## Decisions

### D1 — Screening is answered before the identifier exists, and rides in the `create` write

**Chosen.** The screening action receives the proficiency intent, mints the identifier server-side,
and calls `validators.create({ id, ilocanoProficiency, createdAt, lastActiveAt, totalValidations })`
once. The client sends only the answer.

**Alternative considered — create first, then record proficiency.** Rejected: it needs a repository
method that does not exist, it is two writes where one suffices, and it creates a window in which a
participant holds an identity with no screening answer. If they abandon between the steps the
platform has persisted a validator who never chose to be screened. The nullable column is the
schema's own acknowledgment that a validator may exist without a screening answer; D1 makes that
state reachable only by *declining*, never by *abandoning*, which is the distinction the column
cannot make on its own.

**Consequence.** A returning validator cannot change their screening answer. That is intentional and
is specified: the answer is background recorded at enrollment, not a preference.

### D2 — `localStorage` holds the identifier; a cookie would not

**Chosen.** A client-only module reads and writes the identifier under one key, validating against
`anonymousValidatorIdSchema` on read and discarding anything malformed.

**Alternative considered — an httpOnly cookie.** Rejected, and it is worth being explicit because a
cookie is the reflexive choice: a cookie would let a Server Component read the identifier and render
"welcome back" server-side, with no client round trip on the landing page. But it also means the
identifier is transmitted to the server on *every* request to this origin, which is a worse fit for
a project whose headline property is anonymity than a value that leaves the browser only when the
participant asks to resume. The resume path costs one client-side read plus one server action, and
that cost buys a strictly smaller server-side footprint.

**Consequence, and it is the important part.** Because the server cannot read the identifier, the
landing page cannot know on first paint whether this is a returning visitor. Resume is therefore
explicit: a "Continue as that validator" control on the landing page, rendered unconditionally, which
reads the stored value only when the participant presses it. A visitor with a stored identity is
never silently resumed, which also means a shared device does not hand one person another's session
without a visible action.

> **Amended during Apply.** This paragraph originally said the affordance was "enabled only after the
> client finds a well-formed stored value". That was the design as proposed and it was not what got
> built, because it needs a post-hydration `setState` — `localStorage` does not exist during server
> built, because it needs a post-hydration `setState`: `localStorage` does not exist during server
> rendering, and storage can tell this component an identifier is *stored* while only the server
> can say whether it is *recognised*, so a control that appeared or vanished before the server
> answered would be guessing. (This paragraph originally gave a different reason — that the cascading
> render is "the pattern the React lint rules exist to reject" — which review tested and found
> **half false**: `useSyncExternalStore` lints and typechecks clean on React 19.2.8. That correction
> and its evidence are in the block immediately below.)
> The control is rendered always and reveals what it found only after the participant asks. The cost is
> that a first-time visitor can press a button that turns out to have nothing to resume; the benefit
> is that the affordance is present for the person who needs it, with no effect, no hydration
> mismatch, and no control whose existence depends on which machine the code ran. The argument for the
> change is in the component header of `src/components/onboarding/resume-validator.tsx`.

**What this costs, stated plainly because the spec scenario had to change because of it.** A returning
participant who navigates directly to `/start` **does see the screening question again.** What *is*
guaranteed is that their selection is never stored over their original answer: the resume path
contains no `create` call, so the stored self-reported screening answer survives untouched. The
original spec scenario demanded the question "is not presented again"; it has been amended to require
what is actually true and actually testable — that the original answer is preserved and never
overwritten. See the spec delta for that amendment.

> **The stated reason for this amendment was wrong, and was corrected after being checked.**
> The first version justified it thus: *"the client cannot know without an effect, which cascades a
> render and is the pattern the React lint rules exist to reject."* Independent review tested that
> claim on React 19.2.8 and **half of it is false**:
>
> - `useEffect(() => setState(localStorage.getItem(…)))` → `react-hooks/set-state-in-effect` **does**
>   error. That part was right.
> - `useSyncExternalStore(subscribe, () => localStorage.getItem(…), () => null)` → **lints clean and
>   typechecks clean**, exit 0 on both. `useSyncExternalStore` is React's supported, hydration-safe API
>   for exactly this read, and the record never considered it.
>
> A requirement may only be amended when the original was genuinely unsatisfiable, so citing a
> refuted blocker is not good enough. The reason that actually holds is a data-integrity one:
> **`useSyncExternalStore` can tell the client that a value is *stored*, not that the server
> *recognises* it.** Suppressing the question optimistically would therefore mean a participant whose
> stored identifier has expired presses Continue, is told nothing, and is enrolled with **no
> screening answer at all** — or must be interrupted mid-flow with the question *after* a round trip,
> which is worse for the participant than being asked up front and, critically, means the question's
> absence would depend on a value the server has not yet vouched for.
>
> Two further reasons, lower weight but real: a static prerendered route would ship the question in
> its HTML and swap it after hydration, a visible flash for exactly the returning validators the
> change is meant to serve; and the suppression would reintroduce the post-response state change that
> D2's submit-time check exists to avoid. The build has **no browser and no way to evaluate a
> hydration flash**, so shipping an unseeable UX change to satisfy a wording preference would be the
> worse trade. Recorded so the next reader can disagree with a decision rather than re-derive it.

### D3 — The server verifies existence; the client is never trusted about it

Resume is a Server Action that calls `validators.findById`. Found → restored. Not found → the stored
value is cleared and a fresh identity is minted. The action returns only a status the client renders
and the identifier to store on success; it never returns a profile's stored proficiency, counters, or
timestamps to the browser, because the public experience has no use for them and the anonymity
guarantee is easier to audit if the browser simply never receives them.

### D4 — Two routes, `/start` and `/ready`, and a real link from the landing page

`/` keeps its existing introduction copy and shells; the disabled button becomes a link to
`/start`. `/start` is a Server Component that renders the screening client form. `/ready` is a
Server Component confirmation.

**Why `/ready` exists rather than a query flag on `/start`:** the post-enrollment state is a
distinct, linkable, refreshable destination. A `?done=1` flag on the screening route would be
back-button-hostile and would re-render the screening form on refresh. `/ready` is also where the
Phase 4 hand-off will attach, so the eventual continue-or-finish flow has somewhere to grow.

`/ready` deliberately does not link to a batch route that does not exist. It states that enrollment
succeeded and that receiving sentences arrives later. An honest dead end is better than a link to a
404.

**Why the screening form is a client component and the pages are not.** The form needs selection
state and a pending state, so it is `"use client"`. The pages hold no interactive state, so they stay
Server Components, which keeps the client bundle to exactly one interactive component on the
onboarding path and keeps the privileged repository out of the client graph by construction.

### D5 — The identifier stays at 32 bits of entropy, recorded as a known risk

**Chosen.** `createAnonymousValidatorId` uses four random bytes, and `anonymousValidatorIdSchema` plus
the `validators` primary key pin the `VAL_` + 8 hex format. Widening it to 16 hex characters would
be a migration against an archived spec, a change to the archived `research-schema` requirement, and
a change to the domain contract, for a change that is otherwise entirely additive. That is a
proposal-sized decision, not a field to alter quietly inside a screening change.

**The risk, stated rather than buried.** 2^32 is brute-forceable by a determined party *if* they can
enumerate identifiers against a reachable enrollment surface. The identifier is not a credential —
it grants no access beyond resuming an anonymous session — but a successful guess would let someone
continue as another participant and contaminate that participant's research record. I am recording
this as an open question for the thesis team rather than resolving it unilaterally, because the right
answer depends on the participation model (a link-shared pilot versus a public deployment) and on
whether an enumeration rate limit is in scope.

> **Amended during Apply after independent review disagreed with this paragraph.** It originally
> claimed an interim mitigation: *"the resume action is the only surface that accepts a
> client-supplied identifier, and it answers a yes/no question with no distinguishing error … it
> means there is no second surface to attack."* That was wrong in a way worth recording, because
> the next reader would otherwise inherit a false sense of safety. **The resume action is the
> enumeration oracle.** It is unauthenticated, unmetered, has no rate limit, and returns a clean
> boolean over 2^32. "There is no second surface" is a restatement of there being one surface, and
> one surface is sufficient. A determined party issues ~4.3 billion unauthenticated Server Action
> calls.
>
> The review also pointed out that a *successful* guess is worse than "continue as another
> participant". Because `ValidatorProfile` carries `ilocanoProficiency`, guessing one identifier
> discloses another participant's self-reported screening answer — a second, smaller leak that the
> original text did not mention at all.
>
> **The deferral stands.** Widening the format belongs in its own change with thesis input, and
> adding a rate limiter belongs to a later phase. What was wrong was the description of the
> mitigation, not the decision. Three cheaper, schema-free options are available if the thesis team
> wants the exposure reduced before Phase 11:
>
> 1. Rate-limit or throttle `resumeValidatorAction`. Enumeration resistance is a security property
>    of the surface *this* change introduced, not a Phase 9 nicety.
> 2. Make a failed resume indistinguishable from a successful one to an unauthenticated caller. The
>    `not_configured` / `absent` / `invalid` / `persistence` split is good UX for a real participant
>    and a free environment-state oracle for an attacker, though it does not accelerate 2^32
>    enumeration, so it ranks below option 1.
> 3. Do nothing until the participation model is decided, which is the current state and is an
>    honest answer rather than an oversight.

### D6 — Screening reuses `AnswerGroup` verbatim

The screening screen passes the five approved choices straight from `ILOCANO_PROFICIENCY_CHOICES`,
mapping `label` to `label` and leaving `hint` unset. Reusing the control means the neutrality
guarantee documented in that component's header — the unselected class string is a frozen constant
with no per-option input — covers screening for free, and that the new `design-system` scenario
comparing screening against validation options is true by construction rather than by review.

**Rejected:** a bespoke screening radio group. It would be a second place where a future edit could
add an accent, sort the options, or add a micro-animation to one option — the three things that
component's header explicitly rules out.

### D7 — Two actions, one shared service

`enrollValidator` and `resumeValidator` are thin: parse intent through `parseWriteIntent`, call the
service, map a typed outcome to something renderable. The service in
`@/lib/validators/enrollment` owns minting, timestamp derivation, the repository call, and the
`ValidatorProfile` construction. The service takes its `ValidatorsRepository` and a clock as
arguments, so a test can supply a fake repository and a fixed clock and assert exact stored values —
which is also what makes "the server derives the timestamps" a testable claim rather than a comment.

`now` is injected rather than read from `Date.now()` inside the service for the same reason
`ValidatorsRepository.touchLastActive` takes `at` from its caller: the service, not the ambient
clock, owns when something happened.

### D8 — Errors are typed, and "not configured" is a distinct outcome

The service returns a discriminated result — enrolled, resumed, already-known-as-absent, or failed —
rather than throwing for expected conditions, so the client component can render each case without
string matching. Unexpected persistence failures still surface as `RepositoryError` and are caught at
the action boundary.

The action distinguishes `ServerEnvError` (and only that) from everything else, because "there is no
database configured" is the expected state of this deployment and deserves a plain "the study is not
open" message, whereas a genuine write failure deserves a different, equally plain message. Both
log the underlying error for the operator; neither renders it. The `ServerEnvError` message is
already safe to log by construction — it never contains a value.

**Rejected:** a single generic "something went wrong". It would be true in this environment and
useless in production, and it would erase the distinction that matters most here.

## Risks / Trade-offs

- **[No Supabase project exists, so the repository hop cannot be exercised]** → The service is
  tested against an in-memory fake with exact-value assertions, the action layer is tested for
  intent re-validation and outcome mapping, and the screens are tested as rendered markup. The one
  unverifiable hop is the same one Phase 2 already recorded, and this change does not widen it
  silently — the not-configured state is a deliverable precisely because it is the honest behavior
  here. Nothing in the test suite pretends to have reached PostgREST.
- **[D5 identifier entropy]** → Recorded as an open question, with the reasoning above, rather than
  changed inside an unrelated change. **No interim mitigation is in place.** An earlier draft of this
  bullet claimed "exactly one surface accepts a client-supplied identifier, and it returns a
  boolean-shaped answer" as a mitigation; that claim was false and is retracted at D5, because the
  single surface *is* the enumeration oracle — unauthenticated, unmetered, no rate limit, a clean
  boolean over 2^32. A successful guess also discloses the other participant's self-reported
  proficiency. The deferral is a decision about *sequencing*, not a claim that the exposure is
  mitigated.
- **`localStorage` can be cleared, blocked, or unavailable (private browsing, disabled storage)** →
  A visitor whose storage is unavailable is not blocked: enrollment still completes and the
  confirmation screen appears; only the resume convenience is lost. The failure is swallowed
  *narrowly* — only `localStorage` access is guarded, and only for the identity key — so a storage
  error can never be mistaken for an enrollment failure. This is the one place a catch is
  deliberate, and it is documented in the module.
- **[Two routes plus two actions is more surface than the current single static page]** → Each is
  small and single-purpose, and the alternative — one route with client-side state transitions —
  would make the enrollment result unreloadable and unlinkable, which D4 already rejects.
- **[The screening form is client-side, so the page is not a pure static render]** → The route
  still prerenders; only the form is a client island. The landing page and the confirmation page stay
  static and database-free, preserving the `application-foundation` requirement unchanged.
- **Reusing `AnswerGroup` couples screening to a component documented for validation answers** →
  Accepted deliberately. The coupling is the point: one component, one neutrality guarantee. If the
  two screens ever need genuinely different controls, that is a real design change and should split
  the shared treatment into its own primitive rather than duplicating the class strings.

## Migration Plan

None. No schema change, no backfill, no deploy ordering constraint.

**Rollback:** revert the commit. The only externally visible change is that the landing page's start
action goes from disabled to live; reverting returns it to disabled. No persisted data is affected,
because the only rows this change can create are validator profiles, and a validator profile created
by a reverted build is inert — no route reads one, since resume requires a client-held identifier
that a reverted build never stores.

## Open Questions

These are deferrable: none of them changes the specs above, the approach, or the task breakdown.

1. **Identifier entropy** (D5) — whether 32 bits is acceptable for the intended participation model,
   or whether the format should widen. Answering this changes the schema and the archived
   `research-schema` spec, so it needs its own change with thesis-team input.
2. **Whether a declining visitor should be identifiable as having declined.** This change records
   `null` and nothing else. If the study later needs to distinguish "declined" from "enrolled before
   screening existed", that is a new research question, not a bug fix.
3. **Whether the screening question should ever be re-asked** to measure change over time. D1 collects
   the answer once at enrollment and the resume path never writes, so nothing re-asks today and the
   stored answer cannot be overwritten. The spec therefore forbids *overwriting*, not re-asking: a
   participant who navigates to `/start` again **is** asked again, and simply has their earlier answer
   restored rather than replaced. A longitudinal study that deliberately re-asks to measure change over
   time would need an explicit, separately consented mechanism, because the current flow would already
   have shown the question and discarded the second answer.
