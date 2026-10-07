import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { translatorFor } from "@/lib/i18n/copy";

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
 * `attempt-and-batch-capability-hardening` task 3.1: the session route used to
 * resolve the batch server-side and render the sentence, the finished card, or
 * the absent/failed states directly, and this file asserted each of those
 * server-rendered screens. The route now renders a NEUTRAL SHELL (heading,
 * description, ownership-gate island) and no sentence before the gate proves
 * the browser's active attempt against the batch's stored owner. Content
 * arrives only through `openOwnedValidationSession`, which is proven in
 * `tests/unit/owned-session-gate.test.ts` (service decisions) and
 * `tests/dom/owned-session-gate.test.tsx` (proof before presentation). The
 * old sentence/finished/absent/failed markup assertions below were retired
 * with that behavior; what this file now pins is the new contract.
 */

const testLocale = vi.hoisted(() => ({ value: "en" }));

vi.mock("@/lib/i18n/interface-locale-cookie", () => ({
  getInterfaceLocale: async () => testLocale.value,
}));

const openOwnedValidationSession = vi.fn();
const sessionDependencies = vi.fn();

vi.mock("@/lib/validation/session-service", () => ({
  openOwnedValidationSession: (...args: unknown[]) => openOwnedValidationSession(...args),
  sessionDependencies: (...args: unknown[]) => sessionDependencies(...args),
}));

const gateCalls = vi.hoisted(() => ({
  calls: [] as Array<{ batchId: string; position: number | undefined; locale: string }>,
}));

vi.mock("@/app/validate/[batchId]/owned-session-gate", () => ({
  OwnedSessionGate: (props: { batchId: string; position: number | undefined; locale: string }) => {
    gateCalls.calls.push({
      batchId: props.batchId,
      position: props.position,
      locale: props.locale,
    });
    return null;
  },
}));

const LEGACY_BATCH_ID = "VAL_720f59cd-2026-10-02T19:46:56.320Z";
const NEW_BATCH_ID = "BAT_0123456789abcdef0123456789abcdef";
const INSTRUCTION = "Iti Baguio Athletic Bowl ti ayanko ita; masapulko a makadanon iti Baguio.";
const OTHER_SENTENCES = [
  "Langet iti Wright Park.",
  "Papanak iti The Mansion.",
  "Mankagat iti Camp John Hay.",
];

const EN = translatorFor("en");
const FIL = translatorFor("fil");

async function loadSessionPage() {
  return import("@/app/validate/[batchId]/page");
}

