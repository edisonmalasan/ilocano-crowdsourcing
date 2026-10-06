/**
 * ============================================================================
 * THE BATCH ROUTE CONTRACT — how a stored batch id becomes a URL and back
 * ============================================================================
 * One module, three functions, and **no imports at all**. The absence of imports is the design,
 * not an accident of where the file ended up:
 *
 *   - It must be usable by four client-side producers (`start-batch.tsx`,
 *     `validation-form.tsx`, `finished-batch.tsx`) and by a Server Component (`page.tsx`), so it
 *     cannot be `server-only` and cannot reach the Supabase client.
 *   - It must not import a schema. The dependency-free domain-module standard records the
 *     reason: the one function that must never grow a dependency cannot import a module that
 *     itself has dependencies.
 *
 * ============================================================================
 * WHAT THE CONTRACT IS, IN ONE SENTENCE
 * ============================================================================
 * **A producer emits the identifier exactly as it is stored, and the consumer decodes it exactly
 * once.** Encoding is the transport's business.
 *
 * ============================================================================
 * WHY THE OTHER SHAPE WAS THE DEFECT
 * ============================================================================
 * Measured against Next.js 16.3.6 on this repository's own route: the dynamic route parameter
 * arrives PERCENT-ENCODED **even when the request path spelled the colons literally**, so the
 * consumer must decode once no matter how the address was written. Three of the four producers
 * additionally called `encodeURIComponent`, which composed with the framework's own encoding into
 * `%253A` — a segment that decodes once to `VAL_x-%3A-...`, an identifier that exists in no row.
 *
 * The pre-fix shape therefore required the two sides to hold *complementary* knowledge — the
 * producer encodes and the consumer does not — and complementary knowledge cannot be enforced
 * locally: a forgotten producer produced an address that silently resolved to nothing.
 *
 * This shape inverts that. The producer knows nothing about encoding, so a producer that forgets
 * this module still produces an address that works; and the single decode is the identity for an
 * identifier with no reserved characters, so the consumer has no case in which it must guess
 * whether it is looking at an encoded segment or a literal one.
 *
 * ============================================================================
 * WHY A DOUBLY ENCODED ADDRESS IS NOT RESOLVED
 * ============================================================================
 * `parseBatchRouteParam` catches the `URIError` that a malformed segment throws and returns a
 * refusal. There is deliberately **no second decoding attempt and no hand-written `%`-stripping
 * fallback**.
 *
 * A fallback would be the only code on this path able to resolve a twice-encoded segment to a real
 * batch, and it would do so on behalf of no requirement. Its cost is stated rather than hidden: a
 * doubly encoded address stops working. That is the right trade, because a doubly encoded address
 * has exactly one meaning — a client that encoded twice — and this platform ships no such client.
 *
 * **AND NOTE WHERE THE REFUSAL ACTUALLY HAPPENS, because it is not here.** MEASURED during the
 * Apply that wrote this comment: a doubly encoded segment is *valid* percent-encoding, so one
 * decoding of it SUCCEEDS and yields `VAL_…19%3A46%3A56.320Z`. This function therefore ACCEPTS it —
 * correctly, because decoding it twice is exactly what the contract forbids. The batch that value
 * appears to name does not exist, so the route reports its not-found state one layer up.
 *
 * So a producer that pre-encodes is NOT caught by this parser; it is caught by the lookup finding
 * nothing. An identifier *shape* check here would fail it sooner, and was rejected on purpose: this
 * module is about transport and imports nothing by design, and `session-service.ts` already parses
 * the identifier through `validationSessionRequestSchema`, so a shape check here would be a second
 * place holding the same rule. The participant-visible outcome is identical either way.
 */

/** The route a batch is served from. A constant so no site can spell the prefix its own way. */
const BATCH_ROUTE_PREFIX = "/validate/";

/** The query key the route reads a requested sentence position from. */
const POSITION_QUERY_KEY = "position";

/**
 * What a route segment turned out to be.
 *
 * A discriminated result rather than `string | null`, so a caller that forgets to branch is a
 * TYPE ERROR instead of a lookup against `null`.
 */
export type ParsedBatchRouteParam =
  | { readonly ok: true; readonly batchId: string }
  | { readonly ok: false; readonly reason: "not_a_batch_id" };

/**
 * The path a batch is served from, carrying the identifier EXACTLY as it is stored.
 *
 * No `encodeURIComponent` here, and that omission is the whole of the producer half of the
 * contract: colons are legal characters in a URL path segment, so a raw identifier is a legal
 * path, and letting the transport encode it is what keeps the read side to a single decode.
 */
export function batchRoutePath(batchId: string): string {
  return `${BATCH_ROUTE_PREFIX}${batchId}`;
}

/**
 * The address a producer navigates to, optionally naming the position to open at.
 *
 * `position` is omitted rather than defaulted to `1` when it is not supplied, because an absent
 * position and position one are different requests to the route: the route resolves an absent
 * position against the order the server chose, which is how a stale link lands on the next entry
 * that still needs an answer rather than on nothing.
 */
export function batchRouteHref(batchId: string, position?: number): string {
  const path = batchRoutePath(batchId);
  return position === undefined ? path : `${path}?${POSITION_QUERY_KEY}=${position}`;
}

/**
 * Recovers a batch identifier from the dynamic route parameter.
 *
 * EXACTLY ONE decoding step, which is what makes the round trip `parse(batchRoutePath(id)) === id`
 * for an identifier with or without reserved characters alike.
 *
 * A segment that is not valid percent-encoding throws `URIError` out of `decodeURIComponent`; that
 * is caught here and reported as the same refusal, so a malformed address RENDERS the route's
 * not-found state instead of failing the request. The empty string is refused too, because
 * `decodeURIComponent("")` succeeds and would otherwise hand the lookup an identifier no row can
 * hold.
 */
export function parseBatchRouteParam(segment: string): ParsedBatchRouteParam {
  try {
    const batchId = decodeURIComponent(segment);
    if (batchId === "") return { ok: false, reason: "not_a_batch_id" };
    return { ok: true, batchId };
  } catch {
    return { ok: false, reason: "not_a_batch_id" };
  }
}
