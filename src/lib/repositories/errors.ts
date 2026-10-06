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
/**
 * PostgreSQL SQLSTATE for a unique-constraint violation, as PostgREST reports it in an error's
 * `code`.
 *
 * It lives in this module rather than in the Supabase implementation for one reason: a domain
 * service that must BRANCH on "this validator already answered this entry" needs the code, and a
 * service worth unit-testing cannot import a `server-only` module. `@/lib/repositories/supabase/rows`
 * re-exports it so the implementations keep importing it from where it has always lived, and there
 * is exactly one definition of the string.
 */
export const POSTGREST_UNIQUE_VIOLATION_CODE = "23505";

export type RepositoryOperation =
  | "dataset_entries.list"
  | "dataset_entries.listAll"
  | "dataset_entries.findById"
  | "dataset_entries.listByIds"
  /**
   * The operator import, NOT a request-path read. Distinct from the three above because nothing in a
   * request may reach it: `src/lib/repositories/supabase/dataset-entries.ts` is deliberately a read
   * interface, and a validator request has no path to the write that populates this table.
   */
  | "dataset_entries.import"
  | "validators.insert"
  | "validators.findById"
  | "validators.listByIds"
  | "validators.listAllIds"
  | "validators.touchLastActive"
  | "validations.insert"
  | "validations.findByEntry"
  | "validations.findById"
  | "validations.listForEntries"
  | "validations.listAllValidatorIds"
  | "validations.listEntryIdsForValidator"
  | "validations.countForEntry"
  | "validations.countForValidator"
  | "validation_batches.insert"
  | "validation_batches.findById"
  | "validation_batches.listForRecovery"
  | "validation_batches.allocate"
  | "researcher_signin_attempts.recordAttempt"
  | "researcher_signin_attempts.clear"
  | "entry_reservations.claim"
  | "entry_reservations.release";

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
