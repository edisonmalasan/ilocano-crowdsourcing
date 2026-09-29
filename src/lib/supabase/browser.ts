import { createBrowserClient } from "@supabase/ssr";

import { getClientEnv } from "@/lib/env/client";

/**
 * Browser access path — public-safe credential only.
 *
 * This module is the only Supabase constructor a client component may reach. It is built from
 * `NEXT_PUBLIC_*` values alone, and it deliberately re-exports neither the server nor the
 * privileged constructor: re-exporting would make a privilege escalation a one-line import away
 * from any client component.
 *
 * It does NOT import `@/lib/env/server`. That module is `server-only` and reads the
 * service-role credential; importing it here would put the secret in the client bundle's
 * dependency graph. `tests/unit/supabase-clients.test.ts` asserts at the source level that this
 * file contains no reference to the service-role environment accessor.
 *
 * The key used here is the publishable/anon key, which is public by design and enforced by Row
 * Level Security, not by secrecy.
 */
export function createBrowserSupabaseClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getClientEnv();

  return createBrowserClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export type BrowserSupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;
