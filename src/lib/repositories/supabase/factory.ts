import "server-only";

import type { SignInAttemptsRepository } from "@/lib/repositories";
import { createAdminSupabaseClient, type AdminSupabaseClient } from "@/lib/supabase/admin";

import type { FilterHandleLike, SupabaseClientLike, TableHandleLike } from "./client";
import { SupabaseBatchesRepository } from "./batches";
import { SupabaseDatasetEntriesRepository } from "./dataset-entries";
import { SupabaseEntryReservationsRepository } from "./entry-reservations";
import { SupabaseSignInAttemptsRepository } from "./sign-in-attempts";
import { SupabaseValidationsRepository } from "./validations";
import { SupabaseValidatorsRepository } from "./validators";

/**
 * Constructs the five Supabase-backed repositories over the privileged client.
 *
 * ============================================================================
 * WHAT IS AND IS NOT VERIFIED ABOUT THIS FILE
 * ============================================================================
 *
 * This section was FALSE until 2026-10-03 and has been rewritten against measurements. The previous
 * text opened "NOT VERIFIED. No Supabase project and no credential exist in this environment
 * (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are all absent)". All three
 * were present and a hosted project existed. The error was writing a claim about the environment from
 * the absence of a local Supabase RUNTIME rather than by asking whether a hosted project existed —
 * and a reader would reasonably have read "none of this has ever run" as a statement about the
 * repositories below rather than about docker.
 *
 * ── NOW TRUE, MEASURED AGAINST THE REAL HOSTED PROJECT ON 2026-10-03 ─────────────────────────────
 *   - Seven production migrations are applied to a real project, unchanged, in filename order,
 *     one request per file, through the Supabase Management API — six schema and function files
 *     plus the corrected import guard, which is a second file because the file it corrects is
 *     already applied and applied migrations are not rewritten.
 *   - `dataset_entries` holds 600 rows. The stored id set equals the source id set exactly, and all
 *     600 stored instructions are byte-identical to the source by SHA-256.
 *   - `public.dataset_entries_import` is deployed and callable: the production sink wrote through it
 *     and reported `inserted`, then `updated` on three subsequent runs.
 *   - The anonymous role is REFUSED by the real gateway. A write through the production sink returned
 *     PostgreSQL `42501`, "new row violates row-level security policy for table dataset_entries", and
 *     a direct read returned status 200 with **zero rows**.
 *   - Therefore `.rpc()` has executed against a real PostgREST, by way of `SupabaseDatasetEntrySink`.
 *     That is the ONLY builder method in this repository's own code with that status.
 *
 * ── STILL NOT VERIFIED, and nothing below should be read as claiming otherwise ──────────────────────
 *   - `.eq()`, `.in()`, `.order()`, `.limit()`, `.range()`, `.select(cols, { count: "exact" })`,
 *     `.insert(arrayOfRows)`, `.insert().select().single()`, `.maybeSingle()`, and `.update().eq()`.
 *     Every one of these is CALLED by a repository in this directory — counted off comment-stripped
 *     source, not off this comment — is proved against a RECORDING FAKE in
 *     `tests/unit/repositories-supabase.test.ts` and against real SQL in PGlite, and by neither
 *     against a real PostgREST. (There is no `.neq()` in this repository: `FilterHandleLike`
 *     declares no such member and no caller uses one. An earlier version of this list named it, and
 *     the name propagated into the roadmap and the agent instructions before anyone counted the
 *     call sites. It is removed here rather than left standing, because a residual list that names
 *     a method nobody calls overstates the surface that has not been measured.) **`factory.ts`
 *     itself has never been executed**, so no repository it constructs has reached the wire.
 *   - whether an ARRAY insert is returned in request order or reordered by the planner, which
 *     `SupabaseBatchesRepository.create` never assumes: it compares row COUNT and then reads the
 *     batch back through `findById`, which asks for `order("position")`.
 *   - the shape of the error objects actually returned, including whether `code` is `23505` for
 *     the `(validator_id, dataset_entry_id)` uniqueness violation this code branches on. The
 *     mapping is written to the documented SQLSTATE and to no observed payload. The `42501` above was
 *     observed, but it came from the import function's refusal path, not from this directory's
 *     error mapping.
 *   - the project's configured maximum rows per request, which two methods depend on in order to
 *     detect truncation.
 *   - the `authenticated` role specifically. Only `anon` has been exercised against the real gateway
 *     for the dataset table; `authenticated` requires a signed-in user JWT, which no gate probe holds.
 *   - Auth, Storage, Realtime, and every other Supabase-managed behaviour. The schema enables RLS on
 *     every research table and grants nothing to `anon` or `authenticated`; that the gateway ENFORCES
 *     it is now measured for `anon` on one table, and proved by a PGlite test of the SQL for the rest.
 *
 * ── VERIFIED, AND IT HAS ALWAYS BEEN TRUE ─────────────────────────────────────────────────────────
 * `tsc` checks that the real client and the real filter builder still expose every member the narrow
 * client interface declares (see the assertions below), and the unit tests in
 * `tests/unit/repositories-supabase.test.ts` verify the translation and error-mapping logic against a
 * fake with no network.
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
type RealClientMembers = keyof AdminSupabaseClient;

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

/**
 * The same name-level check for `rpc`, which is a member of the CLIENT rather than of a builder.
 *
 * It needs its own assertion because the two above compare against `from(...)`'s return type, and
 * `rpc` is not on that. `researcher-admin-access` added `rpc` to `SupabaseClientLike` for the
 * attempt counter's atomic increment, so the check that guards this directory's compatibility with
 * the real client has to cover it or it would be narrower than the interface it is checking.
 */