async function renderRoute(
  Page: (props: never) => Promise<React.ReactElement>,
  props: { params?: unknown; searchParams?: unknown } = {},
): Promise<string> {
  return renderToStaticMarkup(
    await Page({
      params: Promise.resolve(props.params ?? { batchId: LEGACY_BATCH_ID }),
      searchParams: Promise.resolve(props.searchParams ?? {}),
    } as never),
  );
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

beforeEach(() => {
  vi.clearAllMocks();
  gateCalls.calls.length = 0;
  testLocale.value = "en";
});

describe("the session route renders a neutral shell and nothing else", () => {
  it("renders the heading and description with the shell geometry", async () => {
    const { default: Page } = await loadSessionPage();

    const html = await renderRoute(Page as never);

    expect(html).toContain(EN("validate.meta.title"));
    expect(html).toContain(EN("validate.meta.description"));
    expect(countOccurrences(html, "<h1")).toBe(1);
    expect(html).toContain("<main");
    expect(html).toContain('id="main"');
  });

  it("reveals no sentence, entry id, option, or outcome copy before proof", async () => {
    const { default: Page } = await loadSessionPage();

    const html = await renderRoute(Page as never);

    expect(html).not.toContain(INSTRUCTION);
    for (const sentence of OTHER_SENTENCES) expect(html).not.toContain(sentence);
    expect(html).not.toContain("OD_0007");
    expect(html).not.toContain(EN("validate.entry.instructionLabel"));
    expect(html).not.toContain(EN("validate.finished.label"));
    expect(html).not.toContain(EN("validate.failed.label"));
    expect(html).not.toContain(EN("validate.absent.label"));
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
  });

  it("carries no attempt-shaped value in the server markup", async () => {
    const { default: Page } = await loadSessionPage();

    // The gate stub renders null, so the batch half travels as a prop the
    // test observes below rather than as markup. A route that printed the
    // batch id (legacy shape embeds VAL_) or the attempt into the document
    // would fail here.
    const html = await renderRoute(Page as never);

    expect(html).not.toMatch(/VAL_/);
  });

  it("renders the Filipino shell copy when the locale cookie says so", async () => {
    const { default: Page } = await loadSessionPage();
    testLocale.value = "fil";

    const html = await renderRoute(Page as never);

    expect(html).toContain(FIL("validate.meta.title"));
    expect(html).toContain(FIL("validate.meta.description"));
    expect(html).not.toContain(INSTRUCTION);
  });
});

describe("the route hands the gate the batch half, never content", () => {
  it("hands the gate the stored identifier character for character", async () => {
    const { default: Page } = await loadSessionPage();

    await renderRoute(Page as never, { params: { batchId: LEGACY_BATCH_ID } });

    expect(gateCalls.calls).toHaveLength(1);
    expect(gateCalls.calls[0]?.batchId).toBe(LEGACY_BATCH_ID);
  });

  it("hands a new-shape BAT_ identifier through untouched", async () => {
    const { default: Page } = await loadSessionPage();

    await renderRoute(Page as never, { params: { batchId: NEW_BATCH_ID } });

    expect(gateCalls.calls).toHaveLength(1);
    expect(gateCalls.calls[0]?.batchId).toBe(NEW_BATCH_ID);
  });

  it("passes the locale through to the gate", async () => {
    const { default: Page } = await loadSessionPage();
    testLocale.value = "fil";

    await renderRoute(Page as never);

    expect(gateCalls.calls[0]?.locale).toBe("fil");
  });

  it("reads a numeric position straight out of the query string", async () => {
    const { default: Page } = await loadSessionPage();

    await renderRoute(Page as never, { searchParams: { position: "5" } });

    expect(gateCalls.calls[0]?.position).toBe(5);
  });

  it("sends NaN for a mangled position, so the refusal is the schema's and not a default", async () => {
    const { default: Page } = await loadSessionPage();

    await renderRoute(Page as never, { searchParams: { position: "abc" } });

    expect(Number.isNaN(gateCalls.calls[0]?.position)).toBe(true);
  });

  it("treats an absent, empty, or repeated position as no position at all", async () => {
    const { default: Page } = await loadSessionPage();

    for (const searchParams of [
      {},
      { position: "" },
      { position: "   " },
      { position: ["3", "4"] },
    ]) {
      gateCalls.calls.length = 0;

      await renderRoute(Page as never, { searchParams });

      expect(gateCalls.calls[0]?.position, JSON.stringify(searchParams)).toBe(undefined);
    }
  });
});

describe("an address that cannot name a batch goes home without proof", () => {
  it.each([["%"], ["%ZZ"], ["VAL_%E0%A4%A"], [""]])(
    "redirects for %s with no gate and no service call",
    async (segment) => {
      const { default: Page } = await loadSessionPage();
      gateCalls.calls.length = 0;

      await expect(renderRoute(Page as never, { params: { batchId: segment } })).rejects.toThrow(
        "NEXT_REDIRECT:/",
      );
      expect(gateCalls.calls).toEqual([]);
      expect(openOwnedValidationSession).not.toHaveBeenCalled();
      expect(sessionDependencies).not.toHaveBeenCalled();
    },
  );
});

describe("the initial server render performs no ownership work", () => {
  it("calls neither the gated open nor the dependency factory", async () => {
    const { default: Page } = await loadSessionPage();

    await renderRoute(Page as never);

    // Both halves the old route called during render now run inside the
    // bound server action, after the gate supplies the attempt half.
    expect(openOwnedValidationSession).not.toHaveBeenCalled();
    expect(sessionDependencies).not.toHaveBeenCalled();
  });
});
