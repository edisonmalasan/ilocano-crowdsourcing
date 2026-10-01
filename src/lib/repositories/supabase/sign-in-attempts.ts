import "server-only";

import {
  RepositoryError,
  type RepositoryOperation,
  type SignInAttemptsRepository,
} from "@/lib/repositories";

import type { PostgrestErrorLike, SupabaseClientLike, SupabaseRpcResultLike } from "./client";
import { awaitQuery, describePostgrestError } from "./rows";
import { SIGN_IN_ATTEMPTS_OPERATIONS as OPS } from "./operations";

/**
 * Supabase-backed access to the durable researcher sign-in attempt counter.
 *
 * The client is the narrow {@link SupabaseClientLike}, so this is testable with a recording fake
 * and no network — which matters more here than for the read-side repositories, because the whole
 * point of the interface is that the increment is ATOMIC, and "atomic" is a claim about a single
 * database statement. A fake can prove this code asks for that statement; it cannot prove the
 * statement is atomic. That is what the PGlite integration test and the hosted project are for, and
 * `tests/integration/researcher-signin-attempts.test.ts` states which of the two it is.
 */

/**
 * The two functions this repository calls, named as constants.
 *
 * They are not parameterised by a caller. `revoke` in the migration means `PUBLIC` cannot execute
 * either one, so the only caller of both is `service_role`, which is this repository's client. Naming
 * them here rather than inlining the strings at the call sites means a search for
 * `researcher_signin_attempts_record` finds this file and the migration and nothing in between.
 */
export const RECORD_ATTEMPT_FUNCTION = "researcher_signin_attempts_record";
export const CLEAR_ATTEMPTS_FUNCTION = "researcher_signin_attempts_clear";

/** The argument names the migration declares. PostgREST matches function arguments BY NAME. */
const ORIGIN_KEY_ARGUMENT = "p_origin_key";
const WINDOW_SECONDS_ARGUMENT = "p_window_seconds";

/** Widest origin key the table's check constraint accepts. */
const MAX_ORIGIN_KEY_LENGTH = 200;

export class SupabaseSignInAttemptsRepository implements SignInAttemptsRepository {
  private readonly client: SupabaseClientLike;

  constructor(client: SupabaseClientLike) {
    this.client = client;
  }

  /**
   * Atomically records one attempt and returns the count for the current window, including this one.
   *
   * The origin key is truncated to the table's own width rather than refused when it is longer.
   * Truncation is the right choice here and validation is not: the key is derived from request
   * headers this project does not control, so a long one is an ordinary hostile input rather than a
   * caller error, and refusing it would let a party convert "your header is long" into "the attempt
   * was not counted" — which would make the limit optional for exactly the party it is meant to
   * constrain.
   */
  async recordAttempt(originKey: string, windowSeconds: number): Promise<number> {
    const key = originKey.slice(0, MAX_ORIGIN_KEY_LENGTH);

    const result = await this.call(
      OPS.recordAttempt,
      "researcher_signin_attempts.recordAttempt",
      RECORD_ATTEMPT_FUNCTION,
      { [ORIGIN_KEY_ARGUMENT]: key, [WINDOW_SECONDS_ARGUMENT]: windowSeconds },
    );

    // The function's return type is `integer`, so a non-integer here means the wire carried
    // something this code does not understand. Defaulting it to 0 would read as "no attempts
    // recorded", which is the one value that silently disables the limit.
    if (typeof result.data !== "number" || !Number.isInteger(result.data) || result.data < 1) {
      throw new RepositoryError(
        OPS.recordAttempt,
        `${RECORD_ATTEMPT_FUNCTION}() did not return a positive integer attempt count (received ` +
          `${describeShape(result.data)}). Reporting 0 here would read as "no failures recorded", ` +
          "which is the single value that would silently disable the limit.",
        { detail: `unexpected rpc return shape: ${describeShape(result.data)}` },
      );
    }
    return result.data;
  }

  /**
   * Deletes the origin's row, so the next allowance starts from nothing.
   *
   * A delete that matches nothing is not a failure. It is the ordinary outcome for an origin that
   * has not failed yet, and the interface asks for `void` precisely so the caller does not have to
   * distinguish "nothing to clear" from "cleared".
   */
  async clear(originKey: string): Promise<void> {
    const key = originKey.slice(0, MAX_ORIGIN_KEY_LENGTH);
    const result = await this.call(
      OPS.clear,
      "researcher_signin_attempts.clear",
      CLEAR_ATTEMPTS_FUNCTION,
      { [ORIGIN_KEY_ARGUMENT]: key },
    );
    // `researcher_signin_attempts_clear` returns void, which PostgREST delivers as `null`. Anything
    // else means the function is not the one this file names, so it is surfaced rather than ignored.
    if (result.data !== null && result.data !== undefined) {
      throw new RepositoryError(
        OPS.clear,
        `${CLEAR_ATTEMPTS_FUNCTION}() returned ${describeShape(result.data)} but declares ` +
          "`returns void`. A non-null body means the deployed function is not the one this " +
          "repository calls, so the counter it maintains cannot be the one this code clears.",
        { detail: `unexpected rpc return shape: ${describeShape(result.data)}` },
      );
    }
  }

  /**
   * One RPC call, with both failure modes leaving through the same typed door.
   *
   * A call that reached Postgres comes back as `{ data, error }`; a call that never got an answer
   * REJECTS. Under this project's error contract a caller must always be able to ask which operation
   * failed, so the rejection is wrapped here rather than at each of the two call sites.
   *
   * On a rejection the message is deliberately SHORTER than the equivalent failure elsewhere in this
   * directory. This is the one write an unauthenticated party can trigger, so it is also the one
   * whose error text most deserves not to describe internals: it says the operation failed before
   * Postgres answered, names the operation, and puts the full description on `detail` for an
   * operator reading logs.
   */
  private async call(
    operation: RepositoryOperation,
    context: string,
    fn: string,
    args: Record<string, unknown>,
  ): Promise<SupabaseRpcResultLike> {
    const result = await awaitQuery(operation, context, () => this.client.rpc(fn, args));
    if (result.error !== null) {
      throw new RepositoryError(
        operation,
        `${context} failed: Postgres rejected ${fn}(). The original error is on \`cause\`.`,
        { cause: result.error, detail: describePostgrestError(result.error as PostgrestErrorLike) },
      );
    }
    return result;
  }
}

/** A short, value-free description of a shape, for error messages. Never includes the value. */
function describeShape(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `an array of ${value.length}`;
  return `a ${typeof value}`;
}
