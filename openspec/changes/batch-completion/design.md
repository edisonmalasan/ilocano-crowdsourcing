# Design — `batch-completion`

## The situation, measured rather than assumed

Every claim below was checked against the repository, not inferred from reading it. Where a search was
used it was run **with controls**, because an empty result and a broken search look identical.

| Claim | How it was established |
| --- | --- |
| The finished state already exists | `session.ts` returns a `finished` variant; `session-service.ts` converts it; `page.tsx` renders it as a card |
| Its copy admits the dead end | `copy.ts` — *"Asking for another batch is not part of this part of the study yet"* — in **both** catalogs |
| The submit result carries no completion figure | `SubmitValidationResult` has exactly four statuses: `recorded`, `already_recorded`, `failed`, and a nested `persistence` reason. **No completion member** |
| A per-validator count exists but is never called | `countForValidator` appears **6 times** in `src/`, and **all 6 are declarations, implementations, or operation-union members — zero call sites** |
| The count is not filtered by evaluation | its implementation selects `COUNT(*) where validator_id = ?` with **no `evaluation` predicate**, so it counts `cannot_evaluate` rows |
| No way to find a validator's batches | `BatchesRepository` declares exactly **two** methods, `create` and `findById` |
| `validation_sessions` is untouched | **0** mentions across all **72** files in `src/` |
| No spec covers any of this | search of `openspec/specs/` for continuation/finished/count/another-batch returned **nothing** relevant |
| The one-start-control test is route-scoped | `loadStartPage()` imports `@/app/validate/page`, so it constrains `/validate`, not `/validate/[batchId]` |

The search controls are worth stating, because they nearly produced a false finding. A PowerShell
`Select-String -Path 'src\**\*.ts'` reported **zero** occurrences of `countForValidator` — because
`**` is not recursive there. Re-run as a real recursive walk it found **6**. A second control was
attempts against a symbol name I had merely guessed, which was also absent, and that control was
worthless; it was replaced with one anchored on `resolveSessionEntry`, a symbol actually read in this
session, which returned **8**. **A control built on a name nobody has verified tests the name, not the
search.**

---

## Decisions

### D1 — Continue is a direct control, not a link to `/validate`

The finished screen offers a control that calls the existing `requestBatchAction` and then presents the
new batch.

The alternative is linking to `/validate`, which already asks for a batch. That is one fewer moving
part and it reuses the exhausted-pool handling for free. It is rejected because the whole point of
continuing is that the participant does not ask again: the moment the loop is meant to feel continuous
would become a second request screen with the same button.

**The constraint this creates, and why it is a feature.** Two paths to allocation means two paths that
can disagree about what allocation does — which is precisely the hazard the existing test
`offers no SECOND control that could also start a batch` was written to prevent on `/validate`. That
test is scoped to `@/app/validate/page` and counts occurrences of one copy key, so it is unaffected.
Its *discipline* is not optional here, so it is applied to the new screen as well: the finished screen
must assert **exactly one** continue control **and** exactly one finish control, each counted.

### D2 — The lifetime figure counts every recorded response, and is not a coverage figure

`countForValidator` counts rows in `validations` for that validator, with no `evaluation` filter. This
change surfaces it as-is.

The alternative is to count only *qualifying* completed validations. It was rejected on research
integrity grounds, not engineering ones. A number that rose only when a validator felt confident would
be a **covert quality measure** — it would reward confidence rather than effort, and would rank
participants by a dimension the approved method explicitly forbids treating as a score. It would also
contradict the participant's own experience, since the screen they just finished would report a total
lower than the number of sentences they were asked about.

Because the figure is deliberately *not* a coverage figure, it is not governed by the single shared
definition of a qualifying completed validation that `domain-contracts` requires for allocation,
coverage reporting, and export. The requirement says this explicitly, so a later reader does not
"correct" the count into a coverage count.

**The copy obligation follows from this.** The figure may be described as entries answered. It may not
be described as contributions to the study's coverage, and the change states that restriction rather
than trusting the copy writer.

### D3 — `Finish For Now` writes nothing

Choosing to stop is a **link**, and it performs no write at all.

The tempting alternative is to record that the participant finished — a `completed` row, an
abandonment flag, something. It is refused because the approved research method defines **no
participation-end event**. Writing one would create a fact about an anonymous participant that no
requirement asks for, and it would be indistinguishable, from the data, between someone who chose to
stop after ten entries and someone whose browser closed. Declining to continue is not a datum.

This also keeps the honest reading available: a participant who returns tomorrow is still eligible, and
nothing was closed.

### D4 — No batch lifecycle column

Stated in the proposal and repeated as a requirement, because it is the decision most likely to be
second-guessed by the change that follows. See the proposal's *Why not simply add a batch status
column*.

### D5 — The two figures must be distinguishable, not just present

