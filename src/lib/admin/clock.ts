import "server-only";

/**
 * The server's clock, read once per request.
 *
 * =================================================================================================
 * WHY THIS EXISTS INSTEAD OF AN INLINE `Date.now()`
 * =================================================================================================
 * Every researcher route needs the current instant to decide whether a presented session has expired
 * or overstayed its configured lifetime, and none of them should invent it: they are handed `nowMs` so
 * that a test can pin it, and the only thing this function supplies is the production value for that
 * parameter.
 *
 * It is a separate module for one concrete reason. `react-hooks/purity` rejects `Date.now()` written
 * directly in a component body, and it is RIGHT to: a component that re-renders must produce the same
 * output, and a bare clock read makes expiry depend on when React happened to render rather than on
 * when the request arrived. Suppressing that rule with a comment would leave a genuinely misleading
 * signal in the file.
 *
 * A Server Component's body IS a request handler — Next.js invokes it once per request and discards
 * the result — so the impurity the rule guards against cannot occur here. Naming the read in a
 * non-component module states that once, in one place, instead of arguing it on every route.
 */

/** Epoch milliseconds, from the server's clock. */
export function serverNowMs(): number {
  return Date.now();
}
