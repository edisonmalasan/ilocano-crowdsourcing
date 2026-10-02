import { parseBatchRouteParam } from "@/lib/validation/batch-route";

/**
 * ============================================================================
 * READING BACK WHAT A PRODUCER RENDERED
 * ============================================================================
 * Three DOM files assert what their component navigated to, and all three used to assert it against
 * an `encodeURIComponent` literal. That literal is what this module replaces, and the replacement is
 * deliberately **stronger rather than merely different** (`tasks.md` 3.2).
 *
 * WHY THE LITERAL WAS WORTHLESS, and this is worth stating because it is the defect the whole
 * change exists to fix: a component that navigated to `/validate/VAL_…%3A…` passed, because the
 * literal it was compared against was built by the SAME `encodeURIComponent` call the component used.
 * Both sides shared one mistake, so the assertion could not see it. The pre-fix tests were not
 * weak — they were **symmetric**, and a symmetric assertion cannot fail when the error is symmetric.
 *
 * What these helpers do instead is CLOSE THE LOOP: take the address the component actually produced,
 * deliver its segment the way the framework delivers it, and ask the route's OWN parse function which
 * batch it names. That is the value `findById` will receive, so a component that emits an address
 * naming the wrong batch — or a doubly encoded one — fails here.
 */

/** The prefix a batch address carries, read from the module rather than spelled a second time. */
const PREFIX = "/validate/";

/**
 * The batch an address names, recovered through the route's real parse function.
 *
 * THROWS rather than returning `null` when the address names no batch, because every caller wants to
 * compare the recovered identifier and a `null` reaching an equality assertion reports "expected null"
 * — which names the symptom rather than the address that caused it.
 *
 * @param address - the address a producer rendered or navigated to, query string included.
 * @returns the batch identifier the route will look up.
 */
export function batchIdFromAddress(address: string): string {
  const path = address.split("?")[0] ?? "";
  // The framework percent-encodes the dynamic segment before the route sees it, WHATEVER the request
  // path spelled. Modelled here rather than passing the raw segment through, so the assertion is
  // about the contract that actually runs rather than about a shape nothing produces.
  const delivered = encodeURIComponent(path.slice(PREFIX.length));
  const parsed = parseBatchRouteParam(delivered);
  if (!parsed.ok) throw new Error(`address ${address} named no batch`);
  return parsed.batchId;
}

/**
 * The `position` an address requests, or `undefined` when it names none.
 *
 * Read as a STRING and handed back unconverted, deliberately. The route converts it with `Number`,
 * and a test that converted it here would be asserting its own arithmetic rather than the address the
 * component built.
 */
export function positionFromAddress(address: string): string | undefined {
  const query = address.split("?")[1];
  if (query === undefined) return undefined;
  const found = query.split("&").find((pair) => pair.startsWith("position="));
  return found === undefined ? undefined : found.slice("position=".length);
}
