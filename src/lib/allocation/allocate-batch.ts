import "server-only";

import {
  selectBatchEntries,
  type AllocationCandidate,
  type CoverageByEntryId,
} from "@/lib/domain/allocation";
import {
  countQualifyingValidations,
  type CoverageResponseShape,
} from "@/lib/domain/validation-response";
import {
  isRepositoryError,
  type BatchesRepository,
  type DatasetEntriesRepository,
  type ValidationsRepository,
  type ValidatorsRepository,
} from "@/lib/repositories";
import {
  resolveBatchSize,
  type AllocationConfig,
  type AllocationFailureReason,
  type AllocationOutcome,
  type AllocatedEntry,
} from "@/schemas/batch";
import type { DatasetEntry } from "@/schemas/dataset";
import type { AnonymousValidatorId } from "@/schemas/validator";

/**
 * Coverage-aware batch allocation.
 *
 * ============================================================================
 * WHAT THE CLIENT SENDS AND WHAT IT GETS BACK
 * ============================================================================
 * The request carries an identifier and, at most, a *preference* for how many entries it would
 * like. Everything that decides the batch — which entries are eligible, what order they come back
 * in, which of them are near the coverage target, how many are served — is derived here. There is
 * no parameter through which a caller could supply an entry list, an order, a per-entry coverage
 * figure, or a coverage target, and that is the guarantee rather than a convenience: a parameter a
 * caller "cannot really" forge would be a convention, whereas an absent parameter is structural.
 *
 * `requestedSize` is capped by `resolveBatchSize` against the server's configuration, so a client
 * can ask for FEWER entries and never for more.
 *
 * ============================================================================
 * WHY COVERAGE IS COMPUTED HERE AND NOWHERE ELSE
 * ============================================================================
 * The pool's stored responses are read ONCE and reduced with `countQualifyingValidations`, the one
 * in-force definition of a qualifying validation. Three things were available instead and all three
 * are wrong:
 *
 *   - `countForEntry` per entry. A raw row count. Three `cannot_evaluate` responses would read as
 *     full coverage and retire an entry that nobody has judged, which is the scenario the spec
 *     names first. There is a test here that fails if this is ever substituted back in.
 *   - a `where` clause on the repository read. That would be the same rule expressed in SQL, a
 *     second implementation in a second language, and a drifted copy fails by producing a plausible
 *     wrong number rather than an error.
 *   - counting rows and de-duplicating here. Self-evidently correct and also wrong at scale, because
 *     a capped response would silently under-count.
 *
 * ============================================================================
 * WHY THE COVERAGE MAP IS BUILT FOR EVERY POOL ENTRY, INCLUDING UNANSWERED ONES
 * ============================================================================
 * `selectBatchEntries` treats a missing coverage key as 0, and this service always supplies one. It
 * has to: a `Map` built only from the returned responses would leave an entry with no responses at
 * all absent, and the rule would then read it as eligible for a reason that is correct but
 * accidental. Building the map over the whole pool makes "uncovered means eligible" an explicit
 * statement here rather than a fallback the rule happens to have.
 *
 * ============================================================================
 * WHY THE BATCH IS READ BACK RATHER THAN THE REQUEST ECHOED
 * ============================================================================
 * `create` returns the stored record, and this service returns THAT. Echoing the request would let a
 * repository that stored a different order be reported as the batch the validator worked through,
 * which is a research record changing to suit a write. `enrollValidator` makes the same choice about
 * the identifier it minted.
 *
 * ============================================================================
 * WHY `unknown_validator` IS NOT `persistence`
 * ============================================================================
 * A returning browser with a stale local-storage identifier is the single most likely thing to go
 * wrong, and the correct response is to offer a fresh identity. Reporting it as a database fault
 * would tell a participant the study is broken when nothing is.
 */

/**
 * One stored response, as far as coverage is concerned: the fields
 * {@link countQualifyingValidations} reads, plus the entry it belongs to.
 *
 * Declared here as an intersection rather than reusing `ValidationResponse` because the grouping key
 * is what this module adds and nothing else in the coverage path carries it. `datasetEntryId` is the
 * ONLY addition, and the repository's return type satisfies it structurally — a `ValidationResponse`
 * from `ValidationsRepository.listForEntries` is assignable to `PoolResponse` with no cast, which is
 * what makes the structural declaration honest rather than a loosening. Naming the field the domain
 * module deliberately leaves out is the point: `CoverageResponseShape` is deliberately validator-
 * agnostic, and the entry it belongs to is this module's concern.
 */
type PoolResponse = CoverageResponseShape & { readonly datasetEntryId: string };

/** What a caller asks for. An identifier and a preference; nothing authoritative. */
export interface AllocationRequest {
  readonly validatorId: AnonymousValidatorId;
  /**
   * A PREFERENCE, capped by `resolveBatchSize`. `undefined` means "whatever the configuration
   * says". There is deliberately no way to ask for more than the configured batch size.
   */
  readonly requestedSize?: number;
}

