import "server-only";

import type { PostgrestErrorLike, SupabaseRpcClientLike } from "./rpc";

/**
 * Re-exported, not redefined. The RPC slice moved to `./rpc` — a module WITHOUT
 * `import "server-only"` — because the hosted dataset import runs in a plain-Node operator command
 * where the `server-only` package throws, and it must be able to name the function-call shape.
 * {@link SupabaseClientLike} below is still this plus `from(...)`, so nothing else moved.
 */
export type { PostgrestErrorLike, SupabaseRpcResultLike, SupabaseRpcClientLike } from "./rpc";

/**
 * The narrow structural slice of the Supabase client these repositories depend on.
 *
 * WHY A NARROW INTERFACE AND NOT `SupabaseClient`
 * ----------------------------------------------
 * Typing the constructors against the concrete `SupabaseClient` makes these classes untestable
 * without credentials, and the result would be either untested code or a cast to `any` — both worse
 * than a small, explicitly-declared contract. This mirrors the precedent of `QueryExecutor` in
 * `tests/integration/support/pglite.ts`, where the harness depends on the two PGlite methods it
 * uses rather than on `PGlite` itself.
 *
 * WHAT IS CHECKED AGAINST THE REAL CLIENT, AND WHAT IS NOT
 * -------------------------------------------------------
 * `factory.ts` does NOT manage a plain structural assignment of the real `SupabaseClient` to
 * {@link SupabaseClientLike}. That assignment is not achievable with this toolchain: the real
 * `PostgrestQueryBuilder`/`PostgrestFilterBuilder` are generic over eight type parameters whose
 * filter signatures are nested conditional types, and asking TypeScript to relate them to a
 * recursive interface fails with `TS2589: Type instantiation is excessively deep and possibly
 * infinite` (reproducible on TypeScript 5.9.3 with `@supabase/postgrest-js` 2.117.2 — verified
 * member by member: the read path alone is affordable, the combination with `insert` is not).
 *
 * So the compatibility that IS enforced is name-level and lives in `factory.ts`: a compile-time
 * check that the real client and the real filter builder still expose every member declared here.
 * That catches a renamed, removed, or re-signatured method. It does NOT prove the signatures
 * behave identically, and nothing here proves any PostgREST behaviour at all — see below.
 *
 * WHAT THIS DOES NOT PROVE
 * ------------------------
 * A structural interface can only describe the members that exist. It cannot prove that PostgREST
 * interprets `.in()`, `.range()`, `.select(cols, { count: "exact" })`, or `.insert().select().single()`
 * the way this code assumes, nor that a service-role request returns rows at all.
 *
 * **THE `rpc` MEMBER IS THE EXCEPTION, AND THE EXCEPTION IS MEASURED.** The hosted project exists,
 * its five migrations are applied, and the hosted dataset import has since driven `rpc` against the
 * real PostgREST gateway with the service-role key. So `rpc` — argument passing, the
 * `{ data, error }` envelope, and a `service_role` call succeeding where `anon` is refused — is
 * backed by the wire, not by a fake. **`.in()`, `.range()`, `.eq()`, and `.insert()` are still
 * proved only against fakes and against PGlite**, which is a real PostgreSQL engine but not
 * PostgREST. `docs/ROADMAP.md` carries the same statement; a reader who trusts one should trust
 * the other.
 *
 * `upsert` is deliberately absent. `ValidatorsRepository.create` must fail on a duplicate id
 * rather than quietly overwrite, and leaving `upsert` out of the type means the requirement is
 * enforced by the compiler for the fake and by review for the real client, instead of resting on
 * remembering not to call it. The hosted dataset import needed an idempotent write and therefore
 * had to reach a DATABASE FUNCTION rather than an `ON CONFLICT` clause PostgREST would express as
 * a REPLACE — which is why `rpc` is here at all.
 *
 * It arrived with the researcher sign-in attempt limit, and the reasoning is recorded here because
 * "we removed upsert on purpose" and "we added rpc on purpose" would otherwise look like an
 * inconsistency. The sign-in counter must be incremented atomically: a read-modify-write from the
 * application loses updates when two requests race, and a lost update means the stored count
 * under-reports and a determined party never reaches the limit. PostgREST cannot express
 * `INSERT ... ON CONFLICT DO UPDATE SET attempt_count = attempt_count + 1` as a table operation —
 * `upsert` REPLACES the named columns rather than incrementing them — so the only way to have the
 * database perform the atomic statement is to let the database own it. That is a function, and a
 * function is reached through `rpc`.
 *
 * It is narrower than it looks: the client cannot name an arbitrary function at a call site in this
 * directory, because the only callers pass constants declared beside them, and every such function's
 * migration ends with `revoke all … from public` plus `grant execute … to service_role`, so no
 * other role can execute any of them.
 */

