import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The allocation Server Action WRAPPER's own failure handling — the path that actually runs here.
 *
 * =============================================================================
 * WHY THIS FILE EXISTS, because the same behaviour is tested elsewhere and the two are not redundant
 * =============================================================================
 * `allocation-actions.test.ts` covers the CORE with dependencies injected. It proves the core maps a
 * thrown configuration failure to `not_configured`.
 *
 * But in the real deployment that branch is UNREACHABLE. `actionDependencies()` calls `getServerEnv()`
 * while building the argument to the core, so a missing credential throws before `runAllocateBatch` is
 * ever entered. The core's handling is exercised only by injecting a fake the real repositories never
 * throw.
 *
 * So the path that actually runs in this environment — the one that exists because all three
 * `SUPABASE_*` variables are absent — was untested. This file drives the real wrapper with the
 * environment module stubbed to throw, which is the closest reproduction of production possible without
 * a credential.
 *
 * =============================================================================
 * WHAT THIS DOES NOT PROVE
 * =============================================================================
 * That `getServerEnv()` throws for the right reason, that the env module's own validation works (that
 * is `env.test.ts`'s job), or that a Supabase client can be constructed — nothing here has ever
 * constructed one. It proves the wrapper translates the throw it will actually receive into the
 * documented result and does not report success.
 */

const getServerEnv = vi.fn();
const createSupabaseRepositories = vi.fn();

/**
 * The configuration-failure class, owned by the test so the mock module and the thrown value are the
 * SAME class.
 *
 * This matters and cost a failing test to learn elsewhere in this repository: `actions.ts`
 * distinguishes a configuration failure with `error instanceof ServerEnvError`. Had the mock declared
 * its own class while the test threw a plain `Error`, the wrapper would have taken the `persistence`
 * branch and the test would have been asserting the wrong result all along — a green test proving the
 * opposite of what it claimed.
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

/** Reproduces the production failure: the environment check raises `ServerEnvError`. */
function throwConfigurationFailure(missing: string): void {
  getServerEnv.mockImplementation(() => {
    throw new ServerEnvError(`${missing} is not set`);
  });
}

/** Imported after the mocks so the module graph picks them up. */
async function loadActions() {
  return import("@/lib/allocation/actions");
}

beforeEach(() => {
  getServerEnv.mockReset();
  createSupabaseRepositories.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requestBatchAction with no database configured", () => {
  it("reports not_configured rather than throwing at the participant", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { requestBatchAction } = await loadActions();

    await expect(requestBatchAction({ validatorId: "VAL_a81d92c1" })).resolves.toEqual({
      status: "failed",
      reason: "not_configured",
    });
  });

  it("never constructs a Supabase client once the environment check has failed", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { requestBatchAction } = await loadActions();
    await requestBatchAction({ validatorId: "VAL_a81d92c1" });

    // Building the client after the check would mean the order guarantee in `actionDependencies` is
    // not what its comment says it is.
    expect(createSupabaseRepositories).not.toHaveBeenCalled();
  });

  it("reports the same result whatever the payload says", async () => {
    // Nothing about the payload should change the outcome when there is no database. Notably a
    // MALFORMED payload also reports `not_configured` rather than `invalid`, because the environment
    // check runs before the payload is parsed — which is the honest answer, since whether the request
    // was well formed was never established.
    throwConfigurationFailure("SUPABASE_URL");

    const { requestBatchAction } = await loadActions();

    const given = await requestBatchAction({ validatorId: "VAL_a81d92c1", requestedSize: 3 });
    const malformed = await requestBatchAction({ nonsense: true });
    const hostile = await requestBatchAction({
      validatorId: "VAL_a81d92c1",
      entryIds: ["OD_0001"],
    });

    expect(given).toEqual(malformed);
    expect(given).toEqual(hostile);
  });

  it("reports a non-configuration failure as persistence, not as not_configured", async () => {
    getServerEnv.mockImplementation(() => {
      throw new TypeError("something unexpected");
    });

    const { requestBatchAction } = await loadActions();

    // The two must stay distinguishable: "this deployment has no database" is the expected state of
    // the current environment and deserves different words from a genuine fault.
    await expect(requestBatchAction({ validatorId: "VAL_a81d92c1" })).resolves.toEqual({
      status: "failed",
      reason: "persistence",
    });
  });

  it("never reports an allocated status, a batch id, or entries on any failure", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { requestBatchAction } = await loadActions();
    const result = await requestBatchAction({ validatorId: "VAL_a81d92c1" });

    expect(result.status).toBe("failed");
    expect(result).not.toHaveProperty("batchId");
    expect(result).not.toHaveProperty("entries");
  });

  it("does not report exhausted when it could not reach the database to find out", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { requestBatchAction } = await loadActions();
    const result = await requestBatchAction({ validatorId: "VAL_a81d92c1" });

    // `exhausted` is routed by the client to "you have finished the study". Reporting it for a
    // database that could not be reached would tell a participant their work is complete when nothing
    // was read.
    expect(result.status).not.toBe("exhausted");
  });
});

describe("what the operator is told", () => {
  it("logs the real cause while returning a generic result", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { requestBatchAction } = await loadActions();
    await requestBatchAction({ validatorId: "VAL_a81d92c1" });

    // An operator needs the actual missing variable. A participant must never see it, which is why the
    // log call and the return value are separate concerns.
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toMatch(/SUPABASE_URL/);
  });

  it("keeps the credential name out of the value returned to the caller", async () => {
    throwConfigurationFailure("SUPABASE_SERVICE_ROLE_KEY");

    const { requestBatchAction } = await loadActions();
    const result = await requestBatchAction({ validatorId: "VAL_a81d92c1" });

    // The result crosses to the browser. No environment variable name, host, or table may appear in it.
    expect(JSON.stringify(result)).not.toMatch(/SUPABASE|service_role|batch_entries|validators/i);
  });
});
