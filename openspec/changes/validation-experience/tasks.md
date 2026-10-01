# Tasks

## 0. Scope decisions taken before implementation

These are recorded as decisions rather than tasks, because each one is a choice this change made
deliberately and a later stage should not silently reverse. Each is falsifiable by the check beside it.

- [x] 0.1 **`RV-4` is NOT fixed here, and the reason is stated rather than implied.** `RV-4` — the
      failed-resume path in `src/components/onboarding/resume-validator.tsx` — is an **onboarding**
      concern. Fixing it means changing an onboarding component and the onboarding tests, which is a
      different capability, and `AGENTS.md` is explicit that a change must not be broadened because a
      related opportunity turned up. **Verify:** `git diff -- src/components/onboarding/` is empty at the
      end of this change, and this decision appears in the change's Proposal, so the Sync stage reviews
      an argued exclusion rather than discovering an omission. `docs/ROADMAP.md` is corrected to say the
      item is still open and now has a worked example of the fix's shape to copy, not a fix.
- [x] 0.2 **The `Archived Changes` ledger guard is NOT built here.** Same reasoning: it is a new test
      class this project has never had and belongs to its own change. **Verify:** the ledger still states
      the absence, and `grep -r ROADMAP tests/` still returns **0** case-sensitively at the end.
- [x] 0.3 **The vacuous `design-system` scenario stays vacuous, per `design.md` D5.** **Verify:** no
      control in this change is rendered `disabled` for unavailability; a check over the new components
      reports **0** such controls, and the scenario remains honestly unwitnessed.

**Evidence, measured on 2026-10-01.**

| Task | Check | Result |
| --- | --- | --- |
| 0.1 | `git diff --name-only main -- src/components/onboarding/` | **0** lines |
| 0.2 | `Get-ChildItem tests -Recurse \| Select-String ROADMAP -CaseSensitive` | **0** matches |
| 0.2 | `docs/ROADMAP.md` still records the absence | Yes, at the `Archived Changes` note, the `Next eligible objective` row, and the `Blockers` row |
| 0.3 | `validation-routes.test.tsx` → *"renders ZERO disabled controls while nothing is pending"* | **0** `disabled` attributes in the idle markup, over a screen whose button count is asserted `> 0` |
| 0.3 | the can-fire control beside it | A real rendered `<button disabled={false}>` counts **0**; the same markup with `disabled=""` spliced in counts **1** |
| 7.2 | the open question appears in the Proposal | **2** matches for the open-question framing |

**A note on 0.3's can-fire control, because a regex self-test is weak evidence.** The precedent is
recorded in `AGENTS.md`: the `Object.keys({ en: 1, fil: 1 })` literal built *inside* a test was once
this repository's sole evidence for a research-integrity scenario. So the control here renders an
actual React element through `renderToStaticMarkup` and mutates the resulting markup in memory, rather
than hand-writing a fragment and matching the hand-written fragment — the same rule the copy-catalog
guard's rewrite followed.

## 1. The session route, and which entry it presents

- [x] 1.1 Add `src/app/validate/[batchId]/page.tsx` as a server component that reads the batch, resolves
      the requested position **through the batch's own recorded `batch_entries.position`**, and renders
      **one** entry. **Verify:** a route test asserting that for a 10-entry batch the rendered markup
      contains exactly **one** dataset entry id and **nine** do not appear.
- [x] 1.2 Show the entry's Ilocano sentence together with its **intended origin** and **intended
      destination**, and show **progress** through the active batch derived from the server-allocated
      batch rather than from client bookkeeping. **Verify:** a rendered-markup test asserting both
      endpoints and a progress indicator are present, and a test asserting the progress figure is the
      server's position and not a counter the client could have supplied.
- [x] 1.3 Exclude entries this validator has already completed, computed at request time from the
      existing `listEntryIdsForValidator` intersected with the batch (`design.md` D2). **Verify:** a test
      seeding completed entries and asserting the completed entry's id is absent from the rendered entry
      and that the request carries no client-supplied completion state.
- [x] 1.4 Pin the request's key set exactly (`design.md` D1): a position and nothing else, so a field
      added later that would let a client dictate order fails `pnpm run typecheck`. **Verify:** the
      exact-key-set assertion compiles, and adding a `clientOrder` field to the request type turns
      `pnpm run typecheck` red with `TS2322`.

**Evidence.** 1.1 — `validation-routes.test.tsx` seeds a session outcome carrying **all nine** other
instructions *and* their nine ids, and asserts each of the eighteen is absent while the presented one is
counted at exactly **1**. Nine, not three: a partial set is what a scope-limited check reports as
complete. 1.2 — the origin, destination, and travel mode are asserted present **as labels**, and the
progress figure is asserted to be `completedCount` (`4`), with the derived `position - 1` value (`1`)
asserted **absent**, because out-of-order completion and a resumed session make the two diverge.
1.3 — `validation-session-service.test.ts` seeds `completedEntryIds: ["OD_0001"]` and asserts the
presented entry is `OD_0002`, that `datasetEntries.findById:OD_0001` is **never called** (it is excluded,
not fetched and hidden), and that a request carrying `validatorId` is **refused** with
`{ status: "failed", reason: "invalid" }` and reads nothing. 1.4 — see the probe table below.

