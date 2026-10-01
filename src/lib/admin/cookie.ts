import "server-only";

import { cookies } from "next/headers";

import { RESEARCHER_SESSION_MAX_LIFETIME_SECONDS } from "@/lib/admin/session";
import { RESEARCHER_AREA_PATH } from "@/lib/admin/routes";

/**
 * The researcher session cookie.
 *
 * ============================================================================
 * EVERY ATTRIBUTE HERE IS A REQUIREMENT, NOT A DEFAULT
 * ============================================================================
 * The spec asks for a session the browser "cannot read or forge", which "SHALL be marked so that page
 * scripts cannot read it" and "SHALL be restricted from being sent on cross-site requests". Each flag
 * below is one of those words:
 *
 *   httpOnly   — page scripts cannot read it. A cookie an injected script can read is a credential
 *                an injected script can steal, and this is the one credential in the system that
 *                grants access.
 *   sameSite   — "lax" blocks the cross-site POST that would carry it. It deliberately still allows a
 *                top-level GET navigation to carry it, which is why D6 records the forward constraint:
 *                any future researcher WRITE must be a POST that re-checks the session server-side and
 *                must not be reachable by a link.
 *   path       — scoped to the researcher area, so the session is not attached to every public
 *                validator request this origin serves. The validators' own anonymity argument against
 *                cookies applies to their identifier, not to this value, but sending a researcher
 *                session alongside a public request is still more exposure than the feature needs.
 *   secure     — follows the environment rather than being hardcoded, because a hardcoded `true`
 *                breaks plain-HTTP local testing and a hardcoded `false` ships a researcher cookie
 *                over plaintext. `NODE_ENV === "production"` is the one signal Next.js guarantees
 *                matches where the code is actually running.
 *   maxAge     — the configured session lifetime. It matches the `exp` INSIDE the signed payload, so
 *                the two agree, and neither extends on use: nothing re-signs a session.
 */

/**
 * The cookie's name.
 *
 * Prefixed so it cannot collide with the interface-locale cookie or anything a future public feature
 * adds, and named for the AREA rather than the privilege — the same reason the modules are called
 * `researcher` and not `admin` (D7), since `admin` in this repository already means the service-role
 * database client.
 */
export const RESEARCHER_SESSION_COOKIE = "sadino_researcher_session";

/**
 * Builds the cookie attributes.
 *
 * A function rather than a constant so the `secure` decision is made at the moment the cookie is
 * written, and so a test can assert the flags without depending on the ambient `NODE_ENV` of the
 * process running it.
 */
export function researcherSessionCookieOptions(): {
  readonly httpOnly: true;
  readonly sameSite: "lax";
  readonly path: string;
  readonly secure: boolean;
  readonly maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: RESEARCHER_AREA_PATH,
    secure: process.env.NODE_ENV === "production",
    maxAge: RESEARCHER_SESSION_MAX_LIFETIME_SECONDS,
  };
}

/**
 * The session the browser presented, or `null`.
 *
 * `null` covers three cases that MUST stay indistinguishable to the caller: no cookie, an empty
 * cookie, and a cookie this server did not issue. {@link resolveResearcherAccess} refuses all three
 * the same way, and it is the only thing that decides — this function reads a string and nothing
 * else, so there is no path by which a caller could treat "no cookie" as anything but a refusal.
 */
export async function readResearcherSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(RESEARCHER_SESSION_COOKIE)?.value ?? null;
}

/** Writes the session. `httpOnly`, `lax`, and scoped to `/researcher`, per the notes above. */
export async function writeResearcherSessionCookie(session: string): Promise<void> {
  (await cookies()).set(RESEARCHER_SESSION_COOKIE, session, researcherSessionCookieOptions());
}

/**
 * Clears the session by overwriting it with an immediately-expiring cookie.
 *
 * It MUST be the same `path` the session was written with, or the browser keeps the original: a
 * delete targeted at a narrower path leaves a live copy at the wider one, and the code would report a
 * successful sign-out while the old session continued to work. This is why
 * `researcherSessionCookieOptions()` is the single source of both attributes rather than two literals.
 */
export async function clearResearcherSessionCookie(): Promise<void> {
  (await cookies()).set(RESEARCHER_SESSION_COOKIE, "", {
    ...researcherSessionCookieOptions(),
    maxAge: 0,
  });
}
