/**
 * What the researcher dashboard shows, assembled from repository reads.
 *
 * DEPENDENCY-INJECTED AND MARKER-FREE, on purpose. This module takes its three repositories as
 * arguments, holds no credential, opens no connection, and reads no environment variable — so it
 * carries no `import "server-only"` and its figures are unit-testable over fakes with no
 * network. The Server Components that call it construct the real repositories from the privileged
 * client after the `(protected)` layout has authorized the request; a client component importing
 * this module would still have no credential to call it with, and the read-only scan in
 * `tests/unit/dashboard-read-only.test.ts` asserts no dashboard module reaches a write path.
 *
 * EVERY figure here is computed from stored rows with the domain functions, never from a second
 * implementation:
 *
 *   - qualifying counts via `countQualifyingValidations` / `isQualifyingValidation` — the same
 *     functions allocation uses, so the dashboard cannot disagree with the pool;
 *   - review flags via `requiresResearcherReview`;
 *   - per-response reasons via `nonQualifyingReason`.
 *
 * Two display decisions that are methodology-adjacent and therefore stated, not hidden:
 *
 *   - "Total validators" counts validators WITH at least one stored response. A registered
 *     profile that never validated contributes to no other figure; including it in this one
 *     would make the headcount disagree with every breakdown on the same screen. The dashboard
 *     labels it "validators who submitted responses" so the definition is on the screen.
 *   - Completion percentage is complete entries ÷ total active entries, to one decimal. The
 *     denominator is total entries, not entries with any response: dividing by attempted entries
 *     would report 100% while untouched entries exist, which is the silent-wrong-answer direction.
 *     Zero entries means 0%, not NaN — there is nothing to divide, and NaN on a research
 *     dashboard reads as a broken query. "Complete" is the shared `isEntryComplete` predicate:
 *     one validating package, not a count against a target.
 */

import type { DatasetEntry } from "@/schemas/dataset";
import type { ValidationResponse } from "@/schemas/validation";
import type { AnonymousValidatorId, IlocanoProficiency } from "@/schemas/validator";

import {
  countQualifyingValidations,
  isEntryComplete,
  isQualifyingValidation,
  type ValidationEvaluation,
} from "@/lib/domain/validation-response";
import { nonQualifyingReason, type DisqualifyReason } from "@/lib/domain/review-reasons";
import { requiresResearcherReview } from "@/lib/domain/review-flags";
import type { DatasetEntriesRepository } from "@/lib/repositories/dataset-entries-repository";
import type { ValidationsRepository } from "@/lib/repositories/validations-repository";
import type { ValidatorsRepository } from "@/lib/repositories/validators-repository";

/**
 * The repositories the dashboard reads, narrowed to the methods it uses.
 *
 * `Pick`, not the whole interfaces, for two reasons. First, documentation: the type states the
 * dashboard's entire persistence surface, and a reader does not have to audit the implementation
 * to learn it reads and nothing else. Second, enforcement: a write method is not in the type, so
 * a service edit that reached for one would fail typecheck rather than waiting for a test — which
 * is the same guarantee the read-only source scan asserts, one layer down.
 */
export interface DashboardRepositories {
  readonly entries: Pick<DatasetEntriesRepository, "listActive" | "findById">;
  readonly validations: Pick<ValidationsRepository, "listForEntries">;
  readonly validators: Pick<ValidatorsRepository, "listByIds">;
}

/**
 * The complete/incomplete partition of the dataset.
 *
 * Two buckets and no ladder: an entry is complete when one stored response establishes the
 * complete bilingual package (`isEntryComplete`), and incomplete otherwise, however many
 * responses it holds. An entry with one qualifying validation and an entry with forty are both
 * complete, and the platform does not rank them. The fuller approved figure list — totals,
 * percentage, and diagnostics — belongs to the `completion-metrics-and-export` change; this
 * partition is the interim shape that the corrected methodology makes true.
 */
export interface CompletionBuckets {
  /** Entries with no stored response establishing the complete package. */
  readonly incomplete: number;
  /** Entries with at least one stored response establishing the complete package. */
  readonly complete: number;
}

/** Proficiency of responding validators, plus the ones who never recorded one. */
export type ProficiencyBreakdown = Record<IlocanoProficiency | "unrecorded", number>;

/** Every approved overview figure, computed — never placeholder. */
export interface DashboardOverview {
  /**
   * ACTIVE dataset entries — the approved figure is "total dataset entries", and this counts the
   * active subset. The two are equal today because no code path retires an entry (the only writers
   * of `is_active` are the column default and the import function's `coalesce(…, true)`), but they
   * would diverge the moment retirement is introduced, and the coverage denominator would then
   * exclude retired entries from the total while their responses still counted. Recorded here
   * rather than left for a reader to discover.
   */
  readonly totalEntries: number;
  readonly totalQualifyingValidations: number;
  readonly totalValidators: number;
  readonly buckets: CompletionBuckets;
  readonly coveragePercentage: number;
  readonly evaluationDistribution: Record<ValidationEvaluation, number>;
  readonly proficiencyBreakdown: ProficiencyBreakdown;
  /** Entry ids flagged for review, in dataset order. */
  readonly reviewEntryIds: readonly string[];
}

/**
 * Zeroed figures with every key present, written as literals against the `Record` type — not built
 * by a loop — so a new evaluation or proficiency level fails TYPECHECK here, at the single place
 * that enumerates the vocabulary, instead of silently leaving a bucket out of the dashboard. A
 * `Object.fromEntries` construction would need a cast that defeats exactly that enforcement, so
 * the repetition is the mechanism, not laziness.
 */
