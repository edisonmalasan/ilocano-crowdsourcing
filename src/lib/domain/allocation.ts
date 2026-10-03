/**
 * The allocation selection rule: which dataset entries a validator is asked to judge next.
 *
 * ============================================================================
 * WHY THIS FUNCTION IS PURE, AND WHY IT IMPORTS NOTHING
 * ============================================================================
 * Two rules that are easy to state and easy to break:
 *
 *  1. **Completion is not derived here.** `selectBatchEntries` is HANDED the set of completed
 *     entry ids, computed by the caller with the single in-force definition (`isEntryComplete`
 *     in `@/lib/domain/validation-response`). This module deliberately does not import that
 *     function either. If it did, the selection rule would own the meaning of completion, and
 *     any other consumer — the admin dashboard, the export pipeline — would have to either
 *     re-implement it or trust that this one function was the rule. Handing completion in as
 *     data keeps exactly one owner, and it makes the "five `cannot_evaluate` responses still
 *     leave the entry incomplete" scenario a property of the CALLER, where it can be tested
 *     against a real stored set rather than a hand-built one.
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
 * WHY A SHUFFLE AND NOT A GROUPED FILL
 * ============================================================================
 * The superseded methodology ordered candidates by ascending qualifying coverage and filled tier
 * by tier. That ordering is provably degenerate once retirement means "any qualifying response":
 * every entry that survives the completion filter is incomplete, so all survivors would land in a
 * single group and a `Map` with one key cannot order anything. Keeping the group-walk would leave
 * code whose comment claims to sort entries that can no longer be sorted, which is worse than
 * deleting it.
 *
 * So the rule is a SHUFFLE: filter out answered and completed entries, shuffle what remains with
 * the supplied source, and take the effective size. The randomization the old rule also required
 * is retained, because it was doing real work independent of the target — no entry is
 * systematically served first — and deleting it with the sorting would remove a guarantee nobody
 * asked to lose.
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
 * WHAT AN UNKNOWN ENTRY MEANS
 * ============================================================================
 * An entry in the pool that is absent from `completedEntryIds` is treated as incomplete, i.e. as
 * eligible. That direction is deliberate. A caller that failed to compute completion for one entry
 * should not thereby RETIRE it — retiring it is the irreversible half of the error, because an
 * entry that stops being offered may never receive its validating package at all. Offering it is
 * the recoverable half: at worst an incomplete entry is asked of one more validator. The correct
 * fix for a caller that really does have no completion figure is to not call this function, and
 * the service above always computes completion for the whole pool.
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
 * The dataset entries that already hold a validating package, by source id.
 *
 * A `ReadonlySet` rather than `Record<string, boolean>` for the reason `AGENTS.md` records about
 * untyped dictionaries crossing a domain boundary: `Record` makes every string a legal key, so a
 * typo becomes a silently absent lookup rather than a compile error. Membership in a set is a
 * deliberate statement, and absence from it is the eligible direction (see the header).
 */
export type CompletedEntryIds = ReadonlySet<string>;

/** One entry of the returned batch, in the order the server selected. */
export interface SelectedEntry {
  /** The dataset entry's source id. */
  readonly id: string;
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
 * `DatasetEntry[]` and mutating it in place would corrupt the completion set the caller still owns.
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
 *  1. An entry the validator has already answered is excluded. One attempt never answers one
 *     entry twice, so this is an eligibility rule and not a preference.
 *  2. An entry that already holds a validating package is excluded. One qualifying response
 *     completes the entry, so there is no second round to offer it for.
 *  3. What remains is shuffled with the supplied source and truncated to `size`.
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
 * @param completedEntryIds Entries that already hold a validating package, from the single
 *   in-force definition.
 * @param size The effective batch size, already capped by `resolveBatchSize`.
 * @param random Source of randomness in `[0, 1)`, called once per swap step.
 */
export function selectBatchEntries(
  candidates: readonly AllocationCandidate[],
  answeredEntryIds: ReadonlySet<string>,
  completedEntryIds: CompletedEntryIds,
  size: number,
  random: () => number,
): SelectedEntry[] {
  if (size <= 0) return [];

  const eligible: AllocationCandidate[] = [];

  for (const candidate of candidates) {
    if (answeredEntryIds.has(candidate.id)) continue;
    if (completedEntryIds.has(candidate.id)) continue;
    eligible.push(candidate);
  }

  return shuffle(eligible, random)
    .slice(0, size)
    .map((candidate) => ({ id: candidate.id }));
}
