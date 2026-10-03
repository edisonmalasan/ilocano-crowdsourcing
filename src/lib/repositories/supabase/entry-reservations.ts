import "server-only";

import {
  RepositoryError,
  type EntryReservationsRepository,
  type RepositoryOperation,
} from "@/lib/repositories";

import type { PostgrestErrorLike, SupabaseClientLike, SupabaseRpcResultLike } from "./client";
import { awaitQuery, describePostgrestError } from "./rows";
import { ENTRY_RESERVATIONS_OPERATIONS as OPS } from "./operations";

/**
 * Supabase-backed access to exclusive assignment leases.
 *
 * The client is the narrow {@link SupabaseClientLike}, so this is testable with a recording fake
 * and no network — which matters more here than for the read-side repositories, because the whole
 * point of the interface is that the claim is ATOMIC, and "atomic" is a claim about a single
 * database statement. A fake can prove this code asks for that statement; it cannot prove the
 * statement arbitrates. That is what the PGlite integration test and the hosted project are for,
 * and `tests/integration/entry-reservations.test.ts` states which of the two it is.
 */

/**
 * The two functions this repository calls, named as constants.
 *
 * They are not parameterised by a caller. `revoke` in the migration means `PUBLIC` cannot execute
 * either one, so the only caller of both is `service_role`, which is this repository's client. Naming
 * them here rather than inlining the strings at the call sites means a search for
 * `claim_entry_reservations` finds this file and the migration and nothing in between.
 */
export const CLAIM_RESERVATIONS_FUNCTION = "claim_entry_reservations";
export const RELEASE_RESERVATION_FUNCTION = "release_entry_reservation";

/** The argument names the migration declares. PostgREST matches function arguments BY NAME. */
const VALIDATOR_ID_ARGUMENT = "p_validator_id";
const ENTRY_IDS_ARGUMENT = "p_entry_ids";
const TTL_SECONDS_ARGUMENT = "p_ttl_seconds";
const ENTRY_ID_ARGUMENT = "p_entry_id";

export class SupabaseEntryReservationsRepository implements EntryReservationsRepository {
  private readonly client: SupabaseClientLike;

  constructor(client: SupabaseClientLike) {
    this.client = client;
  }

  /**
   * Atomically claims candidate entries and returns the granted subset, in no guaranteed order.
   *
   * An empty grant is a REAL answer — contention, not failure — so it returns `[]` rather than
   * raising. What raises is a claim that never got an answer (rejection) or an answer this code
   * does not understand (a row that is not an entry id).
   */
  async claimReservations(
    validatorId: string,
    entryIds: readonly string[],
    ttlSeconds: number,
  ): Promise<string[]> {
    const result = await this.call(
      OPS.claimReservations,
      "entry_reservations.claimReservations",
      CLAIM_RESERVATIONS_FUNCTION,
      {
        [VALIDATOR_ID_ARGUMENT]: validatorId,
        [ENTRY_IDS_ARGUMENT]: [...entryIds],
        [TTL_SECONDS_ARGUMENT]: ttlSeconds,
      },
    );

    // The function returns `table (entry_id text)`, which PostgREST delivers as an array of
    // single-key rows. A row that is not an entry id means the deployed function is not the one
    // this file names — and silently dropping it would turn someone else's grant into our
    // contention, which fails in the wrong direction.
    if (!Array.isArray(result.data)) {
      throw new RepositoryError(
        OPS.claimReservations,
        `${CLAIM_RESERVATIONS_FUNCTION}() did not return a row array (received ` +
          `${describeShape(result.data)}). Treating that as "nothing granted" would report ` +
          "exhaustion precisely when the database is unreachable, which is the wrong direction.",
        { detail: `unexpected rpc return shape: ${describeShape(result.data)}` },
      );
    }
    const granted: string[] = [];
    for (const row of result.data) {
      const id = typeof row === "string" ? row : (row as { entry_id?: unknown } | null)?.entry_id;
      if (typeof id !== "string" || id.length === 0) {
        throw new RepositoryError(
          OPS.claimReservations,
          `${CLAIM_RESERVATIONS_FUNCTION}() returned a row that is not an entry id.`,
          { detail: `unexpected rpc row shape: ${describeShape(row)}` },
        );
      }
      granted.push(id);
    }
    return granted;
  }

  /**
   * Releases the caller's own claim. A delete that matches nothing is not a failure: it is the
   * ordinary outcome for an entry whose claim already expired, and the interface asks for `void`
   * precisely so the caller does not have to distinguish "nothing to release" from "released".
   */
  async releaseReservation(validatorId: string, entryId: string): Promise<void> {
    const result = await this.call(
      OPS.releaseReservation,
      "entry_reservations.releaseReservation",
      RELEASE_RESERVATION_FUNCTION,
      { [VALIDATOR_ID_ARGUMENT]: validatorId, [ENTRY_ID_ARGUMENT]: entryId },
    );
    // `release_entry_reservation` returns void, which PostgREST delivers as `null`. Anything
    // else means the function is not the one this file names, so it is surfaced rather than
    // ignored.
    if (result.data !== null && result.data !== undefined) {
      throw new RepositoryError(
        OPS.releaseReservation,
        `${RELEASE_RESERVATION_FUNCTION}() returned ${describeShape(result.data)} but declares ` +
          "`returns void`. A non-null body means the deployed function is not the one this " +
          "repository calls, so the lease it maintains cannot be the one this code releases.",
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
