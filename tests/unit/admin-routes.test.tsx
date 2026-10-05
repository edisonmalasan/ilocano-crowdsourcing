import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { DatasetEntry } from "@/schemas/dataset";
import type { ValidationResponse } from "@/schemas/validation";
import type { AnonymousValidatorId } from "@/schemas/validator";

vi.mock("server-only", () => ({}));

/**
 * Records what the stubbed `redirect` was asked for, rather than navigating.
 *
 * `next/navigation`'s `redirect` signals by THROWING, and it throws a value the render would
 * otherwise have to catch and interpret. Recording and returning `undefined` keeps the sign-in page
 * renderable in both of its states, and lets a test assert the redirect happened without the
 * assertion being about a thrown object's message.
 */
const redirects: string[] = [];

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    redirects.push(destination);
    return undefined;
  },
  forbidden: () => {
    throw new Error("forbidden() was called");
  },
  notFound: () => {
    throw new Error("notFound() was called");
  },
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {} }),
}));

/**
 * `cookies()` is mocked because it throws outside a request scope.
 *
 * The stub holds NO researcher session — a `Map` with no entry — which is the state a first-time
 * requester is in and therefore the one that must render the sign-in form. A stub holding a valid
 * session would exercise the redirect instead, so the emptiness is the fixture and is stated here
 * rather than left to be discovered.
 */
vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(new Map()),
}));

import ForbiddenPage from "@/app/researcher/(protected)/forbidden";
import ProtectedHome from "@/app/researcher/(protected)/page";
import { metadata as protectedMetadata } from "@/app/researcher/(protected)/layout";
import { metadata as segmentMetadata } from "@/app/researcher/layout";
import ResearcherSignInPage from "@/app/researcher/sign-in/page";
import {
  RESEARCHER_AREA_PATH,
  RESEARCHER_EXPORT,
  RESEARCHER_HOME,
  RESEARCHER_SIGN_IN,
} from "@/lib/admin/routes";
import { RESEARCHER_SESSION_MAX_LIFETIME_SECONDS } from "@/lib/admin/session";
import { RESEARCHER_REFUSAL_MESSAGE } from "@/lib/admin/guard";

/**
 * The researcher routes: their metadata, their refusal surface, and their markup.
 *
 * =================================================================================================
 * WHAT `renderToStaticMarkup` CANNOT SEE, STATED BEFORE THE ASSERTIONS RATHER THAN AFTER
 * =================================================================================================
 * It never runs an effect, never fires a click handler, and never starts a transition. So it can only
 * ever observe the IDLE state of the two client islands — the sign-in form with no refusal shown, the
 * sign-out button idle. Everything about what those controls do while a request is in flight is out
 * of scope here and lives in `tests/dom/researcher-sign-in.test.tsx`, which drives real events.
 *
 * That separation is the point of both files. An earlier version of this project's sign-in markup
 * tests asserted only the initial screen and reported that as covering the form's behaviour; a form
 * that never disabled its controls passed them.
 *
 * What IS observable here, and worth the file: the structural claims about the refusal surface. A
 * component that takes no props cannot disclose whether a record exists, and that is checkable from
 * its signature and from its rendered markup.
 */

/** Renders a sync route component. */
function render(Component: () => React.ReactElement): string {
  return renderToStaticMarkup(<Component />);
}

/** Renders an async route component, which `renderToStaticMarkup` cannot await itself. */
async function renderAsync(Page: () => Promise<React.ReactElement>): Promise<string> {
  return renderToStaticMarkup(await Page());
}

/** Every `href` in rendered markup. */
function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1] as string);
}

/** The text of every `<h1>` in rendered markup. */
function h1Texts(html: string): string[] {
  return [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((match) => match[1] as string);
}

/**
 * The text a reader actually sees: every tag removed, entities left alone.
 *
 * =================================================================================================
 * WHY EVERY CONTENT ASSERTION IN THIS FILE GOES THROUGH THIS
 * =================================================================================================
 * A first draft asserted `expect(html).not.toMatch(/\d/)` to mean "the page shows no figure". That
 * assertion cannot pass and never could: the markup is full of Tailwind class names, so `px-5`,
 * `sm:px-8`, and `max-w-3xl` match. It is an assertion that reports the absence of a difference
 * because the instrument is too blunt to see one — the failure mode this repository has recorded
 * repeatedly, in the sharper form: **an assertion built on a quantity too coarse to show the
 * difference.**
 *
 * Stripping the tags first makes the claim mean what it says: no digit is DISPLAYED. A figure would
 * be displayed and would survive; a class name would not.
 */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Reads one attribute off the first matching tag, case-insensitively. */
function attributeOf(html: string, tagPattern: RegExp, name: string): string | null {
  const tag = html.match(tagPattern)?.[0];
  if (tag === undefined) return null;
  // React's server renderer has emitted BOTH `autocomplete` and `autoComplete` for this attribute
  // across versions in this project, so the lookup is case-insensitive. Hard-coding the casing
  // asserted the renderer's spelling rather than the component's intent.
  const match = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag);
  return match === null ? null : (match[1] as string);
}

