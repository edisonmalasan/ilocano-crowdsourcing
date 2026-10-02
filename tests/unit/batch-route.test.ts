import { beforeAll, describe, expect, it, vi } from "vitest";

import { batchRouteHref, batchRoutePath, parseBatchRouteParam } from "@/lib/validation/batch-route";
import { defaultBatchId } from "@/lib/allocation/allocate-batch";
import { batchIdSchema } from "@/schemas/batch";

/**
 * `server-only` cannot be imported under Vitest, so the marker is stubbed and the module that
 * imports it is pulled in lazily — the same shape `validation-session-service.test.ts` uses, and for
 * the same reason. Recorded here rather than left implicit, because a test that silently cannot
 * import its subject reports "no tests" rather than a failure.
 */
vi.mock("server-only", () => ({}));

type SessionSchema = (typeof import("@/lib/validation/session"))["validationSessionRequestSchema"];

let validationSessionRequestSchema: SessionSchema;

beforeAll(async () => {
  validationSessionRequestSchema = (await import("@/lib/validation/session"))
    .validationSessionRequestSchema;
});

/**
 * ============================================================================
 * THE BATCH ROUTE CONTRACT
 * ============================================================================
 * The acceptance witness for this module is a ROUND TRIP over a real stored identifier, and the
 * reason it is a round trip rather than a pair of string comparisons is recorded in `design.md` D5:
 * the pre-fix tests asserted the correct-looking href and passed, because every one of them
 * compared a literal against a literal. A test that cannot fail is not a test, so each assertion
 * below goes through the real parse function.
 *
 * ============================================================================
 * THE FIXTURE, AND WHY IT IS NOT INVENTED
 * ============================================================================
 * `REAL_BATCH` is copied from a row in the project's own hosted `validation_batches` table, read
 * with the service key over the real wire. It is used here rather than a tidier hand-written
 * identifier because a hand-written sample would reproduce the original defect in a smaller size:
 * the defect only appears for an identifier containing characters a URL must encode, and a fixture
 * with no such characters makes every assertion below true by accident.
 */

/** Exactly the identifier stored in the live table, colons and all. */
const REAL_BATCH = "VAL_720f59cd-2026-10-02T19:46:56.320Z";

/** An identifier with nothing a URL must encode, so the round trip must be the identity. */
const PLAIN_BATCH = "VAL_fresh99";

/**
 * The segment the framework hands the route for a path produced by `batchRoutePath`.
 *
 * Measured on Next.js 16.3.6 against this repository's own route: the dynamic route parameter
 * arrives PERCENT-ENCODED even when the request path spelled the characters literally, so the
 * consumer must decode once regardless. Modelling that here — rather than passing the raw segment —
 * is what makes these tests about the real contract instead of about a shape nothing produces.
 */
function deliveredSegment(path: string): string {
  return encodeURIComponent(path.slice("/validate/".length));
}

describe("a stored identifier round-trips through the route unchanged", () => {
  it("recovers a production-shaped identifier character for character", () => {
    // EQUALITY, not a substring: a partial fix — one that decoded the date but not the time, or
    // that trimmed a character — would satisfy a `toContain` and fail this.
    const path = batchRoutePath(REAL_BATCH);
    const parsed = parseBatchRouteParam(deliveredSegment(path));

    expect(parsed).toEqual({ ok: true, batchId: REAL_BATCH });
  });

  it("is the IDENTITY for an identifier with no reserved characters", () => {
    // Otherwise the round trip could be accidentally true only for the encoding case — a parser
    // that unconditionally mangles its input would satisfy the test above and this one would
    // catch it.
    const path = batchRoutePath(PLAIN_BATCH);
    const parsed = parseBatchRouteParam(deliveredSegment(path));

    expect(parsed).toEqual({ ok: true, batchId: PLAIN_BATCH });
    // Stated directly, because it is the property: encoding the plain identifier is the identity,
    // so the single decode it goes through changes nothing.
    expect(deliveredSegment(path)).toBe(PLAIN_BATCH);
  });

  it("opens a stored batch by its own address, character for character", () => {
    // The second scenario of the requirement, expressed as the identity it claims rather than as a
    // lookup: a repository handed `parsed.batchId` asks for the row that `REAL_BATCH` names.
    const asked = new Set<string>([REAL_BATCH]);
    const segment = deliveredSegment(batchRoutePath(REAL_BATCH));

    const parsed = parseBatchRouteParam(segment);
    expect(parsed.ok).toBe(true);
    expect(asked.has(parsed.ok ? parsed.batchId : "")).toBe(true);
  });

  it("emits the identifier as it is stored, with nothing encoded by the producer", () => {
    // The producer half, asserted as an ABSENCE: if this module pre-encoded, `REAL_BATCH` would not
    // appear literally in the path and the round trip above would still pass — because the test above
    // re-encodes whatever the module produced. This is the assertion that closes that hole.
    expect(batchRoutePath(REAL_BATCH)).toBe(`/validate/${REAL_BATCH}`);
  });
});

