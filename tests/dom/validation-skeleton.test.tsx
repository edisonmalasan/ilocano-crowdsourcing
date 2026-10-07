import { afterEach, describe, expect, it, vi } from "vitest";

import ValidateBatchLoading from "@/app/validate/[batchId]/loading";
import { StartBatch } from "@/app/validate/start-batch";
import { ValidationSkeleton } from "@/components/validation/validation-skeleton";
import { translatorFor } from "@/lib/i18n/copy";

import { mount, type Mounted } from "./support/dom-harness";

/**
 * The validation skeleton family — driven for real.
 *
 *   K-1  the skeleton carries layout blocks and zero text
 *   K-2  visual blocks are hidden from assistive technology; the container reports busy
 *   K-3  no animation classes exist to violate reduced motion
 *   K-4  no fake research content: no sentence, no place name, no Ilocano-like word
 *   K-5  the session loading boundary renders the skeleton inside the route shell
 *   K-6  the start working phase renders the skeleton, never a preparing card
 *   K-7  a failed start replaces any loading presentation with the error state
 *   K-8  the finished card's pending Continue stays an in-button label, not a skeleton
 *
 * WHAT THIS DOES NOT PROVE
 * `happy-dom` performs no navigation, so "Answer another batch → skeleton while
 * pending" is proven as its two observable halves (the card never renders a
 * skeleton itself; the route boundary renders one while the server resolves),
 * not as an observed navigation. No test here opens a real browser.
 */

const t = translatorFor("en");

const h = vi.hoisted(() => ({
  pushes: [] as string[],
  starts: [] as unknown[],
  startResult: null as unknown,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (destination: string) => {
      h.pushes.push(destination);
    },
    replace: () => {},
    refresh: () => {},
    back: () => {},
  }),
}));

vi.mock("@/lib/validation/start-validation-actions", () => ({
  requestStartValidationAction: vi.fn(async (raw: unknown) => {
    h.starts.push(raw);
    return h.startResult as never;
  }),
}));

vi.mock("@/lib/validators/browser-identity", () => ({
  readStoredValidatorId: vi.fn(() => "validator-attempt"),
  writeStoredValidatorId: vi.fn(() => {}),
  clearStoredValidatorId: vi.fn(() => {}),
}));

let view: Mounted | null = null;

function mountSkeleton(): Mounted {
  const mounted = mount(<ValidationSkeleton />);
  view = mounted;
  return mounted;
}

afterEach(() => {
  view?.unmount();
  view = null;
  vi.clearAllMocks();
});

describe("K-1 — the skeleton carries layout blocks and zero text", () => {
  it("renders block placeholders with no text content at all", () => {
    const skeleton = mountSkeleton();

    // Two layout regions (sentence card, form card) with neutral blocks inside.
    expect(skeleton.all('[data-skeleton="validation"]').length).toBe(1);
    expect(skeleton.all("span").length).toBeGreaterThan(5);
    // Zero text: nothing here can be mistaken for a sentence under evaluation.
    expect((skeleton.container.textContent ?? "").trim()).toBe("");
  });
});

describe("K-2 — assistive technology meets meaning, not blocks", () => {
  it("hides the visual pieces and reports the container as busy", () => {
    const skeleton = mountSkeleton();

    const container = skeleton.one('[data-skeleton="validation"]');
    expect(container.getAttribute("aria-busy")).toBe("true");
    // The purely visual pieces expose nothing to assistive technology: the
    // inner presentation wrapper (not the busy container itself, where the
    // two would contradict) is hidden.
    const visual = container.querySelector("[aria-hidden]");
    expect(visual?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("K-3 — reduced motion has nothing to reduce", () => {
  it("uses no animation classes anywhere in the skeleton", () => {
    const skeleton = mountSkeleton();

    const animated = skeleton
      .all("[class]")
      .filter((element) => /(^|\s)animate-/.test(element.getAttribute("class") ?? ""));
    expect(animated).toEqual([]);
  });
});

describe("K-4 — no fake research content", () => {
  it("contains no sentence, place name, or Ilocano-like word", () => {
    const skeleton = mountSkeleton();
    const text = skeleton.container.textContent ?? "";

    expect(text).not.toMatch(/Iti\s+\w+/);
    expect(text).not.toMatch(/ayanko|makadanon|napanda|Baguio|Convention/);
    expect(text.trim()).toBe("");
  });
});

describe("K-5 — the session loading boundary is the skeleton in the route shell", () => {
  it("renders the skeleton inside the validation main landmark, and nothing else", () => {
    const loading = mount(<ValidateBatchLoading />);
    view = loading;

    expect(loading.one("main#main [data-skeleton='validation']")).toBeTruthy();
    // No duplicate layout beside the skeleton: no card text, no form, no button.
    expect(loading.all("button").length).toBe(0);
    expect(loading.all("form").length).toBe(0);
    expect((loading.container.textContent ?? "").trim()).toBe("");
  });
});

describe("K-6 — the start working phase is the skeleton, not a preparing card", () => {
  it("shows the skeleton with no preparing copy in English or Filipino", async () => {
    h.startResult = new Promise(() => {});
    const started = mount(<StartBatch locale="en" />);
    view = started;
    await started.settle();

    expect(started.one('[data-skeleton="validation"]')).toBeTruthy();
    const text = started.container.textContent ?? "";
    expect(text).not.toContain(t("validateStart.working"));
    expect(text).not.toContain(t("validateStart.working.ariaLabel"));
    const fil = translatorFor("fil");
    expect(text).not.toContain(fil("validateStart.working"));
  });
});

describe("K-7 — failure replaces loading with the error state", () => {
  it("renders the retryable error with no skeleton standing", async () => {
    h.startResult = { status: "failed", reason: "persistence" };
    const started = mount(<StartBatch locale="en" />);
    view = started;
    await started.settle();

    expect(started.all('[data-skeleton="validation"]').length).toBe(0);
    expect(started.one('[role="alert"]')).toBeTruthy();
    expect(started.all("button").length).toBe(1);
  });
});

describe("K-8 — the finished card never renders a skeleton of its own", () => {
  it("holds no skeleton markup in any state", async () => {
    // The finished card's Continue is a control that navigates to the next
    // batch address; while the server resolves that address the ROUTE boundary
    // (K-5) is the skeleton, so the card itself must not grow one — otherwise
    // the participant would see two loading layouts for one wait.
    const { FinishedBatch } = await import("@/app/validate/[batchId]/finished-batch");
    const finished = mount(<FinishedBatch locale="en" />);
    view = finished;
    await finished.settle();

    expect(finished.all('[data-skeleton="validation"]').length).toBe(0);
    expect(finished.all("button").length).toBe(2);
  });
});
