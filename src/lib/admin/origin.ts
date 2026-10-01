import "server-only";

/**
 * Which bucket a researcher sign-in attempt is accounted against.
 *
 * ============================================================================
 * WHY THIS IS ITS OWN MODULE RATHER THAN A PRIVATE FUNCTION IN `actions.ts`
 * ============================================================================
 * It is pure — a header reader in, a string out — so it is testable directly, with no action, no
 * database, and no cookie. That is the reason it is here.
 *
 * The alternative is exporting it from `actions.ts`, and that would be wrong: a `"use server"`
 * module's exports ARE its Server Actions, so an exported helper becomes a function any client can
 * invoke. Making this one callable would let an unauthenticated requester ask the server to classify
 * a header value of their choosing. Keeping it out of the action's surface is not tidiness — it is
 * the boundary.
 *
 * ============================================================================
 * THE HONEST LIMITATION, WHICH CODE CANNOT FIX
 * ============================================================================
 * `x-forwarded-for` is supplied by whoever is in front of this application. On a deployment that
 * does not strip it, an unauthenticated party can choose its own key and therefore its own counter.
 * That is why the spec calls this a RATE LIMIT rather than an authorization control: the
 * authorization decision is the credential comparison, and nothing here participates in it.
 *
 * The fallback bucket is the other half of the same limitation. When no header is present, every such
 * request shares ONE counter — so a deployment that strips neither header both lets a party forge
 * its key AND lets one party exhaust a bucket that others share. Both facts are why the deployment
 * obligation recorded in `docs/ROADMAP.md` exists, and neither is fixable in code, because code
 * cannot know which proxy is in front of it.
 */

/** The bucket every request with no usable forwarded header shares. */
export const NO_FORWARDED_ORIGIN = "no-forwarded-origin";

/**
 * Reads one request header.
 *
 * Typed as `string | null`, matching `Headers.get`. The implementation below nevertheless also
 * accepts `undefined`, because the value comes from a header this project does not control and the
 * alternative is a `TypeError` on a request header shape nobody documented: a `Map`, a stub, or a
 * future adapter returns `undefined` where `Headers` returns `null`, and an unhandled throw here
 * would surface as a 500 on the sign-in page rather than as a bucket.
 */
export type HeaderReader = (name: string) => string | null | undefined;

/**
 * The origin key for one request.
 *
 * Takes a HEADER READER rather than reading `next/headers` itself, so the whole decision is a pure
 * function and a test can drive it with a `Map`.
 *
 * Order matters and is deliberate: `x-forwarded-for` first because it is the header every reverse
 * proxy sets, `x-real-ip` second as the fallback for a proxy that sets only that. In both cases the
 * FIRST comma-separated entry is taken, because a proxy prepends the client it observed and appends
 * whatever came before it — so the first entry is the closest thing to the client that is trustworthy
 * at all, and taking the last would take the proxy's own address.
 */
export function resolveOriginKey(get: HeaderReader): string {
  const forwarded = firstEntry(get("x-forwarded-for"));
  if (forwarded !== null) return forwarded;

  const real = firstEntry(get("x-real-ip"));
  if (real !== null) return real;

  return NO_FORWARDED_ORIGIN;
}

/** The first comma-separated entry, trimmed, or `null` when there is nothing usable. */
function firstEntry(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const first = raw.split(",")[0]?.trim();
  return first === undefined || first === "" ? null : first;
}
