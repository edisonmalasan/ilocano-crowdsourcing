import "server-only";

import type { ZodType } from "zod";

import {
  POSTGREST_UNIQUE_VIOLATION_CODE,
  RepositoryError,
  type RepositoryOperation,
} from "@/lib/repositories";

import type { PostgrestErrorLike, PostgrestResultLike } from "./client";

/**
 * Row ⇄ domain translation, and the only place a persistence failure becomes a `RepositoryError`.
 *
 * Every helper here takes the `RepositoryOperation` of the call that produced the value, so a
 * failure is always attributed to a specific call rather than to "the repository". Nothing in
 * this file returns a fallback value: a result that cannot be translated raises, because the
 * alternative — a partially filled domain object, or an empty array standing in for a failed
 * query — is precisely what `@/lib/repositories/errors` forbids.
 *
 * UNKNOWN FIELDS ARE NOT DROPPED — how this directory satisfies that rule
 * ---------------------------------------------------------------------
 * The seam's third rule, stated in `@/lib/repositories/index.ts` and unchanged by this change, is
 * that a persistence record must never lose a field the domain does not model. This comment
 * describes the MECHANISM, not a narrower version of the rule: there are two distinct situations
 * and each is handled where the loss would actually occur.
 *
 * PERSISTENCE COLUMNS the domain does not model — structural, so there is nothing to drop:
 * 1. Every read names an EXPLICIT COLUMN LIST (the `*_COLUMNS` constants next to each row type).
 *    A column this mapping does not model is therefore never even fetched, so it cannot be
 *    discarded at the point where discarding would be unrecoverable. `select("*")` appears nowhere
 *    in this directory, and `tests/unit/repositories-supabase.test.ts` asserts that.
 * 2. The domain object is then assembled field by field, so its shape is the domain shape and
 *    cannot accidentally absorb a column name. That is also what lets a `strictObject` schema
 *    such as `validatorProfileSchema` be used as an assertion rather than as a rejection: it sees
 *    only keys the mapping itself chose.
 *
 * UNKNOWN SOURCE FIELDS — preserved in storage and surfaced at the moment they matter:
 * 3. The unmodelled keys of the imported source JSON record live in `dataset_entries.source_payload`,
 *    which design D5 makes the archival copy. The domain `DatasetEntry` deliberately has no field
 *    for it, so it is not smuggled into the domain type. It is preserved in storage, and it is
 *    *surfaced*: the importer names every unmodelled field path in its report
 *    (`src/lib/dataset/synthetic-source.ts`). A field arriving in a future dataset revision is
 *    therefore recoverable from storage without a migration, and visible to the importer run that
 *    caused it.
 *
 * Two alternatives were rejected. Widening `DatasetEntry` with a `sourcePayload` field would make
 * every consumer carry a field none of them uses. A `findSourcePayload` repository method
 * returning `Record<string, unknown>` would put a persistence record back across the seam this
 * package exists to keep clear — and its column-folding half would be unreachable, because every
 * read names an explicit column list, so PostgREST cannot return a column the list did not ask
 * for. It would be covered only by a fake invented to satisfy it.
 */

/**
 * Re-exported, not redefined. The definition moved to `@/lib/repositories/errors` so a domain
 * service can branch on a uniqueness violation without importing a `server-only` module; the
 * implementations below keep importing the name from here.
 */
export { POSTGREST_UNIQUE_VIOLATION_CODE };

/** Renders a PostgREST error for `RepositoryError.detail`: a code and a message, never a value. */
export function describePostgrestError(error: PostgrestErrorLike): string {
  return `PostgREST ${error.code}: ${error.message}`;
}

/**
 * Builds the `RepositoryError` for a failed call.
 *
 * The PostgREST error object is kept as `cause` and its code/message reduced to `detail`, because
 * `RepositoryErrorOptions.detail` is documented as diagnosis-only material that must never be
 * surfaced verbatim to a user-facing message.
 */
export function persistenceFailure(
  operation: RepositoryOperation,
  context: string,
  error: PostgrestErrorLike,
  message?: string,
): RepositoryError {
  return new RepositoryError(
    operation,
    message ??
      `${context} failed: PostgREST reported ${error.code} (${error.message}). The original error is on \`cause\`.`,
    { cause: error, detail: describePostgrestError(error) },
  );
}