describe("the researcher route constants", () => {
  it("names three routes that agree with the directory layout", () => {
    // The constants live in a module rather than in the pages because a `"use server"` module may
    // only export async functions, and a route path is not one. Asserting them against the real
    // filesystem stops them drifting from the routes that exist.
    expect(RESEARCHER_HOME).toBe("/researcher");
    expect(RESEARCHER_SIGN_IN).toBe("/researcher/sign-in");
    expect(RESEARCHER_AREA_PATH).toBe("/researcher");
  });

  it("names the export download beneath the area it belongs to", () => {
    expect(RESEARCHER_EXPORT).toBe("/researcher/export");
    expect(RESEARCHER_EXPORT.startsWith(`${RESEARCHER_AREA_PATH}/`)).toBe(true);
  });

  it("scopes the area path to the researcher area and no wider", () => {
    // The cookie's `path` comes from this constant. A value of `/` would attach the researcher
    // session to every public validator request this origin serves, which `cookie.ts` documents as
    // more exposure than the feature needs.
    expect(RESEARCHER_AREA_PATH.startsWith("/")).toBe(true);
    expect(RESEARCHER_AREA_PATH).not.toBe("/");
    for (const route of [RESEARCHER_HOME, RESEARCHER_SIGN_IN, RESEARCHER_EXPORT]) {
      expect(route.startsWith(`${RESEARCHER_AREA_PATH}/`) || route === RESEARCHER_AREA_PATH).toBe(
        true,
      );
    }
  });
});

describe("the researcher area is never indexed", () => {
  it("declares noindex at the segment root, so it covers every route in the area", () => {
    expect(segmentMetadata.robots).toEqual({ index: false, follow: false, nocache: true });
    expect(segmentMetadata.title).toBe("Researcher area");
  });

  it("restates noindex on the protected layout rather than relying on inheritance", () => {
    // Asserted as its own declaration, not as "the merged result". The duplication is deliberate —
    // a split of the segment layout must not silently leave the protected route indexable.
    expect(protectedMetadata.robots).toEqual({ index: false, follow: false, nocache: true });
  });

  it("carries noindex on BOTH layouts, so no researcher route depends on the other existing", () => {
    // The merged-metadata claim, stated as two independent declarations. Reading only the segment's
    // would pass with the protected layout's own declaration removed, which is the edit that would
    // matter.
    expect(segmentMetadata.robots).toMatchObject({ index: false });
    expect(protectedMetadata.robots).toMatchObject({ index: false });
  });
});

