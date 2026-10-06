/**
 * ============================================================================
 * RECOGNISING AN INTERRUPTED BATCH — as a pure rule
 * ============================================================================
 * "Which batch, if any, should this validator be offered the chance to finish?" is a research
 * question with a defensible answer, so it is written as a rule rather than as a query and then
 * embedded in a component. Nothing here touches a database, a clock, or `Math.random`: the two
 * inputs that could otherwise be ambient — WHICH batch is newest, and WHICH entries the validator
 * has already answered — are both supplied, and the supplied creation instant is the only time
 * source in the module.
 *
 * ============================================================================
 * WHY RECOGNITION IS DERIVED, AND WHY THERE IS NO LIFECYCLE COLUMN
 * ============================================================================
 * A batch is interrupted when it belongs to the validator and at least one of its entries has no
 * recorded response BY THAT VALIDATOR. Both halves are read from stored rows. No `status`, no
 * `abandoned_at`, no `resumed_at` — and the reason is not tidiness, it is that a stored flag is a
 * SECOND AUTHORITY: a batch marked `in_progress` whose entries are all answered would then be
 * reported as interrupted, and the repair for that is a scheduled reconciliation job nobody has a
 * reason to write. Derivation has no such state to fall out of step, because there is no such state.
 *
 * ============================================================================
 * WHY "ANSWERED" IS A QUESTION ABOUT THE VALIDATOR AND NOT ABOUT THE BATCH
 * ============================================================================
 * This is the rule's one subtle point and the place a plausible implementation is wrong.
 *
 * The remaining count is derived from the VALIDATOR'S answered set — every entry id they have ever
 * submitted a response for — and NOT from "the responses recorded against this batch". Those are
 * different numbers whenever the same entry was answered in a different batch, and the difference
 * is a lie in both directions:
 *
 *   - Counting only this batch's responses would report work that does not exist. The validator
 *     answered the entry during an earlier batch, `validations_validator_entry_unique` means they
 *     will never be asked it again, and the versioned allocation function excludes it.
 *     An offer saying "3 remaining" would be showing someone a third entry they cannot do, and
 *     would show a validator a batch they cannot finish.
 *
 *   - Filtering the answered set to QUALIFYING responses would be worse and subtler. A
 *     `cannot_evaluate` response is a recorded response, and the validator will never be asked that
 *     entry again — but it contributes ZERO to qualifying coverage. If "answered" meant
 *     "qualifying", a `cannot_evaluate` entry would come back as outstanding work forever: offered
 *     again by this rule, excluded by the allocation filter, unanswerable by definition. The
 *     answered set is therefore handed in ALREADY FILTERED TO THE VALIDATOR AND UNFILTERED BY
 *     EVALUATION, and this module is not given the responses to re-filter. See
 *     `ValidationsRepository.listEntryIdsForValidator`, which is the single read that answers it and
 *     which selects exactly one column.
 *
 * ============================================================================
 * WHY AN EMPTY BATCH IS NOT AN INTERRUPTED BATCH
 * ============================================================================
 * `BatchesRepository.create` issues two PostgREST requests with no transaction spanning them, so a
 * `validation_batches` row with no `batch_entries` rows is a KNOWN residue rather than a
 * hypothetical one. Such a row cannot be worked through, and `batchRecordSchema` requires at least
 * one entry, so `findById` on it raises. Reporting it as interrupted would offer a participant work
 * that does not exist; letting it through as an empty batch would turn a database fault into "you
 * have nothing to do". It is therefore skipped, which is the same answer as "there is no
 * interrupted batch" — and the rule below cannot raise on it, so its presence never fails a lookup.
 *
 * ============================================================================
 * WHY THE CHOICE DOES NOT DEPEND ON THE ORDER THE ROWS ARRIVED IN
 * ============================================================================
 * The candidate is chosen by ONE PASS that keeps the best interrupted batch seen so far, comparing
 * `createdAt` descending and then `id` descending. Two properties matter:
 *
 *   - It does not sort, and it does not read the first interrupted batch in the array. "Newest
 *     first" as an INPUT ORDER is a property of a query string, and the requirement is that the
 *     same stored data always yields the same choice — so the choice is re-derived here rather than
 *     inherited. This mirrors `SupabaseBatchesRepository.findById`, which re-sorts its entries in
 *     memory for the same reason.
 *
 *   - The `id` tiebreaker is not decorative. `id` is the primary key, so no two rows share one and
 *     the comparison is TOTAL: every pair of candidates is decidable, so the winner is never left
 *     to arrival order. And a real tie exists in the world rather than only in a fixture: the
 *     migration backfills every pre-existing row with one identical `now()`, so a validator who had
 *     allocated twice before that migration holds two batches with the same recorded instant.
 *
 * `Date.parse` rather than a string comparison, deliberately. The stored value arrives already
 * normalised by `toIsoDateTime`, and comparing normalised ISO strings lexicographically would be
 * correct — but it would be correct only because of that normalisation, which is a fact about
 * another module. Parsing is correct for any ISO 8601 form a `timestamptz` can serialise to,
 * including the `+00:00` offset form PostgREST actually sends, so the rule does not depend on a
 * caller having tidied its input.
 *
 * ============================================================================
 * WHY IT IMPORTS NOTHING
 * ============================================================================
 * Same precedent and same reason as `src/lib/domain/allocation.ts`: this rule must be usable from a
 * Server Action, a plain test, and any future consumer without dragging Zod or `server-only` into
 * its dependency graph. The shapes below are structural, so a schema output, a repository value,
 * and an object literal in a test are all accepted without any of them having to be a schema output
 * first. `StoredBatchSummary` from `@/schemas/batch` satisfies {@link RecoverableBatch}
 * structurally, with no cast and no import — which is the property that makes the separation honest
 * rather than a loosening.
 */