/** Fails when a result carries an error. The only other outcome of a write is "no rows to read". */
export function expectNoError(
  result: PostgrestResultLike,
  operation: RepositoryOperation,
  context: string,
): void {
  if (result.error === null) return;
  throw persistenceFailure(operation, context, result.error);
}

/**
 * Awaits a query and converts a REJECTED call into a `RepositoryError`.
 *
 * A PostgREST call fails in two different ways and both have to leave through the same typed door.
 * A request that reached the server comes back as `{ data, error }` and is handled by the
 * `read*` helpers. A request that never got an answer — a refused connection, a DNS failure, an
 * aborted fetch — rejects, and an unhandled rejection would escape as whatever the HTTP client
 * threw, with no operation name on it. Under the error contract a caller must always be able to
 * ask which call failed, so the rejection is wrapped here rather than at each call site.
 *
 * Only the query itself is wrapped. Translation happens outside this helper, so a bug in the
 * mapping is not misreported as a persistence failure.
 */
/**
 * Awaits a PostgREST call and converts a REJECTION into a `RepositoryError`.
 *
 * GENERIC over the envelope rather than fixed to `PostgrestResultLike`, because the repository
 * client has two shapes: a table operation returns `{ data, error, count }` and an `rpc` call
 * returns `{ data, error }` with no count to report. The one thing they share is the field this
 * function actually reads, and the constraint names exactly that field — so a shape is accepted
 * precisely when it can carry an error, and there is still only ONE place that turns a rejection
 * into a typed failure.
 */
export async function awaitQuery<T extends { readonly error: PostgrestErrorLike | null }>(
  operation: RepositoryOperation,
  context: string,
  query: () => PromiseLike<T>,
): Promise<T> {
  try {
    return await query();
  } catch (cause) {
    throw new RepositoryError(
      operation,
      `${context} failed before PostgREST returned a response (${describeCause(cause)}). The ` +
        "original error is on `cause`.",
      { cause, detail: describeCause(cause) },
    );
  }
}

/** A value-free description of a thrown value, for error messages. Never includes a message. */
function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.name : `a thrown ${typeof cause}`;
}

/**
 * Reads the row array out of a result.
 *
 * `data: null` with no error is treated as a FAILURE, not as an empty result. An empty array is a
 * legitimate answer; a null body is a response this code does not understand, and reporting it as
 * "no rows" would be the exact collapse of "no data" into "the query failed" that the error
 * contract prohibits.
 */
export function readRows(
  result: PostgrestResultLike,
  operation: RepositoryOperation,
  context: string,
): Record<string, unknown>[] {
  if (result.error !== null) throw persistenceFailure(operation, context, result.error);
  if (!Array.isArray(result.data)) {
    throw new RepositoryError(
      operation,
      `${context} returned no row array (PostgREST \`data\` was ${describeValueShape(result.data)}). ` +
        "Treating that as zero rows would hide a failed query behind an empty result.",
      { detail: `unexpected data shape: ${describeValueShape(result.data)}` },
    );
  }
  return result.data as Record<string, unknown>[];
}

/**
 * Reads a single row, where `null` means absent.
 *
 * Callers must reach this through `maybeSingle()`, never `single()`: `single()` turns an absent
 * row into `PGRST116`, which would make "no such entry" indistinguishable from "the query failed".
 */
export function readSingleRow(
  result: PostgrestResultLike,
  operation: RepositoryOperation,
  context: string,
): Record<string, unknown> | null {
  if (result.error !== null) throw persistenceFailure(operation, context, result.error);
  if (result.data === null) return null;
  if (typeof result.data !== "object" || Array.isArray(result.data)) {
    throw new RepositoryError(
      operation,
      `${context} returned ${describeValueShape(result.data)} where a single row or null was expected.`,
      { detail: `unexpected data shape: ${describeValueShape(result.data)}` },
    );
  }
  return result.data as Record<string, unknown>;
}

