import { createClient } from "@supabase/supabase-js";

/**
 * The one place a Supabase client is built from a service-role key.
 *
 * NO `import "server-only"` HERE, DELIBERATELY
 * --------------------------------------------
 * The `server-only` package's entry point THROWS when it is evaluated outside a React Server
 * Component render, so a module carrying it cannot be loaded by a plain-Node process. The hosted
 * dataset import is a plain-Node operator command (`scripts/import-dataset.ts`), and it needs a
 * privileged client; putting the constructor behind the marker would make that command impossible
 * to write without giving the credential to a client bundle.
 *
 * What replaces the marker is NOT nothing:
 *
 *  1. The ENV READING is still behind it. `@/lib/env/server` carries the marker, so the module that
 *     resolves `SUPABASE_SERVICE_ROLE_KEY` cannot be reached from a browser bundle. This module
 *     takes the url and key as ARGUMENTS precisely so it never imports that module itself — the
 *     only caller that can produce a key is one that already passed the marker.
 *  2. The BOUNDARY RULE lists this specifier in `eslint.config.mjs`, so a client component that
 *     imports it fails `pnpm run lint` by name.
 *  3. A unit test enumerates every `createClient` call site under `src/` and fails unless exactly
 *     ONE of them is handed a service-role key. That is what keeps "one privileged construction"
 *     a property rather than a convention.
 *
 * The consequence to state plainly: a reader of this file sees a function whose parameter is a
 * secret, with no marker of its own. That is why the arguments are two strings and not a config
 * object — a narrower surface is the point.
 */

/**
 * Builds a Supabase client from an explicit url and key.
 *
 * Takes the credential rather than reading it, so the privileged env module stays behind its own
 * marker. The caller is responsible for having obtained the key legitimately; this function's only
 * job is to construct the client and to refuse to hold a session.
 *
 * The three `auth` settings are load-bearing rather than stylistic. The service role acts as
 * itself, not as any signed-in user, so there is no session to persist, no token to refresh, and
 * no URL fragment to pick up. A client that persisted a session here would write the service-role
 * session somewhere the browser could later read it.
 */
export function createSupabaseAdminClient(url: string, key: string) {
  return createClient(url, key, {
    auth: {
      // The service role acts as itself, not as any signed-in user; no session is persisted.
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * The real client's type, named once so the two construction sites agree.
 *
 * This is the concrete `SupabaseClient`, deliberately NOT `SupabaseClientLike`: this function has
 * no test that substitutes a fake — a fake here would prove only that a fake was passed through —
 * so the narrow interface would buy nothing and would hide the `TS2589` instantiation problem that
 * `src/lib/repositories/supabase/client.ts` documents in full.
 */
export type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