/**
 * The PostgREST response envelope.
 *
 * Deliberately the whole envelope, including `count`, rather than just `data`: a caller that
 * destructures `{ data }` and forgets `error` is the exact bug the repository error contract
 * exists to prevent, so the shape forces both to be considered at every call site.
 */
export interface PostgrestResultLike {
  data: unknown;
  error: PostgrestErrorLike | null;
  /** Total matching rows when a `count` was requested, otherwise `null`. */
  count: number | null;
}

export interface SelectOptionsLike {
  /** Return no body; only `count` and `error`. Used by the two count queries. */
  head?: boolean;
  /**
   * Ask PostgREST to report the total number of matching rows. `"exact"` runs a real `COUNT(*)`.
   * It is requested on the reads that have no bound of their own, because the only way to notice
   * that the server truncated the result set is to compare it against the real total.
   */
  count?: "exact" | "planned" | "estimated";
}

export interface OrderOptionsLike {
  ascending?: boolean;
}

/**
 * `client.from(table)` — the shape that can start a read, an insert, or an update.
 *
 * Split from {@link FilterHandleLike} because the real builder genuinely has two shapes here:
 * `from()` offers `select`/`insert`/`update`, and each of those produces the filterable builder.
 * It is also, correctly, NOT thenable: awaiting it directly would be a mistake, and the real
 * `PostgrestQueryBuilder` has no `then` either.
 */
export interface TableHandleLike {
  select(columns?: string, options?: SelectOptionsLike): FilterHandleLike;
  /**
   * Writes one row, or SEVERAL rows in one request.
   *
   * The array form exists for exactly one caller: `batch_entries`, where a batch is a list of
   * ordered placements and writing them one request at a time would issue up to fifty round trips
   * for a full batch, with a partial write the caller could not distinguish from a complete one.
   * It is `readonly Record<string, unknown>[]` rather than `Record<string, unknown>[]` because no
   * implementation in this directory mutates the array it was handed.
   *
   * It is deliberately NOT widened to a variadic `...values` form. That is how the real client
   * accepts rows, and matching it exactly would be the more faithful interface — but the object
   * form is what every other call in this directory uses, and a signature that offers three ways to
   * say the same thing is a signature where one of them goes untested. The name-level check below
   * is unaffected either way, and that is the compatibility that is actually enforced here.
   */
  insert(values: Record<string, unknown> | readonly Record<string, unknown>[]): FilterHandleLike;
  update(values: Record<string, unknown>): FilterHandleLike;
  /**
   * Deletes matching rows, further narrowed by the filter builder it returns.
   *
   * OPTIONAL, and that is deliberate rather than hesitant: no other repository needs a delete,
   * so requiring it would force every existing fake to implement a member nothing it tests can
   * reach. The one caller (`SupabaseOperationalEventsRepository.pruneBefore`) checks for its
   * presence and skips the cleanup when the client cannot express it. The real PostgREST
   * builder exposes it, which `factory.ts` asserts at compile time like every other member.
   */
  delete?: () => FilterHandleLike;
}

/** The filterable, chainable builder, plus the terminals. */
export interface FilterHandleLike extends PromiseLike<PostgrestResultLike> {
  /**
   * Re-selects the columns a write returns, which is how an insert is read back. A write's
   * `select` takes columns alone; the options only exist on a read.
   */
  select(columns?: string, options?: SelectOptionsLike): FilterHandleLike;
  eq(column: string, value: unknown): FilterHandleLike;
  /**
   * Strictly-earlier comparison, for the retention cleanup only.
   *
   * OPTIONAL for the same reason as `TableHandleLike.delete`: nothing else needs it, so no
   * existing fake is required to provide it, and the single caller checks before using it.
   */
  lt?: (column: string, value: unknown) => FilterHandleLike;
  in(column: string, values: readonly unknown[]): FilterHandleLike;
  order(column: string, options?: OrderOptionsLike): FilterHandleLike;
  limit(count: number): FilterHandleLike;
  range(from: number, to: number): FilterHandleLike;
  /**
   * Errors with `PGRST116` when the row is absent, which would conflate "absent" with "failed".
   * Used only where exactly one row is guaranteed to exist, which today is nowhere: the
   * single-row reads all use {@link maybeSingle}.
   */
  single(): PromiseLike<PostgrestResultLike>;
  /** An absent row yields `data: null` and `error: null`, which is what "absent" looks like. */
  maybeSingle(): PromiseLike<PostgrestResultLike>;
}

/**
 * The only client members used: a table handle, and the RPC slice this file extends.
 *
 * `extends SupabaseRpcClientLike` rather than declaring `rpc` again, so the two shapes cannot
 * drift apart — a change to the RPC contract is made once, in `./rpc`, and every implementation
 * that presents a client as this interface is checked against it.
 */
export interface SupabaseClientLike extends SupabaseRpcClientLike {
  from(table: string): TableHandleLike;
}
