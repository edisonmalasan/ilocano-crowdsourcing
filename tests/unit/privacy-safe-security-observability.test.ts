import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  digestPublicSecurityComponent,
  formatPublicSecurityDiagnostic,
  PUBLIC_SECURITY_LOG_PREFIX,
} from "@/lib/abuse/public-security-diagnostic";
import { csvField } from "@/lib/export/csv";
import type { ValidatorsRepository } from "@/lib/repositories";
import {
  runEnroll,
  runResume,
  type OnboardingActionDependencies,
} from "@/lib/validators/onboarding-actions-core";
import { runStartValidation } from "@/lib/validation/start-validation-core";
import { runSubmitResponse } from "@/lib/validation/submit-response-core";

vi.mock("server-only", () => ({}));

class FakeConfigurationFailure extends Error {}

const ATTEMPT = "VAL_a81d92c1";
const BATCH = "BAT_0123456789abcdef0123456789abcdef";
const ORIGIN = "origin-a";

function onboardingDeps(): OnboardingActionDependencies {
  const validators = {
    create: vi.fn(async (profile: unknown) => ({
      ...(profile as object),
      id: ATTEMPT,
      ilocanoProficiency: "fluent",
      createdAt: "2026-09-30T12:00:00.000Z",
      lastActiveAt: "2026-09-30T12:00:00.000Z",
      totalValidations: 0,
    })) as never,
    findById: vi.fn(async () => null) as never,
    listByIds: vi.fn(async () => []) as never,
    listAllIds: vi.fn(async () => []) as never,
    touchLastActive: vi.fn(async () => {}) as never,
  } as unknown as ValidatorsRepository;
  return {
    validators,
    now: () => new Date("2026-09-30T12:00:00.000Z"),
    ConfigurationFailure: FakeConfigurationFailure as never,
  };
}

function startDeps() {
  return {
    validators: { findById: async () => null },
    validations: { listEntryIdsForValidator: async () => [] as string[] },
    batches: {
      listForRecovery: async () => [],
      allocate: async () => [],
      findById: async () => null,
    },
    datasetEntries: { findById: async () => null, listByIds: async () => [] },
    config: { batchSize: 5 },
    newBatch: () => ({ id: "BAT_x", createdAt: "2026-09-30T00:00:00.000Z" }),
    ConfigurationFailure: FakeConfigurationFailure,
  } as never;
}

function submitDeps(refusedReason: "unknown_batch" | "not_in_batch" = "unknown_batch") {
  return {
    validations: {
      submitResponse: async () => ({ status: "refused", reason: refusedReason }),
    },
    now: () => new Date("2026-10-08T00:00:00.000Z"),
  } as never;
}

function sessionRepos(batch: unknown) {
  return {
    batches: { findById: async () => batch },
    validations: {
      listEntryIdsForValidator: async () => [] as string[],
      countForValidator: async () => 0,
    },
    datasetEntries: { findById: async () => null },
  };
}

describe("the diagnostic line itself", () => {
  it("formats action, reason, and digests with no raw value anywhere", () => {
    const line = formatPublicSecurityDiagnostic({
      action: "resume",
      reason: "throttled",
      originDigest: digestPublicSecurityComponent(ORIGIN),
      actorDigest: digestPublicSecurityComponent(ATTEMPT),
    });
    expect(line).toBe(
      `public resume refused reason=throttled origin=${digestPublicSecurityComponent(ORIGIN)} actor=${digestPublicSecurityComponent(ATTEMPT)}`,
    );
    expect(line).not.toMatch(/VAL_/);
    expect(line).not.toContain(ORIGIN);
  });

  it("omits the actor segment for actorless actions", () => {
    const line = formatPublicSecurityDiagnostic({
      action: "enroll",
      reason: "throttled",
      originDigest: digestPublicSecurityComponent(ORIGIN),
    });
    expect(line).toBe(
      `public enroll refused reason=throttled origin=${digestPublicSecurityComponent(ORIGIN)}`,
    );
    expect(line).not.toContain("actor=");
  });

  it("digests deterministically to 16 lowercase hex", () => {
    const first = digestPublicSecurityComponent(ORIGIN);
    expect(first).toBe(digestPublicSecurityComponent(ORIGIN));
    expect(first).toMatch(/^[0-9a-f]{16}$/);
    expect(digestPublicSecurityComponent("origin-b")).not.toBe(first);
  });
});