/**
 * The minimum this rule needs to know about one stored batch.
 *
 * `{ id, validatorId, createdAt, entryIds }` and nothing else. Two absences are load-bearing:
 *
 *   - NO POSITIONS. Recognition asks which entries remain, not in what order, and `position` is
 *     not in this shape so a caller cannot start rendering an order from a recovery read. Resuming
 *     already reads the stored order through the batch's own route.
 *   - NO LIFECYCLE FIELD. There is nothing to read even if a caller wanted to.
 */
export interface RecoverableBatch {
  /** The batch's own stored identifier. Also the tiebreaker when two batches share an instant. */
  readonly id: string;
  /** The stored owner. Compared here, so the rule cannot offer a batch that belongs to somebody else. */
  readonly validatorId: string;
  /** When the batch was created, as an ISO 8601 datetime string. */
  readonly createdAt: string;
  /**
   * The entry ids assigned to this batch, in any order.
   *
   * MAY BE EMPTY, and that is a modelled state rather than an oversight: a batch row with no
   * entries is the residue of a partial write, and this rule has to be able to see one without
   * raising. The other batch read in this directory, `findById`, deliberately cannot.
   */
  readonly entryIds: readonly string[];
}

/**
 * The interrupted batch, as it is offered.
 *
 * EXACTLY THREE FIELDS, and the closedness is the requirement rather than a description of it: the
 * spec forbids the offer from carrying proficiency, a screening answer, an enrolment state, an
 * activity timestamp, or any hint that another batch exists.
 *
 * ── WHERE THE CLOSURE ACTUALLY LIVES, CORRECTED ─────────────────────────────────────────────────────────
 * This comment used to name `InterruptedBatchOfferKeysAreBatchIdRemainingAndTotalOnly` in
 * `recovery-actions-core.ts` as the pin that makes a fourth field fail `pnpm run typecheck`. **It did
 * not, and naming it was a claim of enforcement that did not enforce.** Measured: the alias has no
 * assertion site, so the compiler never evaluates it, and adding an optional fourth field to THIS
 * interface produced the identical `tsc` failure whether the alias was present or deleted. A type alias
 * nobody names is decoration.
 *
 * The real enforcement is `tests/unit/batch-recovery.test.ts`, which closes the key set at the type
 * layer with `Record<Exclude<OfferKeys, ...>, never>` AND reads it off a real offer as a runtime closed
 * set. Two halves rather than one, because they catch different edits: the type half catches an interface
 * widened on purpose, and the runtime half catches a literal that grew a field while the interface did
 * not.
 *
 * The alias in `recovery-actions-core.ts` has therefore been **deleted** rather than given an assertion
 * site. It was a second spelling of a guarantee already enforced in a better place, and `AGENTS.md`'s rule
 * applies — an export nothing requires is dead weight — with the sign reversed for this case: dead weight
 * that is *believed* to be enforcing something is worse than dead weight, because a reader stops looking
 * for the enforcement that is actually there.
 *
 * `remaining` is a count of entries still to answer and `total` is the batch's size. Neither is a
 * count of what the participant contributed, and neither is a coverage figure: `cannot_evaluate`
 * responses count as answered here and count as zero toward coverage, so "4 of 10 answered" would be
 * a number whose meaning depends on a subtlety nobody was told, while "6 remaining" is true under
 * every reading.
 */
