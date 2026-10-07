import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The start orchestration Server Action WRAPPER's own failure handling.
 *
 * Same arrangement as `allocation-actions-wrapper.test.ts` and
 * `recovery-actions-wrapper.test.ts`: the core's `not_configured` branch is unreachable
 * in the real deployment, because `getServerEnv()` throws while the wrapper builds the
 * argument. This file drives the real wrapper with the environment module stubbed to
 * throw, which is the closest reproduction of production possible without a credential.
 */

const getServerEnv = vi.fn();
const createSupabaseRepositories = vi.fn();

/**
 * The configuration-failure class, owned by the test so the mock module and the thrown
 * value are the SAME class. See `allocation-actions-wrapper.test.ts` for why a second
 * class here would assert the wrong branch while staying green.
 */
class ServerEnvError extends Error {
  override name = "ServerEnvError";
}

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => getServerEnv(),
  ServerEnvError,
}));

vi.mock("@/lib/repositories/supabase", () => ({
  createSupabaseRepositories: () => createSupabaseRepositories(),
}));

function throwConfigurationFailure(missing: string): void {
  getServerEnv.mockImplementation(() => {
    throw new ServerEnvError(`${missing} is not set`);
  });
}

async function loadActions() {
  return import("@/lib/validation/start-validation-actions");
}

beforeEach(() => {
  getServerEnv.mockReset();
  createSupabaseRepositories.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requestStartValidationAction with no database configured", () => {
  it("reports not_configured rather than throwing at the participant", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { requestStartValidationAction } = await loadActions();

    await expect(requestStartValidationAction({ validatorId: "VAL_a81d92c1" })).resolves.toEqual({
      status: "failed",
      reason: "not_configured",
    });
  });

  it("never constructs a Supabase client once the environment check has failed", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { requestStartValidationAction } = await loadActions();
    await requestStartValidationAction({ validatorId: "VAL_a81d92c1" });

    expect(createSupabaseRepositories).not.toHaveBeenCalled();
  });

  it("reports the same result whatever the payload says", async () => {
    // The environment check runs before the payload is parsed, so a malformed or
    // hostile payload reports `not_configured` rather than `invalid` — whether the
    // request was well formed was never established.
    throwConfigurationFailure("SUPABASE_URL");

    const { requestStartValidationAction } = await loadActions();

    const given = await requestStartValidationAction({ validatorId: "VAL_a81d92c1" });
    const malformed = await requestStartValidationAction({ nonsense: true });
    const hostile = await requestStartValidationAction({
      validatorId: "VAL_a81d92c1",
      entryIds: ["OD_1"],
    });

    expect(given).toEqual(malformed);
    expect(given).toEqual(hostile);
  });

  it("reports a non-configuration failure as persistence, not as not_configured", async () => {
    getServerEnv.mockImplementation(() => {
      throw new TypeError("something unexpected");
    });

    const { requestStartValidationAction } = await loadActions();

    await expect(requestStartValidationAction({ validatorId: "VAL_a81d92c1" })).resolves.toEqual({
      status: "failed",
      reason: "persistence",
    });
  });

  it("never reports a batch id or an entry on any failure", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { requestStartValidationAction } = await loadActions();
    const result = await requestStartValidationAction({ validatorId: "VAL_a81d92c1" });

    expect(result.status).toBe("failed");
    expect(result).not.toHaveProperty("batchId");
    expect(result).not.toHaveProperty("entry");
    expect(result).not.toHaveProperty("entries");
  });

  it("does not report exhausted when it could not reach the database to find out", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { requestStartValidationAction } = await loadActions();
    const result = await requestStartValidationAction({ validatorId: "VAL_a81d92c1" });

    // `exhausted` is routed by the client to "you have finished the study". Reporting it
    // for a database that could not be reached would tell a participant their work is
    // complete when nothing was read.
    expect(result.status).not.toBe("exhausted");
  });
});

describe("what the operator is told", () => {
  it("logs the real cause while returning a generic result", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { requestStartValidationAction } = await loadActions();
    await requestStartValidationAction({ validatorId: "VAL_a81d92c1" });

    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toMatch(/SUPABASE_URL/);
  });

  it("keeps the credential name out of the value returned to the caller", async () => {
    throwConfigurationFailure("SUPABASE_SERVICE_ROLE_KEY");

    const { requestStartValidationAction } = await loadActions();
    const result = await requestStartValidationAction({ validatorId: "VAL_a81d92c1" });

    expect(JSON.stringify(result)).not.toMatch(/SUPABASE|service_role|batch_entries|validators/i);
  });
});