## 2. The four evaluation choices, offered neutrally

- [x] 2.1 Render the four approved evaluation values through the existing `AnswerGroup`, in both
      interface locales. **Verify:** a rendered-markup test asserting **all four** values are present for
      the presented entry.
- [x] 2.2 Assert neutrality on the **rendered** class of every option, following the precedent that
      every screening option's rendered class is already asserted equal. **Verify:** a test comparing the
      class attribute of all four rendered options for equality, plus a negative control: promoting one
      option turns the test red.
- [x] 2.3 Assert no choice is pre-selected and none is marked as the expected or recommended answer.
      **Verify:** a test asserting no option carries `checked`/`selected`/`aria-checked` on first render,
      and that no rendered string marks a recommendation.

**Evidence.** 2.1 — asserted in **both** locales. Every other test in the file renders with no locale
cookie, which resolves to English, so a missing Filipino string would have been invisible to all of
them; the cookie store is therefore a controllable fixture, reset to absent in `beforeEach` after a
first draft leaked Filipino into four later tests. 2.2 — the comparison is against
`answerOptionClasses({ selected: false })` read off the **rendered markup**, never the constant against
itself, and the control is a mutation probe (P2, P3 below). 2.3 — **the scenario's literal wording is
wrong and the test says so**: `aria-checked` is always rendered, so "no option carries `aria-checked`"
describes a document that does not exist. The unambiguous form is a **count**: **0** `aria-checked="true"`
and **4** `aria-checked="false"`, both asserted so a component that stopped rendering the attribute
fails too. "None is marked as recommended" is asserted as **equality** against the four catalog strings
derived from `EVALUATION_CHOICES` through `EVALUATION_LABEL_KEYS`/`EVALUATION_DESCRIPTION_KEYS` — **not**
with a `recommended|best answer|most likely` regex, which would fire on the legitimate label "Correct
and natural" and become a guard that cries wolf. A marker-based guard in this repository once matched
**zero** of the 600 real records while reporting coverage for months.

## 3. The conditional correction

- [x] 3.1 Render the correction input **only** when the chosen evaluation requires one, deciding that
      with the existing `isCorrectionRequired` imported from the domain module and not reimplemented
      (`design.md` D3). **Verify:** a test over all four evaluations asserting the input is present for
      *correct but sounds unnatural* and *incorrect* and **absent** for the other two.
- [x] 3.2 Require a non-blank corrected sentence before the response can be completed, reusing the
      existing validation schema rather than a local rule. **Verify:** a test asserting a
      whitespace-only correction does not complete the response, and a test asserting the form and the
      schema **agree** across a set of representative responses — the check that a second implementation
      of one rule would eventually fail.
- [x] 3.3 Prove 3.1 is not a second rule by mutating the call site to a hardcoded evaluation and
      confirming the tests go red. **Verify:** the reversal produces a named failure; a green result means
      the tests do not guard the single-sourcing.

**Evidence.** 3.1 — a `dom` test counts `[name="correctedInstruction"]` at **0** before a choice, **1**
after `correct_unnatural`, and **0** again after `cannot_evaluate`. **Hidden, not disabled** (D5), and the
assertion is on **absence** rather than on a `disabled` attribute, because a disabled input is still in
the DOM, still focusable, and still readable in the markup. 3.2 — `entry-form-flow.test.ts` asserts
whitespace-only corrections do not complete the response and that `checkEntryForm` **agrees with
`validationResponseInputSchema`** across all four evaluations. 3.3 — probes P4 and P5 below.

## 4. Both required research translations, and no skip affordance

- [x] 4.1 Render an English and a Filipino translation input for every evaluable evaluation, and
      **neither** for *cannot confidently evaluate*, deciding that with the existing
      `requiresBilingualTranslations`. **Verify:** a test over all four evaluations asserting two inputs
      for the three evaluable ones and **zero** for *cannot confidently evaluate*.
- [x] 4.2 Assert there is no control that skips, defers, or postpones either translation, by enumerating
      the rendered interactive controls rather than by matching a phrase. **Verify:** the enumeration
      finds no such control, **and** the enumeration is proven able to find controls at all — a control
      search that cannot match reports "none" for the same reason a broken predicate reports "no gap".
- [x] 4.3 Assert the translations are of the **validated** sentence — the correction where one was
      required, the original where none was — by asserting the submitted value, not the prompt text.
      **Verify:** a test that submits an *incorrect* response with a correction and asserts the persisted
      translation pair is what the validator typed and that the original instruction is not substituted.
- [x] 4.4 Add every new interface string to **both** catalogs, English and Filipino. **Verify:** the
      existing copy-catalog guard passes, and it passes for the right reason — it compares all 600 real
      instructions against both catalogs bilaterally, so a real instruction pasted into either catalog
      turns it red. That guard was once a marker set matching **zero** of the 600, which is why its
      mechanism is named here rather than assumed.

