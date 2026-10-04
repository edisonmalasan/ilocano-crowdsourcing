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
 * The orchestration (recovery lookup, then allocation, then one navigation) runs inside a mount
 * EFFECT with no manual control on the happy path. `renderToStaticMarkup` never runs effects, so
 * the whole behaviour — what fires, in what order, and where it navigates — is invisible to the
 * static renderer. These are behavioural: mount, let the promises resolve, observe.
 *
 *   AO-1  the lookup is issued on mount, carrying only the identifier
 *   AO-2  a recognised interrupted batch navigates to its own address, with no allocation request
 *   AO-3  with no interrupted batch the island allocates and navigates to the new batch
 *   AO-4  a failed lookup falls through to allocation rather than stranding the participant
 *   AO-5  exhaustion renders honestly with no navigation
 *   AO-6  failure renders honestly with a retry that re-runs the orchestration exactly once more
 *   AO-7  no stored identifier issues no request and points at screening
 *   AO-8  one mount issues one lookup and at most one allocation
 *
 * =================================================================================================
 * WHAT THIS DOES NOT PROVE
 * =================================================================================================
 * `happy-dom` is a SYNTHETIC DOM. It proves a mount effect fires, in what order requests leave,
 * and where the router is told to go. It proves nothing about layout, contrast, focus order, or a
 * real viewport. Both Server Actions are mocked, so nothing here has spoken to a database. The
 * StrictMode double-mount guard (`started` ref) is review-only: this harness mounts without
 * StrictMode, so no test here can remount one instance.
 */