describe("a segment that cannot be decoded once is refused; one that can is not decoded twice", () => {
  /**
   * Seeds a doubly encoded segment whose value WOULD resolve if a second decode were attempted.
   *
   * This is what turns "the parser refuses" into a test rather than a restatement of the code: a
   * parser that decoded twice would return a real identifier here, and the assertion below would
   * fail. A fixture that merely produced garbage on a second decode could not tell the two
   * implementations apart.
   */
  const TWICE_ENCODED_REAL_BATCH = encodeURIComponent(encodeURIComponent(REAL_BATCH));

  it("resolves a doubly encoded segment only ONCE, and never to the batch it appears to name", () => {
    // CORRECTED BY MEASUREMENT, twice, and both corrections point the same way.
    //
    // The first draft asserted that a doubly encoded segment is REFUSED. It is not, and it should
    // not be: `%253A` is *valid* percent-encoding, so one decoding of it succeeds and yields
    // `VAL_…19%3A46%3A56.320Z`. The spec's own wording is precise about this and my first draft was
    // not: it says the route "performs no lookup against the REPEATEDLY DECODED value", which is a
    // statement about the single decode, not about rejecting a decodable segment.
    //
    // So the refusal that matters is the one layer up. The control below is what makes this a test:
    // it asserts that a second decode WOULD have recovered the stored identifier, so a parser that
    // decoded twice would produce a real batch here and fail the assertion after it.
    expect(decodeURIComponent(TWICE_ENCODED_REAL_BATCH)).not.toBe(REAL_BATCH);
    expect(decodeURIComponent(decodeURIComponent(TWICE_ENCODED_REAL_BATCH))).toBe(REAL_BATCH);

    // ONE decode, and the value is the still-encoded half rather than the stored identifier.
    const parsed = parseBatchRouteParam(TWICE_ENCODED_REAL_BATCH);
    expect(parsed).toEqual({ ok: true, batchId: "VAL_720f59cd-2026-10-02T19%3A46%3A56.320Z" });

    // The batch it appears to name is NOT found, which is the requirement's "no lookup against the
    // repeatedly decoded value" observed where it has consequences.
    const storedIds = new Set([REAL_BATCH]);
    expect(storedIds.has(parsed.ok ? parsed.batchId : "")).toBe(false);
  });

  it("refuses a segment that is not valid percent-encoding, without throwing", () => {
    // `%ZZ` is not a valid escape, so `decodeURIComponent` throws `URIError`. The requirement is that
    // the route RENDERS its not-found state rather than failing, so the refusal must be a value and
    // not an exception.
    expect(parseBatchRouteParam("%")).toEqual({ ok: false, reason: "not_a_batch_id" });
    expect(parseBatchRouteParam("%ZZ")).toEqual({ ok: false, reason: "not_a_batch_id" });
    expect(parseBatchRouteParam("VAL_%E0%A4%A")).toEqual({ ok: false, reason: "not_a_batch_id" });
  });

  it("refuses an empty segment, which decoding alone would accept", () => {
    // `decodeURIComponent("")` succeeds and yields `""`, so without this the parser would hand the
    // lookup an identifier no row can hold. Asserted against `decodeURIComponent` directly, because
    // "the empty string decodes fine" is the fact that makes the check necessary.
    expect(decodeURIComponent("")).toBe("");
    expect(parseBatchRouteParam("")).toEqual({ ok: false, reason: "not_a_batch_id" });
  });

  it("returns a whitespace-padded segment's value VERBATIM rather than trimming it", () => {
    // CORRECTED BY MEASUREMENT, and the correction matters because the first draft of this test
    // asserted the opposite and was wrong. `%20VAL_a81d92c1` is VALID percent-encoding, so one
    // decoding of it succeeds and yields `" VAL_a81d92c1"` — a well-formed segment, not a refused
    // one. Asserting a refusal here would have required the parser to reject a decodable segment,
    // which is not what the requirement says.
    //
    // What the requirement forbids is REPAIR: the parser must not trim the padding off and hand the
    // lookup `VAL_a81d92c1`. So the assertion is that the whitespace SURVIVES the decode, which is
    // precisely what makes the lookup come back empty.
    for (const [segment, expected] of [
      ["%20VAL_a81d92c1", " VAL_a81d92c1"],
      ["VAL_a81d92c1%20", "VAL_a81d92c1 "],
      ["%25", "%"],
    ] as const) {
      expect(parseBatchRouteParam(segment), `segment ${segment}`).toEqual({
        ok: true,
        batchId: expected,
      });
      // …and the value is not the stored identifier any row holds, which is the property.
      expect(expected).not.toBe("VAL_a81d92c1");
    }
  });
});

