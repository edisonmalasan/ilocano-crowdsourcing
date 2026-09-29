import "server-only";

import { createClient } from "@supabase/supabase-js";

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
export function createAdminSupabaseClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      // The service role acts as itself, not as any signed-in user; no session is persisted.
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export type AdminSupabaseClient = ReturnType<typeof createAdminSupabaseClient>;

/**
 * Whether the privileged credential is configured. Returns a boolean and never the value, so it is
 * safe to call from a diagnostic path. Useful for a startup self-check or an admin-route guard
 * that needs to distinguish "not provisioned" from "misconfigured", without constructing a
 * privileged client just to find out.
 */
export { isServiceRoleKeyConfigured };