export interface InterruptedBatchOffer {
  readonly batchId: string;
  readonly remaining: number;
  readonly total: number;
}

/**
 * The rule's answer. A CLOSED two-way union, so a consumer switching on `kind` is forced to handle
 * both and adding a case is a compile error at each consumer.
 *
 * `none` is an explicit value, never a `null` and never an absent property. "There is no
 * interrupted batch" and "the lookup could not be completed" are DIFFERENT facts that happen to
 * render the same way, and the second one is modelled one layer up — by the action, which reports
 * `unavailable` — so that the distinction survives where it is testable instead of being collapsed
 * into a success at the boundary.
 */
export type RecoveryRecognition =
  | { readonly kind: "interrupted"; readonly offer: InterruptedBatchOffer }
  | { readonly kind: "none" };

/**
 * How many of a batch's entries the validator has not answered.
 *
 * Counts ITERATIONS rather than testing `length` against a filtered copy, because the input is
 * `readonly` and copying a batch's entry list to measure it would be an allocation whose size is the
 * thing being reported.
 */
function countRemaining(
  entryIds: readonly string[],
  answeredEntryIds: ReadonlySet<string>,
): number {
  let remaining = 0;
  for (const entryId of entryIds) {
    if (!answeredEntryIds.has(entryId)) remaining += 1;
  }
  return remaining;
}

/** The batch's creation instant in epoch milliseconds, or a raise rather than a silent `NaN`. */
function creationEpoch(batch: RecoverableBatch): number {
  const parsed = Date.parse(batch.createdAt);
  if (Number.isNaN(parsed)) {
    // Unreachable through the repository: `toIsoDateTime` normalises the column and raises there
    // for the same reason. It is here because a `NaN` in this comparison would be SILENT — every
    // `!==` against `NaN` is true, so a comparator built on it returns `NaN` and the winner would
    // be whatever the last candidate happened to be. A pure rule whose tiebreaker is silently
    // meaningless is worse than one that refuses.
    throw new Error(
      `batch ${JSON.stringify(batch.id)} has an unreadable createdAt ` +
        `(${JSON.stringify(batch.createdAt)}), so "the most recently created" cannot be decided`,
    );
  }
  return parsed;
}

/**
 * Whether `candidate` should replace `incumbent` as the most recently created interrupted batch.
 *
 * `createdAt` descending, then `id` descending, both compared as CODE POINTS rather than with a
 * locale-aware comparison. A locale-aware comparison is not available here (this module imports
 * nothing) and would be the wrong tool regardless: the tiebreak must be the same on every machine
 * and under every locale, and a collation that orders identifiers differently on two participants'
 * devices would make the offered batch depend on where the server happens to be running.
 *
 * The two keys make this a TOTAL order, because `id` is unique — the primary key of the row it was
 * read from. That is what makes the winner independent of the order the rows arrived in, and it is
 * the reason the migration's index carries an `id DESC` key as well as a `created_at DESC` one.
 */
