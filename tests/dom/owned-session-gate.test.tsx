import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { translatorFor } from "@/lib/i18n/copy";
import type {
  OwnedValidationSessionRequest,
  ValidationSessionOutcome,
} from "@/lib/validation/session";
import { OwnedSessionGate } from "@/app/validate/[batchId]/owned-session-gate";
import { mount, type Mounted } from "./support/dom-harness";

const BATCH_ID = "VAL_720f59cd-2026-10-02T19:46:56.320Z";
const OWNER = "VAL_720f59cd";
const SENTENCE = "Iti Baguio Athletic Bowl ti ayanko ita.";

const t = translatorFor("en");

const h = vi.hoisted(() => ({
  replaces: [] as string[],
  /** The attempt the stubbed identity module reports, or null for none. */
  storedId: null as string | null,
  /** Every ownership request the gate issued, in order. */
  requests: [] as OwnedValidationSessionRequest[],
  /** The scripted gated-open answer, or a held proof while the shell is asserted. */
  hold: null as null | {
    promise: Promise<ValidationSessionOutcome>;
    resolve: (value: ValidationSessionOutcome) => void;
  },
  result: null as null | ValidationSessionOutcome,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: () => {},
    replace: (destination: string) => {
      h.replaces.push(destination);
    },
    refresh: () => {},
    back: () => {},
  }),
}));

vi.mock("@/lib/validators/browser-identity", () => ({
  readStoredValidatorId: vi.fn(() => h.storedId),
  writeStoredValidatorId: vi.fn(() => {}),
  clearStoredValidatorId: vi.fn(() => {}),
}));

vi.mock("@/lib/validation/next-entry-actions", () => ({
  requestNextEntryAction: vi.fn(async () => ({ status: "finished" })),
}));

vi.mock("@/lib/validation/verify-batch-actions", () => ({
  verifyBatchResponsesAction: vi.fn(async () => ({
    status: "verified",
    complete: true,
    missing: [],
    total: 0,
  })),
}));

vi.mock("@/lib/validation/start-validation-actions", () => ({
  requestStartValidationAction: vi.fn(async () => ({ status: "failed", reason: "persistence" })),
}));

function presenting(): ValidationSessionOutcome {
  return {
    status: "presenting",
    session: {
      batchId: BATCH_ID,
      entry: {
        id: "OD_1",
        category: "origin_destination",
        instruction: SENTENCE,
        origin: null,
        destination: null,
        transitMode: null,
      },
      position: 1,
      total: 5,
      completedCount: 0,
      remainingCount: 5,
    },
  };
}

function openSessionStub(raw: OwnedValidationSessionRequest): Promise<ValidationSessionOutcome> {
  h.requests.push(raw);
  if (h.hold !== null) return h.hold.promise;
  if (h.result === null) throw new Error("openSession called with no scripted answer");
  return Promise.resolve(h.result);
}

let view: Mounted | null = null;

function mountGate(): void {
  view = mount(
    <OwnedSessionGate
      locale="en"
      batchId={BATCH_ID}
      position={undefined}
      openSession={openSessionStub}
    />,
  );
}

beforeEach(() => {
  h.replaces.length = 0;
  h.requests.length = 0;
  h.hold = null;
  h.result = null;
  h.storedId = OWNER;
});

afterEach(async () => {
  // Release a still-held proof BEFORE unmounting, so no promise outlives the
  // root that is waiting on it.
  if (h.hold !== null) {
    const held = h.hold;
    h.hold = null;
    await view?.settle(() => {
      held.resolve(presenting());
    });
  }
  view?.unmount();
  view = null;
  vi.clearAllMocks();
});

describe("the gate proves before it presents", () => {
  it("renders a neutral shell with no sentence while the proof is in flight", async () => {
    let resolve!: (value: ValidationSessionOutcome) => void;
    const promise = new Promise<ValidationSessionOutcome>((res) => {
      resolve = res;
    });
    h.hold = { promise, resolve };

    mountGate();
    await view?.settle();

    const text = view?.container.textContent ?? "";
    expect(text).not.toContain(SENTENCE);
    expect(h.requests).toHaveLength(1);
  });

  it("hands the gated open both halves: the route batch and the stored attempt", async () => {
    h.result = presenting();

    mountGate();
    await view?.settle();

    expect(h.requests).toEqual([
      { batchId: BATCH_ID, position: undefined, activeAttemptId: OWNER },
    ]);
    expect(view?.container.textContent ?? "").toContain(SENTENCE);
  });

  it("navigates home on a redirect outcome and never renders the sentence", async () => {
    h.result = { status: "redirectHome" };

    mountGate();
    await view?.settle();

    expect(h.replaces).toEqual(["/"]);
    expect(view?.container.textContent ?? "").not.toContain(SENTENCE);
  });

  it("navigates home with no proof at all when there is no stored attempt", async () => {
    h.storedId = null;

    mountGate();
    await view?.settle();

    expect(h.replaces).toEqual(["/"]);
    expect(h.requests).toEqual([]);
  });

  it("renders the failure explanation with no navigation when the read fails", async () => {
    h.result = { status: "failed", reason: "persistence" };

    mountGate();
    await view?.settle();

    expect(h.replaces).toEqual([]);
    const text = view?.container.textContent ?? "";
    expect(text).toContain(t("validate.failed.label"));
    expect(text).not.toContain(SENTENCE);
  });

  it("renders the finished screen when the batch is complete", async () => {
    h.result = {
      status: "finished",
      batchId: BATCH_ID,
      completedCount: 5,
      total: 5,
      lifetimeAnsweredCount: 9,
    };

    mountGate();
    await view?.settle();

    expect(h.replaces).toEqual([]);
    const text = view?.container.textContent ?? "";
    expect(text).toContain(t("validate.finished.label"));
    expect(text).not.toContain(SENTENCE);
  });
});
