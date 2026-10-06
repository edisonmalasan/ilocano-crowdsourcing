import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepositoryError, type ValidatorsRepository } from "@/lib/repositories";
import {
  runEnroll,
  runResume,
  type OnboardingActionDependencies,
} from "@/lib/validators/onboarding-actions-core";
import { ANONYMOUS_VALIDATOR_ID_PATTERN } from "@/schemas/validator";

vi.mock("server-only", () => ({}));

/** Stand-in for `ServerEnvError`, so the core needs no `process.env` stubbing. */
class FakeConfigurationFailure extends Error {}

function createHarness(options: { findResult?: unknown; createError?: unknown } = {}) {
  const calls: string[] = [];
  // Every profile handed to `create`, kept so a test can assert the exact stored key set
  // rather than inferring it from the return value.
  const stored: Array<Record<string, unknown>> = [];
  let findResult: unknown = options.findResult ?? null;
  let createError: unknown = options.createError ?? null;

  const validators: ValidatorsRepository = {
    create: vi.fn(async (profile) => {
      calls.push("create");
      if (createError) throw createError;
      stored.push({ ...profile });
      return profile;
    }),
    findById: vi.fn(async () => {
      calls.push("findById");
      return findResult as Awaited<ReturnType<ValidatorsRepository["findById"]>>;
    }),
    listByIds: vi.fn(async () => {
      calls.push("listByIds");
      return [];
    }),
    listAllIds: vi.fn(async () => {
      calls.push("listAllIds");
      return [];
    }),
    touchLastActive: vi.fn(async () => {
      calls.push("touchLastActive");
    }),
  };

  const deps: OnboardingActionDependencies = {
    validators,
    now: () => new Date("2026-09-30T12:00:00.000Z"),
    ConfigurationFailure: FakeConfigurationFailure as never,
  };

  return {
    deps,
    validators,
    calls,
    stored,
    set findResult(value: unknown) {
      findResult = value;
    },
    set createError(value: unknown) {
      createError = value;
    },
  };
}

const STORED_PROFILE = {
  id: "VAL_0000abcd" as const,
  ilocanoProficiency: "fluent" as const,
  createdAt: "2026-09-30T12:00:00.000Z",
  lastActiveAt: "2026-09-30T12:00:00.000Z",
  totalValidations: 3,
};