const h = vi.hoisted(() => ({
  pushes: [] as string[],
  /** Payloads handed to the ALLOCATION action. */
  allocations: [] as unknown[],
  /** Payloads handed to the RECOVERY action. */
  lookups: [] as unknown[],
  /** Clears of the stored identifier. */
  cleared: 0,
  /** What the recovery action reports, changed per test. */
  lookupResult: {
    status: "interrupted",
    offer: { batchId: "VAL_a81d92c1-2026-09-30T20:14:03.117Z", remaining: 4, total: 10 },
  } as unknown,
  /** What the allocation action reports. */
  allocationResult: {
    status: "allocated",
    batchId: "VAL_fresh99-2026-10-02T00:00:00.000Z",
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

vi.mock("@/lib/allocation/actions", () => ({
  requestBatchAction: vi.fn(async (raw: unknown) => {
    h.allocations.push(raw);
    return h.allocationResult;
  }),
}));

vi.mock("@/lib/validation/recovery-actions", () => ({
  requestInterruptedBatchAction: vi.fn(async (raw: unknown) => {
    h.lookups.push(raw);
    return h.lookupResult;
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

let view: Mounted;

async function mountSettled(): Promise<Mounted> {
  const mounted = mount(<StartBatch locale="en" />);
  await mounted.settle();
  view = mounted;
  return mounted;
}

beforeEach(async () => {
  h.pushes.length = 0;
  h.allocations.length = 0;
  h.lookups.length = 0;
  h.cleared = 0;
  h.storedId = "VAL_a81d92c1";
  h.lookupResult = {
    status: "interrupted",
    offer: { batchId: REAL_BATCH, remaining: 4, total: 10 },
  };
  h.allocationResult = { status: "allocated", batchId: FRESH_BATCH };
  view = await mountSettled();
});

afterEach(() => {
  view.unmount();
  vi.clearAllMocks();
});

describe("AO-1 — the lookup is issued on mount, and carries only the identifier", () => {
  it("asks on mount without the participant doing anything", () => {
    // No press anywhere in this test, and that is the requirement: reaching
    // `/validate` starts the orchestration by itself.
    expect(h.lookups).toHaveLength(1);
    expect((h.lookups[0] as Record<string, unknown>)["validatorId"]).toBe("VAL_a81d92c1");
  });

  it("sends EXACTLY one key, and it is the identifier", () => {
    // A client cannot NAME a batch, so there is no request in which a batch
    // could be named. `Object.keys` rather than a structural equality, so a
    // third key fails whatever it is called.
    const payload = h.lookups[0] as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["validatorId"]);
    expect(JSON.stringify(payload)).not.toContain("batchId");
  });
});

describe("AO-2 — a recognised interrupted batch is resumed without asking", () => {
  it("navigates to the interrupted batch's own address", () => {
    // The address names the stored batch, asserted through a ROUND TRIP rather
    // than against a literal — a real id embeds a timestamp, so this is the
    // case where an encoding mistake actually changes the address.
    expect(h.pushes).toHaveLength(1);
    expect(batchIdFromAddress(h.pushes[0] as string)).toBe(REAL_BATCH);
  });

  it("issues no allocation request alongside the resumption", () => {
    // Resuming is navigation, not a lifecycle event: nothing is created for it.
    expect(h.allocations).toEqual([]);
  });
});

describe("AO-3 — with no interrupted batch the island allocates", () => {
  it("navigates to the newly allocated batch", async () => {
    h.lookupResult = { status: "none" };
    view.unmount();
    // The `beforeEach` mount already ran once, so the logs are CLEARED rather
    // than read: asserting against the previous mount's entries would fail for
    // a reason unrelated to this test.
    h.pushes.length = 0;
    h.allocations.length = 0;
    h.lookups.length = 0;
    view = await mountSettled();

    expect(h.allocations).toHaveLength(1);
    expect((h.allocations[0] as Record<string, unknown>)["validatorId"]).toBe("VAL_a81d92c1");
    expect(h.pushes).toHaveLength(1);
    // The round trip, not a literal: the address must name the batch the
    // SERVER chose, not a hand-written string shaped like one.
    expect(batchIdFromAddress(h.pushes[0] as string)).toBe(FRESH_BATCH);
  });
});

describe("AO-4 — a failed lookup falls through to allocation", () => {
  it("still allocates and never shows the failure", async () => {
    h.lookupResult = { status: "failed", reason: "unavailable" };
    view.unmount();
    h.pushes.length = 0;
    h.allocations.length = 0;
    h.lookups.length = 0;
    view = await mountSettled();

    // The participant cannot act on a lookup failure, so none is shown: no
    // alert role, and the orchestration proceeded exactly as with `none`.
    expect(view.all('[role="alert"]').length).toBe(0);
    expect(h.allocations).toHaveLength(1);
    expect(batchIdFromAddress(h.pushes[0] as string)).toBe(FRESH_BATCH);
  });
});

describe("AO-5 — exhaustion renders honestly", () => {
  it("shows the exhausted state with no navigation", async () => {
    h.lookupResult = { status: "none" };
    h.allocationResult = { status: "exhausted" };
    view.unmount();
    h.pushes.length = 0;
    view = await mountSettled();

    expect(h.pushes).toEqual([]);
    expect(view.container.innerHTML).toContain(t("validateStart.exhausted"));
  });
});

describe("AO-6 — failure renders honestly with a retry", () => {
  it("shows the reason and retries the whole orchestration on press", async () => {
    h.lookupResult = { status: "none" };
    h.allocationResult = { status: "failed", reason: "persistence" };
    view.unmount();
    h.pushes.length = 0;
    h.allocations.length = 0;
    h.lookups.length = 0;
    view = await mountSettled();

    expect(h.pushes).toEqual([]);
    const alert = view.one('[role="alert"]');
    expect(alert.textContent).toBe(t("validateStart.failure.persistence"));

    // The retry is the only button on the error state. Pressing it re-runs the
    // orchestration exactly once more: one more lookup and one more allocation
    // on top of the mount's own run.
    h.allocationResult = { status: "allocated", batchId: FRESH_BATCH };
    await view.pressAndSettle(view.one("button"));

    expect(h.lookups).toHaveLength(2);
    expect(h.allocations).toHaveLength(2);
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
    h.allocations.length = 0;
    h.lookups.length = 0;
    view = await mountSettled();

    // A browser with no identity cannot have been enrolled: neither the lookup
    // nor the allocation may run, and the screen says where to go instead.
    expect(h.lookups).toEqual([]);
    expect(h.allocations).toEqual([]);
    expect(view.container.innerHTML).toContain(t("validateStart.noIdentity"));
    const cta = view.one('a[href="/start"]');
    expect(cta.textContent).toBe(t("validateStart.noIdentity.cta"));
  });
});

describe("AO-8 — one mount issues one lookup and at most one allocation", () => {
  it("never double-issues on a single mount", () => {
    // The allocation half is conditional on the lookup: resume issues none,
    // fall-through issues one. Either way the counts below are the whole run.
    expect(h.lookups).toHaveLength(1);
    expect(h.allocations.length).toBeLessThanOrEqual(1);
    expect(h.pushes).toHaveLength(1);
  });
});

describe("AO-10 — the island carries no title and the working state reads as pending", () => {
  it("renders no heading of its own, so the route title appears exactly once", async () => {
    // The route page owns the single `h1`. An island-level heading with the
    // same title rendered "Start validating" twice — once as the page, once
    // as the card — which is the defect this guards.
    h.lookupResult = { status: "none" };
    h.allocationResult = { status: "exhausted" };
    view.unmount();
    view = await mountSettled();

    expect(view.all("h1").length).toBe(0);
    expect(view.all("h2").length).toBe(0);
    expect(view.container.innerHTML).toContain(t("validateStart.exhausted"));
  });

  it("marks the working state pending with a status role and a busy section", async () => {
    // Mount settles past working on the default fixture, so hold the run
    // open: the allocation mock below never resolves, leaving the island in
    // its working phase while the assertions run.
    h.lookupResult = { status: "none" };
    h.allocationResult = new Promise(() => {}) as unknown as Record<string, unknown>;
    view.unmount();
    view = mount(<StartBatch locale="en" />);
    await view.settle();

    const status = view.one('[role="status"]');
    expect(status.textContent).toBe(t("validateStart.working"));
    expect(view.one("section")?.getAttribute("aria-busy")).toBe("true");
    h.allocationResult = { status: "allocated", batchId: FRESH_BATCH };
  });
});

describe("AO-9 — an attempt without a recorded answer restarts screened", () => {
  it("shows the restart state with no retry, and restarting clears without a write", async () => {
    h.lookupResult = { status: "none" };
    h.allocationResult = { status: "failed", reason: "screening_required" };
    view.unmount();
    h.pushes.length = 0;
    h.allocations.length = 0;
    h.lookups.length = 0;
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
    // And no second allocation was attempted on the way out: the restart is a
    // local retirement plus a navigation, never a request.
    expect(h.allocations).toHaveLength(1);
    expect(h.lookups).toHaveLength(1);

    // WEAKNESS: observes that no request left, not that none COULD. A restart
    // that also re-requested before navigating would still show these counts
    // if the request failed silently — the write-intake boundary is what makes
    // an unobserved request impossible rather than merely unobserved.
  });
});
