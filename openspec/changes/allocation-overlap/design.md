# Design

## D1. The scoping lives in the SERVICE, not in the selection rule — so the pure rule is unchanged

`selectBatchEntries` (`src/lib/domain/allocation.ts`) receives `answeredEntryIds: ReadonlySet<string>`
and has **no validator identity anywhere in its signature**. It cannot know, and is not asked,
whose answers those are. The scoping is one call away from it:

```
src/lib/allocation/allocate-batch.ts:255
    const answeredEntryIds = await dependencies.validations.listEntryIdsForValidator(
      request.validatorId,
    );
```

and one line further down that set is built as `new Set(answeredEntryIds)` and handed to the rule.

This is why the change is tests-plus-spec with **no `src/` edit**, and it is worth being explicit
because "no product change" in a proposal otherwise reads as "nothing was done". The behaviour the
new requirement describes is already correct; the requirement is not in force; and the suite cannot
distinguish the two facts. Two of those three gaps are closable here and the third is not closable
at all without a product change nobody is asking for.

The consequence for where the witness goes: the pure rule cannot be tested for this at all, and a
test written against it would be testing a function that has no such capability. The witness
belongs at the service seam, where the requester's identity and the answer set meet.

## D2. The overlap is proven through the SERVICE, over a shared fake, allocating twice

`createFakes` in `tests/unit/allocation-service.test.ts` closes over a single `responses` array
(`const responses = options.responses ?? []`), so every `allocateBatch` call made with one fake set
observes the same stored world. **Two allocations in one test therefore need no production change
and no new fake** — the fixture already supports the scenario and simply never used it. That is the
measured reason this is a bounded slice rather than a larger one.

## D3. The overlap assertion is built on the PIGEONHOLE PRINCIPLE, so it cannot depend on the injected randomness

The obvious construction is wrong and the reason generalises past this test. With a pool of exactly
the batch size, both validators receive the entire pool, the batches are *identical*, and the
intersection is non-empty **by construction** — the assertion would pass for any allocator at all,
including one that filtered aggressively, and would be a fixture that cannot discriminate. This
project has recorded three separate instances of exactly that defect.

So the pool is **12 entries against a batch size of 10**. Two 10-element subsets of a 12-element
set intersect in at least 8, whatever the randomness. The assertion `intersection.length > 0` then
holds for **every possible injected source**, which means it is a property of the allocator's
*policy* rather than of a scripted permutation, and no choice of `random` can rescue or defeat it.

The rejected alternative — scripting two different sources and asserting a specific overlap — was
not taken because it converts a research property into a property of a fixture, and a fixture can be
edited until the test says something else.

## D4. A CAN FIRE control, and what it must be

A guard that no mutation can turn red is the defect this change exists to close, so the new tests
carry their own witness. The control is a **deliberately validator-excluding allocator** — one
that drops any entry some validator has already answered — driven through the *same* assertion the
real tests use, expected to produce a disjoint pair.

Chosen over the obvious alternative, which is mutating `allocate-batch.ts` to widen the exclusion.
Both are run: the in-suite control is in `tasks.md` 2.4 and the source probe is `tasks.md` 2.5.
The in-suite one exists because the probe is not reproducible on an ordinary `pnpm run test:unit`,
and a proof that only exists in a temp directory is a proof a later reader cannot run.

## D5. The three scenarios are three different KINDS of claim, and none is redundant

- **Scenario 1** (another validator's answered entry is still offered) is a claim about **eligibility
  for one validator against one stored response**. It is the narrowest and the most direct.
- **Scenario 2** (two validators over one pool are not kept disjoint) is a claim about **the absence
  of a rule**, which is the thing actually at risk: it is what a future "don't offer the same
  entries twice" optimisation would break, and such an optimisation would look like a performance
  improvement.
- **Scenario 3** (three validators in turn drive one entry's coverage up to the target) is a claim
  about **the mechanism end to end**, including that the entry leaves the pool only when the target
  is reached.

Writing only scenario 3 would leave 1 and 2 unproven and would make a passing test depend on a
multi-step fixture; writing only scenario 2 would leave the per-validator scoping unproven, because
disjoint batches are the symptom and per-request exclusion is the cause.

## D6. No source change is planned, and the Apply stage must not quietly add one

Recorded so a later reader can tell a deliberate zero from an oversight: if Apply finds that the
implementation does *not* already scope the exclusion to the requesting validator, then the premise
of `proposal.md` is wrong and that is a finding to report rather than a licence to edit. The
measurement above was read from source at `84ca54f` and re-checked at the start of this stage.