describe("runEnroll", () => {
  it("enrolls and returns only an identifier", async () => {
    const harness = createHarness();

    const result = await runEnroll({ ilocanoProficiency: "fluent" }, harness.deps);

    expect(result).toEqual({ status: "enrolled", validatorId: expect.any(String) });
    expect(Object.keys(result).sort()).toEqual(["status", "validatorId"]);
    if (result.status === "enrolled") {
      expect(result.validatorId).toMatch(ANONYMOUS_VALIDATOR_ID_PATTERN);
    }
  });

  it("makes no repository call when the payload fails validation", async () => {
    const harness = createHarness();

    const result = await runEnroll({ ilocanoProficiency: { nested: "object" } }, harness.deps);

    expect(result).toEqual({ status: "failed", reason: "invalid" });
    expect(harness.calls).toEqual([]);
  });

  it("makes no repository call when the payload carries an unexpected key", async () => {
    const harness = createHarness();

    // `strictObject` must reject an added key rather than strip it silently: a
    // stripped identity field would look like a clean request.
    const result = await runEnroll(
      { ilocanoProficiency: "fluent", totalValidations: 9999 },
      harness.deps,
    );

    expect(result).toEqual({ status: "failed", reason: "invalid" });
    expect(harness.calls).toEqual([]);
  });

  // ---------------------------------------------------------------------------------
  // The anonymity invariant is the headline of the whole project, so the fields are
  // named literally rather than proxied by an innocuous extra key. `totalValidations`
  // proved `strictObject` works; it did not prove that a field called `name` is refused.
  // A future change that added an `email` column would be caught here and not there.
  // ---------------------------------------------------------------------------------
  it.each([
    "name",
    "email",
    "emailAddress",
    "studentId",
    "studentNumber",
    "phone",
    "phoneNumber",
    "address",
    "facebookAccount",
  ])("refuses a payload carrying a personal field called %s", async (field) => {
    const harness = createHarness();

    const result = await runEnroll(
      { ilocanoProficiency: "fluent", [field]: "somebody@example.com" },
      harness.deps,
    );

    expect(result).toEqual({ status: "failed", reason: "invalid" });
    // No write, and critically: nothing persisted that could be read back later.
    expect(harness.calls).toEqual([]);
  });

  it("names no personal field anywhere in the stored profile", async () => {
    // The positive statement, since the negative one only proves rejection at the edge:
    // the profile that reaches the database must contain only the approved keys.
    const harness = createHarness();

    await runEnroll({ ilocanoProficiency: "fluent" }, harness.deps);

    expect(harness.stored).toHaveLength(1);
    const keys = Object.keys(harness.stored[0] ?? {}).sort();

    expect(keys).toEqual([
      "createdAt",
      "id",
      "ilocanoProficiency",
      "lastActiveAt",
      "totalValidations",
    ]);
  });

  it("refuses an explicit null proficiency rather than enrolling an absence", async () => {
    // The methodology correction admits no decline: explicit `null` is invalid
    // exactly like a missing key, and nothing is persisted for it.
    const harness = createHarness();

    const result = await runEnroll({ ilocanoProficiency: null }, harness.deps);

    expect(result).toEqual({ status: "failed", reason: "invalid" });
    expect(harness.calls).toEqual([]);
  });

  it("rejects a payload with no proficiency key at all rather than recording a decline", async () => {
    const harness = createHarness();

    // A missing key is a malformed request, not a declined answer. Conflating the
    // two would silently write "declined" for someone who never had the chance to
    // choose, which is exactly the research distortion the strict schema prevents.
    const result = await runEnroll({}, harness.deps);

    expect(result).toEqual({ status: "failed", reason: "invalid" });
    expect(harness.calls).toEqual([]);
  });

  it("rejects an unapproved proficiency value before persistence", async () => {
    const harness = createHarness();

    const result = await runEnroll({ ilocanoProficiency: "expert" }, harness.deps);

    expect(result).toEqual({ status: "failed", reason: "invalid" });
    expect(harness.calls).toEqual([]);
  });

  it("reports a configuration failure distinctly from a persistence failure", async () => {
    const harness = createHarness();
    harness.createError = new FakeConfigurationFailure("no database");

    const result = await runEnroll({ ilocanoProficiency: "fluent" }, harness.deps);

    expect(result).toEqual({ status: "failed", reason: "not_configured" });
  });

  it("reports a persistence failure separately from a configuration failure", async () => {
    const harness = createHarness();
    harness.createError = new RepositoryError("validators.insert", "insert rejected");

    const result = await runEnroll({ ilocanoProficiency: "fluent" }, harness.deps);

    expect(result).toEqual({ status: "failed", reason: "persistence" });
  });

  it("never returns an identifier on any failure", async () => {
    const harness = createHarness();
    harness.createError = new RepositoryError("validators.insert", "insert rejected");

    const result = await runEnroll({ ilocanoProficiency: "fluent" }, harness.deps);

    expect(result).not.toHaveProperty("validatorId");
    expect(JSON.stringify(result)).not.toMatch(/VAL_/);
  });

  it("returns no technical detail in any failure message", async () => {
    const harness = createHarness();
    harness.createError = new RepositoryError("validators.insert", "insert rejected", {
      detail: "duplicate key value violates unique constraint validators_pkey",
    });

    const result = await runEnroll({ ilocanoProficiency: "fluent" }, harness.deps);

    const serialised = JSON.stringify(result);
    expect(serialised).not.toMatch(/duplicate key|constraint|validators_pkey/i);
    expect(serialised).not.toMatch(/SUPABASE|service_role|https?:\/\//i);
  });
});

describe("runResume", () => {
  it("restores a validator the server recognises", async () => {
    const harness = createHarness();
    harness.findResult = STORED_PROFILE;

    const result = await runResume({ storedId: "VAL_0000abcd" }, harness.deps);

    expect(result).toEqual({ status: "restored", validatorId: "VAL_0000abcd" });
  });

  it("returns no stored profile fields to the caller", async () => {
    const harness = createHarness();
    harness.findResult = STORED_PROFILE;

    const result = await runResume({ storedId: "VAL_0000abcd" }, harness.deps);

    expect(Object.keys(result).sort()).toEqual(["status", "validatorId"]);
    // The stored proficiency, counter, and timestamps must not cross to the client.
    expect(JSON.stringify(result)).not.toMatch(/fluent|totalValidations|2026-09-30T/);
  });

  it("reports an unrecognised identifier as absent rather than as an error", async () => {
    const harness = createHarness();

    const result = await runResume({ storedId: "VAL_0000abcd" }, harness.deps);

    expect(result).toEqual({ status: "absent" });
  });

  it.each([
    ["empty", ""],
    ["wrong prefix", "val_0000abcd"],
    ["uppercase", "VAL_0000ABCD"],
    ["too short", "VAL_0000abc"],
    ["non-hex", "VAL_zzzzzzzz"],
  ])("reports a %s stored identifier as absent without querying", async (_label, storedId) => {
    const harness = createHarness();

    const result = await runResume({ storedId }, harness.deps);

    expect(result).toEqual({ status: "absent" });
    expect(harness.calls).toEqual([]);
  });

  it("makes no repository call when the payload fails validation", async () => {
    const harness = createHarness();

    const result = await runResume({ storedId: "VAL_0000abcd", extra: true }, harness.deps);

    expect(result).toEqual({ status: "failed", reason: "invalid" });
    expect(harness.calls).toEqual([]);
  });

  it("reports a configuration failure distinctly", async () => {
    const harness = createHarness();
    harness.validators.findById = vi.fn(async () => {
      throw new FakeConfigurationFailure("no database");
    });

    const result = await runResume({ storedId: "VAL_0000abcd" }, harness.deps);

    expect(result).toEqual({ status: "failed", reason: "not_configured" });
  });

  it("reports a persistence failure separately", async () => {
    const harness = createHarness();
    harness.validators.findById = vi.fn(async () => {
      throw new RepositoryError("validators.findById", "select failed");
    });

    const result = await runResume({ storedId: "VAL_0000abcd" }, harness.deps);

    expect(result).toEqual({ status: "failed", reason: "persistence" });
  });

  it("distinguishes absence from failure, so a stale value never looks broken", async () => {
    const absent = createHarness();
    const failing = createHarness();
    failing.validators.findById = vi.fn(async () => {
      throw new RepositoryError("validators.findById", "select failed");
    });

    const absentResult = await runResume({ storedId: "VAL_0000abcd" }, absent.deps);
    const failedResult = await runResume({ storedId: "VAL_0000abcd" }, failing.deps);

    expect(absentResult.status).toBe("absent");
    expect(failedResult.status).toBe("failed");
  });
});

describe("onboarding action core never reads browser storage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("has no browser-storage call and no browser-identity import in its code", async () => {
    // The server has no browser storage. A core that touched it would be a core that
    // could only ever run in a browser, and therefore could not be unit tested.
    //
    // Comments are stripped first: this module's own header explains at length WHY
    // it never touches browser storage, and a scan that matched its prose would be
    // a scan that could only ever pass by deleting the explanation.
    //
    // The test's NAME used to say "no localStorage call", and that was a LIST rather than a
    // definition for as long as the identity module used `localStorage` too — moving the application
    // to session-scoped storage in this change would have left this guard green on a core that read
    // the attempt token. Four names are now forbidden here, and the closed-set guard rooted at all of
    // `src/` (`attempt-storage-enumeration.test.ts`) is what covers the ones neither of us thought of.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/lib/validators/onboarding-actions-core.ts", "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

    expect(code).not.toMatch(/localStorage/);
    expect(code).not.toMatch(/sessionStorage/);
    expect(code).not.toMatch(/indexedDB/);
    expect(code).not.toMatch(/document\.cookie/);
    expect(code).not.toMatch(/browser-identity/);
    expect(code).not.toMatch(/globalThis\./);
  });
});
