import type { DatasetEntryId } from "@/schemas/dataset";
import type { AnonymousValidatorId } from "@/schemas/validator";
import type { ValidationResponse } from "@/schemas/validation";

/**
 * Access to persisted validation responses.
 *
 * `ValidationResponse` carries the correction and the translation as fields on the *response*,
 * never as a mutation of the dataset entry — that separation is the immutability guarantee for
 * `data/merged-ilocano-synthetic-data.json` and it is visible in this signature.
 *
 * The uniqueness of `(validatorId, datasetEntryId)` is a data-layer constraint, not something this
 * interface enforces. A second insert for the same pair is expected to raise `RepositoryError`
 * naming `validations.insert`; an implementation must not swallow it as a no-op, because "already
 * validated" is a meaningful outcome the service must be able to report.
 *
 * Raises `RepositoryError` on failure — see `@/lib/repositories/errors`.
 */
export interface ValidationsRepository {
  /**
   * Persists one completed entry's response.
   *
   * Note the shape: this is called once per completed entry, not once per batch, because the
   * approved saving strategy persists each entry as it is finished rather than at batch end.
   */
  insert(response: ValidationResponse): Promise<ValidationResponse>;

  /** The stored response with this ID, or `null` when absent. `null` means absent, not failed. */
  findById(id: string): Promise<ValidationResponse | null>;

  /** Every response for one entry, across all validators. Powers entry review and disagreement inspection. */
  findByEntry(entryId: DatasetEntryId): Promise<ValidationResponse[]>;

  /**
   * Every stored response for a set of entries, across all validators, UNFILTERED.
   *
   * ==========================================================================================
   * WHY THIS DOES NOT FILTER, and why that is the most important thing about the method
   * ==========================================================================================
   * It would be easy — and wrong — for this method to return only the responses that count toward
   * coverage, by applying the qualifying rule as a `where` clause or a row filter. That would make
   * the repository a SECOND implementation of the rule defined in
   * `@/lib/domain/validation-response`, in a second language, with nothing keeping the two in
   * agreement. The rule is a research question and it has exactly one owner; a repository that
   * pre-filtered would be that rule expressed somewhere nobody reviews it, and a drifted copy
   * fails by producing a plausible wrong coverage number rather than an error.
   *
   * So this returns what is STORED and the domain predicate decides what counts. The cost is
   * honest and named in `design.md` D1: response rows travel to the server to be counted there.
   * At the current scale (3,000 entries × 3 validators, and fewer in practice because only
   * under-covered entries are queried) that is small. The revisit, if a future dataset reaches six
   * figures, is a projection of only the columns the predicate reads — not a second copy of the
   * predicate.
   *
   * An empty `entryIds` list returns `[]` without a query, because `.in("dataset_entry_id", [])` is
   * a malformed filter rather than an empty one.
   */
  listForEntries(entryIds: readonly DatasetEntryId[]): Promise<ValidationResponse[]>;

  /**
   * The entry ids ONE validator has already answered, so allocation can exclude them.
   *
   * Ids only, and that is the whole design: the exclusion rule reads nothing else about the
   * response, and returning full responses would invite a caller to start reading something —
   * coverage, an evaluation, a translation — that this method exists to keep out of allocation's
   * way.
   */
  listEntryIdsForValidator(validatorId: AnonymousValidatorId): Promise<DatasetEntryId[]>;

  /**
   * How many independent validators have responded for an entry. This is a count of DISTINCT
   * validators, not of rows: the coverage rule is defined in terms of independent validators, so
   * counting rows would let a duplicate submission inflate coverage.
   *
   * DIAGNOSTIC ONLY, AND NOT THE COVERAGE NUMBER. This counts validators who responded at all,
   * which includes validators whose response was `cannot_evaluate` and therefore contributes
   * nothing to qualifying coverage. It is the honest answer to "how many people have looked at
   * this", which is what a reviewer inspecting disagreement needs, and it is NOT the number that
   * retires an entry from the allocation pool.
   *
   * It is left in place, and deliberately not removed, because the admin dashboard needs it. The
   * risk is a future author reaching for the convenient method — it is one call and it returns a
   * number, whereas the qualifying path is a read plus a reduce. The mitigation is naming, this
   * comment, and the spec scenario ("an entry whose responses are all non-qualifying stays in the
   * pool") that fails loudly against a raw count. Removing a method the admin needs to make the
   * convenient method slightly less convenient would trade a documented risk for an undocumented
   * gap.
   */
  countForEntry(entryId: DatasetEntryId): Promise<number>;

  /** How many entries a validator has completed. Used for the profile's total and for progress. */
  countForValidator(validatorId: AnonymousValidatorId): Promise<number>;
}