**Evidence.** 4.1 — the three-box / zero-box counts are in the same `dom` test as 3.1. 4.2 — the
interactive controls are **enumerated from the rendered markup by tag** (`button`, `a`, `input`,
`textarea`, `select`), not matched by phrase, and each one's label is classified. The can-fire control
runs the **same** classifier over a literal list containing `"Skip translation for now"` and requires it
to be found, while `"Correct and natural"` and `"Submit answer"` are required **not** to match — a
pattern that matched all three would also pass the absence assertion. A **Filipino** enumeration runs
too, with a separate pattern: the two languages share no root, so a reuse would have been vacuous.

**4.2's enumerator was BLIND TO VOID ELEMENTS, and the verification pass caught it, so the evidence
above is corrected here rather than left standing.** The task was ticked on a guard whose extraction
pattern was `` new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`) `` — which **demands a closing tag**.
`input` is an HTML void element and React writes it as `<input ... />`, so the enumerator matched **zero
inputs in all three spellings**, while its own comment claimed "`input` is included because a checkbox is
a perfectly good way to skip something" and this paragraph named `input` among the enumerated tags. A
guard that names a control kind it cannot see is reporting coverage it is not providing, which is the
second time this repository has paid for exactly that. **It was measured, not argued:** with a real
`<button>Skip translation for now</button>` added to the form the guard went red naming the control, and
with a real `<input type="checkbox" aria-label="Skip translation for now"/>` it stayed **green at 42
passed**.

The scenario held throughout — the live screen contains no `<input>` at all — but it held for a reason
the guard did not measure. The repair separates the two element shapes explicitly (`VOID_TAGS` gets its
own pattern) and adds the control the guard did not have, which exercises the **extraction** rather than
the **predicate**: the original can-fire control ran the classifier over a hand-written literal array, so
it could never detect a broken enumerator. The new one renders two real `<input type="checkbox">`
elements through `renderToStaticMarkup`, feeds the markup to the real enumerator, and requires that both
void inputs and the accompanying button are found **and** that only the skip-flavoured label is flagged.
A companion test records the other half honestly: the real screen has **zero** inputs and the only tag
present is `button`, because the conditional textareas are **hidden** rather than disabled (D5) until an
evaluation is chosen — so that count is a fact about today's markup, not a property of the enumerator.
That companion's first draft expected `{button, textarea}` and failed, which is the sixth time this
session an expected value written down instead of measured failed against correct code. 4.3 —
split across the two layers that can see it: the `dom` test asserts the **submitted payload** carries the
validator's own strings and that no field echoes the dataset's wording, and `validation-actions.test.ts`
asserts the **inserted row** carries the same three strings byte for byte, that the two translations were
not swapped for each other, and that the response row's key set is exactly ten fields with **no**
`instruction`/`sourcePayload`/`text` — so the rule "never overwrite the imported synthetic instruction"
is enforced by the **absence of a path**, not by a check somebody could forget. 4.4 — the guard's
mechanism was **rewritten** this change, not merely passed. Its marker set matched **zero** of the 600
instructions, because the data is Ayta/Itao place-name-first constructions; the replacement compares all
600 records bilaterally against both catalogs, with `MIN_FRAGMENT_CHARACTERS = 8` plus whole-word
matching. Both halves of that floor are re-measured by a test in `locale-copy.test.ts`, and its can-fire
control pastes a **real** record into each catalog.

## 5. Persisting a completed response, immediately, and advancing

- [x] 5.1 Add `src/lib/validation/validation-actions-core.ts` as a pure core taking its repositories
      injected, and `src/lib/validation/actions.ts` as a thin server-action wrapper going through
      `write-intake`. **Verify:** the core is unit-tested against recording fakes with no database, no
      network, and no `server-only` import, and `pnpm run lint` confirms no client component reaches the
      privileged path.
- [x] 5.2 Persist each completed response **as soon as it is complete**, never at batch end. **Verify:**
      a test that completes one entry **while other entries in the batch remain unanswered** and asserts
      the insert happened. This is the case a batch-end implementation fails, so it is the assertion that
      gives "immediately" its meaning rather than a comment.
- [x] 5.3 Advance to the next entry in the server-allocated order after the write, without depending on
      the rest of the batch. **Verify:** a `dom` test driving a real click through `act`, asserting the
      next entry is presented after the write resolves.
- [x] 5.4 Make the write single-flight, exposing the pending state on the control that initiated it and
      changing the appearance of controls made inert alongside it **uniformly** (`design.md`, and the
      `design-system` requirement this is the first non-onboarding consumer of). **Verify:** a `dom` test
      asserting `aria-busy` and `disabled` track the pending state **during** the write — which
      `renderToStaticMarkup` provably cannot see, since it never fires a handler — and a test asserting
      a second click produces **one** insert, not two.
- [x] 5.5 Treat a duplicate refusal for this validator and entry as the entry being complete, and
      advance; report every other failure as a failure (`design.md` D6). **Verify:** a test seeding a
      duplicate and asserting an advance with **no** discard, plus a negative control asserting a
      non-duplicate failure is reported as a failure and does **not** advance.

**Evidence.** 5.1 — `pnpm run lint` exits 0 with **zero warnings**. **The claim that the boundary rule
(`sadino/no-privileged-imports`) "covers every client component" is NARROWED, because measurement showed it
is inert on Windows for the one kind that matters most, and the defect is PRE-EXISTING.** The rule gates
on `context.filename.includes("/components/")` at `eslint.config.mjs:74`, and on Windows
`context.filename` is a native path with backslashes, so the substring is absent. Five isolation cases
were probed: a file under `src/components/` carrying `"use client"` **fires** the rule, a file under
`src/components/` **without** the directive does **not** fire, and `src/lib/` and `src/app/` without the
directive correctly do not fire. So on this platform a *presentation component that omits its own
`"use client"`* and imports a privileged module escapes the lint gate. There is **no live breach** in
this change — `src/components/validation/entry-card.tsx` imports only `@/schemas/batch` — and
`eslint.config.mjs` is **unchanged from `main`**, so this is not something this change introduced. It
also does not weaken CI, which runs `ubuntu-latest` where the rule fires normally. It is **not repaired
here**: `AGENTS.md` puts CI/CD and security tooling outside a change's scope and forbids unrelated fixes,
so it is recorded in `docs/ROADMAP.md` as a newly discovered pre-existing defect with its measurement
rather than quietly fixed or quietly dropped. The durable rule it guards is instead verified by reading:
no client component in this change reaches `server-only`, `@supabase/supabase-js`, or the service-role
env module, and `entry-card.tsx` imports no copy catalog at all.

**Two further measured corrections to the task's wording.** The core file does not import `server-only`
**of its own**, but it *inherits* the marker through `parseWriteIntent` in `@/lib/server/write-intake`,
so `validation-actions.test.ts` **does** stub `server-only` — exactly as `allocation-actions.test.ts`
does. The file's module comment claimed no stub was needed; that was measured wrong and has been
corrected in place. 5.2 — the action's call sequence is asserted as exactly
`["batches.findById:batch-1", "validations.insert"]` with **no** dataset call, and the batch in the
fixture has two entries of which one is answered. 5.3 — see below. 5.4 — the pending state is observed
**while the write is open**, and the single-flight latch is exercised by two submissions inside **one
synchronous `act`** so no render can occur between them; `h.submitted` is asserted at length **1**. 5.5 —
`already_recorded` advances and the document must not say nothing was saved; a `failed` write does not
advance and does.

**5.3 required more than a pushed URL, and the reason is worth recording.** Asserting
`router.push("/validate/<batch>?position=4")` would be satisfied by a form that pushed a URL and a server
that then showed the **same** entry again — which is the actual participant-facing failure. So the test
does both halves: it reads the position back **out of the URL the form produced**, unmounts, mounts the
real component again at that position, and takes the entry from the **real `resolveSessionEntry`**
against a real placement list. No arithmetic appears in the assertion. The completed set had to be
**measured**: the first draft passed an empty set plus the entry just answered and got `OD_0005`, the
first *remaining* placement, because with only `OD_0007` done, placements 1 and 2 were still outstanding.
That was the resolver behaving correctly and the expectation being invented — the fifth time this
session that an expected value written down rather than measured failed against correct code.

**5.3 was ALSO WITNESSING A DEAD FUNCTION, and the verification pass caught it. This paragraph is the
correction, and the deletion it describes is recorded in `src/lib/validation/session.ts`.** The first
draft resolved the next entry with `resolveNextSessionEntry` — a second export whose own doc said it
existed "rather than as a call with `requestedPosition: position + 1` at each of two call sites". **It
had zero production callers.** Its only importers were two test files, and this test was one of them, so
it proved a *dead* function correct and said nothing about the product. **A function gaining a test is
not a function gaining a caller**, which is the same shape as the "a specification gaining an
implementation is not a scenario gaining a witness" rule already recorded in `AGENTS.md`.

It could not have had a caller, and that is the interesting part. The advance really is
`position + 1`, where `position` is the **placement's** own position, which
`src/app/validate/[batchId]/page.tsx` passes as `position={session.position}` — the server's figure,
never the URL's requested one. So the arithmetic is forward by construction and the candidate function
was not merely unused but *wrong for the real path*: it resolved `requestedPosition: undefined`, which
`resolveSessionEntry` answers with `remaining[0]`, where the route's own call answers with the first
remaining placement at or after the requested position. Those differ exactly when a participant resumes
part-way through a batch, and the route's version is the correct one. Fetching the next entry inside the
write was rejected during design for research integrity — the next sentence must not be read before the
current response is stored — and that decision is what leaves the advance as a navigation and therefore
leaves the function with nowhere to live.

**The guarantee is now asserted where it is real, as three production links**, and the second and third
were the ones the first draft had no witness for:

1. the form pushes exactly `position + 1`, read back out of the URL — the sibling test in the same
   `describe`, which is what catches a *wrong* position and not merely a missing one;
2. `resolveSessionEntry`, the production function, called with the position the push named — and with a
   **new can-fire control** that three different in-range positions give three different entries, which
   is what makes reading the position out of the URL worth anything rather than decoration. Without it
   the first control is invisible to a mutation pushing a large position, because the resolver's
   past-the-end fallback answers `OD_0008` for `?position=999` too. That control itself failed on its
   first draft with a completed set leaving only **one** remaining placement, where every requested
   position resolves to the same entry — a control that passes for the wrong reason is still a control
   that proves nothing;
3. the route treats the **server's** placement position as the current one, never the URL's, asserted
   from rendered markup. A source scan would prove a string is present and nothing about which value
   reached the form.

**One behaviour the deleted tests encoded is now UNSPECIFIED, and is raised for the Sync stage rather
than quietly adopted.** They asserted that a participant answering an entry *out of order* is next shown
the **first entry still needing an answer**, even one positioned before the one just answered. The
production path does not do that and cannot: it advances by placement position, so a participant who
reached `?position=7` is next sent to `?position=8`, leaving position 1 outstanding. **Nothing is lost**
— the resolver falls back to the first remaining entry once the requested position passes the end, so an
earlier entry is never permanently skipped and can still reach its coverage target. But no scenario
specifies which behaviour is correct, and "the next entry in the order the server allocated" is
satisfied by both readings when a validator answers in order, which is the only way the session is meant
to be driven. Inventing a rule for the case the specification does not reach would be exactly the kind of
unapproved widening this project records as a finding.

## 6. Safe navigation, and preventing an invalid submission

- [x] 6.1 Moving between entries in the active batch preserves completed work and never resubmits a
      completed response. **Verify:** a `dom` test that completes an entry, navigates, and asserts the
      persisted row is still there and no second insert occurred.
- [x] 6.2 A completed entry is not offered again in the same batch, including after leaving and returning
      to the session. **Verify:** a test returning to the session and asserting the completed entry is
      absent from what is offered — the participant-facing counterpart to at-most-once, and a different
      failure from the database refusing the write, since a refusal has already cost the validator their
      typed answer.
- [x] 6.3 Prevent an invalid response from being sent, and identify which input is required, **without**
      treating that prevention as the enforcement. **Verify:** a `dom` test asserting no request is made
      while a required input is missing and that the missing input is identified, plus a server-side test
      asserting an invalid response reaching the server is still refused.

**Evidence.** 6.1 — a `dom` test answers `incorrect` with a correction and both translations, submits,
re-mounts at the next entry, and asserts `h.submitted` is still length **1** and still `toEqual` the
snapshot taken **after** the first submit. The snapshot is a `structuredClone` taken **after** the
submit: the first draft took it before, read `h.submitted[-1]`, and compared a real payload against
`undefined`. 6.2 — two visits to the same batch with the same completed set both present `OD_0002`, the
completed entry is never read, and the call log shows two identical **read** sequences and no mutation. A
requested position naming a completed entry resolves **forward** (`OD_0002` completed, position 2 →
`OD_0003`), measured rather than assumed. 6.3 — the `dom` test asserts `h.submitted` stays at **0** when
a required input is missing, and the missing input is **named**; the server-side refusal is asserted in
`validation-actions.test.ts` for six plausible extra keys and three invalid responses, each with
`deps.calls` and `deps.inserted` both asserted **empty**, so a refused write costs no query.

## 7. The handoff out of `/ready`

- [x] 7.1 Replace `/ready`'s honest dead end with the real onward path, correcting the comment that
      claims *"Allocation is Phase 4, so there is nothing to link to yet"* — false since
      `requestBatchAction` exists. **Verify:** a test asserting `/ready`'s internal hrefs against routes
      that exist, following the precedent that the existing set is asserted **exactly** rather than
      satisfied by having no links at all, which is how that assertion previously passed trivially.
- [x] 7.2 Record that **no spec requirement covers this handoff**. It is participant-visible, so a
      reviewer may reasonably want one, but adding a requirement to `validator-onboarding` would modify a
      capability this change declares it does not touch. **Verify:** this item appears in the change's
      Proposal as an open question for the Sync stage, so the decision is reviewed rather than buried.

**Evidence.** 7.1 — the existing `KNOWN_ROUTES` inventory is asserted to **contain** `/start`, `/ready`,
and `/validate` before the href loop runs, so a `readdirSync` pointed at the wrong path cannot yield an
empty array and pass every href assertion vacuously. `/validate` is named **explicitly as well as** being
picked up by the directory scan, because the scan reports a missing directory and the explicit name
reports the missing route. **7.1 was ticked as having corrected a comment it had not, and the
verification pass caught it.** The header comment at `src/app/ready/page.tsx:17` still read
*"It deliberately does NOT link to a batch route. Allocation is Phase 4, so there is nothing to link to
yet"* while the same page carried `href="/validate"` at line 234 — so the sentence was false twice over,
once when it was written and again once the link existed. A **new** JSX comment near the link *quoted*
the stale header as already false, which acknowledges a claim without correcting it, and a tick that
asserts a correction is worse than an unticked box because it removes the work item. The header is now
rewritten to the true and narrower claim — it does not link to a **BATCH** route, because
`/validate/<batchId>` needs an identifier the server has not chosen yet — with the retraction recorded in
place. **The two remaining occurrences of the old sentence in that file are the retraction quoting it**,
which is the trap `AGENTS.md` records: retracting a claim inside the comment that made it leaves the
phrase legitimately present, so any absence check on this file has to allow a quoted past-tense
attribution rather than a bare `not.toContain`. No behavioural impact; the tick was simply untrue.
7.2 — the Proposal carries the open question; **2** matches.

### The four verification-repair probes, and what they measured

The independent verification pass for this Apply stage returned **NO** overall, on the grounds that three
ticked boxes were not true as written and one guard reported coverage it did not provide. All four
findings were re-derived independently before anything was repaired, all four were confirmed, and the
repair of each is now witnessed by a mutation probe with a **negative control** and a **byte-identical
restore**. A green suite cannot show that a guard fires, so these are the evidence.

| Probe | Mutation | Result | Named failures |
| --- | --- | --- | --- |
| P6 (W1) | a real `<input type="checkbox" aria-label="Skip translation for now">` on the screen | RED | **2** tests, incl. `a control that can skip required research data: Skip translation for now` |
| P7 (W2) | the stale *"Allocation is Phase 4"* sentence asserted as current | **PASS — a source scan, not a test** | **0** lines assert it; only the retraction quotes it |
| P8 (W3) | the progress line rendering `completedCount + 1` instead of the placement position | RED | **1**, `expected '…' to contain 'Sentence 4 of 10'` |
| P9 (W3) | the form advancing by `position + 2` | RED | **4**, all in VF-6 |

**P6 is the one that matters, because the same mutation was GREEN before the repair.** With a real void
`<input>` added, the *original* guard stayed green at 42 passed while the *fixed* one goes red naming the
control. That is the whole of W1 in one measurement: the guard could not see the control kind its own
comment claimed to cover.

**P8b is recorded as a MEASURED LIMIT rather than a pass, and it is a limit on this change's own new
test.** The new route test witnesses the **progress line**. It does **not** witness
`position={session.position}` — the prop handed to the form — because a Server Component's props are not
attributes in rendered HTML: `renderToStaticMarkup` cannot see them, and the only other instrument is a
source scan, which proves a string is present and never that the code behaves as the string suggests. P8b
mutates exactly that prop and the suite stays **green at 1214/1214**. That is written down rather than
glossed, because the question "what would have to be true for this assertion to fail" is the one that
finds vacuous guards, and the honest answer here is "break the prop wiring". Closing it properly needs a
real server render plus a real navigation, which needs a browser and a Supabase project; **neither
exists**.

### The re-verification of the repairs found THREE MORE, and one of them was in my own new test

The repairs were re-verified by a second independent pass, which returned **YES** for W1, W2 and W4 and
**YES for W3's substance** with three reservations. All three were confirmed by re-derivation and
repaired. Two are worth reading in full, because both are the failure this repository's ledger exists to
catch and **one of them was in a test I had just written to fix a different instance of it**.

| Probe | Mutation | Result | Named failures |
| --- | --- | --- | --- |
| P10 (W-1) | the route resolving the session with `position: undefined` | RED | **3** |
| P11 (W-2) | the resolver **ignoring** `requestedPosition` entirely (`remaining[0]`) | RED | **6**, incl. the re-mount test |
| P11b (W-2) | the form pushing `position + 2` | RED | **5**, incl. the re-mount test |
| P12 (W-3) | a labelless `<input type="checkbox" />` | RED | **2**, message names `<input> ""` |

**WARNING 2 is the one worth reading: my repaired re-mount test was STILL VACUOUS, in the same way, one
test after I fixed it.** Its fixture marked positions 1, 2 and 3 complete, leaving exactly **one**
remaining placement. Every requested position then resolved to that one entry — `4`, `1` and `999`
alike — so reading the position out of the pushed URL was **decoration**: the test passed identically
with the resolver ignoring its argument, and identically with the form pushing `position + 2`. Measured,
not reasoned: P11 and P11b both left this test **green** before the fix and go **red** after it. The
fixture now marks positions 1 and 3 complete, leaving **two** outstanding, so the request genuinely
chooses between them, and the test asserts the first remaining (`OD_0006`) is **not** the answer.

The can-fire control I added in the previous commit had a comment claiming it made the re-mount's
`requestedPosition` load-bearing. **That claim was false, and the reason is general: a control in a
different test with a different fixture cannot repair a fixture in another test.** Both comments now
state what each test actually witnesses. This is also the **third** time this session that a fixture
leaving a single candidate made a real read look like a real dependency — the same trap, in the
`interactiveControls` control, then in the can-fire control's own first draft, then here.

**WARNING 1** was a production comment in `validation-actions-core.ts:50-52` still naming the deleted
`resolveNextSessionEntry` as the mechanism that decides what comes next — the same defect class as W2,
left standing in `src/` while the deletion was recorded in two other files. It is now the real
mechanism, with the wrongness of the old claim recorded.

**WARNING 3** was an assertion that became *newly reachable* when the void-element repair landed: a
labelless `<input>` is invisible to the skip-affordance pattern, and the failure message was
`expected false to be true`, naming neither the control nor the cause. The next reader would have been
looking at a skip-affordance guard while the actual problem was a missing `aria-label`. The offending
controls are now named. P12 measures it.

**NOTE 2 was also fixed**: the out-of-order advance question was recorded in `tasks.md` and
`session.ts` but **not** in the `proposal.md` open questions, so a reader consulting the proposal alone
would not have seen it. It is now in the proposal, which is where a Sync-stage decision gets made.

**NOTE 1 was fixed too**: the P7 row in the table above sat in a column where P6/P8/P9 mean "a test went
red", when it is a **source scan** and no test asserts that sentence's absence. It now reads
**PASS — a source scan, not a test**, because a table that mixes a grep with four mutation probes reads
as four green-backed guarantees when one is a string match.

### The repair probe harness was wrong twice before it was right, and both errors are instructive

The first harness generation reported **P6 and P9 as COLLECT-FAILED** — "1214 -> 1212 tests: FEWER than the
control" — which read as *the guards do not fire*. They do. **The harness compared the wrong number.** A
vitest run with two failures reports `1212 passed` against a control's `1214 passed`, and the harness
checked that drop **before** checking whether there were failures at all, so every genuine red was
reclassified as a collection break. A number compared against the wrong number is indistinguishable from
a finding, which is the same conflation this harness exists to prevent. The discriminator is the
**total** — `passed + failed` — and failures are checked first.

The second error was in P8 itself, and the harness **refused it correctly**. The first P8 mutation was
`position={Number(query["position"]) || session.position}`, which does not type-check —
`query["position"]` is `string | string[] | undefined` — so `tsc` exited 2 and the harness reported
NOT-ATTRIBUTABLE rather than a red. **A mutation that does not compile makes almost any assertion fail,
so its red would have been evidence about a compile error.** The rewritten P8 mutates a line that
type-checks, and the harness requires `tsc --noEmit` to be green on the mutant *before* believing any
verdict. Note again that the discriminator is not the exit code: `tsc` exits **2** on a type error, so a
predicate written for "0 or 1" calls a textbook red `DID-NOT-RUN`.

## 8. Integration verification

This group is cross-cutting checks only. Every test and every catalog update is owed by the group whose
work called for it above, so a failure here points at the boundary rather than at a late test.

- [x] 8.1 `openspec validate validation-experience --strict` and `openspec validate --specs --strict`
      both exit 0, with the capability count and totals reported from their own output. **Verify:** the
      figures are read out of the command, not inferred; the in-force total must be **9 passed, 0 failed**
      and this change is a delta so it adds no capability directory until Sync.
- [x] 8.2 The full gate passes: lint, format:check, typecheck, unit, dom, integration, the **scoped**
      dataset guard, and build. **Verify:** every figure is attributed to a **named step's own** summary
      line by a reader that refuses rather than reporting a partial answer, and the guard is confirmed
      scoped to 1 file and **distinct** from the whole suite.
- [x] 8.3 `data/ilocano-synthetic-data.json` is unchanged, and `git diff main --numstat -- supabase/`
      is **empty** because this change writes no migration. **Verify:** the dataset SHA-256 is read
      directly rather than read off a checkmark, and the migration diff is empty.
- [x] 8.4 State plainly what was **not** verified: no Supabase client has ever been constructed, PostgREST
      behaviour and API-gateway RLS are unverified, and **no human has looked at any screen**. **Verify:**
      these appear in the change's Proposal and in `docs/ROADMAP.md`, so no later stage reads a passing
      gate as visual or hosted verification.

**Evidence, all figures read out of the commands on 2026-10-01.**

| Check | Result | What it does **not** prove |
| --- | --- | --- |
| `pnpm run lint` | exit 0, **0 errors and 0 warnings** | The boundary rule would catch a *new* violation in a file not yet written |
| `pnpm run format:check` | exit 0, "All matched files use Prettier code style!" | Anything about correctness |
| `pnpm run typecheck` | exit 0 | Any runtime behaviour |
| `pnpm run test:unit` | exit 0 — **40 files, 1077 tests** | Anything needing a database, a network, or a browser |
| `pnpm run test:dom` | exit 0 — **4 files, 39 tests** | Anything about a real browser; `happy-dom` is synthetic |
| `pnpm run test:integration` | exit 0 — **6 files, 100 tests** | That this is Supabase: PGlite is PostgreSQL compiled to WebAssembly |
| whole suite (`vitest run`) | exit 0 — **50 files, 1216 tests** | The three projects' counts sum exactly, so nothing failed to collect |
| `pnpm exec vitest run --project integration tests/integration/immutable-dataset.test.ts` | exit 0 — **1 file, 7 tests** | That it is scoped correctly on CI; a scoped step has been read back from a run log four times this project |
| `pnpm run build` | exit 0, "Compiled successfully" | That any test passed |
| `openspec change validate validation-experience --strict` | exit 0, `Change "validation-experience" is valid` | That the implementation matches the change |
| `openspec validate --specs --strict` | exit 0, `Totals: 9 passed, 0 failed (9 items)` | The same; still 9 capabilities, so this delta adds no directory until Sync |
| `Get-FileHash data/ilocano-synthetic-data.json` | `39f757e61b70386b87ec1bb9410e881df342027bf580bed9c2f9beeb2f2e8965` | Read directly, not off a checkmark |
| `git diff main --numstat -- supabase/` | **0** lines | — this change writes no migration |

### Mutation probes

Five probes, each run as a **documented experiment** rather than committed as a permanent test, because
the question each asks — "what would it take to make this guard fail?" — is answered by a deliberate edit
to the file the guard protects. Every probe ran a **negative control** first and every working tree was
restored **byte-identically** (SHA-256 compared after the restore).

| Probe | Mutation performed | Control | Result | Named failures |
| --- | --- | --- | --- | --- |
| **P1** (1.4) | added `clientOrder: z.array(z.number()).optional()` to `submitValidationIntentSchema` | typecheck exit 0 | exit **2** | `TS2322: Type 'true' is not assignable to type 'never'` at `domain-types.test.ts:410` |
| **P2** (2.2) | prefixed `bg-accent ` onto the frozen `UNSELECTED` class | 50 files / 1200 passed | RED | **5**, across 3 files |
| **P3** (2.2b) | `[...EVALUATION_CHOICES].reverse()` at the `AnswerGroup` call site | 50 / 1200 | RED | **19** |
| **P4** (3.3) | replaced `requiresBilingualTranslations(evaluation)` with `evaluation !== null` | 50 / 1200 | RED | **8**, including *"AGREES with the domain predicates for every approved evaluation, with no local rule"* |
| **P5** (3.3b) | hardcoded `evaluation: "correct_natural"` into the submitted payload | 50 / 1200 | RED | **1**, in the `dom` project |

**P4's mutation is the one worth keeping.** It is *right for three of the four evaluations* and wrong for
`cannot_evaluate` — a uniformly wrong rule would be caught by almost any test, and a half-right one is
the version that escapes review.

**P5 is why the first draft of the probe harness was discarded, and the lesson generalises.** The first
run scoped every vitest probe to `--project unit` and scored P5 `RED-EXPECTED-BUT-GREEN` at exit 0 —
while the real answer was a single named failure in the `dom` project. A probe scoped to a subset reports
the rest as silent, and this repository has already been bitten by the same shape when a CI step claimed
to run a subset and was green. Every vitest probe now runs the **whole** suite.

**Three defects in the first harness condemned probes that were reporting on CORRECT code**, and each is
a shape this project has met before:

1. `applyMutation` **concatenated** the anchor with the replacement instead of replacing it, so every
   mutation produced a file with a duplicated line. A mutation that corrupts the artefact makes almost
   any assertion fail, so a red would have been evidence about a syntax error.
2. The verdict was `RED ? CONFIRMED` with **no requirement that a failure be named**. P2 scored
   `CONFIRMED` on the line below `failing tests (0)`. This is the ANSI/named-capture defect for the
   **fourth** time: an empty capture must be refused, never scored.
3. A collect failure read as a pass. P2 reported `898 passed (898)` against a `1064 passed (1064)`
   control — fewer tests than the control, which is a **COLLECT** failure, a distinct outcome, and not a
   meaningful subset.

The rebuilt harness gates every vitest probe on `tsc --noEmit` being **green on the mutant** first,
classifies on `status === undefined` rather than the exit code (`tsc` exits 2, so an "0 or 1" predicate
would call a textbook red `DID-NOT-RUN`), reports `COLLECT-FAILED` when the test count drops below the
control's, and **refuses** `named=false` as `NOT-ATTRIBUTABLE` rather than a pass.

**8.4, stated plainly.** **No Supabase client has ever been constructed** — every `SUPABASE_*` variable
is absent, so `getServerEnv()` throws on every real request. PostgREST wire behaviour, the
`error.cause.code === "23505"` duplicate detection, and RLS as enforced by the Supabase API gateway are
all **unverified**. The duplicate this suite treats as a success is a value a mock returned, not a code a
database raised. **No human has looked at any screen in this project** — `happy-dom` is synthetic, and
`renderToStaticMarkup` never fires a handler, so nothing above is visual verification. **No failing CI
run has ever been observed**, so "a failing test blocks the pull request" remains inferred from the
required checks rather than demonstrated.
