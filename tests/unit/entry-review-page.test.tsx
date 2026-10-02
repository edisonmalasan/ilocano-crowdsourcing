/**
 * The per-entry review ROUTE, rendered — the gap this file exists to close.
 *
 * `dashboard-views.test.tsx` renders the VIEW, and `dashboard-service.test.ts` proves the SERVICE
 * returns `null` for an unknown id. Neither renders the ROUTE, so the wiring between them was
 * unverified: `params.id` reaching the service, and `notFound()` being called when it comes back
 * absent. A page that dropped the `notFound()` call, or passed the wrong id, would have passed
 * every other test in this change. `admin-routes.test.tsx` renders the overview route and its
 * counterpart; this file does the same for this one, which is also why
 * `validation-routes.test.tsx` names this file as the witness that the route is not unmonitored.
 *
 * The repository factory is stubbed for the reason stated in `admin-routes.test.tsx`: the page
 * constructs a service-role client, and no test may hold a credential. `notFound()` THROWS when
 * called, which is what makes the absent case assertable at all — a stub returning `undefined`
 * would let a page render an empty review instead, and the test would see markup rather than the
 * absence of it.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound() was called");
  },
  forbidden: () => {
    throw new Error("forbidden() was called");
  },
  redirect: () => {
    throw new Error("redirect() was called");
  },
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));

const KNOWN_ID = "OD_0001";

/** The ids the stubbed `findById` was asked for, in order. Proves the route passed `params.id`. */
const askedFor: string[] = [];

vi.mock("@/lib/repositories/supabase", () => ({
  createSupabaseRepositories: () => ({
    datasetEntries: {
      listActive: async () => [],
      findById: async (id: string) => {
        askedFor.push(id);
        if (id !== KNOWN_ID) return null;
        return {
          id,
          category: "origin_destination",
          instruction: "Iti Baguio Athletic Bowl ti ayanko.",
          origin: "Baguio Athletic Bowl",
          destination: "Baguio Convention Center",
          transitMode: "jeepney",
          createdAt: "2026-09-01T12:00:00.000Z",
          isActive: true,
        };
      },
    },
    validations: {
      listForEntries: async () => [
        {
          id: "r01",
          validatorId: "VAL_00000001",
          datasetEntryId: KNOWN_ID,
          batchId: "batch_01",
          evaluation: "correct_natural",
          englishTranslation: "Go north past the athletic bowl.",
          filipinoTranslation: "Pumunta ka sa hilaga.",
          createdAt: "2026-09-02T12:00:00.000Z",
          updatedAt: "2026-09-02T12:00:00.000Z",
        },
      ],
    },
    validators: {
      listByIds: async (ids: readonly string[]) =>
        ids.map((id) => ({
          id,
          ilocanoProficiency: "fluent" as const,
          createdAt: "2026-09-01T12:00:00.000Z",
          lastActiveAt: "2026-09-02T12:00:00.000Z",
          totalValidations: 1,
        })),
    },
  }),
}));

import EntryReviewPage from "@/app/researcher/(protected)/entries/[id]/page";

const renderRoute = async (id: string): Promise<string> =>
  renderToStaticMarkup(await EntryReviewPage({ params: Promise.resolve({ id }) }));

describe("the per-entry review route", () => {
  it("passes the route's id to the data source and renders the review", async () => {
    const html = await renderRoute(KNOWN_ID);

    // The wiring this file exists for: the id in `params` reaches `findById` unchanged.
    expect(askedFor).toContain(KNOWN_ID);
    expect(html).toContain("Entry review");
    expect(html).toContain("Original Ilocano instruction");
    // The stored Ilocano and both translations, exactly as stored.
    expect(html).toContain("Iti Baguio Athletic Bowl ti ayanko.");
    expect(html).toContain("Baguio Convention Center");
    expect(html).toContain("Go north past the athletic bowl.");
    expect(html).toContain("Pumunta ka sa hilaga.");
    expect(html).toContain('<main id="main"');
  });

  it("calls notFound() for an authorized request naming an absent entry", async () => {
    // Distinct from the layout's 403 refusal: reaching this route at all means a verified session
    // existed, so "no such entry" must render as not-found and not as an empty review or an error
    // page that looks like data.
    askedFor.length = 0;

    await expect(renderRoute("OD_9999")).rejects.toThrow(/notFound\(\) was called/);
    expect(askedFor).toEqual(["OD_9999"]);
  });

  it("renders no research content when the entry is absent", async () => {
    // The negative half of the assertion above, stated separately because "it threw" and "it threw
    // AFTER rendering a partial page" are different behaviours. `notFound()` throws before any
    // markup is returned, so there is nothing to render — and this records that the throw happens
    // on the absent branch specifically.
    let rendered = false;
    try {
      await renderRoute("OD_9999");
      rendered = true;
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
    }

    expect(rendered).toBe(false);
  });
});
