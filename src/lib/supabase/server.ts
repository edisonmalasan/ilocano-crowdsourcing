import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getServerEnv } from "@/lib/env/server";

/**
 * Authenticated server access path.
 *
 * This is the path Server Components, Server Actions, and Route Handlers use when they act with a
 * signed-in user's authority. It carries the PUBLIC-SAFE key only — the same key the browser gets.
 * Privilege here comes from the caller's session, not from a stronger credential, which is exactly
 * why it is safe for a request path: nothing it does is wider than what the caller may already do.
 *
 * When the privileged credential is genuinely required, that is `admin.ts` in this directory, and
 * it is a separate module precisely so the two cannot be confused.
 *
 * `cookies()` is awaited because it is async in the App Router; a new client is therefore
 * constructed per request rather than memoized in a module singleton, which would leak one
 * request's session into another.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = getServerEnv();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. A session refresh performed while rendering is
          // best-effort: the read path already used the current cookie, and the refreshed token
          // is persisted by the Server Action or Route Handler that triggered the refresh. Swallowing
          // here is therefore correct and not an unhandled failure.
        }
      },
    },
  });
}

export type ServerSupabaseClient = Awaited<ReturnType<typeof createServerSupabaseClient>>;
