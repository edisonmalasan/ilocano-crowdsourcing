import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StartBatch } from "@/app/validate/start-batch";
import { translatorFor } from "@/lib/i18n/copy";

import { batchIdFromAddress } from "./support/batch-address";
import { mount, type Mounted } from "./support/dom-harness";

/**
 * `/validate`'s auto-orchestration island — driven for real.
 *
 * =================================================================================================
 * WHY THIS FILE EXISTS
 * =================================================================================================
 * The orchestration (one start action resolving recovery, allocation, and the first entry
 * server-side, then one navigation) runs inside a mount EFFECT with no manual control on
 * the happy path. `renderToStaticMarkup` never runs effects, so the whole behaviour —
 * what fires, and where it navigates — is invisible to the static renderer. These are
 * behavioural: mount, let the promises resolve, observe.
 *
 *   AO-1  the single orchestration is issued on mount, carrying only the identifier
 *   AO-2  a resumed batch navigates to its own address, with no second request
 *   AO-3  with no interrupted batch the island starts a fresh batch and navigates
 *   AO-4  (retired: a failed internal recovery check falls through INSIDE the
 *          orchestration, so the client never observes it — proven in
 *          `tests/unit/start-validation-core.test.ts` instead of here)
 *   AO-5  exhaustion renders honestly with no navigation
 *   AO-6  failure renders honestly with a retry that re-runs the orchestration exactly once more
 *   AO-7  no stored identifier issues no request and points at screening
 *   AO-8  one mount issues one orchestration
 *   AO-9  an attempt without a recorded answer restarts screened
 *   AO-10 the island carries no title and the working state is a skeleton
 *   AO-11 the first entry's sentence never reaches the document on the start path
 *
 * =================================================================================================
 * WHAT THIS DOES NOT PROVE
 * =================================================================================================
 * `happy-dom` is a SYNTHETIC DOM. It proves a mount effect fires, what request leaves,
 * and where the router is told to go. It proves nothing about layout, contrast, focus order, or a
 * real viewport. The Server Action is mocked, so nothing here has spoken to a database. The
 * StrictMode double-mount guard (`started` ref) is review-only: this harness mounts without
 * StrictMode, so no test here can remount one instance.
 */

const h = vi.hoisted(() => ({
  pushes: [] as string[],
  /** Payloads handed to the start orchestration. */
  starts: [] as unknown[],
  /** Clears of the stored identifier. */
  cleared: 0,
  /** What the start orchestration reports, changed per test. */
  startResult: {
    status: "resumed",
    batchId: "VAL_a81d92c1-2026-09-30T20:14:03.117Z",
    entry: {
      id: "OD_1",
      category: "origin_destination",
      instruction: "Iti OD_1 ti ayanko ita.",
      origin: null,
      destination: null,
      transitMode: null,
    },
    position: 1,
    total: 5,
  } as unknown,
  /** What the browser holds, or `null`. */
  storedId: "VAL_a81d92c1" as string | null,
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
    return h.startResult;
  }),
}));

/**
 * `happy-dom` in this project exposes no `window.localStorage`, so the identity module is stubbed
 * exactly as `finished-batch.test.tsx` does. The real `readStoredValidatorId` is exercised in
 * `tests/unit/browser-identity.test.ts`; what THIS file owns is that the island consults the
 * module and forwards whatever it says.
 */
vi.mock("@/lib/validators/browser-identity", () => ({
  readStoredValidatorId: () => h.storedId,
  writeStoredValidatorId: () => {},
  clearStoredValidatorId: () => {
    h.cleared += 1;
  },
}));

const t = translatorFor("en");
const REAL_BATCH = "VAL_a81d92c1-2026-09-30T20:14:03.117Z";
const FRESH_BATCH = "VAL_fresh99-2026-10-02T00:00:00.000Z";

function freshResult(batchId: string = FRESH_BATCH): unknown {
  return {
    status: "started",
    batchId,
    entry: {
      id: "OD_1",
      category: "origin_destination",
      instruction: "Iti OD_1 ti ayanko ita.",
      origin: null,
      destination: null,
      transitMode: null,
    },
    position: 1,
    total: 5,
  };
}

let view: Mounted;

async function mountSettled(): Promise<Mounted> {
  const mounted = mount(<StartBatch locale="en" />);
  await mounted.settle();
  view = mounted;
  return mounted;
}

beforeEach(async () => {
  h.pushes.length = 0;
  h.starts.length = 0;
  h.cleared = 0;
  h.storedId = "VAL_a81d92c1";
  h.startResult = {
    status: "resumed",
    batchId: REAL_BATCH,
    entry: {
      id: "OD_1",
      category: "origin_destination",
      instruction: "Iti OD_1 ti ayanko ita.",
      origin: null,
      destination: null,
      transitMode: null,
    },
    position: 1,
    total: 5,
  };
  view = await mountSettled();
});

