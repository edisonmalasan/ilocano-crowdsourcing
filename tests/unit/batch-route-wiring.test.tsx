import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultBatchId } from "@/lib/allocation/allocate-batch";
import { translatorFor } from "@/lib/i18n/copy";
import { batchRoutePath } from "@/lib/validation/batch-route";

/**
 * `server-only` cannot be imported under Vitest, so the marker is stubbed. Everything below it is
 * REAL: the real route component, the real `openValidationSession`, the real `resolveSessionEntry`.
 */
vi.mock("server-only", () => ({}));

/**
 * ============================================================================
 * WHAT THE ROUTE HANDS THE BATCH LOOKUP — the one wiring claim no unit test can make
 * ============================================================================
 * `validation-routes.test.tsx` mocks `openValidationSession` outright, so it can prove what the route
 * RENDERS from an outcome but not what it asks for. `validation-session-service.test.ts` drives the
 * real service, so it can prove what the service DOES with an identifier but not what the route
 * gives it.
 *
 * The claim neither can make is the one the requirement states — "the value the batch lookup receives
 * is character-for-character the identifier that was stored" — because it spans both. So this file
 * closes the gap the only way it can be closed: **no mock between the rendered route and the
 * repository.** The batch repository is a recording fake, which is the one thing here that is not
 * real, and it is real in the only respect that matters — it records the exact string it was asked
 * for and returns a row only for the exact stored identifier.
 *
 * ============================================================================
 * WHY THE FAKE REJECTS ANY OTHER IDENTIFIER
 * ============================================================================
 * Because a fake that returns the batch for ANY id would let a broken route pass this file: the route
 * could hand the lookup `%253A` and the fake would cheerfully answer. `findById` here compares the
 * requested string to the stored identifier BY EQUALITY and answers `null` otherwise — so the
 * participant-facing outcome itself is evidence, not just the recording.
 */

/** Exactly the identifier stored in this project's hosted table, read with the service key. */
const STORED_BATCH_ID = "VAL_720f59cd-2026-10-02T19:46:56.320Z";

/** A second stored batch, so "returned the row" cannot be an artefact of there being only one. */
const OTHER_BATCH_ID = defaultBatchId("VAL_0a1b2c3d", new Date("2026-09-30T20:14:03.117Z"));

/** Everything the batch lookup was asked for, in order. */
let asked: string[] = [];

/** The ids the fake holds, which is the same as what it will answer for. */
const STORED: ReadonlySet<string> = new Set([STORED_BATCH_ID, OTHER_BATCH_ID]);

const storedEntry = (id: string) => ({
  id,
  category: "origin_destination" as const,
  instruction: "Iti Baguio Athletic Bowl ti ayanko ita.",
  origin: "Baguio Athletic Bowl",
  destination: "Baguio Convention Center",
  transitMode: "jeepney",
});

/** A stored batch the real service will accept, with one placed entry. */
const storedBatch = (id: string) => ({
  id,
  validatorId: "VAL_720f59cd",
  createdAt: "2026-10-02T19:46:56.320Z",
  entries: [{ datasetEntryId: "OD_0001", position: 1 }],
});

/**
 * The repository bundle the real `sessionDependencies()` builds, replaced wholesale.
 *
 * Mocked at `@/lib/repositories/supabase` rather than at the service, so `session-service.ts` itself
 * runs for real: `getServerEnv`, the try/catch around `findById`, the completed-set read, and
 * `resolveSessionEntry` are all the production code paths.
 */
