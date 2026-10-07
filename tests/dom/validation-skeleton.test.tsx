import { afterEach, describe, expect, it, vi } from "vitest";

import { ValidationPageShell } from "@/components/validation/validation-page-shell";
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

/**
 * `StartBatch` now renders the session runner in place on the happy path, and
 * the real runner pulls server-action modules (`server-only`) that happy-dom
 * cannot import. This file owns the SKELETON states, not the handoff — so the
 * runner is stubbed to a marker, exactly as `start-batch.test.tsx` does for
 * the handoff it owns.
 */
vi.mock("@/app/validate/[batchId]/validation-session", () => ({
  ValidationSessionRunner: () => <div data-runner="session" />,
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
  it("renders heading, description, and skeleton in the shared shell geometry", () => {
    // `loading.tsx` is an async Server Component, which happy-dom cannot mount
    // as a client component — so this renders exactly what it renders: the
    // shared shell with the skeleton in its content slot. The source half
    // (`validation-server-boundary.test.ts`) pins that the boundary imports
    // and renders both. What this proves is the geometry: heading once,
    // description once, skeleton once, in the validation main landmark.
    const loading = mount(
      <ValidationPageShell
        title={t("validate.meta.title")}
        description={t("validate.meta.description")}
      >
        <ValidationSkeleton />
      </ValidationPageShell>,
    );
    view = loading;

    expect(loading.one("main#main h1")?.textContent).toBe(t("validate.meta.title"));
    expect(loading.one("main#main [data-skeleton='validation']")).toBeTruthy();
    expect(loading.container.textContent ?? "").toContain(t("validate.meta.description"));
    // No duplicate layout beside the skeleton: no card text, no form, no button.
    expect(loading.all("button").length).toBe(0);
    expect(loading.all("form").length).toBe(0);
    // The shell container geometry is the contract the handoff preserves.
    expect(loading.one("main#main")?.getAttribute("class")).toContain("max-w-2xl");
  });

  it("shares container geometry with the presenting shell", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const shell = readFileSync(
      join(process.cwd(), "src", "components", "validation", "validation-page-shell.tsx"),
      "utf8",
    );
    // One shell module owns the main container: the start page, the session
    // route, and the loading fallback cannot drift because none of them spells
    // the container itself.
    expect(shell).toContain("max-w-2xl");
    const page = readFileSync(join(process.cwd(), "src", "app", "validate", "page.tsx"), "utf8");
    const session = readFileSync(
      join(process.cwd(), "src", "app", "validate", "[batchId]", "page.tsx"),
      "utf8",
    );
    const fallback = readFileSync(
      join(process.cwd(), "src", "app", "validate", "[batchId]", "loading.tsx"),
      "utf8",
    );
    for (const source of [page, session, fallback]) {
      expect(source).toContain("ValidationPageShell");
    }
    for (const source of [page, session, fallback]) {
      expect(source).not.toMatch(/<main[^>]*id="main"/);
    }
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

describe("K-9 — the skeleton shares geometry with the real UI, not a redraw", () => {
  it("renders the real EntryCard shell, the real option classes, and the real button size", async () => {
    const skeleton = mountSkeleton();
    const { ENTRY_CARD_SECTION_CLASS, ENTRY_CARD_INNER_CLASS } =
      await import("@/components/validation/entry-card");
    const { answerOptionClasses } = await import("@/components/validation/answer-option-styles");
    const { buttonClasses } = await import("@/components/ui/button");

    const section = skeleton.all("section")[0]!;
    for (const token of ENTRY_CARD_SECTION_CLASS.split(" ")) {
      expect(section.getAttribute("class")).toContain(token);
    }
    const inner = section.querySelector("div");
    for (const token of ENTRY_CARD_INNER_CLASS.split(" ")) {
      expect(inner?.getAttribute("class")).toContain(token);
    }

    const options = skeleton.all('[data-skeleton-line="option"]');
    expect(options).toHaveLength(4);
    const expectedOption = answerOptionClasses({ selected: false });
    for (const option of options) {
      expect(option.getAttribute("class")).toBe(expectedOption);
    }

    // Save-button block mirrors Button size="lg" geometry (min-h-13 px-7 py-3.5, full width).
    const buttonBlock = skeleton.one('[data-skeleton-line="button"]');
    const buttonGeometry = buttonClasses({ size: "lg", fullWidth: true });
    for (const token of ["min-h-13", "px-7", "py-3.5", "w-full"]) {
      expect(buttonBlock.getAttribute("class")).toContain(token);
      expect(buttonGeometry).toContain(token);
    }
  });

  it("carries no control semantics: no button, form, or focusable content", () => {
    const skeleton = mountSkeleton();
    expect(skeleton.all("button").length).toBe(0);
    expect(skeleton.all("form").length).toBe(0);
    expect(skeleton.all("a").length).toBe(0);
    expect(skeleton.all("input").length).toBe(0);
    expect(skeleton.all("textarea").length).toBe(0);
    expect(skeleton.all("[tabindex]").length).toBe(0);
  });
});

describe("K-10 — the sentence skeleton adapts to the upcoming sentence length", () => {
  it("shows fewer lines for a short sentence and more for a long one, never the text", async () => {
    const { ValidationSkeleton: Skeleton } =
      await import("@/components/validation/validation-skeleton");
    const short = mount(<Skeleton upcomingInstructionLength={21} />);
    const long = mount(<Skeleton upcomingInstructionLength={185} />);
    view = short;
    try {
      const shortLines = short.all('[data-skeleton-line="sentence"]');
      const longLines = long.all('[data-skeleton-line="sentence"]');
      expect(shortLines.length).toBeLessThan(longLines.length);
      expect(shortLines.length).toBe(1);
      expect(longLines.length).toBe(4);
      expect((short.container.textContent ?? "").trim()).toBe("");
      expect((long.container.textContent ?? "").trim()).toBe("");
    } finally {
      short.unmount();
      long.unmount();
      view = null;
    }
  });

  it("uses the stable generic shape when the upcoming sentence is unknown", async () => {
    const { ValidationSkeleton: Skeleton } =
      await import("@/components/validation/validation-skeleton");
    const generic = mount(<Skeleton />);
    const explicit = mount(<Skeleton upcomingInstructionLength={null} />);
    view = generic;
    try {
      expect(generic.all('[data-skeleton-line="sentence"]').length).toBe(2);
      expect(explicit.all('[data-skeleton-line="sentence"]').length).toBe(2);
      expect((generic.container.textContent ?? "").trim()).toBe("");
    } finally {
      generic.unmount();
      explicit.unmount();
      view = null;
    }
  });
});
