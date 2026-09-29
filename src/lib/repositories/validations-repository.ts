import type { DatasetEntryId } from "@/schemas/dataset";
import type { AnonymousValidatorId } from "@/schemas/validator";
import type { ValidationResponse } from "@/schemas/validation";

/**
 * Access to persisted validation responses.
 *
 * `ValidationResponse` carries the correction and the translation as fields on the *response*,
 * never as a mutation of the dataset entry — that separation is the immutability guarantee for
 * `data/ilocano-synthetic-data.json` and it is visible in this signature.
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
   * How many independent validators have responded for an entry. This is a count of DISTINCT
   * validators, not of rows: the coverage rule is defined in terms of independent validators, so
   * counting rows would let a duplicate submission inflate coverage.
   */
  countForEntry(entryId: DatasetEntryId): Promise<number>;

  /** How many entries a validator has completed. Used for the profile's total and for progress. */
  countForValidator(validatorId: AnonymousValidatorId): Promise<number>;
}
