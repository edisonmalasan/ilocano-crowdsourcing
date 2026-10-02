import { RepositoryError, type RepositoryOperation } from "@/lib/repositories";

/**
 * The PostgREST call vocabulary, in a module WITHOUT `import "server-only"`.
 *
 * WHY THIS FILE EXISTS AT ALL
 * --------------------------
 * Everything else in `src/lib/repositories/supabase/**` opens with `import "server-only"`, and the
 * boundary rule requires it. This file deliberately does not, and the reason is a runtime fact
 * rather than a preference: the `server-only` package's own entry point THROWS when it is loaded
 * outside a React Server Component render, so a plain-Node operator command cannot evaluate a
 * module that carries the marker. The hosted dataset import is exactly such a command —
 * `scripts/import-dataset.ts` runs under Node, not under Next.js — and it needs the shared error
 * mapping in this directory to build a typed failure.
 *
 * So the shared half moved here and `rows.ts` and `client.ts` RE-EXPORT it. One definition, the
 * existing import sites unchanged, and no copy. This is the same pattern `rows.ts` already used
 * for `POSTGREST_UNIQUE_VIOLATION_CODE`, whose own comment records the identical reason: a
 * `server-only` module cannot be imported by a service worth unit-testing.
 *
 * WHAT IS HERE, AND WHY THESE FIVE THINGS
 * ---------------------------------------
 * The split is "the wire" against "the row". These are the shapes a caller must know in order to
 * READ a PostgREST answer and to TURN a failure into a `RepositoryError`. Translating a row into a
 * domain object is a different concern and stays in `rows.ts`.
 *
 * Nothing here holds a credential, opens a connection, or reads an environment variable, so a
 * client component importing this module by mistake gains it nothing. That is why it is safe for
 * this file to be importable from anywhere even though its SIBLINGS are not — and it is also why
 * `eslint.config.mjs` lists this specifier as privileged anyway (defence in depth, not because the
 * contents warrant it).
 */

/** The PostgREST error fields this code reads. `code` is the only one it branches on. */
export interface PostgrestErrorLike {
  /** PostgREST code (`PGRST116`) or PostgreSQL SQLSTATE (`23505`, `23503`, `23514`). */
  code: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

/**
 * `client.rpc(function, args)` — a single-row scalar function call.
 *
 * A plain `PromiseLike` rather than a chainable builder, because a function's return value is
 * whatever the function returns and there is nothing further to filter. It is the same two-field
 * envelope every other call returns, so `expectNoError` and `persistenceFailure` apply unchanged
 * and no new error-handling path is introduced.
 */
export interface SupabaseRpcResultLike {
  data: unknown;
  error: PostgrestErrorLike | null;
}

/**
 * The RPC slice of the client, on its own.
 *
 * `SupabaseClientLike` is this plus `from(...)`, and a caller that only ever calls a function has
 * no business being handed the table builder: the narrower dependency is the one that cannot be
 * used to perform the write the function exists to make atomic. `factory.ts` presents the real
 * client as `SupabaseClientLike`; `SupabaseDatasetEntrySink` depends on this instead, and the
 * hosted dataset import never obtains a table handle at all.
 */
export interface SupabaseRpcClientLike {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<SupabaseRpcResultLike>;
}

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
  result: { readonly error: PostgrestErrorLike | null },
  operation: RepositoryOperation,
  context: string,
): void {
  if (result.error === null) return;
  throw persistenceFailure(operation, context, result.error);
}

/**
 * Awaits a PostgREST call and converts a REJECTION into a `RepositoryError`.
 *
 * GENERIC over the envelope rather than fixed to one result shape, because the client has two: a
 * table operation returns `{ data, error, count }` and an `rpc` call returns `{ data, error }` with
 * no count to report. The one thing they share is the field this function actually reads, and the
 * constraint names exactly that field — so a shape is accepted precisely when it can carry an
 * error, and there is still only ONE place that turns a rejection into a typed failure.
 *
 * A PostgREST call fails in two different ways and both have to leave through the same typed door.
 * A request that reached the server comes back as `{ data, error }` and is handled by
 * `expectNoError`. A request that never got an answer — a refused connection, a DNS failure, an
 * aborted fetch — rejects, and an unhandled rejection would escape as whatever the HTTP client
 * threw, with no operation name on it. Under the error contract a caller must always be able to
 * ask which call failed, so the rejection is wrapped here rather than at each call site.
 *
 * Only the call itself is wrapped. Translation happens outside this helper, so a bug in the
 * mapping is not misreported as a persistence failure.
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
