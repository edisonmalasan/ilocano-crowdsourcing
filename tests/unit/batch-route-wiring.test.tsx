import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { translatorFor } from "@/lib/i18n/copy";
import { batchRoutePath } from "@/lib/validation/batch-route";

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  },
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map(),
}));

/**
 * SUPERSEDED, recorded rather than deleted, by
 * `attempt-and-batch-capability-hardening` task 3.1: this file used to prove
 * the route hands the stored identifier to the batch LOOKUP character for
 * character, with a recording fake standing in for the repository and the
 * participant-facing batch as the second witness. The route no longer looks
 * anything up during its initial render — a batch address alone grants
 * nothing — so there is no lookup argument to record. The character-for-
 * character claim now lives one layer down: the route hands the stored
 * identifier to the OWNERSHIP GATE untouched, and the gate hands it to
 * `openOwnedValidationSession`, which is proven against recording fakes in
 * `tests/unit/owned-session-gate.test.ts`. What this file pins is the new
 * wiring: exact handoff to the gate, zero repository reads on initial render,
 * and the same single-decode refusal for malformed addresses.
 */

const testLocale = vi.hoisted(() => ({ value: "en" as string }));

vi.mock("@/lib/i18n/interface-locale-cookie", () => ({
  getInterfaceLocale: async () => testLocale.value,
}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => ({}) as never,
  ServerEnvError: class ServerEnvError extends Error {},
}));

const gateCalls = vi.hoisted(() => ({
  calls: [] as Array<{ batchId: string; position: number | undefined }>,
}));

vi.mock("@/app/validate/[batchId]/owned-session-gate", () => ({
  OwnedSessionGate: (props: { batchId: string; position: number | undefined }) => {
    gateCalls.calls.push({ batchId: props.batchId, position: props.position });
    return null;
  },
}));

/** A legacy stored batch identifier, carrying reserved characters. */
const STORED_BATCH_ID = "VAL_720f59cd-2026-10-02T19:46:56.320Z";

/** A new-shape opaque batch identifier, carrying no reserved characters. */
const NEW_BATCH_ID = "BAT_0123456789abcdef0123456789abcdef";

/** Every repository read the initial render performs, in order. */
let asked: string[] = [];

vi.mock("@/lib/repositories/supabase", () => ({
  createSupabaseRepositories: () => ({
    batches: {
      findById: async (id: string) => {
        asked.push(id);
        return null;
      },
    },
    datasetEntries: {
      findById: async (id: string) => {
        asked.push(`datasetEntries.findById:${id}`);
        return null;
      },
    },
    validations: {
      listEntryIdsForValidator: async () => [],
      countForValidator: async () => 0,
    },
  }),
}));

const EN = translatorFor("en");

/**
 * Renders the REAL route with the segment the framework would deliver for a
 * given address. Next.js 16.3.6 percent-encodes the dynamic route parameter
 * whatever the request path spelled, so the tests drive the encoded form.
 */
function deliveredSegmentFor(address: string): string {
  const path = address.split("?")[0] ?? "";
  return encodeURIComponent(path.slice("/validate/".length));
}

async function renderWithSegment(segment: string, searchParams: Record<string, string> = {}) {
  gateCalls.calls.length = 0;
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
  gateCalls.calls.length = 0;
  asked = [];
  testLocale.value = "en";
});

describe("a stored batch address reaches the gate untouched, with no lookup", () => {
  it("hands the gate the stored identifier CHARACTER FOR CHARACTER", async () => {
    await renderWithSegment(deliveredSegmentFor(batchRoutePath(STORED_BATCH_ID)));

    expect(gateCalls.calls).toHaveLength(1);
    expect(gateCalls.calls[0]?.batchId).toBe(STORED_BATCH_ID);
  });

  it("performs NO repository read on the initial render", async () => {
    await renderWithSegment(deliveredSegmentFor(batchRoutePath(STORED_BATCH_ID)));

    // The ownership proof (and its batch read) runs inside the bound server
    // action after mount, never during the server render.
    expect(asked).toEqual([]);
  });

  it("hands the OTHER stored batch through too, so the first one is not special", async () => {
    await renderWithSegment(deliveredSegmentFor(batchRoutePath(NEW_BATCH_ID)));

    expect(gateCalls.calls).toHaveLength(1);
    expect(gateCalls.calls[0]?.batchId).toBe(NEW_BATCH_ID);
    expect(asked).toEqual([]);
  });

  it("round-trips an identifier carrying reserved characters, and one carrying none", async () => {
    await renderWithSegment(deliveredSegmentFor(batchRoutePath(STORED_BATCH_ID)));
    const withColons = gateCalls.calls.map((call) => call.batchId);

    await renderWithSegment(deliveredSegmentFor(batchRoutePath(NEW_BATCH_ID)));

    expect(withColons).toEqual([STORED_BATCH_ID]);
    expect(gateCalls.calls.map((call) => call.batchId)).toEqual([NEW_BATCH_ID]);
  });

  it("renders the neutral shell, never a sentence, before proof", async () => {
    const html = await renderWithSegment(deliveredSegmentFor(batchRoutePath(STORED_BATCH_ID)));

    expect(html).toContain(EN("validate.meta.title"));
    expect(html).not.toContain("Iti Baguio Athletic Bowl ti ayanko ita.");
    expect(html).not.toContain(EN("validate.absent.label"));
  });
});

describe("a segment that cannot be decoded once is refused, with no lookup", () => {
  it("hands the gate the ONCE-decoded value for a doubly encoded segment, never the stored identifier", async () => {
    // A producer that pre-encoded, delivered by a framework that encodes
    // again. One decoding SUCCEEDS and yields the still-encoded string; the
    // contract forbids the second decode that would resolve it.
    const twice = encodeURIComponent(deliveredSegmentFor(batchRoutePath(STORED_BATCH_ID)));

    expect(decodeURIComponent(decodeURIComponent(twice))).toBe(STORED_BATCH_ID);

    await renderWithSegment(twice);

    expect(gateCalls.calls).toHaveLength(1);
    expect(gateCalls.calls[0]?.batchId).not.toBe(STORED_BATCH_ID);
    expect(gateCalls.calls[0]?.batchId).toBe("VAL_720f59cd-2026-10-02T19%3A46%3A56.320Z");
    // The mistaken lookup the old route performed never runs on this path
    // now: the gate's later proof reads the batch, and finds nothing there.
    expect(asked).toEqual([]);
  });

  it.each([["%"], ["%ZZ"], ["VAL_%E0%A4%A"]])(
    "redirects rather than throwing for malformed %s",
    async (malformed) => {
      await expect(renderWithSegment(malformed)).rejects.toThrow("NEXT_REDIRECT:/");
      expect(gateCalls.calls).toEqual([]);
      expect(asked).toEqual([]);
    },
  );

  it("redirects with NO gate and NO lookup at all for an EMPTY segment", async () => {
    await expect(renderWithSegment("")).rejects.toThrow("NEXT_REDIRECT:/");
    expect(gateCalls.calls).toEqual([]);
    expect(asked).toEqual([]);
  });

  it("still reads the requested position from the query string", async () => {
    await renderWithSegment(deliveredSegmentFor(batchRoutePath(STORED_BATCH_ID)), {
      position: "1",
    });

    expect(gateCalls.calls[0]).toMatchObject({ batchId: STORED_BATCH_ID, position: 1 });
    expect(asked).toEqual([]);
  });
});