describe("CAN FIRE — a pre-encoding producer breaks the round trip", () => {
  /**
   * The producer shape this change exists to remove, written out and asserted.
   *
   * Every assertion in the first two describes could be satisfied by code that does nothing at all,
   * because they compare OUR two functions against each other. This drives the same requirement
   * through a DELIBERATELY WRONG producer — one that calls `encodeURIComponent` on the identifier
   * before handing it over — and asserts that the batch it appears to name is then NOT found.
   * Without it, nothing in the suite contradicts the possibility that the contract is untested.
   */
  const preEncodingPath = (batchId: string): string => `/validate/${encodeURIComponent(batchId)}`;

  it("yields an identifier no stored row holds, so the lookup comes back empty", () => {
    const path = preEncodingPath(REAL_BATCH);
    const parsed = parseBatchRouteParam(deliveredSegment(path));

    // CORRECTED BY MEASUREMENT, and this is the sharpest thing in this file. The first draft of this
    // test asserted `parsed.ok === false`, on the reasoning that a twice-encoded segment "is not a
    // valid single decoding". It is not: it is a perfectly VALID single decoding, of the wrong
    // string. The pre-encoding producer's segment decodes to `VAL_…19%3A46%3A56.320Z`, which is
    // well-formed, so a correct parser accepts it — and the batch it names does not exist.
    //
    // So the pre-encoding defect is NOT caught by the parser, and this design must not claim it is.
    // What makes the wrong producer fail is that the recovered value is not the stored identifier,
    // and the refusal happens one layer up in the lookup returning nothing. Asserted here at the
    // layer where it is actually true.
    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.batchId : "").not.toBe(REAL_BATCH);

    // The consequence, stated as the lookup that actually happens.
    const storedIds = new Set([REAL_BATCH]);
    expect(storedIds.has(parsed.ok ? parsed.batchId : "")).toBe(false);
  });

  it("would STILL fail after a second decode, which is why the contract must not do one", () => {
    // Recorded so the reason the parser refuses is legible: the only thing that would rescue a
    // pre-encoding producer is a repair the requirement forbids, and adding it would make a
    // second, differently encoded spelling of the same address open the batch.
    const segment = deliveredSegment(preEncodingPath(REAL_BATCH));
    expect(decodeURIComponent(decodeURIComponent(segment))).toBe(REAL_BATCH);
  });
});

