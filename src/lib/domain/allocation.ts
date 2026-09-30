/**
 * The allocation selection rule: which dataset entries a validator is asked to judge next.
 *
 * ============================================================================
 * WHY THIS FUNCTION IS PURE, AND WHY IT IMPORTS NOTHING
 * ============================================================================
 * Two rules that are easy to state and easy to break:
 *
 *  1. **The coverage number is not derived here.** `selectBatchEntries` is HANDED the
 *     per-entry qualifying coverage, computed by the caller with the single in-force
 *     definition (`countQualifyingValidations` in `@/lib/domain/validation-response`). This
 *     module deliberately does not import that function either. If it did, the selection rule
 *     would own the meaning of coverage, and any other consumer — the admin dashboard, the
 *     export pipeline — would have to either re-implement it or trust that this one function
 *     was the rule. Handing coverage in as data keeps exactly one owner, and it makes the
 *     "all three `cannot_evaluate` responses mean zero coverage" scenario a property of the
 *     CALLER, where it can be tested against a real stored set rather than a hand-built one.
 *
 *  2. **No import from `@/schemas`.** Same precedent and same reason as
 *     `validation-response.ts`: this module has to stay usable from a Server Action, a plain
 *     test, and eventually a client-side preview of the ordering, without dragging Zod (or
 *     `server-only`) into it. The shapes below are structural, so a stored `DatasetEntry`, a
 *     value from a repository, and an object literal in a test are all accepted without any of
 *     them having to be a schema output first. The cost is that the `id` here is a plain
 *     `string` rather than the `DatasetEntryId` alias; since that alias resolves to `string`
 *     anyway, nothing is lost, and the alternative — importing it — would put a schema module
 *     in the dependency graph of the one function that must never grow a dependency.
 *
 * ============================================================================
 * WHY A GROUPED FILL AND NOT "THE LOWEST TIER ONLY"
 * ============================================================================
 * Roadmap allocation rules 4, 5 and 6 read, in sequence: prioritize the lowest qualifying count;
 * randomize within the lowest-qualifying-count candidate pool; return UP TO 10 entries. Read
 * strictly in order, that is a batch drawn only from the single lowest-count group — so a dataset
 * with 4 uncovered entries out of 600 would serve batches of 4, indefinitely.
 *
 * That reading is rejected, and the reason is internal to the roadmap rather than a preference:
 * the participant experience specifies a batch of 10, and `resolveBatchSize` in `@/schemas/batch`
 * already documents the expectation that "a validator at the end of the dataset with only three
 * eligible entries will still be served three entries". Rules 4 and 5 describe PRIORITIZING and
 * RANDOMIZING. Neither says "stop at the first group".
 *
 * So the rule is a TIERED FILL: group the eligible entries by qualifying count, walk the groups
 * from the lowest count upward, shuffle within each group, concatenate, and take the effective
 * size. Lower coverage is always preferred, and a higher-coverage entry is reached only when the
 * groups below genuinely cannot fill the batch.
 *
 * This is a METHODOLOGY judgment, deliberately isolated in this one function. The alternative is
 * a one-line change here, and it is not recorded as an open question because leaving it undecided
 * would mean the batch-size behaviour was implemented by accident. It is recorded in
 * `design.md` D2 as a decision the thesis team can overturn without touching anything else.
 *
 * ============================================================================
 * WHY GROUPING AND NOT SORTING
 * ============================================================================
 * A `Map<number, AllocationCandidate[]>` keyed by coverage, iterated with ascending keys, is the
 * data structure the rule actually needs. A comparator over a flat array would have to be correct
 * about ties, and its correctness would then rest on `Array.prototype.sort` stability — a property
 * this rule has no reason to depend on. A test can assert the group structure directly without
 * re-deriving a comparator, which is the property most worth testing: "every entry at the lowest
 * coverage precedes every entry at a higher coverage".
 *
 * ============================================================================
 * WHY THE RANDOM SOURCE IS A REQUIRED PARAMETER
 * ============================================================================
 * `random` is a parameter and has no default. The rejected alternatives, in the order they were
 * considered:
 *
 *   - `Math.random()` read inside the domain. Untestable, and the process-wide mutable state the
 *     architecture rules exclude.
 *   - a seeded PRNG in module scope. Same exclusion, and worse: a module-level generator is
 *     shared mutable state whose behaviour depends on call order across the whole process.
 *   - `crypto.getRandomValues`. A better entropy source and the SAME untestability problem, since
 *     it is not a parameter.
 *
 * The spec scenario "the same inputs and the same supplied randomness produce the same order" is
 * testable only because of this decision, and it is the standing guard against a later edit
 * reintroducing ambient randomness into a rule whose determinism is a research property. Callers
 * that genuinely want entropy pass `Math.random`; callers that need reproducibility pass a
 * scripted source. The domain does not choose between those, because choosing is the service's
 * job.
 *
 * ============================================================================
 * WHAT A MISSING COVERAGE KEY MEANS
 * ============================================================================
 * An entry in the pool with no entry in `coverageByEntryId` is treated as coverage 0, i.e. as
 * eligible. That direction is deliberate. A caller that failed to compute coverage for one entry
 * should not thereby RETIRE it — retiring it is the irreversible half of the error, because an
 * entry that stops being offered may never reach the independent-validation target at all. Offering
 * it is the recoverable half: at worst an under-covered entry is asked of one more validator. The
 * correct fix for a caller that really does have no coverage figure is to not call this function,
 * and the service above always computes coverage for the whole pool.
 */