function isNewer(
  candidate: RecoverableBatch,
  candidateEpoch: number,
  incumbent: RecoverableBatch,
  incumbentEpoch: number,
): boolean {
  if (candidateEpoch !== incumbentEpoch) return candidateEpoch > incumbentEpoch;
  return candidate.id > incumbent.id;
}

/**
 * Decides whether a validator is offered an interrupted batch, and which one.
 *
 * The rule, in the order it is applied to each candidate batch:
 *
 *   1. The stored batch's own validator must be the requesting validator. A batch belonging to
 *      somebody else is skipped, which makes the spec's "a batch belonging to somebody else is not
 *      reportable" a property of the RULE rather than only of the query that fetched it. The
 *      repository already filters on this, so the check here is a narrowing of an
 *      already-narrowed set rather than a second authority for it: if the fetch were ever wrong,
 *      the offer would still be about the caller's own batch.
 *   2. A batch with NO entries is skipped, and cannot raise — see the header on the partial-write
 *      residue.
 *
 *      THIS STEP IS REDUNDANT, and that is measured rather than assumed. An entry-less batch has a
 *      remaining count of zero, so rule 3 skips it anyway: deleting the line
 *      `if (batch.entryIds.length === 0) continue;` leaves all **14** tests green
 *      (`Tests  14 passed (14)` against the same `14 passed (14)` control, probe run with a negative
 *      control and the file restored byte-identical). It is KEPT anyway, for one reason: rule 3
 *      catching an empty batch is a **coincidence of arithmetic**, not a decision, and a reader who
 *      deleted rule 2 would be relying on that coincidence without knowing it. The guarantee comes
 *      from rule 3; the line is here so the case is handled rather than implied. Anyone who wants one
 *      skip instead of two should delete rule 3's wording from the header too, not quietly rely on it.
 *   3. The batch's remaining count is derived from the VALIDATOR's answered set. Zero remaining
 *      means the batch is finished, and a finished batch is not interrupted however it was left, so
 *      it is skipped. The two conditions are complements derived from the same rows, which is why
 *      there is no third possibility to represent.
 *   4. The most recent survivor wins, by `createdAt` descending and then `id` descending.
 *
 * Every batch is examined, so a validator with many interrupted batches gets the newest one rather
 * than whichever one the fetch happened to list first. Batches that are finished, entry-less, or
 * somebody else's are skipped WITHOUT affecting that choice, so adding one of them can never change
 * which batch is offered unless it is itself newer AND interrupted.
 *
 * @param validatorId The anonymous identifier making the request. Nothing is returned about any
 *   other validator.
 * @param batches The stored batches, in ANY order. See the header on why the order is not trusted.
 * @param answeredEntryIds EVERY entry id this validator has a recorded response for, across all of
 *   their batches and unfiltered by evaluation. See the header for why that last part is the
 *   caller's responsibility and not this rule's.
 */
export function recognizeInterruptedBatch(
  validatorId: string,
  batches: readonly RecoverableBatch[],
  answeredEntryIds: ReadonlySet<string>,
): RecoveryRecognition {
  let winner: RecoverableBatch | null = null;
  let winnerEpoch = Number.NEGATIVE_INFINITY;
  let winnerRemaining = 0;

  for (const batch of batches) {
    if (batch.validatorId !== validatorId) continue;
    if (batch.entryIds.length === 0) continue;

    const remaining = countRemaining(batch.entryIds, answeredEntryIds);
    if (remaining === 0) continue;

    const epoch = creationEpoch(batch);
    if (winner === null || isNewer(batch, epoch, winner, winnerEpoch)) {
      winner = batch;
      winnerEpoch = epoch;
      winnerRemaining = remaining;
    }
  }

  if (winner === null) return { kind: "none" };

  return {
    kind: "interrupted",
    offer: {
      batchId: winner.id,
      remaining: winnerRemaining,
      total: winner.entryIds.length,
    },
  };
}