Showing "10" and "30" with no labels is a number and a number. The requirement requires both to be
labelled so a reader can tell the batch figure from the lifetime figure. A validator seeing "10" after
answering ten sentences should not have to guess whether they have validated ten sentences in their
lifetime.

### D6 — Both figures and the finished state are server-derived

`data-access-boundary` already names *"a completion status"* as state a client must not be able to
dictate. This change does not weaken that; it inherits it. The requirement adds a scenario for a
client supplying a completion status, a answered-count, or a remaining-count, all of which are ignored.

Note the consequence for the *total* figure: it comes from validation records, **not** from
`validators.total_validations`. That column exists, is set to `0` at enrolment, is never incremented,
and has no increment method. It is not this change's job to maintain it, so the requirement explicitly
routes the displayed figure away from the profile — which also serves the profile-disclosure
requirement. **Two independent reasons converge on the same source, and neither depends on the other.**

### D7 — The lifetime figure is a record, not a streak — found by cross-checking, not by designing

`design-system` requires that **no screen** carries a countdown timer, a **streak counter**, or a
speed-pressure mechanic. A lifetime cumulative total is adjacent to that: it rises monotonically, it
rewards volume, and the roadmap's own example is a bare `Total contributions: 30`.

This was found by reading the ten in-force capabilities against the delta rather than by designing —
which is the only reason it surfaced at all, since nothing about the finished screen *looks* like a
gamification mechanic until you read a spec that already forbids one.

The distinguishing property is **whether the figure escalates during the activity**:

- Progress *within the current batch* — `BatchProgress` already shows it, and the roadmap requires it.
  A 0-to-10 indicator inside one batch is progress, not a streak.
- A **lifetime total that climbs on screen while someone is answering sentences** is a volume counter
  competing for attention with the sentence in front of them. That is precisely what the rule exists to
  prevent, and `AGENTS.md` is blunter still: no *"mechanics that encourage speed over careful
  validation"*.

So the figure appears **once, on the finished presentation, as a static record**, with no comparison,
target, milestone, rank, or encouragement toward a further one. The requirement pins this rather than
leaving it to the copy, because a figure is a mechanic regardless of how neutrally it is worded — the
roadmap's phrase *Total contributions* does the persuading on its own.

Note that this constrains a later change too: a "your total is 31!" banner on the request screen, or a
milestone celebration, would fall under this scenario even though nothing about it is a streak.


---

## Deliberately not in this change

Roadmap task 6, *restore interrupted active batches where practical*, is out.

It is a separate vertical slice: it changes a different screen (`/validate`, the request screen, not the
finished one), it needs discovery that does not exist (`BatchesRepository` can only find a batch by an
id it is already given), and it needs a lifecycle column, which means modifying `research-schema` and
writing a migration. None of that belongs in a change whose subject is what a participant sees after
finishing a batch.

**The ordering risk, stated rather than waved away.** This change makes repeated continuation more
likely, and repeated continuation is what produces orphaned batches: today every request creates a new
batch, `allocateBatch` never looks at a validator's existing batches, and nothing surfaces an older
one. So after this change, a participant who abandons their second batch midway will have no way back
to it.

**No work is lost.** Every response is banked at the moment it is submitted — that is
`validation-experience`'s central guarantee, and it is why shipping continuation first is defensible at
all. What is lost is *reachability of that specific batch*, not the data. `countForValidator` counts
across all batches, so the lifetime figure stays correct regardless.

It is recorded as the next bounded change, not as an afterthought.

---

## Carried forward, and deliberately not re-decided here

- **Out-of-order advance.** Decided in Phase 5 and now specified. Inherited unchanged.
- **The vacuous `design-system` pending-state scenario.** Phase 5 was measured to leave it unwitnessed,
  because it hides conditional inputs rather than disabling them. **This change adds a pending state
  of its own** — the continue control will be busy while a batch is requested — so the scenario has a
  second chance to become observable. If it does not, that is a measurement to make, not a reason to
  restructure the controls into something disabled-for-unavailability that the scenario could see.
- **`RV-4`** still has no behavioural guard. Phase 5 declined it; the guard belongs to whichever change
  first makes the boundary observable, and this change does not obviously make it observable.

## Open questions, carried into Sync

1. **Should the continue control be disabled or hidden while its request is in flight?** Phase 5's
   established pattern is to hide conditional inputs and expose a pending state, with `aria-busy` and
   in-button progress. This change should follow that precedent rather than re-open it, but the
   precedent is worth confirming against the new control rather than assumed to transfer.
2. **Where does the finished screen's lifetime figure come from on a cold render**, and does the
   finished presentation need the count to be *fresh*, or is a value read in the same request as the
   session acceptable? There is a genuine question about whether a figure shown immediately after a
   submit should reflect that submit, which decides whether the count is read before or after.