afterEach(() => {
  view.unmount();
  vi.clearAllMocks();
});

describe("AO-1 — the single orchestration is issued on mount, and carries only the identifier", () => {
  it("asks on mount without the participant doing anything", () => {
    // No press anywhere in this test, and that is the requirement: reaching
    // `/validate` starts the orchestration by itself, in ONE round trip.
    expect(h.starts).toHaveLength(1);
    expect((h.starts[0] as Record<string, unknown>)["validatorId"]).toBe("VAL_a81d92c1");
  });

  it("sends EXACTLY one key, and it is the identifier", () => {
    // A client cannot name a batch, choose entries, or supply ordering, so there is no
    // request in which any of those could be named. `Object.keys` rather than a
    // structural equality, so a third key fails whatever it is called.
    const payload = h.starts[0] as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["validatorId"]);
    expect(JSON.stringify(payload)).not.toContain("batchId");
  });
});

describe("AO-2 — a resumable batch is resumed without asking", () => {
  it("navigates to the resumed batch's own address", () => {
    // The address names the stored batch, asserted through a ROUND TRIP rather
    // than against a literal — a real id embeds a timestamp, so this is the
    // case where an encoding mistake actually changes the address.
    expect(h.pushes).toHaveLength(1);
    expect(batchIdFromAddress(h.pushes[0] as string)).toBe(REAL_BATCH);
  });

  it("issues no second request alongside the resumption", () => {
    // Resuming is navigation, not a lifecycle event: the single orchestration already
    // resolved everything, and nothing further leaves the client.
    expect(h.starts).toHaveLength(1);
  });
});

describe("AO-3 — with no interrupted batch the island starts a fresh batch", () => {
  it("navigates to the newly started batch", async () => {
    h.startResult = freshResult();
    view.unmount();
    // The `beforeEach` mount already ran once, so the logs are CLEARED rather
    // than read: asserting against the previous mount's entries would fail for
    // a reason unrelated to this test.
    h.pushes.length = 0;
    h.starts.length = 0;
    view = await mountSettled();

    expect(h.starts).toHaveLength(1);
    expect((h.starts[0] as Record<string, unknown>)["validatorId"]).toBe("VAL_a81d92c1");
    expect(h.pushes).toHaveLength(1);
    // The round trip, not a literal: the address must name the batch the
    // SERVER chose, not a hand-written string shaped like one.
    expect(batchIdFromAddress(h.pushes[0] as string)).toBe(FRESH_BATCH);
  });
});

describe("AO-5 — exhaustion renders honestly", () => {
  it("shows the exhausted state with no navigation", async () => {
    h.startResult = { status: "exhausted" };
    view.unmount();
    h.pushes.length = 0;
    view = await mountSettled();

    expect(h.pushes).toEqual([]);
    expect(view.container.innerHTML).toContain(t("validateStart.exhausted"));
  });
});

describe("AO-6 — failure renders honestly with a retry", () => {
  it("shows the reason and retries the orchestration on press", async () => {
    h.startResult = { status: "failed", reason: "persistence" };
    view.unmount();
    h.pushes.length = 0;
    h.starts.length = 0;
    view = await mountSettled();

    expect(h.pushes).toEqual([]);
    const alert = view.one('[role="alert"]');
    expect(alert.textContent).toBe(t("validateStart.failure.persistence"));

    // The retry is the only button on the error state. Pressing it re-runs the
    // single orchestration exactly once more.
    h.startResult = freshResult();
    await view.pressAndSettle(view.one("button"));

    expect(h.starts).toHaveLength(2);
    expect(h.pushes).toHaveLength(1);
    expect(batchIdFromAddress(h.pushes[0] as string)).toBe(FRESH_BATCH);
  });
});

describe("AO-7 — no stored identifier issues no request", () => {
  it("points at screening instead", async () => {
    h.storedId = null;
    view.unmount();
    // The `beforeEach` mount already ran once, so the logs are CLEARED rather
    // than read: the null-identity mount below must issue nothing itself.
    h.pushes.length = 0;
    h.starts.length = 0;
    view = await mountSettled();

    // A browser with no identity cannot have been enrolled: the orchestration may not
    // run, and the screen says where to go instead.
    expect(h.starts).toEqual([]);
    expect(view.container.innerHTML).toContain(t("validateStart.noIdentity"));
    const cta = view.one('a[href="/start"]');
    expect(cta.textContent).toBe(t("validateStart.noIdentity.cta"));
  });
});