export interface AllocationDependencies {
  readonly validators: ValidatorsRepository;
  readonly datasetEntries: DatasetEntriesRepository;
  readonly validations: ValidationsRepository;
  readonly batches: BatchesRepository;
  /**
   * The research parameters, injected rather than imported as constants.
   *
   * Both are pending thesis-team and adviser approval, so hard-coding either would freeze a
   * provisional number into code. It also makes the spec scenario "the coverage target is
   * configuration rather than a fixed constant" a property of the signature: there is no parameter
   * a future caller could pass a different target *around*.
   */
  readonly config: AllocationConfig;
  /**
   * The source of randomness, injected for the same reason `selectBatchEntries` takes one: the
   * selection rule must stay reproducible for the spec scenario "the same inputs and the same
   * supplied randomness produce the same order". `Math.random` is the production value; a scripted
   * source is the test value. Nothing in this module draws from an ambient source.
   */
  readonly random: () => number;
  /**
   * A batch's identity at the moment it is created: its identifier AND its creation instant.
   *
   * BOTH COME FROM ONE `Date`, and that is the whole reason they are returned together rather than
   * asked for separately. Migration `20261001120000` refuses to order batches by the ISO instant
   * embedded in the identifier, on the grounds that the string exists for a different reason and a
   * future id scheme would break the ordering silently. Having refused to READ that string, the
   * application would then be writing two instants for one event — the one inside the id and the one
   * in `created_at` — that could differ by however long the request took. A batch whose id says it
   * was created at `T1` while the column says `T2` is a batch nobody can reason about, so the two
   * are minted from the same `Date` and the dependency's return type says so.
   */
  readonly newBatch: (validatorId: AnonymousValidatorId) => MintedBatchIdentity;
}

/** A freshly minted batch's identifier and creation instant. See {@link AllocationDependencies}. */
export interface MintedBatchIdentity {
  readonly id: string;
  /** ISO 8601, as `Date.prototype.toISOString()` produces it. */
  readonly createdAt: string;
}

/**
 * Mints a batch identifier from the validator's identifier and the current time.
 *
 * Deliberately not a UUID and not a bare counter: batch ids are read in logs and matched by hand
 * during review, so `VAL_a81d92c1-2026-09-30T20:14:03.117Z` is more useful than a random string.
 * The validator's own id is included so that a log line naming a batch also names whose batch it is
 * — and it is the validator's OWN identifier, never another one, because a batch id is readable to
 * the validator who owns it.
 *
 * The embedded instant is NOT an ordering source, and migration `20261001120000` says why at length:
 * it exists because a log line should be readable, so a future id scheme could drop it and would
 * break any ordering built on it silently while the query kept working. The authoritative creation
 * instant is the `created_at` column, and {@link defaultBatch} writes both from ONE `Date` so they
 * cannot disagree.
 */
export function defaultBatchId(validatorId: AnonymousValidatorId, now: Date): string {
  return `${validatorId}-${now.toISOString()}`;
}

/**
 * The production `newBatch`: a batch identifier and its creation instant, from one `Date`.
 *
 * Exported rather than inlined in `actions.ts` so that the pairing — one instant, two facts — is a
 * named thing a test can check rather than a detail of a dependency object.
 */
export function defaultBatch(validatorId: AnonymousValidatorId, now: Date): MintedBatchIdentity {
  return { id: defaultBatchId(validatorId, now), createdAt: now.toISOString() };
}

/**
 * Builds the per-entry qualifying coverage for a whole pool.
 *
 * A `Map` rather than `Record<string, number>` because `Record` makes every string a legal key and
 * every read a `number | undefined` by type accident — the same argument `CoverageByEntryId` makes.
 *
 * Every pool entry gets a key, including those with no stored responses, so that eligibility does
 * not depend on the fallback in `selectBatchEntries` (see the header).
 */
function coverageByEntry(
  candidates: readonly AllocationCandidate[],
  responses: readonly PoolResponse[],
): CoverageByEntryId {
  const responsesByEntry = new Map<string, PoolResponse[]>();

  for (const response of responses) {
    const existing = responsesByEntry.get(response.datasetEntryId);
    if (existing === undefined) responsesByEntry.set(response.datasetEntryId, [response]);
    else existing.push(response);
  }

  // Built as a mutable `Map` and returned through the read-only alias. `CoverageByEntryId` is a
  // `ReadonlyMap` because that is what the selection rule needs; a builder that could not insert
  // would have to go through a cast, and a cast here is exactly the kind of unchecked widening
  // `AGENTS.md` warns about at a domain boundary.
  const coverage = new Map<string, number>();
  for (const candidate of candidates) {
    const stored = responsesByEntry.get(candidate.id) ?? [];
    coverage.set(candidate.id, countQualifyingValidations(stored));
  }

  return coverage;
}