vi.mock("@/lib/repositories/supabase", () => ({
  createSupabaseRepositories: () => ({
    batches: {
      // Records EVERY identifier it is asked for, and answers only from the stored set.
      //
      // The recording is the whole point of this file: it is the repository's own view of the value
      // that reached it, which is the only place `tasks.md` 4.2's claim — "the value the batch lookup
      // receives is character-for-character the identifier that was stored" — can be observed. A mock
      // of `openValidationSession` cannot see it, because the argument it receives has already been
      // parsed and could have been mangled before it got there.
      //
      // Equality, not a `startsWith` or a normalized comparison: a fake that answered for a prefix
      // would let a route that dropped the timestamp's milliseconds pass this file.
      findById: async (id: string) => {
        asked.push(id);
        return STORED.has(id) ? storedBatch(id) : null;
      },
    },
    datasetEntries: {
      findById: async (id: string) => (id === "OD_0001" ? storedEntry(id) : null),
    },
    validations: {
      listEntryIdsForValidator: async () => [],
      countForValidator: async () => 0,
    },
  }),
}));

/**
 * The env check, which is a real deployment concern and not what this file is about.
 *
 * Mocked so a missing `SUPABASE_*` variable cannot turn every test here into a "not configured"
 * render — which would make a broken route and a correctly refused one produce identical markup.
 */
vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({}) as never,
  ServerEnvError: class ServerEnvError extends Error {},
}));

/**
 * The locale cookie, so the route renders English deterministically.
 */
vi.mock("@/lib/i18n/interface-locale-cookie", () => ({
  getInterfaceLocale: async () => "en" as const,
}));

/**
 * `useRouter` for the two client islands the route renders.
 *
 * Needed only because `renderToStaticMarkup` has no app router mounted, and it is the same stub
 * `validation-routes.test.tsx` uses. It mocks nothing this file asserts about: the push target is
 * covered in the DOM project, where a real click drives it.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));

const EN = translatorFor("en");

/**
 * Renders the REAL route with the segment the framework would deliver for a given address.
 *
 * `deliveredSegment` is the measured behaviour — Next.js 16.3.6 percent-encodes the dynamic route
 * parameter whatever the request path spelled — so the tests drive the encoded form rather than a raw
 * one. Every one of them would pass trivially against a raw form, which is why this exists.
 */
function deliveredSegmentFor(address: string): string {
  const path = address.split("?")[0] ?? "";
  return encodeURIComponent(path.slice("/validate/".length));
}

async function renderWithSegment(segment: string, searchParams: Record<string, string> = {}) {
  asked = [];
  const { default: Page } = await import("@/app/validate/[batchId]/page");
  const html = renderToStaticMarkup(
    await Page({
      params: Promise.resolve({ batchId: segment }),
      searchParams: Promise.resolve(searchParams),
    } as never),
  );
  return html;
}

beforeEach(() => {
  asked = [];
});

describe("a stored batch is openable by its own address", () => {
  it("hands the batch lookup the stored identifier CHARACTER FOR CHARACTER", async () => {
    await renderWithSegment(deliveredSegmentFor(batchRoutePath(STORED_BATCH_ID)));

    // EQUALITY on the recorded argument, not a substring and not a parameter-shape assertion. This is
    // `tasks.md` 4.2's "not by asserting a parameter was passed": the recording is the repository's
    // own view of what it was asked, which is the only place the value actually exists.
    expect(asked).toEqual([STORED_BATCH_ID]);
  });

  it("PRESENTS the batch rather than reporting it missing", async () => {
    const html = await renderWithSegment(deliveredSegmentFor(batchRoutePath(STORED_BATCH_ID)));

    // Both halves, because "the identifier reached the repository" and "the participant got their
    // batch" are separate claims and the second is the one a participant experiences. The pre-fix
    // route rendered `validate.absent` for a batch that demonstrably existed.
    expect(html).not.toContain(EN("validate.absent.label"));
    expect(html).not.toContain(EN("validate.failed.label"));
    expect(html).toContain("Iti Baguio Athletic Bowl ti ayanko ita.");
  });

  it("opens the OTHER stored batch too, so the first one is not special", async () => {
    await renderWithSegment(deliveredSegmentFor(batchRoutePath(OTHER_BATCH_ID)));

    // Without this, a route that returned the same batch for any id would satisfy the first test. The
    // fake answers from a SET, and this is the assertion that the set is consulted at all.
    expect(asked).toEqual([OTHER_BATCH_ID]);
  });

  it("opens an identifier carrying reserved characters, and one carrying none", async () => {
    // Both halves of the requirement's round trip, driven through the route rather than through the
    // module — because the module's own tests cannot prove the ROUTE calls it.
    //
    // `renderWithSegment` clears the recording, which is correct for a single-render assertion and was
    // the first draft's bug here: it called the helper twice and expected both recordings to survive.
    // The first draft then read `asked` as holding only the SECOND identifier — and the obvious "fix"
    // would have been to drop the first render, which is how a test stops measuring what it claims.
    await renderWithSegment(deliveredSegmentFor(batchRoutePath(STORED_BATCH_ID)));
    const withColons = [...asked];

    await renderWithSegment(deliveredSegmentFor(batchRoutePath(OTHER_BATCH_ID)));

    expect(withColons).toEqual([STORED_BATCH_ID]);
    expect(asked).toEqual([OTHER_BATCH_ID]);
  });
});