describe("AO-8 — one mount issues one orchestration", () => {
  it("never double-issues on a single mount", () => {
    expect(h.starts).toHaveLength(1);
    expect(h.pushes).toHaveLength(1);
  });

  it("issues exactly one orchestration under a StrictMode double-mount", async () => {
    // React 19 StrictMode mounts, unmounts, and remounts effects in development with the
    // SAME refs, so the `started` guard's first run must close the second synchronously
    // before its first `await`. Without the guard this mounts two orchestrations — two
    // batches and two reservation sets for one participant — and this is the test that
    // goes red: deleting the guard yields two starts instead of one.
    h.pushes.length = 0;
    h.starts.length = 0;
    const strict = mount(
      <StrictMode>
        <StartBatch locale="en" />
      </StrictMode>,
    );
    try {
      await strict.settle();
      expect(h.starts).toHaveLength(1);
      expect(h.pushes).toHaveLength(1);
    } finally {
      strict.unmount();
    }
  });
});

describe("AO-10 — the island carries no title and the working state is a skeleton", () => {
  it("renders no heading of its own, so the route title appears exactly once", async () => {
    // The route page owns the single `h1`. An island-level heading with the
    // same title rendered "Start validating" twice — once as the page, once
    // as the card — which is the defect this guards.
    h.startResult = { status: "exhausted" };
    view.unmount();
    view = await mountSettled();

    expect(view.all("h1").length).toBe(0);
    expect(view.all("h2").length).toBe(0);
    expect(view.container.innerHTML).toContain(t("validateStart.exhausted"));
  });

  it("shows the validation skeleton while working, never a preparing card", async () => {
    // Mount settles past working on the default fixture, so hold the run
    // open: the orchestration mock below never resolves, leaving the island in
    // its working phase while the assertions run.
    h.startResult = new Promise(() => {}) as unknown as Record<string, unknown>;
    view.unmount();
    view = mount(<StartBatch locale="en" />);
    await view.settle();

    // The normal-flow working state is the validation skeleton: a busy
    // container whose visual blocks are hidden from assistive technology, with
    // no "Preparing your sentences" card text anywhere in the flow.
    expect(view.one('[data-skeleton="validation"]')?.getAttribute("aria-busy")).toBe("true");
    expect(view.container.textContent ?? "").not.toContain(t("validateStart.working"));
    expect(view.container.textContent ?? "").not.toContain(t("validateStart.working.ariaLabel"));
    h.startResult = freshResult();
  });
});

describe("AO-9 — an attempt without a recorded answer restarts screened", () => {
  it("shows the restart state with no retry, and restarting clears without a write", async () => {
    h.startResult = { status: "failed", reason: "screening_required" };
    view.unmount();
    h.pushes.length = 0;
    h.starts.length = 0;
    view = await mountSettled();

    // The refusal is deterministic, so no retry control exists: the only
    // button on this state restarts, and it is labelled as such.
    expect(h.pushes).toEqual([]);
    expect(view.container.innerHTML).toContain(t("validateStart.screeningRequired"));
    const buttons = view.all("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe(t("validateStart.restart"));

    // Restarting retires the attempt the way Finish does — the identifier is
    // browser-held, so clearing it ends the attempt with zero server writes —
    // and moves to screening for the new screened attempt.
    await view.pressAndSettle(buttons[0] as Element);

    expect(h.cleared).toBe(1);
    expect(h.pushes).toEqual(["/start"]);
    // And no second orchestration was attempted on the way out: the restart is a
    // local retirement plus a navigation, never a request.
    expect(h.starts).toHaveLength(1);

    // WEAKNESS: observes that no request left, not that none COULD. A restart
    // that also re-requested before navigating would still show these counts
    // if the request failed silently — the write-intake boundary is what makes
    // an unobserved request impossible rather than merely unobserved.
  });
});

describe("AO-11 — the first entry never reaches the document on the start path", () => {
  it("navigates without rendering the orchestration's entry", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { parseSyntheticDataset } = await import("@/lib/dataset/synthetic-source");
    const { entries } = parseSyntheticDataset(
      JSON.parse(
        readFileSync(join(process.cwd(), "data", "merged-ilocano-synthetic-data.json"), "utf8"),
      ),
    );
    expect(entries.length, "this control read a real dataset").toBe(4800);
    const instruction = entries[0].instruction;

    h.startResult = {
      status: "started",
      batchId: FRESH_BATCH,
      entry: {
        id: entries[0].id,
        category: "origin_destination",
        instruction,
        origin: null,
        destination: null,
        transitMode: null,
      },
      position: 1,
      total: 5,
    };
    view.unmount();
    h.pushes.length = 0;
    h.starts.length = 0;
    view = await mountSettled();

    // The island navigates to the batch address; the entry itself is rendered by the
    // batch route, never by this screen.
    expect(h.pushes).toHaveLength(1);
    expect(batchIdFromAddress(h.pushes[0] as string)).toBe(FRESH_BATCH);
    expect(view.container.innerHTML).not.toContain(instruction);
    expect(view.container.innerHTML).not.toContain(entries[0].id);
  });
});
