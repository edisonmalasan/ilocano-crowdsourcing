/**
 * The researcher area's route paths, as literals.
 *
 * ============================================================================
 * WHY THEY ARE NOT IN `actions.ts`
 * ============================================================================
 * A `"use server"` module may export only async functions — Next.js rejects any other export,
 * because every export of such a module becomes a callable endpoint. The sign-in page and the
 * refusal surface both need these two strings, and neither may import from an action module.
 *
 * Putting them here rather than inline at each use also gives them ONE definition, which matters
 * for a security-relevant path: `actions.ts` redirects to `/researcher` on success and
 * `cookie.ts` scopes the session cookie to `/researcher`, and a value that had to be written twice
 * would be free to drift. A cookie scoped to a path the redirect does not use still works; a cookie
 * scoped to a path the guard does not check is a session nobody verifies.
 *
 * They are literals rather than a builder because there are three of them and no parameter. A
 * template function for two fixed strings is a layer that exists to be misread.
 */

/** Where a signed-in researcher lands, and the root of the guarded area. */
export const RESEARCHER_HOME = "/researcher";

/** Where a signed-out researcher lands, and where the sign-in surface lives. */
export const RESEARCHER_SIGN_IN = "/researcher/sign-in";

/** Where a signed researcher downloads the research export as one dated ZIP. */
export const RESEARCHER_EXPORT = "/researcher/export";

/**
 * The cookie's path scope.
 *
 * Declared here rather than in `cookie.ts` for the same reason the two routes are: it must be the
 * same value the area actually lives at, and there is now exactly one place a reader can check that
 * it is.
 */
export const RESEARCHER_AREA_PATH = "/researcher";