/**
 * Allocates a coverage-aware batch for one validator.
 *
 * The order of operations is the specification, and each step exists because the one after it would
 * otherwise have to guess:
 *
 *   1. Confirm the validator exists. Without this, an identifier naming nobody would be persisted as
 *      a batch, and the foreign key would refuse it — or, worse, would not if the schema ever
 *      changed — producing a batch belonging to a person who does not exist.
 *   2. Resolve the effective size against the server's configuration.
 *   3. Read the active pool. Not paged: the whole pool is the candidate set by definition, and a
 *      truncated pool would silently exclude the entries that sort last.
 *   4. Read the pool's stored responses ONCE and reduce them to per-entry qualifying coverage.
 *   5. Exclude the entries this validator already answered.
 *   6. Select, with the coverage map and the configured target.
 *   7. Persist with 1-based positions derived from the selected order.
 *   8. Read back, and project to `AllocatedEntry`.
 *
 * Steps 1–6 perform no write. An `unknown_validator` outcome is therefore observable as "no batch
 * was created", which a test asserts directly rather than inferring from the absence of a batch id.
 */
export async function allocateBatch(
  request: AllocationRequest,
  dependencies: AllocationDependencies,
): Promise<AllocationOutcome> {
  try {
    const profile = await dependencies.validators.findById(request.validatorId);
    if (profile === null) {
      return { status: "failed", reason: "unknown_validator" satisfies AllocationFailureReason };
    }

    const size = resolveBatchSize(request.requestedSize, dependencies.config);

    // No category filter: the pool is every active entry, because category-conditional allocation
    // would let a category with no under-covered entries starve while another category had them, and
    // that is a coverage-reporting question rather than an allocation one.
    const pool = await dependencies.datasetEntries.listActive();
    if (pool.length === 0) return { status: "exhausted" };

    const answeredEntryIds = await dependencies.validations.listEntryIdsForValidator(
      request.validatorId,
    );
    // A `Set` because the selection rule probes membership once per pool entry, and `Array.includes`
    // would make that quadratic in exactly the read this module already pays for.
    const answered = new Set<string>(answeredEntryIds);

    // One read for the WHOLE pool. Per-entry reads would be up to 600 round trips for one batch
    // request, and each would be a separate chance to observe a different snapshot of coverage.
    const responses = await dependencies.validations.listForEntries(pool.map((entry) => entry.id));

    const selected = selectBatchEntries(
      pool,
      answered,
      coverageByEntry(pool, responses),
      dependencies.config.independentValidationTarget,
      size,
      dependencies.random,
    );

    if (selected.length === 0) return { status: "exhausted" };

    const minted = dependencies.newBatch(request.validatorId);

    // READ BACK, not the argument. See the header.
    const stored = await dependencies.batches.create(
      {
        id: minted.id,
        validatorId: request.validatorId,
        entries: selected.map((entry, index) => ({
          datasetEntryId: entry.id,
          // 1-based, derived HERE from the selected order. There is no code path by which a caller
          // supplies this, which is what the "a client cannot dictate the batch order" scenario
          // reduces to once the parameter does not exist.
          position: index + 1,
        })),
      },
      minted.createdAt,
    );

    return {
      status: "allocated",
      batchId: stored.id,
      entries: projectEntries(
        pool,
        stored.entries.map((entry) => entry.datasetEntryId),
      ),
    };
  } catch (error) {
    // A `RepositoryError` is an expected outcome of an ordinary network call and the caller has to
    // be able to distinguish it from a programming error, which should stay loud. Anything else
    // propagates: swallowing an unknown throwable is how a real bug becomes a "persistence
    // failure" that nobody investigates.
    if (!isRepositoryError(error)) throw error;
    return { status: "failed", reason: "persistence" };
  }
}

/**
 * Resolves the persisted placements against the pool, in the ORDER STORED, and projects each to the
 * six fields a validator may see.
 *
 * The order comes from the read-back rather than from `selected`, which is the whole reason the
 * batch is read back. The lookup is against the pool the service already holds rather than a fresh
 * `listByIds`, so no additional query is issued for data this call already has — and because a pool
 * that shrank between two reads cannot drop an entry out of a batch that was already persisted, the
 * projection walks the stored placements and resolves each id, failing loudly on one that is
 * missing rather than silently returning a shorter batch.
 */
function projectEntries(
  pool: readonly DatasetEntry[],
  persistedEntryIds: readonly string[],
): AllocatedEntry[] {
  const byId = new Map<string, AllocatedEntry>();

  for (const entry of pool) {
    byId.set(entry.id, {
      id: entry.id,
      category: entry.category,
      instruction: entry.instruction,
      origin: entry.origin,
      destination: entry.destination,
      transitMode: entry.transitMode,
    });
  }

  return persistedEntryIds.map((id) => {
    const entry = byId.get(id);
    if (entry === undefined) {
      // Unreachable while the pool is the one the selection ran against. It is here because the
      // alternative — filtering the id out — would return a batch the validator never received, and
      // the research would record fewer entries than were actually allocated to them.
      throw new Error(
        `allocated batch ${JSON.stringify(id)} is not in the pool it was selected from; the pool ` +
          "changed between the selection and the projection",
      );
    }
    return entry;
  });
}
