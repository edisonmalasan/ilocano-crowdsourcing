# Proposal

## Why

**Nothing in this repository proves that the allocator offers the same entry to two different
validators.** Measured on `main` at `84ca54f`, not inferred:

| Where one might expect the proof | What it actually contains |
| --- | --- |
| `tests/unit/allocation.test.ts` (the pure rule) | **Zero** occurrences of any validator identifier. `selectBatchEntries` takes `answeredEntryIds` and has no notion of who answered them, so the file is coverage-to-order and nothing else. |
| `tests/unit/allocation-service.test.ts` (the service) | 43 tests, **one `allocateBatch` call per test**, 14 distinct validator ids spread across those 43 independent fixtures. No test allocates twice, so no test ever observes a second validator over a pool a first validator has already drawn from. |
| `tests/integration/research-schema.test.ts:429` | Proves overlap **at the database**: a second validator's insert for an entry the first already answered is accepted. |
| `openspec/specs/domain-contracts/spec.md:234` and `openspec/specs/research-schema/spec.md:109`, both "Different validators may validate the same entry" | Both are about that same **insert constraint**. Neither is about which entries allocation chooses. |

So the chain has a hole in the middle. The database will happily accept two validators' responses
for one entry; nothing establishes that the allocator will ever *ask* the second one.

**Why that hole matters more than a missing test.** The approved coverage target is 3 qualifying
validations from 3 **distinct** validators per dataset entry. Coverage by distinct validators is
reachable *only* through overlap: the allocator serving entry `OD_0042` to validator A and then to
validator B. If the allocator were changed — or had been wrong from the start — to exclude entries
any validator had already answered, then every entry would be offered exactly once, coverage would
stall at 1 of 3 forever, and **every suite in this repository would stay green**. The failure mode
is not an error; it is a research dataset that silently never completes, discovered at
adjudication.

That is the defect class this project has already paid for twice, and it is the reason this change
exists rather than being folded into a general "add more tests" task: the suite passing is not
evidence, because the specific failure it fails to detect is invisible to it.

**This is not a research decision.** The 3-distinct-validators target is already approved. This
change specifies the mechanism the approved target depends on and gives it a witness that can go
red. It states no new rule about how many validators or which entries.

## What Changes

- **One ADDED requirement in `batch-allocation`** stating that the exclusion applied to a
  validator's candidates is derived from *that validator's* responses alone, and that allocation
  SHALL NOT withhold an entry because another validator's batch or response already contained it.
  Three scenarios: another validator's answered entry is still offered; two validators over one
  shared pool are not kept disjoint; coverage by distinct validators can rise toward the target.
- **Tests only.** `tests/unit/allocation-service.test.ts` gains the cross-validator witnesses the
  measurement above shows are absent. No file under `src/`, `supabase/`, `scripts/`, or `data/` is
  changed — see `design.md` D1, where the behaviour is located and read from source.
- **A can-fire control**, both as an in-suite `CAN FIRE` companion and as a source probe recorded
  in `tasks.md`, because a test that no mutation can turn red is the defect this change is closing.

## Explicitly out of scope, and why

- **`domain-contracts` / `research-schema`.** Both already carry an overlap scenario and both are
  about the insert constraint. Re-specifying them here would create a third statement of the same
  fact in a capability this change does not touch.
- **The `validations_validator_entry_unique` constraint and the database.** Already proven against
  a real PostgreSQL engine, including the direction where a *different* validator's duplicate is
  accepted.
- **Phase 9's UX matrix.** Not closable by any command in this repository; it needs a browser,
  which is the standing residual `docs/ROADMAP.md` already records.
- **Any change to coverage arithmetic, batch size, or ordering.** The tiered fill, the randomized
  group order, and the qualifying rule are all in force and unchanged.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `batch-allocation`: one ADDED requirement, and one scenario under the existing "Batch entries are
  chosen on the server by qualifying coverage" requirement is **not** modified — the new requirement
  is wholly additional, so `openspec/specs/batch-allocation/spec.md` grows from 4 requirements /
  18 scenarios to 5 / 21 at Sync.

## Impact

- `tests/unit/allocation-service.test.ts`: three new scenarios plus a `CAN FIRE` control, driven
  through the file's existing call-recording fake.
- `openspec/specs/batch-allocation/spec.md` at Sync (not in this stage).
- **No product change**, and that is a measurement rather than an intention: the scoping is at
  `src/lib/allocation/allocate-batch.ts:255`, which passes `request.validatorId` to
  `listEntryIdsForValidator`. What is missing is the requirement and the witness, not the
  behaviour.