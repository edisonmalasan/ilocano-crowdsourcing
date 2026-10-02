# Tasks

## 0. Preconditions

- [ ] 0.1 Re-confirm, from source and not from this change's prose, that the exclusion is scoped to
      the requesting validator: `allocate-batch.ts` passes `request.validatorId` to
      `listEntryIdsForValidator`, and the repository's implementation filters on
      `validator_id = <that id>` rather than reading the whole pool's responses.
      **If this does not hold, `proposal.md` is wrong and that is a finding to report, not a licence
      to edit `src/`** (`design.md` D6).

## 1. Requirement

- [ ] 1.1 The ADDED requirement in `specs/batch-allocation/spec.md`, and the three scenarios. No
      existing requirement is modified; the delta carries one ADDED block and zero MODIFIED.

## 2. Witnesses

- [ ] 2.1 Scenario 1 — an entry another validator has answered is still offered. One stored
      qualifying response recorded against a different validator; the requesting validator's batch
      still contains the entry. The fixture must place the entry **inside** the batch on its own
      merits, and assert the response is present in the fake, so a fixture that quietly omitted it
      cannot make the assertion pass.
- [ ] 2.2 Scenario 2 — two validators drawing from one pool are not kept disjoint. Pool of 12
      against a batch size of 10, so the overlap is forced by the pigeonhole principle and holds for
      **any** injected randomness (`design.md` D3). Assert the intersection is non-empty and name
      both validators in the failure message. Assert the pool was 12 and the size 10 in the test
      itself, so a later edit that shrinks the pool below the batch size is caught by the test rather
      than by the assertion silently becoming true by construction.
- [ ] 2.3 Scenario 3 — three validators in turn. Each allocation is followed by that validator's
      qualifying response being stored in the shared fake, so the next allocation reads real
      coverage. Assert the same entry appears in all three batches, that its coverage reads 0, 1
      then 2 at each step, and that a fourth validator's request excludes it **because the target is
      reached** rather than because of any per-validator bookkeeping.
- [ ] 2.4 **CAN FIRE, in-suite.** A deliberately validator-excluding allocator — one that drops any
      entry some validator has already answered — driven through the *same* intersection assertion,
      expected to produce a disjoint pair. Without this, the assertion is a claim that nothing
      contradicts (`design.md` D4).
- [ ] 2.5 **CAN FIRE, as a source probe.** Mutate `allocate-batch.ts` so the answered set is built
      from the pool's whole response set rather than the requester's, and record that the new tests
      go red by name. Green control before and after, sha256-verified byte-identical restore, and
      the mutant's mutation stated (removed text, inserted text, mutant sha256) so a later reader
      can tell a finding from a different experiment.

## 3. Close out

- [ ] 3.1 `pnpm run lint`, `format:check`, `typecheck`, `test:unit`, `test:dom`,
      `test:integration`, `build` — all run, with the figures they actually produced. **Re-derived,
      never incremented.**
- [ ] 3.2 `openspec change validate allocation-overlap --strict` exits 0. `openspec validate --specs
      --strict` is expected to remain **16**: this delta is not synced until the Sync stage, and a
      figure that has risen here would mean the delta was written to the wrong place.
- [ ] 3.3 Update `docs/ROADMAP.md` `## Project Status`. The archive count is **unchanged at
      Seventeen** by a proposal — a proposal creates no archive directory — and the sentence is
      stated as unchanged rather than left ambiguous. `tests/unit/ledger-integrity.test.ts` must
      stay green.
- [ ] 3.4 Independent verification pass. No CRITICAL may survive and no WARNING may be silently
      waived.
- [ ] 3.5 Merge with a merge commit, after 3.1–3.4 are green. **Ticked in the Archive stage, not
      before the merge** — both prior changes record the same handover, and a ticked "merged" box on
      an unmerged branch claims a fact that does not yet exist.