function emptyDistribution(): Record<ValidationEvaluation, number> {
  return { correct_natural: 0, correct_unnatural: 0, incorrect: 0, cannot_evaluate: 0 };
}

function emptyBreakdown(): ProficiencyBreakdown {
  return {
    native: 0,
    fluent: 0,
    conversational: 0,
    basic: 0,
    not_confident: 0,
    unrecorded: 0,
  };
}

/** One decimal place. The dashboard shows a figure, not a float artifact like 33.333333333336. */
function toOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function loadDashboardOverview(
  repositories: DashboardRepositories,
): Promise<DashboardOverview> {
  const entries = await repositories.entries.listActive();
  const validations = await repositories.validations.listForEntries(
    entries.map((entry) => entry.id),
  );

  const byEntry = new Map<string, ValidationResponse[]>();
  for (const entry of entries) byEntry.set(entry.id, []);
  for (const response of validations) {
    const list = byEntry.get(response.datasetEntryId);
    // A response for an entry OUTSIDE the active set. Reachable in principle — `listForEntries` is
    // asked only for active ids, so the database should never return one — and the handling is the
    // conservative one: excluded from entry-scoped figures below (it has no entry to be counted
    // against) and still INCLUDED in the response-scoped ones further down, because a validator
    // did submit it.
    //
    // It is currently UNREACHABLE in production, and that is a measurement, not a guess: the only
    // writers of `is_active` are the column default and the import function's
    // `coalesce(p_is_active, true)`, so no code path retires an entry today. The branch is kept
    // because `listActive()` is a FILTER, not a promise about what the validations table holds, and
    // the alternative — indexing straight in — would throw on exactly the row this guard absorbs.
    if (list !== undefined) list.push(response);
  }

  const buckets: { -readonly [K in keyof CompletionBuckets]: number } = {
    incomplete: 0,
    complete: 0,
  };
  const reviewEntryIds: string[] = [];
  for (const entry of entries) {
    const responses = byEntry.get(entry.id) ?? [];
    // The shared predicate, not a count against a target: allocation retires the entry on the
    // same condition, because reporting it complete one validation later would disagree on the
    // wire.
    if (isEntryComplete(responses)) {
      buckets.complete += 1;
    } else {
      buckets.incomplete += 1;
    }
    if (requiresResearcherReview(responses)) reviewEntryIds.push(entry.id);
  }

  // Response-scoped figures: every stored row counts, including ones for retired entries. These
  // answer "what did validators do", while the buckets answer "where does each entry stand" —
  // different questions, different denominators, both stated.
  const evaluationDistribution = emptyDistribution();
  let totalQualifyingValidations = 0;
  const respondingValidatorIds = new Set<string>();
  for (const response of validations) {
    evaluationDistribution[response.evaluation] += 1;
    if (isQualifyingValidation(response)) totalQualifyingValidations += 1;
    respondingValidatorIds.add(response.validatorId);
  }

  const profiles = await repositories.validators.listByIds([...respondingValidatorIds]);
  const proficiencyBreakdown = emptyBreakdown();
  for (const profile of profiles) {
    if (profile.ilocanoProficiency === null) proficiencyBreakdown.unrecorded += 1;
    else proficiencyBreakdown[profile.ilocanoProficiency] += 1;
  }

  return {
    totalEntries: entries.length,
    totalQualifyingValidations,
    totalValidators: respondingValidatorIds.size,
    buckets,
    coveragePercentage:
      entries.length === 0 ? 0 : toOneDecimal((buckets.complete / entries.length) * 100),
    evaluationDistribution,
    proficiencyBreakdown,
    reviewEntryIds,
  };
}

/** One stored response as the review page shows it: content, author metadata, and verdict. */
export interface ReviewedResponse {
  readonly response: ValidationResponse;
  /** The validator's self-reported proficiency as stored — metadata, never a score. */
  readonly proficiency: IlocanoProficiency | null;
  readonly qualifies: boolean;
  readonly disqualifyReason: DisqualifyReason | null;
}

/** Everything the per-entry review page renders. `null` at the service means absent. */
export interface EntryReview {
  readonly entry: DatasetEntry;
  readonly qualifyingCount: number;
  /** Whether the entry is complete under the shared predicate — the flag, not a count. */
  readonly isComplete: boolean;
  readonly needsReview: boolean;
  /** In creation order (oldest first): the order the conversation happened in. */
  readonly responses: readonly ReviewedResponse[];
}

export async function loadEntryReview(
  repositories: DashboardRepositories,
  entryId: string,
): Promise<EntryReview | null> {
  const entry = await repositories.entries.findById(entryId);
  if (entry === null) return null;

  const responses = await repositories.validations.listForEntries([entry.id]);
  const profiles = await repositories.validators.listByIds([
    ...new Set(responses.map((response) => response.validatorId)),
  ]);
  const proficiencyByValidator = new Map<AnonymousValidatorId, IlocanoProficiency | null>(
    profiles.map((profile) => [profile.id, profile.ilocanoProficiency]),
  );

  const reviewed: ReviewedResponse[] = responses
    .map((response) => ({
      response,
      proficiency: proficiencyByValidator.get(response.validatorId) ?? null,
      qualifies: isQualifyingValidation(response),
      disqualifyReason: nonQualifyingReason(response),
    }))
    .sort((a, b) => a.response.createdAt.localeCompare(b.response.createdAt));

  return {
    entry,
    qualifyingCount: countQualifyingValidations(responses),
    isComplete: isEntryComplete(responses),
    needsReview: requiresResearcherReview(responses),
    responses: reviewed,
  };
}
