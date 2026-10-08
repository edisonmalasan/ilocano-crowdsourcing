import { describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";

import type { ValidatorsRepository } from "@/lib/repositories";
import {
  runEnroll,
  type OnboardingActionDependencies,
} from "@/lib/validators/onboarding-actions-core";
import { decideEnrollment } from "@/lib/validators/onboarding-flow";
import { createPublicThrottle } from "@/lib/validators/public-throttle";
import { translatorFor } from "@/lib/i18n/copy";
import { runStartValidation } from "@/lib/validation/start-validation-core";
import { decideStartBatch } from "@/lib/validation/start-batch-flow";
import { decideContinueBatch } from "@/lib/validation/continue-batch-flow";
import { failureMessageFor } from "@/lib/validation/entry-form-flow";
import { runSubmitResponse } from "@/lib/validation/submit-response-core";
import { createSaveQueue } from "@/lib/validation/save-queue";
import type { SubmitValidationResult } from "@/lib/validation/validation-actions-core";
import type { AnonymousValidatorId } from "@/schemas/validator";

vi.mock("server-only", () => ({}));

class FakeConfigurationFailure extends Error {}

const VALID_ENROLL = { ilocanoProficiency: "fluent" };
const STORED_PROFILE = {
  id: "VAL_a81d92c1",
  ilocanoProficiency: "fluent" as const,
  createdAt: "2026-09-30T12:00:00.000Z",
  lastActiveAt: "2026-09-30T12:00:00.000Z",
  totalValidations: 0,
};

function enrollHarness() {
  const calls: string[] = [];
  const validators = {
    create: vi.fn(async (profile: unknown) => {
      calls.push("create");
      return { ...(profile as object), ...STORED_PROFILE } as Awaited<
        ReturnType<ValidatorsRepository["create"]>
      >;
    }),
    findById: vi.fn(async () => null),
    listByIds: vi.fn(async () => []),
    listAllIds: vi.fn(async () => []),
    touchLastActive: vi.fn(async () => {}),
  } as unknown as ValidatorsRepository;
  const deps: OnboardingActionDependencies = {
    validators,
    now: () => new Date("2026-09-30T12:00:00.000Z"),
    ConfigurationFailure: FakeConfigurationFailure as never,
  };
  return { deps, calls };
}

describe("enrollment pacing", () => {
  it("refuses a burst with zero validator rows", async () => {
    const { deps, calls } = enrollHarness();
    const throttle = createPublicThrottle(() => 0);
    const context = { throttle, originKey: "origin-a" };

    for (let n = 0; n < 30; n += 1) {
      const outcome = await runEnroll(VALID_ENROLL, deps, context);
      expect(outcome.status).toBe("enrolled");
    }
    const refused = await runEnroll(VALID_ENROLL, deps, context);
    expect(refused).toEqual({ status: "failed", reason: "throttled" });
    // Thirty accepted enrollments created thirty rows; the refused one none.
    expect(calls.filter((call) => call === "create")).toHaveLength(30);
  });

  it("refuses invalid payloads before the throttle, consuming no budget", async () => {
    const { deps } = enrollHarness();
    const throttle = createPublicThrottle(() => 0);
    const context = { throttle, originKey: "origin-a" };

    for (let n = 0; n < 10; n += 1) {
      const outcome = await runEnroll({ ilocanoProficiency: "klingon" }, deps, context);
      expect(outcome).toEqual({ status: "failed", reason: "invalid" });
    }
    // The invalid calls consumed nothing: a full origin burst still fits.
    for (let n = 0; n < 30; n += 1) {
      const outcome = await runEnroll(VALID_ENROLL, deps, context);
      expect(outcome.status).toBe("enrolled");
    }
    expect(await runEnroll(VALID_ENROLL, deps, context)).toEqual({
      status: "failed",
      reason: "throttled",
    });
  });

  it("leaves a single ordinary enrollment exactly as before", async () => {
    const { deps, calls } = enrollHarness();
    const throttle = createPublicThrottle(() => 0);

    const outcome = await runEnroll(VALID_ENROLL, deps, {
      throttle,
      originKey: "quiet-origin",
    });
    expect(outcome.status).toBe("enrolled");
    expect(calls).toEqual(["create"]);
  });

  it("runs unpaced when no throttle context is supplied", async () => {
    const { deps, calls } = enrollHarness();
    const outcome = await runEnroll(VALID_ENROLL, deps);
    expect(outcome.status).toBe("enrolled");
    expect(calls).toEqual(["create"]);
  });
});

describe("start orchestration pacing", () => {
  function startDeps(calls: string[]) {
    return {
      validators: {
        findById: async () => {
          calls.push("validators.findById");
          return null;
        },
      },
      validations: {
        listEntryIdsForValidator: async () => {
          calls.push("validations.listEntryIdsForValidator");
          return [];
        },
      },
      batches: {
        listForRecovery: async () => {
          calls.push("batches.listForRecovery");
          return [];
        },
        allocate: async () => {
          calls.push("batches.allocate");
          return [];
        },
        findById: async () => {
          calls.push("batches.findById");
          return null;
        },
      },
      datasetEntries: {
        findById: async () => {
          calls.push("datasetEntries.findById");
          return null;
        },
        listByIds: async () => {
          calls.push("datasetEntries.listByIds");
          return [];
        },
      },
      config: { batchSize: 5 },
      newBatch: () => ({ id: "BAT_x", createdAt: "2026-09-30T00:00:00.000Z" }),
      ConfigurationFailure: FakeConfigurationFailure,
    } as never;
  }

  const VALID_START = { validatorId: "VAL_a81d92c1" };

  it("refuses a burst with zero database work", async () => {
    const calls: string[] = [];
    const deps = startDeps(calls);
    const throttle = createPublicThrottle(() => 0);
    const context = { throttle, originKey: "origin-a" };

    for (let n = 0; n < 20; n += 1) {
      await runStartValidation(VALID_START, deps, context);
    }
    const readsAfterBurst = calls.length;
    const refused = await runStartValidation(VALID_START, deps, context);
    expect(refused).toEqual({ status: "failed", reason: "throttled" });
    // The refused call read nothing: no recovery list, no allocation, no entry.
    expect(calls).toHaveLength(readsAfterBurst);
  });

  it("keeps throttled distinct from exhausted, screening_required, and honest errors", async () => {
    const calls: string[] = [];
    const deps = startDeps(calls);
    const throttle = createPublicThrottle(() => 0);
    // One-shot refused throttle: the reason is its own, never a terminal twin.
    const refused = await runStartValidation(VALID_START, deps, {
      throttle: { check: () => false },
      originKey: "origin-a",
    });
    expect(refused).toEqual({ status: "failed", reason: "throttled" });
    expect(calls).toEqual([]);
  });

  it("paces on the attempted identity even when it names nobody", async () => {
    const calls: string[] = [];
    const deps = startDeps(calls);
    const seen: Array<string | undefined> = [];
    const context = {
      throttle: {
        check: (_action: string, _origin: string, actor?: string) => {
          seen.push(actor);
          return true;
        },
      } as never,
      originKey: "origin-a",
    };
    await runStartValidation({ validatorId: "VAL_ffffffff" }, deps, context);
    expect(seen).toEqual(["VAL_ffffffff"]);
  });
});

describe("throttled outcomes read as pacing, never as faults", () => {
  const EN = translatorFor("en");
  const FIL = translatorFor("fil");
  const STORED = "VAL_a81d92c1" as AnonymousValidatorId;

  it("maps a throttled enrollment to an error naming no identifier", () => {
    for (const t of [EN, FIL]) {
      const decision = decideEnrollment({ status: "failed", reason: "throttled" }, t);
      expect(decision.kind).toBe("error");
      expect(decision).not.toHaveProperty("validatorId");
      expect(JSON.stringify(decision)).not.toMatch(/VAL_/);
    }
  });

  it("gives throttled enrollment its own sentence: nothing saved, wait, retry", () => {
    const decision = decideEnrollment({ status: "failed", reason: "throttled" }, EN);
    if (decision.kind !== "error") throw new Error("expected an error decision");
    expect(decision.message).toMatch(/nothing was saved/i);
    expect(decision.message).toMatch(/wait a moment/i);
    const persistence = decideEnrollment({ status: "failed", reason: "persistence" }, EN);
    if (persistence.kind !== "error") throw new Error("expected an error decision");
    expect(decision.message).not.toBe(persistence.message);
  });

  it("maps a throttled start to a retry error, never to exhausted or screening_required", () => {
    const decision = decideStartBatch(STORED, { status: "failed", reason: "throttled" }, EN);
    expect(decision).toEqual({
      kind: "error",
      message: EN("validateStart.failure.throttled"),
    });
  });

  it("maps a throttled continue to a retry error that leaves submitted work untouched", () => {
    const decision = decideContinueBatch(STORED, { status: "failed", reason: "throttled" }, EN);
    expect(decision).toEqual({
      kind: "error",
      message: EN("validate.finished.failure.throttled"),
    });
    if (decision.kind !== "error") throw new Error("expected an error decision");
    expect(decision.message).toMatch(/already submitted/i);
  });

  it("reads a throttled save as the generic unsaved sentence with a retry control", () => {
    // The sentence is deliberately the shared one — which of the four
    // not-stored facts it was is not checkable by the reader — while the
    // reason stays distinct where it belongs, in the typed result.
    expect(failureMessageFor("throttled", EN)).toBe(failureMessageFor("persistence", EN));
  });
});

describe("wrapper wiring pins (source scans)", () => {
  it("paces enroll through the shared throttle with an origin key", () => {
    const source = readFileSync("src/lib/validators/actions.ts", "utf8");
    expect(source).toMatch(/enrollThrottleContext/);
    expect(source).toMatch(/sharedPublicThrottle/);
    expect(source).toMatch(/resolveOriginKey/);
  });

  it("paces the start orchestration through the shared throttle with an origin key", () => {
    const source = readFileSync("src/lib/validation/start-validation-actions.ts", "utf8");
    expect(source).toMatch(/sharedPublicThrottle/);
    expect(source).toMatch(/resolveOriginKey/);
  });

  it("paces the submit route through the shared throttle with a 429 for refusal", () => {
    const source = readFileSync("src/app/api/validation-responses/route.ts", "utf8");
    expect(source).toMatch(/sharedPublicThrottle/);
    expect(source).toMatch(/resolveOriginKey/);
    expect(source).toMatch(/429/);
  });
});

describe("submission pacing", () => {
  const BATCH_ID = "BAT_0123456789abcdef0123456789abcdef";
  const ENTRY_ID = "OD_1";

  function intent() {
    return {
      batchId: BATCH_ID,
      datasetEntryId: ENTRY_ID,
      response: { evaluation: "correct_natural" },
    };
  }

  it("refuses a burst with zero submission RPCs", async () => {
    const calls: unknown[] = [];
    const validations = {
      submitResponse: async (input: unknown) => {
        calls.push(input);
        return { status: "recorded", responseId: "rsp_01", reservationReleased: true };
      },
    } as never;
    const deps = { validations, now: () => new Date("2026-10-08T00:00:00.000Z") } as never;
    const throttle = createPublicThrottle(() => 0);
    const context = { throttle, originKey: "origin-a" };

    for (let n = 0; n < 30; n += 1) {
      const outcome = await runSubmitResponse(intent(), deps, context);
      expect(outcome.status).toBe("recorded");
    }
    const refused = await runSubmitResponse(intent(), deps, context);
    expect(refused).toEqual({ status: "failed", reason: "throttled" });
    expect(calls).toHaveLength(30);
  });

  it("refuses malformed POSTs by parsing before the throttle", async () => {
    const calls: unknown[] = [];
    const validations = {
      submitResponse: async (input: unknown) => {
        calls.push(input);
        return { status: "recorded", responseId: "rsp_01", reservationReleased: true };
      },
    } as never;
    const deps = { validations, now: () => new Date("2026-10-08T00:00:00.000Z") } as never;
    const throttle = createPublicThrottle(() => 0);
    const context = { throttle, originKey: "origin-a" };

    for (let n = 0; n < 10; n += 1) {
      const outcome = await runSubmitResponse({ garbage: true }, deps, context);
      expect(outcome.status).toBe("failed");
      expect((outcome as { reason: string }).reason).toBe("invalid");
    }
    // The malformed calls consumed nothing: a full batch burst still fits.
    for (let n = 0; n < 30; n += 1) {
      const outcome = await runSubmitResponse(intent(), deps, context);
      expect(outcome.status).toBe("recorded");
    }
    expect(calls).toHaveLength(30);
  });

  it("classifies throttled as transient: the queue retries it, never parks it first-try", async () => {
    const submit = vi
      .fn(async (): Promise<SubmitValidationResult> => ({ status: "failed", reason: "throttled" }))
      .mockResolvedValueOnce({ status: "failed", reason: "throttled" })
      .mockResolvedValueOnce({
        status: "recorded",
        responseId: "rsp_01",
        datasetEntryId: ENTRY_ID,
      });
    const queue = createSaveQueue({
      submit,
      wait: async () => {},
      now: () => 0,
    });

    queue.enqueue({
      key: ENTRY_ID,
      batchId: BATCH_ID,
      datasetEntryId: ENTRY_ID,
      position: 1,
      payload: { evaluation: "correct_natural" },
    });
    await queue.drain();

    // Retried with backoff, then confirmed — the same transient path as
    // `persistence`, not the park-on-first-refusal permanent path.
    expect(submit).toHaveBeenCalledTimes(2);
    expect(queue.snapshot().states[ENTRY_ID]).toEqual({ kind: "saved" });
  });
});
