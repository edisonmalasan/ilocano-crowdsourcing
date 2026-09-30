import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Server Action wrapper's own failure handling.
 *
 * =============================================================================
 * WHY THIS FILE EXISTS, because the same behaviour is tested elsewhere and the two
 * tests are not redundant
 * =============================================================================
 * `validators-actions.test.ts` covers the CORE, with dependencies injected. It proves
 * that when a repository throws the configured `ConfigurationFailure` class, the core
 * maps it to `not_configured`.
 *
 * But in the real deployment that branch is UNREACHABLE. `actionDependencies()` calls
 * `getServerEnv()` while building the argument to the core, so a missing credential
 * throws before `runEnroll` is ever entered. The core's handling of a configuration
 * failure is exercised only by injecting a fake that the real repository never throws.
 *
 * So the path that actually runs in this environment - the one the change exists to
 * handle honestly, since all three `SUPABASE_*` variables are absent - was untested.
 * This file drives the real wrapper with the environment module stubbed to throw, which
 * is the closest reproduction of production that is possible without a credential.
 *
 * What this does NOT prove: that `getServerEnv()` throws for the right reason, that the
 * env module's own validation works (that is `env.test.ts`'s job), or that a Supabase
 * client can be constructed. It proves the wrapper translates the throw it will actually
 * receive into the documented result, and does not report success.
 */

const getServerEnv = vi.fn();
const createSupabaseRepositories = vi.fn();

/**
 * The configuration-failure class, owned by the test so the mock module and the thrown
 * value are the SAME class.
 *
 * This matters and cost a failing test to learn: `actions.ts` distinguishes a
 * configuration failure with `error instanceof ServerEnvError`. Had the mock declared
 * its own class while the test threw a plain `Error`, the wrapper would have taken the
 * `persistence` branch and the test would have been asserting the wrong result all
 * along — a green test proving the opposite of what it claimed.
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
  return import("@/lib/validators/actions");
}

beforeEach(() => {
  getServerEnv.mockReset();
  createSupabaseRepositories.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("enrollValidatorAction with no database configured", () => {
  it("reports not_configured rather than throwing at the participant", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { enrollValidatorAction } = await loadActions();

    await expect(enrollValidatorAction({ ilocanoProficiency: "fluent" })).resolves.toEqual({
      status: "failed",
      reason: "not_configured",
    });
  });

  it("never constructs a Supabase client once the environment check has failed", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { enrollValidatorAction } = await loadActions();
    await enrollValidatorAction({ ilocanoProficiency: "fluent" });

    // Building the client after the check would mean the order guarantee in
    // `actionDependencies` is not what its comment says it is.
    expect(createSupabaseRepositories).not.toHaveBeenCalled();
  });

  it("reports the same result for a declined answer as for a given one", async () => {
    // Nothing about the payload should change the outcome when there is no database.
    throwConfigurationFailure("SUPABASE_URL");

    const { enrollValidatorAction } = await loadActions();

    const given = await enrollValidatorAction({ ilocanoProficiency: "fluent" });
    const declined = await enrollValidatorAction({ ilocanoProficiency: null });

    expect(given).toEqual(declined);
  });

  it("reports a non-configuration failure as persistence, not as not_configured", async () => {
    getServerEnv.mockImplementation(() => {
      throw new TypeError("something unexpected");
    });

    const { enrollValidatorAction } = await loadActions();

    // The two must stay distinguishable: "this deployment has no database" is the
    // expected state of the current environment and deserves different words from a
    // genuine fault.
    await expect(enrollValidatorAction({ ilocanoProficiency: "fluent" })).resolves.toEqual({
      status: "failed",
      reason: "persistence",
    });
  });

  it("never reports an enrolled status or an identifier on any failure", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { enrollValidatorAction } = await loadActions();
    const result = await enrollValidatorAction({ ilocanoProficiency: "fluent" });

    expect(result.status).toBe("failed");
    expect(result).not.toHaveProperty("validatorId");
  });
});

describe("resumeValidatorAction with no database configured", () => {
  it("reports not_configured rather than throwing at the participant", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { resumeValidatorAction } = await loadActions();

    await expect(resumeValidatorAction({ storedId: "VAL_0000abcd" })).resolves.toEqual({
      status: "failed",
      reason: "not_configured",
    });
  });

  it("does not report a stored identifier it could not have checked", async () => {
    throwConfigurationFailure("SUPABASE_SERVICE_ROLE_KEY");

    const { resumeValidatorAction } = await loadActions();
    const result = await resumeValidatorAction({ storedId: "VAL_0000abcd" });

    expect(result.status).toBe("failed");
    expect(result).not.toHaveProperty("validatorId");
  });

  it("does not report `absent` when it could not reach the database to find out", async () => {
    throwConfigurationFailure("SUPABASE_SERVICE_ROLE_KEY");

    const { resumeValidatorAction } = await loadActions();
    const result = await resumeValidatorAction({ storedId: "VAL_0000abcd" });

    // `absent` is routed by the client to "forget this and enroll fresh", which would
    // hand the participant a second identity. A database that could not be reached is
    // not evidence that the identifier names nobody.
    expect(result.status).not.toBe("absent");
  });

  it("never constructs a Supabase client once the environment check has failed", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { resumeValidatorAction } = await loadActions();
    await resumeValidatorAction({ storedId: "VAL_0000abcd" });

    expect(createSupabaseRepositories).not.toHaveBeenCalled();
  });
});

describe("what the operator is told", () => {
  it("logs the real cause while returning a generic result", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { enrollValidatorAction } = await loadActions();
    await enrollValidatorAction({ ilocanoProficiency: "fluent" });

    // An operator needs the actual missing variable. A participant must never see it,
    // which is why the log call and the return value are separate concerns.
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toMatch(/SUPABASE_URL/);
  });

  it("keeps the credential name out of the value returned to the caller", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { enrollValidatorAction } = await loadActions();
    const result = await enrollValidatorAction({ ilocanoProficiency: "fluent" });

    // The result crosses to the browser. No environment variable name, host, or table
    // may appear in it.
    expect(JSON.stringify(result)).not.toMatch(/SUPABASE|service_role|validators/i);
  });
});
