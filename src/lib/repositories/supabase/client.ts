import "server-only";

/**
 * The narrow structural slice of the Supabase client these repositories depend on.
 *
 * WHY A NARROW INTERFACE AND NOT `SupabaseClient`
 * ----------------------------------------------
 * There is no Supabase project and no credential in this repository's environment, so a test
 * cannot construct a real client and cannot make a network call. Typing the constructors against
 * the concrete `SupabaseClient` would make these classes untestable until credentials exist, and
 * the result would be either untested code or a cast to `any` — both worse than a small,
 * explicitly-declared contract. This mirrors the precedent of `QueryExecutor` in
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
 * A structural interface can only describe the members that exist. It cannot prove that
 * PostgREST interprets `.in()`, `.range()`, `.select(cols, { count: "exact" })`, or
 * `.insert().select().single()` the way this code assumes, nor that a service-role request
 * returns rows at all. Every behavioural claim about the wire protocol is unverified until a
 * hosted Supabase project exists. The unit tests prove the *translation and error-mapping logic*
 * against a fake; they prove nothing about PostgREST.
 *
 * `upsert` is deliberately absent. `ValidatorsRepository.create` must fail on a duplicate id
 * rather than quietly overwrite, and leaving `upsert` out of the type means the requirement is
 * enforced by the compiler for the fake and by review for the real client, instead of resting on
 * remembering not to call it.
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
  insert(values: Record<string, unknown>): FilterHandleLike;
  update(values: Record<string, unknown>): FilterHandleLike;
}

/** The filterable, chainable builder, plus the terminals. */
export interface FilterHandleLike extends PromiseLike<PostgrestResultLike> {
  /**
   * Re-selects the columns a write returns, which is how an insert is read back. A write's
   * `select` takes columns alone; the options only exist on a read.
   */
  select(columns?: string, options?: SelectOptionsLike): FilterHandleLike;
  eq(column: string, value: unknown): FilterHandleLike;
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

/** The only client member used: a table handle. */
export interface SupabaseClientLike {
  from(table: string): TableHandleLike;
}
