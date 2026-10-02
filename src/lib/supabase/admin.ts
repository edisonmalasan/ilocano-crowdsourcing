import "server-only";

import { createSupabaseAdminClient, type SupabaseAdminClient } from "@/lib/supabase/admin-client";

import { getServerEnv, isServiceRoleKeyConfigured } from "@/lib/env/server";

/**
 * PRIVILEGED server access path.
 *
 * `import "server-only"` is the first import deliberately: it is what turns "only server code may
 * use this" from a review convention into a build/runtime failure when a client component imports
 * it. `server-only` also throws when the module is loaded from a client bundle, which is the
 * mechanism the data-access-boundary spec requires.
 *
 * This client BYPASSES Row Level Security. That is the whole point and also the whole danger:
 * every query through it sees and can write rows a public or anon-key request could not, and
 * nothing a validator submits is filtered on the way in.
 *
 * Therefore: server-side code only, and never in a request path whose authority comes from
 * client-supplied input. Not for "just checking whether a validator exists", not for a coverage
 * read triggered by a button. The researcher's own authorization is decided by the protected admin
 * boundary, and the allocation change will re-derive authoritative state server-side before any
 * privileged write. `tests/unit/supabase-clients.test.ts` asserts the `server-only` import is
 * present here.
 */
/**
 * DELEGATION, AND WHY THE MARKER STAYS HERE RATHER THAN MOVING WITH IT
 * -------------------------------------------------------------------
 * This module still carries `import "server-only"` and still reads the environment; what moved to
 * the sibling `./admin-client` is the `createClient` call itself, because the hosted dataset import
 * is a plain-Node operator command and the `server-only` package THROWS outside a React Server
 * Component render. See that module's header for what replaces the marker on its side.
 *
 * The split is the credential's own trust boundary. HERE is where the environment is read, and that
 * module is unreachable from a client bundle. THERE is where a url and a key are turned into a
 * client, which is harmless on its own because it can only ever be handed a key a caller already
 * holds. A function that both read the env and constructed the client could not be loaded by a
 * command; a function that only constructs one can.
 */
export function createAdminSupabaseClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  return createSupabaseAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export type AdminSupabaseClient = SupabaseAdminClient;

/**
 * Whether the privileged credential is configured. Returns a boolean and never the value, so it is
 * safe to call from a diagnostic path. Useful for a startup self-check or an admin-route guard
 * that needs to distinguish "not provisioned" from "misconfigured", without constructing a
 * privileged client just to find out.
 */
export { isServiceRoleKeyConfigured };