/**
 * The minimum this module needs to know about a dataset entry: its source id.
 *
 * `{ id }` and nothing else. The selection is returned as `SelectedEntry` values rather than as
 * the candidates themselves, so the caller resolves each id against the pool it already holds.
 * That keeps `source_payload` — the one field carrying whatever an unmodelled source field
 * happened to contain — out of a pure rule that has no use for it.
 */
export interface AllocationCandidate {
  readonly id: string;
}

/**
 * Qualifying validations behind one entry, keyed by dataset entry id.
 *
 * A `ReadonlyMap` rather than `Record<string, number>` for the reason `AGENTS.md` records about
 * untyped dictionaries crossing a domain boundary: `Record` makes every string a legal key and
 * every read a `number | undefined` by type accident, so a typo becomes a silently absent
 * lookup rather than a compile error. A `Map` makes a missing key a deliberate decision, and this
 * function makes that decision on purpose (see the header).
 */
export type CoverageByEntryId = ReadonlyMap<string, number>;

/** One entry of the returned batch, in the order the server selected. */
export interface SelectedEntry {
  /** The dataset entry's source id. */
  readonly id: string;
  /** Qualifying coverage the entry had when it was selected. Not for a caller to act on. */
  readonly coverage: number;
}

/**
 * Fisher–Yates, inside-out, driven entirely by the supplied source.
 *
 * `random()` is assumed to return a value in `[0, 1)`, which is `Math.random`'s contract. The
 * index is clamped with `Math.min` rather than trusted: a scripted source in a test, or a future
 * caller passing a misbehaving generator, would otherwise index past the end of the array and
 * produce an `undefined` entry — which, in a research rule, is a silently corrupt batch rather
 * than a loud failure. Clamping turns that into a rotation, which is still a permutation and is
 * therefore still a valid shuffle.
 *
 * The result is a NEW array. The input is never mutated: the candidate pool is the caller's
 * `DatasetEntry[]` and mutating it in place would corrupt the coverage map the caller still owns.
 */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const pick = Math.min(index, Math.floor(random() * (index + 1)));
    const held = shuffled[index] as T;
    shuffled[index] = shuffled[pick] as T;
    shuffled[pick] = held;
  }

  return shuffled;
}

/**
 * Selects up to `size` entries for one validator.
 *
 * The rules, in the order they are applied:
 *
 *  1. An entry the validator has already answered is excluded. The methodology forbids a second
 *     opinion being recorded as independent, so this is an eligibility rule and not a preference.
 *  2. An entry whose qualifying coverage has REACHED `independentValidationTarget` is excluded.
 *     "Reached", not "exceeds": the third qualifying validation is what retires the entry.
 *  3. What remains is grouped by qualifying coverage, groups are walked from the lowest count
 *     upward, each group is shuffled independently, and the concatenation is truncated to `size`.
 *
 * `size` at or below zero yields an empty array rather than raising. The service above can never
 * pass such a value — `resolveBatchSize` floors the result at 1 — and the reason for tolerating it
 * here rather than throwing is that a zero is a legitimate "I want nothing" from a future caller
 * and an exception would be a worse answer than an empty selection.
 *
 * Every parameter is required. `random` in particular has no default, so a caller cannot reach
 * this function without choosing where its randomness comes from; see the header for why that is
 * a research property rather than a testing convenience.
 *
 * @param candidates The active pool, in whatever order the repository returned it. The rule
 *   imposes its own order and does not preserve this one.
 * @param answeredEntryIds Entries this validator has already submitted a response for.
 * @param coverageByEntryId Qualifying coverage per entry, from the single in-force definition.
 * @param independentValidationTarget The configured number of qualifying validations from
 *   DISTINCT validators at which an entry leaves the pool. Passed in rather than hard-coded
 *   because it is pending adviser approval and is configuration, not a constant.
 * @param size The effective batch size, already capped by `resolveBatchSize`.
 * @param random Source of randomness in `[0, 1)`, called once per swap step.
 */
export function selectBatchEntries(
  candidates: readonly AllocationCandidate[],
  answeredEntryIds: ReadonlySet<string>,
  coverageByEntryId: CoverageByEntryId,
  independentValidationTarget: number,
  size: number,
  random: () => number,
): SelectedEntry[] {
  if (size <= 0) return [];

  // D3: the grouping IS the rule. Nothing is sorted, so nothing depends on sort stability.
  const groups = new Map<number, AllocationCandidate[]>();

  for (const candidate of candidates) {
    if (answeredEntryIds.has(candidate.id)) continue;

    const coverage = coverageByEntryId.get(candidate.id) ?? 0;
    if (coverage >= independentValidationTarget) continue;

    const group = groups.get(coverage);
    if (group === undefined) groups.set(coverage, [candidate]);
    else group.push(candidate);
  }

  const selected: SelectedEntry[] = [];

  // `[coverage, group]` pairs sorted by coverage ASC, so the groups are walked from the lowest count
  // upward. Iterating the entries directly rather than the keys and then looking each one up: the
  // lookup could only ever return what the key list was built from, so it was a second path to the
  // same value, and the `as AllocationCandidate[]` needed to express it was a cast that asserted a
  // fact the compiler could not check. `noUncheckedIndexedAccess` makes that cast look necessary when
  // it is not — the value is not an index, it is a `Map` lookup the type already knows the answer to.
  const ordered = [...groups.entries()].sort(([left], [right]) => left - right);

  for (const [coverage, group] of ordered) {
    for (const candidate of shuffle(group, random)) {
      selected.push({ id: candidate.id, coverage });
      if (selected.length === size) return selected;
    }
  }

  return selected;
}