type RpcMembersArePresent = [Exclude<keyof SupabaseClientLike, RealClientMembers>] extends [never]
  ? true
  : Exclude<keyof SupabaseClientLike, RealClientMembers>;

// The assertions are consumed here, so a drift in `@supabase/postgrest-js` fails typecheck.
const TABLE_MEMBERS_ARE_PRESENT: TableMembersArePresent = true;
const FILTER_MEMBERS_ARE_PRESENT: FilterMembersArePresent = true;
const RPC_MEMBERS_ARE_PRESENT: RpcMembersArePresent = true;

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
  void RPC_MEMBERS_ARE_PRESENT;
  return admin as unknown as SupabaseClientLike;
}

/**
 * Builds the repositories over one privileged client.
 *
 * The first four are the research repositories, and they are the ONLY ones any public validator
 * request may construct. `signInAttempts` is separated here for the same reason the admin
 * environment contract is separated in `@/lib/admin/env.ts`: it belongs to a path whose authority
 * comes from a request an unauthenticated party can send, and grouping it with the four would make
 * "construct the repositories for a validation submission" quietly also construct the one repository
 * a validation submission has no business holding.
 *
 * The separation is a property of this function's RETURN SHAPE rather than of a convention. A caller
 * destructures what it needs, so a public path that asks for `{ validations }` cannot reach the
 * counter even by accident.
 */
export function createSupabaseRepositories(
  admin: AdminSupabaseClient = createAdminSupabaseClient(),
) {
  const client = asNarrowClient(admin);
  return {
    datasetEntries: new SupabaseDatasetEntriesRepository(client),
    validators: new SupabaseValidatorsRepository(client),
    validations: new SupabaseValidationsRepository(client),
    batches: new SupabaseBatchesRepository(client),
    entryReservations: new SupabaseEntryReservationsRepository(client),
  };
}

/**
 * The repository the researcher sign-in surface uses, and nothing else.
 *
 * A separate constructor rather than a fifth member of {@link createSupabaseRepositories}, so that
 * reading a research repository's return type does not also tell you the counter exists. The reason
 * is not tidiness: the counter is the one repository reachable from an unauthenticated request, and
 * the strongest thing this codebase can say about that is that no other request can name it.
 */
export function createSignInAttemptsRepository(
  admin: AdminSupabaseClient = createAdminSupabaseClient(),
): SignInAttemptsRepository {
  return new SupabaseSignInAttemptsRepository(asNarrowClient(admin));
}

export type SupabaseRepositories = ReturnType<typeof createSupabaseRepositories>;
