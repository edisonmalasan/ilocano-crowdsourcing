/**
 * Client-beacon shape guard for the retry-exhaustion signal.
 *
 * Pure module: no I/O, no environment, no Supabase import, no `server-only` marker — the route
 * that calls it runs on the server, but the shape rule itself is testable anywhere.
 *
 * The beacon carries ONLY a random id minted by the browser when its save queue gives up
 * retrying. The id is validated for SHAPE alone (length and alphabet): nothing about its
 * content is interpreted, nothing is joined to a response, and the recorder stores at most a
 * digest of it, never the id itself.
 */

/** Beacon ids are 16–64 chars over an unreserved alphabet, so they travel safely in JSON. */
export const BEACON_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** Narrows an arbitrary parsed-JSON value to a well-shaped beacon id, or `null`. */
export function parseBeaconId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return BEACON_ID_PATTERN.test(raw) ? raw : null;
}