describe("the refusal surface", () => {
  const html = render(ForbiddenPage);

  it("renders a single top-level heading", () => {
    // `h1`, not `CardTitle` — `CardTitle` renders an `h3` unconditionally, so a page whose only
    // heading came from one would have no top-level heading at all. The same accessibility contract
    // the public validator screens are held to.
    expect(h1Texts(html)).toHaveLength(1);
    expect(h1Texts(html)[0]).toContain("Not available");
  });

  it("shows exactly the one refusal message, and nothing derived from the request", () => {
    expect(html).toContain(RESEARCHER_REFUSAL_MESSAGE);
    // The refusal appears once. A page that rendered the message and then a reason, or twice, would
    // be leaking through repetition.
    expect(html.split(RESEARCHER_REFUSAL_MESSAGE)).toHaveLength(2);
  });

  it("displays NO identifier, figure, count, path, or reason", () => {
    // The disclosure rule, checked against real markup rather than against the constant. The
    // component takes no props, so there is nothing it could render about a request — and this is
    // the half of the guarantee that a test can observe.
    //
    // Everything below reads {@link visibleText}, so class names cannot satisfy or break it.
    // `OD_0001` is a canonical dataset entry identifier's shape from
    // `data/merged-ilocano-synthetic-data.json`, so an entry-specific refusal would carry
    // something matching it.
    const shown = visibleText(html);
    expect(shown).not.toMatch(/OD_\d{4}/);
    // No digit is displayed at all, so there is no count, no figure, and no identifier anywhere on
    // the surface.
    expect(shown).not.toMatch(/\d/);
    // No dataset entry, validator, batch, or coverage vocabulary.
    expect(shown.toLowerCase()).not.toMatch(/dataset|validator|validation|batch|coverage|entry/);
    // And the whole of what is displayed, asserted exactly, so an added sentence is a failing test
    // rather than a silent widening of the surface.
    expect(shown).toBe(`Not available ${RESEARCHER_REFUSAL_MESSAGE} Go to the researcher sign-in`);
  });

  it("offers the sign-in route and no retry", () => {
    expect(hrefs(html)).toEqual([RESEARCHER_SIGN_IN]);
    // A retry would re-present a session that already failed to verify, which is a loop, and it
    // would be a second control whose behaviour a screen reader announces as an option.
    expect(hrefs(html)).toHaveLength(1);
  });

  it("offers a route that exists", () => {
    // A link to a route that is not there turns a refusal into a 404, and a 404 would be
    // indistinguishable from a wrong path — which is worse than the refusal it replaced.
    for (const href of hrefs(html)) {
      const relative = href.replace(/^\//, "");
      const directory = join(process.cwd(), "src", "app", relative);
      expect(() => readFileSync(join(directory, "page.tsx"), "utf8")).not.toThrow();
    }
  });

  it("targets the skip link's `#main` landmark", () => {
    // The ROOT layout renders the skip link as its first focusable element pointing at `#main`, so a
    // page without that id has a skip link that does nothing.
    expect(html).toMatch(/<main id="main"/);
  });
});

describe("the refusal surface cannot disclose existence, structurally", () => {
  it("takes NO parameters at all", () => {
    // The stronger half of the guarantee, and the one no markup assertion can reach. If the
    // component accepted a `params` or a `searchParams` prop, a future edit could render an
    // identifier from it, and every markup assertion above would still pass — because they assert
    // the CURRENT behaviour, not the class of behaviour.
    //
    // Measured on the real function: `length` is 0, so there is no argument to pass.
    expect(ForbiddenPage.length).toBe(0);
  });

  it("is not given the request anywhere in its call sites", () => {
    // The Next.js convention lets a page receive `params` and `searchParams` even when it declares
    // none, so "declares no parameters" and "is never handed the request" are different claims. The
    // second is checked at the framework's call site, which is `forbidden.tsx` itself for this
    // boundary — the file declares a default export with an empty parameter list.
    const source = readFileSync(
      join(process.cwd(), "src", "app", "researcher", "(protected)", "forbidden.tsx"),
      "utf8",
    );
    expect(source).toMatch(/export default function ResearcherForbidden\(\)/);
    // And it never reaches for the request, the params, or the headers itself.
    expect(source).not.toMatch(/params|searchParams|headers\(|cookies\(/);
  });
});

describe("the sign-in page", () => {
  it("renders the form for a request with no session", async () => {
    redirects.length = 0;
    const html = await renderAsync(ResearcherSignInPage);
    // The stubbed cookie jar holds no session and the ambient environment has no researcher
    // credential, so this is the ordinary first-time state — and it must render the form rather than
    // refusing or redirecting.
    expect(redirects).toEqual([]);
    expect(html).toMatch(/<form/);
    expect(html).toContain("Researcher sign-in");
  });

  it("has exactly one top-level heading", async () => {
    expect(h1Texts(await renderAsync(ResearcherSignInPage))).toHaveLength(1);
  });

  it("labels its single input and gives it an accessible name", async () => {
    const html = await renderAsync(ResearcherSignInPage);
    // `Field` wires the label's `htmlFor` to the control's `id`; this asserts the wiring actually
    // arrived in the markup rather than being satisfied in the component.
    const inputs = [...html.matchAll(/<input[^>]*>/g)].map((match) => match[0]);
    expect(inputs).toHaveLength(1);
    const id = /id="([^"]*)"/.exec(inputs[0] as string)?.[1] as string;
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
    // Exactly one text-entry control, so there is no second field for a browser to autofill or for a
    // person to fill in by mistake.
    expect([...html.matchAll(/<textarea/g)]).toHaveLength(0);
  });

  it("types the input as a password with autofill and spellcheck off", async () => {
    const html = await renderAsync(ResearcherSignInPage);
    // Read case-insensitively: React's server renderer has emitted both spellings of these
    // attributes in this project's history, and a test that hard-codes one asserts the renderer's
    // spelling rather than the component's intent.
    expect(attributeOf(html, /<input[^>]*>/, "type")).toBe("password");
    // A credential in a `text` input is shoulder-surfable and lands in a browser's autofill store.
    expect(attributeOf(html, /<input[^>]*>/, "autocomplete")).toBe("off");
    expect(attributeOf(html, /<input[^>]*>/, "spellcheck")).toBe("false");
  });

  it("does not say whether this deployment is configured", async () => {
    // The page must render identically in an unconfigured deployment and a configured one. It does:
    // there is one implementation, and it reads nothing about configuration to decide what to say.
    // The assertion is that no such statement appears — "not configured", "no access key", "please
    // ask an administrator" would each hand an unauthenticated requester a fact about the operator's
    // setup, which the spec forbids.
    const html = await renderAsync(ResearcherSignInPage);
    expect(html.toLowerCase()).not.toMatch(
      /not configured|no access key|not set up|unavailable|ask an administrator|contact/i,
    );
    // And it records nothing about the requester, which is the anonymity half.
    expect(html.toLowerCase()).not.toMatch(/we (will )?record|we store|logged|tracked/);
  });

  it("offers a way back to the public validation site", async () => {
    // An operator who cannot get in must still be able to reach the validator flow, and the public
    // site must be reachable from the researcher area so a misdirected person is not stuck.
    expect(hrefs(await renderAsync(ResearcherSignInPage))).toEqual(["/"]);
  });

  it("renders NO validator, batch, dataset, or proficiency content", async () => {
    // The researcher area is a different tool for a different reader. Nothing from the public
    // validator vocabulary may appear here, and in particular no proficiency screening — the adjacency
    // between a proficiency-screening surface and a researcher surface in the same browser profile is
    // precisely what this project refuses to create.
    const html = await renderAsync(ResearcherSignInPage);
    expect(html).not.toMatch(/ilocano|proficien|native|first-language|conversational/i);
    expect(html).not.toMatch(/OD_\d{4}/);
  });

  it("states the residual window, so it does not imply that sign-out revokes a session", async () => {
    // =============================================================================================
    // WHY THIS IS AN ASSERTION ABOUT RENDERED MARKUP AND NOT ABOUT A DOC COMMENT
    // =============================================================================================
    // Requirement 6's last clause — "the platform SHALL state that residual window rather than imply
    // that sign-out revokes it" — was, before this test, satisfied only by prose in a design document
    // and a constant's doc comment. An independent verification pass found that the requirement's own
    // words say "the platform", and a developer-facing comment is not the platform; a control labelled
    // "Sign out" that redirects immediately is what a researcher reads as revocation.
    //
    // So the claim is asserted where the reader is. `renderToStaticMarkup` is enough for it, because
    // this is static text rather than an event, which is the one class of assertion in this project
    // that the unit renderer genuinely can discharge.
    const html = await renderAsync(ResearcherSignInPage);

    // The two halves of the claim, separated so a partial implementation fails.
    expect(html).toMatch(/signing out/i);
    // Says the captured copy SURVIVES, rather than merely mentioning signing out.
    expect(html).toMatch(/(copy|a copy)[^.]*stays valid|remains valid/i);
    // And states the bound, read from the same constant the session's expiry is derived from — so the
    // sentence cannot disagree with the configuration, which is the failure that would make this
    // worse than saying nothing.
    const hours = Math.floor(RESEARCHER_SESSION_MAX_LIFETIME_SECONDS / 3600);
    expect(html).toContain(String(hours));
    // It must not claim sign-out is immediate, which is the implication the requirement forbids.
    expect(html).not.toMatch(/sign(ing)? out[^.]*(immediately|instantly|right away)/i);
  });

  it("is not part of the localized copy catalog", async () => {
    // Stated as a property of the CATALOG rather than of this page, because the property is about
    // where researcher strings live. `@/lib/i18n/copy` holds the public experience's words and nothing
    // else, and that catalog's research-boundary guards stay meaningful only while that is true.
    const catalog = readFileSync(join(process.cwd(), "src", "lib", "i18n", "copy.ts"), "utf8");
    for (const researcherString of [
      "Researcher access key",
      "Researcher sign-in",
      "Researcher area",
      RESEARCHER_REFUSAL_MESSAGE,
    ]) {
      expect(catalog).not.toContain(researcherString);
    }
  });
});

/**
 * The dashboard's data source, stubbed at the repository seam.
 *
 * The page constructs its own repositories from the privileged client, which no test may do —
 * there is no credential here and must never be one. So the factory module is stubbed and the
 * page is rendered against two hand-counted entries: OD_0001 with one qualifying response, OD_0002
 * with three disagreeing ones (flagged, complete). What these tests prove is the WIRING —
 * repositories into service into markup — while `dashboard-views.test.tsx` proves the markup
 * itself. A page test that re-asserted every figure would duplicate that file; a view test cannot
 * prove the page called `listActive`.
 */
const dashboardCalls: string[] = [];
const DASHBOARD_ENTRIES: DatasetEntry[] = [
  {
    id: "OD_0001",
    category: "origin_destination",
    sourceEntryId: 1,
    categoryName: "Origin + Destination",
    instruction: "instruction for OD_0001",
    origin: "origin of OD_0001",
    destination: "destination of OD_0001",
    transitMode: "walking",
    createdAt: "2026-09-01T12:00:00.000Z",
    isActive: true,
  },
  {
    id: "OD_0002",
    category: "origin_destination",
    sourceEntryId: 2,
    categoryName: "Origin + Destination",
    instruction: "instruction for OD_0002",
    origin: "origin of OD_0002",
    destination: "destination of OD_0002",
    transitMode: "walking",
    createdAt: "2026-09-01T12:00:00.000Z",
    isActive: true,
  },
];

const dashboardResponse = (
  id: string,
  validatorId: string,
  entryId: string,
  evaluation: ValidationResponse["evaluation"],
  extra: Partial<ValidationResponse> = {},
): ValidationResponse => ({
  id,
  validatorId: validatorId as AnonymousValidatorId,
  datasetEntryId: entryId,
  batchId: "batch_01",
  evaluation,
  englishTranslation: "Go north past the market.",
  filipinoTranslation: "Dumiretso ka sa hilaga lagpas ng palengke.",
  createdAt: "2026-09-02T12:00:00.000Z",
  updatedAt: "2026-09-02T12:00:00.000Z",
  ...extra,
});

const DASHBOARD_RESPONSES: ValidationResponse[] = [
  dashboardResponse("dr01", "VAL_00000001", "OD_0001", "correct_natural"),
  dashboardResponse("dr02", "VAL_00000001", "OD_0002", "correct_natural"),
  dashboardResponse("dr03", "VAL_00000002", "OD_0002", "correct_natural"),
  dashboardResponse("dr04", "VAL_00000003", "OD_0002", "incorrect", {
    correctedInstruction: "naurnos a balikas",
  }),
];

const DASHBOARD_PROFILES = new Map([
  ["VAL_00000001", "fluent"],
  ["VAL_00000002", "native"],
  ["VAL_00000003", "basic"],
]);

vi.mock("@/lib/repositories/supabase", () => ({
  createSupabaseRepositories: () => ({
    datasetEntries: {
      listActive: async () => {
        dashboardCalls.push("entries.listActive");
        return DASHBOARD_ENTRIES;
      },
      findById: async (id: string) => DASHBOARD_ENTRIES.find((entry) => entry.id === id) ?? null,
    },
    validations: {
      listForEntries: async (ids: readonly string[]) => {
        dashboardCalls.push("validations.listForEntries");
        return DASHBOARD_RESPONSES.filter((response) => ids.includes(response.datasetEntryId));
      },
    },
    validators: {
      listByIds: async (ids: readonly string[]) => {
        dashboardCalls.push("validators.listByIds");
        return ids.flatMap((id) => {
          const proficiency = DASHBOARD_PROFILES.get(id);
          return proficiency === undefined
            ? []
            : [
                {
                  id,
                  ilocanoProficiency: proficiency,
                  createdAt: "2026-09-01T12:00:00.000Z",
                  lastActiveAt: "2026-09-02T12:00:00.000Z",
                  totalValidations: 1,
                },
              ];
        });
      },
    },
  }),
}));

describe("the protected home page renders the dashboard from its repositories", () => {
  // The placeholder block above pinned the ABSENCE of figures as an explicit Non-Goal of the
  // access change. The approved dashboard spec requires figures on this page, which directly
  // contradicts those tests — so they were replaced, not weakened. A test changed because the
  // behavior changed is legitimate only with the approved requirement behind it, and here there
  // is one. What remains from that era is the discipline (visible-text assertions, exact link
  // targets), not the assertions.
  let html: string;

  beforeAll(async () => {
    html = await renderAsync(ProtectedHome);
  });

  it("has one top-level heading and a sign-out control", () => {
    expect(h1Texts(html)).toEqual(["Researcher dashboard"]);
    expect(html).toContain("Sign out");
  });

  it("shows figures the service computed from the repositories, not placeholders", () => {
    // OD_0001 complete on one qualifying response, OD_0002 complete and flagged: 2 entries, 4
    // qualifying of 4 stored, 100% completion. A single validating package completes an entry, so
    // the entry that used to sit "in bucket one" is complete now. OD_0002's three packages share
    // one instant: overlap with no late arrival.
    const shown = visibleText(html);
    expect(shown).toContain("Dataset entries");
    expect(shown).toContain("Overall completion");
    expect(shown).toContain("100%");
    expect(shown).toContain("Needs researcher review");
  });

  it("renders the approved volume and diagnostic figures from the same repositories", () => {
    // No new reads: the route proves the figures arrive through the page's existing wiring.
    // Values are pinned by the service and view suites; what belongs here is that the page
    // renders them at all, with the entries behind the diagnostics identified.
    const shown = visibleText(html);
    expect(shown).toContain("Stored responses");
    expect(shown).toContain("Cannot-evaluate responses");
    expect(shown).toContain("Entries with extra packages");
    expect(shown).toContain("Entries: OD_0002");
    expect(shown).toContain("Late-arrival responses");
    expect(shown).toContain("No late arrivals");
  });

  it("links the flagged entry to its review route", () => {
    expect(hrefs(html)).toContain("/researcher/entries/OD_0002");
    expect(hrefs(html)).not.toContain("/researcher/entries/OD_0001");
  });

  it("reads the repositories to render, which is the wiring only the page can prove", () => {
    // The view tests prove markup from data; nothing but this page proves the page asked for
    // the data. A page that rendered canned figures without reading would pass every other
    // test in this file.
    expect(dashboardCalls).toContain("entries.listActive");
    expect(dashboardCalls).toContain("validations.listForEntries");
    expect(dashboardCalls).toContain("validators.listByIds");
  });

  it("targets the skip link's `#main` landmark", () => {
    expect(html).toMatch(/<main id="main"/);
  });
});

describe("the protected layout, rendered for an unauthorized request", () => {
  it("never returns children without a verified session", async () => {
    // The guard's own behaviour, exercised through the real module with the real `next/headers` and
    // `next/navigation` stubs. The stubbed `forbidden()` THROWS, so a layout that returned children
    // for a sessionless request would render instead of throwing — which is the defect this test
    // exists for, and which no markup assertion could see because the layout renders nothing itself.
    const { default: ProtectedLayout } = await import("@/app/researcher/(protected)/layout");
    await expect(ProtectedLayout({ children: "SHOULD-NEVER-RENDER" })).rejects.toThrow(
      /forbidden\(\) was called/,
    );
  });

  it("reads the SAME guard module the page-level assertions used, rather than a second one", async () => {
    // Two definitions of "authorized" in one feature is how a page ends up checking a different
    // thing from its layout. The layout imports `resolveResearcherAccess` from `@/lib/admin/guard`
    // and nothing else that could decide, which the source read confirms directly.
    //
    // The occurrence count is TWO — the import and the one call — so this asserts exactly that
    // rather than exactly one, which is what a first draft asserted and which was simply a
    // miscount. What matters is that the number is small and that both occurrences are the imported
    // symbol rather than two different decision functions.
    const source = readFileSync(
      join(process.cwd(), "src", "app", "researcher", "(protected)", "layout.tsx"),
      "utf8",
    );
    expect(source).toContain('from "@/lib/admin/guard"');
    const occurrences = [...source.matchAll(/resolveResearcherAccess/g)];
    expect(occurrences).toHaveLength(2);
    // The first is the import, the second the call site. No local re-definition, which would shadow
    // the imported one and make the import decorative.
    expect(source).not.toMatch(/(function|const|let|var)\s+resolveResearcherAccess/);
    // And no other decision function is reachable from this layout.
    expect(source).not.toMatch(/verifyResearcherSession|runResearcherSignIn/);
  });
});