describe("no identifier the platform accepts can address a route outside /validate", () => {
  /**
   * THE PROTECTION THIS CHANGE HAD TO REBUILD, and it is worth reading rather than inheriting.
   *
   * The pre-change producers called `encodeURIComponent`, which incidentally blocked a client-side
   * route injection: an identifier containing `/` could not produce an address leaving `/validate`.
   * This change removes that call because it IS the defect, so it removes the incidental protection
   * with it — and `min(1)` alone does not restore it, since `batch/../../admin` is non-empty.
   *
   * So the invariant now lives in `batchIdSchema`, and these assertions are the ones that go red if
   * it is deleted. They are driven against the schema the ROUTE parses through rather than against
   * `batchRoutePath`, because the honest claim is not "the builder refuses an identifier" — it is
   * "no identifier this platform accepts can escape the path".
   */
  const HOSTILE = ["batch/../../admin", "../admin", "a/b", "/admin", "a//b"];

  it("refuses every identifier carrying a path separator, at the schema", () => {
    for (const hostile of HOSTILE) {
      expect(batchIdSchema.safeParse(hostile).success, `id ${hostile} was accepted`).toBe(false);
    }
  });

  it("refuses them at the route's OWN request schema, not merely at the id schema", () => {
    // `openValidationSession` parses through `validationSessionRequestSchema`, so a segment that
    // cannot satisfy THAT can never reach a lookup — whichever layer catches it.
    for (const hostile of HOSTILE) {
      expect(
        validationSessionRequestSchema.safeParse({ batchId: hostile }).success,
        `route request schema accepted ${hostile}`,
      ).toBe(false);
    }
  });

  it("is ONE rejection rather than two independent ones", () => {
    // Asserted because two schemas catching the same value for different reasons is a coincidence
    // that editing either one can break, and the claim "the route refuses it" is only meaningful
    // while the route's own parser is the thing refusing.
    for (const hostile of HOSTILE) {
      expect(validationSessionRequestSchema.safeParse({ batchId: hostile }).success).toBe(
        batchIdSchema.safeParse(hostile).success,
      );
    }
  });

  it("leaves every identifier the platform can actually MINT accepted", () => {
    // The control that makes the three refusals above meaningful. A rule that also rejected real
    // identifiers would close the injection and open EVERY batch in storage — a worse failure, and
    // one these refusals alone would report as success.
    for (const validatorId of ["VAL_a81d92c1", "VAL_00000000", "VAL_ffffffff"] as const) {
      for (const instant of [
        "2026-09-30T20:14:03.117Z",
        "2026-10-02T19:46:56.320Z",
        "2026-12-31T23:59:59.999Z",
      ]) {
        const minted = defaultBatchId(validatorId, new Date(instant));
        expect(minted.includes("/"), `minted id ${minted} contains a separator`).toBe(false);
        expect(batchIdSchema.safeParse(minted).success, `minted id ${minted} refused`).toBe(true);
        // And the round trip still holds for a minted id, which is the point of the whole file.
        const parsed = parseBatchRouteParam(
          encodeURIComponent(batchRoutePath(minted).slice("/validate/".length)),
        );
        expect(parsed).toEqual({ ok: true, batchId: minted });
      }
    }
  });
});

describe("the address a producer navigates to", () => {
  it("is the bare path when no position is requested", () => {
    // An absent position and position one are DIFFERENT requests: the route resolves an absent
    // position against the order the server chose, so defaulting would silently change which entry
    // a stale link lands on.
    expect(batchRouteHref(REAL_BATCH)).toBe(batchRoutePath(REAL_BATCH));
  });

  it("names the requested position as a query, and the path is untouched by it", () => {
    const href = batchRouteHref(REAL_BATCH, 4);

    expect(href).toBe(`/validate/${REAL_BATCH}?position=4`);
    // The path half still round-trips, because the route reads the segment and the query separately.
    const path = href.split("?")[0] as string;
    expect(parseBatchRouteParam(deliveredSegment(path))).toEqual({ ok: true, batchId: REAL_BATCH });
  });

  it("round-trips the production-shaped identifier in every position", () => {
    // Position 0 and position 1 are both reachable from the producers — `validation-form.tsx`
    // navigates to `position + 1` and a finished batch navigates with none at all — so neither is
    // assumed correct and neither is special-cased here.
    for (const position of [0, 1, 2]) {
      const path = (batchRouteHref(REAL_BATCH, position).split("?")[0] ?? "") as string;
      expect(parseBatchRouteParam(deliveredSegment(path))).toEqual({
        ok: true,
        batchId: REAL_BATCH,
      });
    }
  });
});