describe("the seven refusal sites each emit exactly one privacy-safe line", () => {
  it("logs a throttled enrollment with the origin digest and no identifier", async () => {
    const lines: string[] = [];
    const outcome = await runEnroll({ ilocanoProficiency: "fluent" }, onboardingDeps(), {
      throttle: { check: () => false },
      originKey: ORIGIN,
      log: (line: string) => lines.push(line),
    });
    expect(outcome).toEqual({ status: "failed", reason: "throttled" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("public enroll refused reason=throttled");
    expect(lines[0]).toContain(digestPublicSecurityComponent(ORIGIN));
    expect(lines[0]).not.toContain(ORIGIN);
  });

  it("logs a throttled resume as one line while the outward outcome stays absent", async () => {
    const lines: string[] = [];
    const outcome = await runResume({ storedId: ATTEMPT }, onboardingDeps(), {
      throttle: { check: () => false },
      originKey: ORIGIN,
      log: (line: string) => lines.push(line),
    });
    expect(outcome).toEqual({ status: "absent" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("public resume refused reason=throttled");
    expect(lines[0]).toContain(digestPublicSecurityComponent(ATTEMPT));
    expect(lines[0]).not.toMatch(/VAL_/);
  });

  it("logs a throttled allocation with the attempted attempt digest", async () => {
    const lines: string[] = [];
    const outcome = await runStartValidation({ validatorId: ATTEMPT }, startDeps(), {
      throttle: { check: () => false },
      originKey: ORIGIN,
      log: (line: string) => lines.push(line),
    });
    expect(outcome).toEqual({ status: "failed", reason: "throttled" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("public allocate refused reason=throttled");
    expect(lines[0]).toContain(digestPublicSecurityComponent(ATTEMPT));
  });

  it("logs a throttled submit with the batch-capability digest", async () => {
    const lines: string[] = [];
    const outcome = await runSubmitResponse(
      { batchId: BATCH, datasetEntryId: "OD_1", response: { evaluation: "correct_natural" } },
      submitDeps(),
      {
        throttle: { check: () => false },
        originKey: ORIGIN,
        log: (line: string) => lines.push(line),
      },
    );
    expect(outcome).toEqual({ status: "failed", reason: "throttled" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("public submit refused reason=throttled");
    expect(lines[0]).toContain(digestPublicSecurityComponent(BATCH));
    expect(lines[0]).not.toContain(BATCH);
  });

  it("logs a submit capability naming no batch while the outward 404 is unchanged", async () => {
    const lines: string[] = [];
    const outcome = await runSubmitResponse(
      { batchId: BATCH, datasetEntryId: "OD_1", response: { evaluation: "correct_natural" } },
      submitDeps("unknown_batch"),
      {
        throttle: { check: () => true },
        originKey: ORIGIN,
        log: (line: string) => lines.push(line),
      },
    );
    expect(outcome).toEqual({ status: "failed", reason: "unknown_batch" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("public submit refused reason=unknown_batch");
  });

  it("stays silent on a routine not_in_batch for the same capability", async () => {
    const lines: string[] = [];
    const outcome = await runSubmitResponse(
      { batchId: BATCH, datasetEntryId: "OD_1", response: { evaluation: "correct_natural" } },
      submitDeps("not_in_batch"),
      {
        throttle: { check: () => true },
        originKey: ORIGIN,
        log: (line: string) => lines.push(line),
      },
    );
    expect(outcome).toEqual({ status: "failed", reason: "not_in_batch" });
    expect(lines).toHaveLength(0);
  });

  it("logs a throttled session open while the outward outcome stays redirectHome", async () => {
    const { openOwnedValidationSession } = await import("@/lib/validation/session-service");
    const lines: string[] = [];
    const outcome = await openOwnedValidationSession({ batchId: BATCH, activeAttemptId: ATTEMPT }, {
      ...sessionRepos(null),
      throttleContext: {
        throttle: { check: () => false },
        originKey: ORIGIN,
        log: (line: string) => lines.push(line),
      },
    } as never);
    expect(outcome).toEqual({ status: "redirectHome" });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("public session_open refused reason=throttled");
  });

  it("logs an ownership mismatch but stays silent on an unknown batch", async () => {
    const { openOwnedValidationSession } = await import("@/lib/validation/session-service");
    const allow = { throttle: { check: () => true }, originKey: ORIGIN };

    const mismatchLines: string[] = [];
    const mismatch = await openOwnedValidationSession(
      { batchId: BATCH, activeAttemptId: ATTEMPT },
      {
        ...sessionRepos({ id: BATCH, validatorId: "VAL_ffffffff", entries: [] }),
        throttleContext: { ...allow, log: (line: string) => mismatchLines.push(line) },
      } as never,
    );
    expect(mismatch).toEqual({ status: "redirectHome" });
    expect(mismatchLines).toHaveLength(1);
    expect(mismatchLines[0]).toContain("public session_open refused reason=owner_mismatch");
    expect(mismatchLines[0]).not.toMatch(/VAL_/);

    const unknownLines: string[] = [];
    const unknown = await openOwnedValidationSession({ batchId: BATCH, activeAttemptId: ATTEMPT }, {
      ...sessionRepos(null),
      throttleContext: { ...allow, log: (line: string) => unknownLines.push(line) },
    } as never);
    expect(unknown).toEqual({ status: "redirectHome" });
    expect(unknownLines).toHaveLength(0);
  });

  it("stays silent on successes and on calls with no log sink", async () => {
    const silent = await runEnroll({ ilocanoProficiency: "fluent" }, onboardingDeps(), {
      throttle: { check: () => true },
      originKey: ORIGIN,
      log: () => {
        throw new Error("must not log a success");
      },
    });
    expect(silent.status).toBe("enrolled");

    const noSink = await runEnroll({ ilocanoProficiency: "fluent" }, onboardingDeps(), {
      throttle: { check: () => false },
      originKey: ORIGIN,
    });
    expect(noSink).toEqual({ status: "failed", reason: "throttled" });
  });
});

describe("spreadsheet-safe CSV cells", () => {
  it.each(["=1+1", "+2+2", "-3+3", "@SUM(A1:A2)", "=HYPERLINKX", "\t=cmd"])(
    "prefixes a dangerous leading character %j with a single quote",
    (value) => {
      expect(csvField(value)).toBe(`'${value}`);
    },
  );

  it("prefixes a leading carriage return and then quotes it like any CR field", () => {
    expect(csvField("\rcmd")).toBe(`"'\rcmd"`);
  });

  it("still quotes a prefixed cell that needs quoting, and leaves ordinary text byte-identical", () => {
    expect(csvField("=a,b")).toBe('"\'=a,b"');
    expect(csvField("Normal text")).toBe("Normal text");
    expect(csvField("veni, vidi")).toBe('"veni, vidi"');
    expect(csvField(null)).toBe("");
    expect(csvField("")).toBe("");
  });
});

describe("shell wiring pins (source scans)", () => {
  it("passes a namespaced abuse log sink with every throttle context", () => {
    for (const path of [
      "src/lib/validators/actions.ts",
      "src/lib/validation/start-validation-actions.ts",
      "src/app/api/validation-responses/route.ts",
      "src/app/validate/[batchId]/page.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain(PUBLIC_SECURITY_LOG_PREFIX);
    }
  });
});
