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
 *   sameSite   — "strict", because the requirement says the session "SHALL be restricted from being
 *                sent on cross-site requests" and `strict` is the only value that does exactly that.
 *
 *                =================================================================================
 *                THIS WAS "lax", AND AN INDEPENDENT VERIFICATION PASS CAUGHT IT
 *                =================================================================================
 *                The first version shipped `lax`, justified by a source comment that said `lax` "blocks
 *                the cross-site POST that would carry it. It deliberately still allows a top-level GET
 *                navigation to carry it". That last clause is the problem: a cross-site
 *                `<a href="…/researcher/…">`, or any third-party redirect, is a top-level GET and
 *                **does** carry the cookie. So the requirement's sentence was not satisfied, and it
 *                was discharged by a comment rather than by the spec — the requirement is ADDED by
 *                this change, `proposal.md` records no MODIFIED capabilities, and so there was nowhere
 *                for the deviation to live except prose.
 *
 *                `strict` is the fix rather than a rewording of the requirement, because the
 *                requirement is the safer of the two and nothing here needs the exception. `strict`
 *                drops the cookie from a cross-site top-level navigation; the cost is that a
 *                researcher arriving from an external link is treated as signed out and must sign in
 *                again. For a server-rendered area reached only by typing its own address or by an
 *                in-app link, that is the correct trade. Rewriting an approved requirement to match a
 *                narrower implementation is the move that should attract suspicion, not the one taken
 *                here.
 *
 *                The forward constraint D6 records is therefore RETAINED and is now belt and braces
 *                rather than load-bearing: any future researcher write must still be a POST that
 *                re-checks the session server-side, because `strict` is a browser default that a
 *                non-browser client is not obliged to honour.
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
  readonly sameSite: "strict";
  readonly path: string;
  readonly secure: boolean;
  readonly maxAge: number;
} {
  return {
    httpOnly: true,
    // Not negotiable, and not a default. `tests/unit/admin-guard.test.ts` pins this value against the
    // requirement's own words, because a change from `strict` to `lax` is the kind of edit that looks
    // like loosening rather than like breaking anything.
    sameSite: "strict",
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
