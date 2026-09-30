/**
 * Repository error contract.
 *
 * A repository MUST raise `RepositoryError` when a persistence call fails. It MUST NOT return an
 * empty array, `null`, or `undefined` to mean "the query failed".
 *
 * The reason is research correctness, not style. A domain service cannot tell "this validator has
 * no validations" from "the validations table was unreachable" if both look like an empty result.
 * Under coverage-aware allocation those two cases lead to opposite decisions — one allocates more
 * entries, the other should fail loudly — so collapsing them would quietly corrupt coverage counts
 * and could hand a validator entries that already reached the independent-validation target. An
 * explicit typed error forces the service to decide, at the point where the decision is visible.
 */

/**
 * Every repository operation is named here, as `"<resource>.<verb>"` (for example
 * `"dataset_entries.list"`). The name is a stable, greppable contract: a caller can branch on which
 * operation failed, and a log or a test can assert the failure was attributed to the right call
 * rather than to a repository in general.
 */
export type RepositoryOperation =
  | "dataset_entries.list"
  | "dataset_entries.findById"
  | "dataset_entries.listByIds"
  | "validators.insert"
  | "validators.findById"
  | "validators.touchLastActive"
  | "validations.insert"
  | "validations.findByEntry"
  | "validations.findById"
  | "validations.listForEntries"
  | "validations.listEntryIdsForValidator"
  | "validations.countForEntry"
  | "validations.countForValidator"
  | "validation_batches.insert"
  | "validation_batches.findById";

export interface RepositoryErrorOptions {
  /** The original failure, preserved for diagnostics. Never re-wrapped into a bare message. */
  cause?: unknown;
  /**
   * Persistence-specific detail (an error code, a table name, a constraint name). Recorded for
   * diagnosis only; it MUST NOT be surfaced verbatim to a user-facing message, because it can
   * describe internal schema.
   */
  detail?: string;
}

export class RepositoryError extends Error {
  readonly operation: RepositoryOperation;
  readonly detail: string | undefined;

  constructor(
    operation: RepositoryOperation,
    message: string,
    options: RepositoryErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "RepositoryError";
    this.operation = operation;
    this.detail = options.detail;
  }
}

export function isRepositoryError(value: unknown): value is RepositoryError {
  return value instanceof RepositoryError;
}
