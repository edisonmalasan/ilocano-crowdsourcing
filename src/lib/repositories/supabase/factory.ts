import "server-only";

import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";

import type { FilterHandleLike, SupabaseClientLike, TableHandleLike } from "./client";
import { SupabaseBatchesRepository } from "./batches";
import { SupabaseDatasetEntriesRepository } from "./dataset-entries";
import { SupabaseValidationsRepository } from "./validations";
import { SupabaseValidatorsRepository } from "./validators";

/**
 * Constructs the four Supabase-backed repositories over the privileged client.
 *
 * ============================================================================
 * WHAT IS AND IS NOT VERIFIED ABOUT THIS FILE
 * ============================================================================
 *
 * NOT VERIFIED. No Supabase project and no credential exist in this environment
 * (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are all absent), so
 * `createAdminSupabaseClient()` has never been *called* by any test in this repository, and no
 * query in `dataset-entries.ts`, `validators.ts`, `validations.ts`, or `batches.ts` has ever reached
 * PostgREST. Nothing in this file has been executed against a database. Unverified specifically:
 *
 *   - PostgREST's interpretation of `.in()`, `.range()`, `.select(cols, { count: "exact" })`,
 *     `.insert(arrayOfRows)`, `.insert().select().single()`, and `.update().eq()`.
 *   - whether an ARRAY insert is returned in request order or reordered by the planner, which
 *     `SupabaseBatchesRepository.create` never assumes: it compares row COUNT and then reads the
 *     batch back through `findById`, which asks for `order("position")`.
 *   - the shape of the error objects actually returned, including whether `code` is `23505` for
 *     the `(validator_id, dataset_entry_id)` uniqueness violation this code branches on. The
 *     mapping is written to the documented SQLSTATE and to no observed payload.
 *   - the project's configured maximum rows per request, which two methods depend on in order to
 *     detect truncation.
 *   - Row Level Security, Auth, Storage, and every other Supabase-managed behaviour. The schema
 *     enables RLS on all six tables and grants nothing to `anon` or `authenticated`; whether a
 *     hosted project enforces that is verified only by a PGlite test of the SQL, never of the
 *     Supabase API gateway.
 *
 * VERIFIED. `tsc` checks that the real client and the real filter builder still expose every
 * member the narrow client interface declares (see the assertions below), and the unit tests in
 * `tests/unit/repositories-supabase.test.ts` verify the translation and error-mapping logic against
 * a fake with no network.
 *
 * The privileged client BYPASSES Row Level Security, so these repositories must be reached only
 * from server-side code that has already decided what it is allowed to do. See
 * `@/lib/supabase/admin` for the full statement of that rule.
 */

/**
 * The real table builder and the real filter builder, reached without instantiating a client.
 *
 * `ReturnType` of a generic method resolves cheaply (it substitutes the type parameters rather
 * than evaluating the builder's nested conditional result types), which is what makes the
 * name-level assertions below affordable where a full structural assignment is not.
 */
type RealTableHandle = ReturnType<AdminSupabaseClient["from"]>;
type RealFilterHandle = ReturnType<RealTableHandle["select"]>;

/**
 * Compile-time compatibility check: every member the narrow client interface declares must exist
 * on the real builder, and vice versa is not required.
 *
 * A missing member resolves `…IsComplete` to the member name rather than `true`, which fails at
 * the point of use below. This catches a rename, a removal, or a member moved off the builder.
 * It does NOT compare signatures — see `client.ts` for why a full comparison is not possible with
 * this toolchain, and what that leaves unchecked.
 */
type TableMembersArePresent = [Exclude<keyof TableHandleLike, keyof RealTableHandle>] extends [
  never,
]
  ? true
  : Exclude<keyof TableHandleLike, keyof RealTableHandle>;
type FilterMembersArePresent = [Exclude<keyof FilterHandleLike, keyof RealFilterHandle>] extends [
  never,
]
  ? true
  : Exclude<keyof FilterHandleLike, keyof RealFilterHandle>;

// The two assertions are consumed here, so a drift in `@supabase/postgrest-js` fails typecheck.
const TABLE_MEMBERS_ARE_PRESENT: TableMembersArePresent = true;
const FILTER_MEMBERS_ARE_PRESENT: FilterMembersArePresent = true;

/**
 * Presents the real privileged client as the narrow interface the repositories are written
 * against.
 *
 * The cast is the one place where a real guarantee is given up, and it is given up for a reason
 * that is not a matter of taste: `AdminSupabaseClient extends SupabaseClientLike` does not
 * compile — it fails with `TS2589: Type instantiation is excessively deep and possibly infinite`,
 * because relating the real generic builder (eight type parameters, conditional-typed filter
 * signatures, and a `GetResult`-derived result type on every `select`) to a recursive interface
 * exhausts TypeScript's instantiation budget. The members it needs are asserted to exist just
 * above, so what this cast hides is a signature difference, not a missing method.
 *
 * The alternative — writing the repositories against the concrete client — would remove the cast
 * and make every method in this directory impossible to test without a network.
 */
function asNarrowClient(admin: AdminSupabaseClient): SupabaseClientLike {
  void TABLE_MEMBERS_ARE_PRESENT;
  void FILTER_MEMBERS_ARE_PRESENT;
  return admin as unknown as SupabaseClientLike;
}

/** Builds all four repositories over one privileged client. */
export function createSupabaseRepositories(
  admin: AdminSupabaseClient = createAdminSupabaseClient(),
) {
  const client = asNarrowClient(admin);
  return {
    datasetEntries: new SupabaseDatasetEntriesRepository(client),
    validators: new SupabaseValidatorsRepository(client),
    validations: new SupabaseValidationsRepository(client),
    batches: new SupabaseBatchesRepository(client),
  };
}

export type SupabaseRepositories = ReturnType<typeof createSupabaseRepositories>;