/**
 * Reads a count.
 *
 * A missing count is a failure, never `0`. Returning `0` here would tell allocation that an entry
 * has no validators when in fact the server did not answer the question, and allocation would then
 * hand the entry to more validators.
 */
export function readExactCount(
  result: PostgrestResultLike,
  operation: RepositoryOperation,
  context: string,
): number {
  if (result.error !== null) throw persistenceFailure(operation, context, result.error);
  if (typeof result.count !== "number" || !Number.isInteger(result.count) || result.count < 0) {
    throw new RepositoryError(
      operation,
      `${context} did not return a row count. The query must request \`count: "exact"\`; ` +
        "defaulting to zero would be indistinguishable from a genuinely uncovered entry.",
      { detail: `count was ${describeValueShape(result.count)}` },
    );
  }
  return result.count;
}

/**
 * Guards a read whose result set the server may have truncated.
 *
 * PostgREST caps a response at a configured maximum (1000 rows by default) and reports the
 * truncation only by returning fewer rows than exist. For the two unbounded reads here that is
 * the dangerous kind of silent wrong answer: a shorter pool would look like a smaller category and
 * a shorter response list would look like less disagreement. Requesting an exact count in the
 * same round trip costs no extra request and makes the cap detectable.
 *
 * Skipped when the caller asked for a cap of its own — a page that is deliberately shorter than
 * the total is paging, not truncation.
 */
export function assertPageIsComplete(
  result: PostgrestResultLike,
  rows: readonly unknown[],
  requestedLimit: number | undefined,
  operation: RepositoryOperation,
  context: string,
): void {
  if (requestedLimit !== undefined) return;
  if (result.count === null) return;
  if (rows.length >= result.count) return;
  throw new RepositoryError(
    operation,
    `${context} returned ${rows.length} of ${result.count} matching rows. PostgREST truncates a ` +
      "response at the project's maximum rows per request, and a short read here would be " +
      "indistinguishable from a short dataset.",
    { detail: `truncated read: ${rows.length} of ${result.count} rows` },
  );
}

/**
 * Converts a `timestamptz` column to the ISO 8601 string the domain uses.
 *
 * PostgREST serializes a `timestamptz` as an ISO 8601 string carrying the server's UTC offset
 * (for example `2026-09-30T08:00:00+08:00`), which parses fine but is not the canonical
 * `toISOString()` form the domain schemas were written against. Normalizing here means every
 * timestamp in the domain is one representation, so equality comparisons and `startsWith` checks
 * in tests are meaningful.
 *
 * An unparseable value raises rather than passing through: a garbage timestamp in a research
 * record must not become a string that merely looks like a timestamp.
 */
export function toIsoDateTime(
  value: unknown,
  column: string,
  operation: RepositoryOperation,
): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new RepositoryError(
      operation,
      `Column \`${column}\` is not a readable timestamp (received ${describeValueShape(value)}). ` +
        "The stored value cannot be represented as an ISO 8601 datetime.",
      { detail: `unreadable timestamp in column ${column}` },
    );
  }
  return new Date(value).toISOString();
}

/**
 * Validates a candidate domain object with its own schema and turns a rejection into a
 * `RepositoryError`.
 *
 * The candidate is always assembled field by field by the caller, so a `strictObject` schema here
 * is an assertion about the *values* the database returned (a proficiency outside the five
 * approved values, a negative `total_validations`, a blank correction stored against a
 * `correct_natural` evaluation) rather than a surprise about shape.
 */
export function parseDomainValue<T>(
  schema: ZodType<T>,
  candidate: unknown,
  operation: RepositoryOperation,
  context: string,
): T {
  const result = schema.safeParse(candidate);
  if (result.success) return result.data;
  const detail = result.error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join(".") : "(root)"}: ${issue.message}`)
    .join("; ");
  throw new RepositoryError(
    operation,
    `${context} produced a value the domain schema rejects, so it is not returned to a caller: ${detail}`,
    { detail, cause: result.error },
  );
}

/** A short, value-free description of a shape, for error messages. Never includes the value. */
function describeValueShape(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (value === undefined) return "undefined";
  return `a ${typeof value}`;
}