describe("a segment that cannot be decoded once is refused, and no lookup uses a second decode", () => {
  it("does NOT resolve a doubly encoded segment to the batch it names", async () => {
    // The pre-fix address shape, spelled exactly: a producer that pre-encoded, delivered by a framework
    // that encodes again. This is what the live project produced, and it rendered "We could not find
    // that batch" for a batch that exists.
    const twice = encodeURIComponent(deliveredSegmentFor(batchRoutePath(STORED_BATCH_ID)));

    // The control, and the reason the assertion below means something: a second decode WOULD name the
    // stored batch, so a route that decoded twice would open it.
    expect(decodeURIComponent(decodeURIComponent(twice))).toBe(STORED_BATCH_ID);

    const html = await renderWithSegment(twice);

    // What the lookup was asked for is the ONCE-decoded value, never the stored identifier — which is
    // precisely the requirement's "performs no lookup against the repeatedly decoded value".
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toBe(STORED_BATCH_ID);
    expect(asked[0]).toBe("VAL_720f59cd-2026-10-02T19%3A46%3A56.320Z");
    // And the participant sees the not-found state rather than a batch that is not theirs.
    expect(html).toContain(EN("validate.absent.label"));
  });

  it("renders rather than throwing when the segment is not valid percent-encoding", async () => {
    for (const malformed of ["%", "%ZZ", "VAL_%E0%A4%A"]) {
      asked = [];
      const html = await renderWithSegment(malformed);

      expect(html, `${malformed} did not render`).toContain(EN("validate.absent.label"));
      // Whether or not a lookup ran is not asserted here — the malformed segment decodes to a string
      // that no row holds, so the lookup is harmless. What matters is that the route rendered.
    }
  });

  it("performs NO lookup at all for an EMPTY segment", async () => {
    // The one refused shape where "no lookup" is assertable, and it is asserted: `decodeURIComponent("")`
    // succeeds, so without an explicit refusal the lookup would be asked for an empty identifier.
    const html = await renderWithSegment("");

    expect(asked).toEqual([]);
    expect(html).toContain(EN("validate.absent.label"));
  });

  it("still reads the requested position from the query string", async () => {
    // The change must not have cost the route its one piece of query-string handling, so the
    // position is asserted end to end: it is passed to the real service, which resolves it against the
    // order the server chose. Position 5 against a one-entry batch resolves to nothing, so the
    // assertion is that the SERVICE received it — and it received it because the route still forwards
    // it, which a regression in the parse branch could silently drop.
    await renderWithSegment(deliveredSegmentFor(batchRoutePath(STORED_BATCH_ID)), {
      position: "1",
    });
    expect(asked).toEqual([STORED_BATCH_ID]);
  });
});
