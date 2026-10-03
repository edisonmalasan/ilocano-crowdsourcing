import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The validation Server Action WRAPPER — the path that actually runs in this deployment.
 *
 * =================================================================================================
 * WHY THIS FILE EXISTS AND IS NOT REDUNDANT WITH `validation-actions.test.ts`
 * =================================================================================================
 * That file drives the CORE with repositories injected, so every classification is reachable with no
 * credential. But in this environment — where all three `SUPABASE_*` variables are absent — the core's
 * `not_configured` branch is UNREACHABLE from the wrapper's own call path: `actionDependencies()` calls
 * `getServerEnv()` while BUILDING the argument, so the throw happens before `runSubmitValidation` is
 * ever entered. `not_configured` is produced here and nowhere else, so without this file the most
 * likely thing a deployed participant would see has never been executed.
 *
 * =================================================================================================
 * WHAT THIS DOES NOT PROVE
 * =================================================================================================
 * That `getServerEnv()` throws for the right reason (that is `env.test.ts`), or that a Supabase client
 * can be constructed. Nothing here has ever constructed one. It proves the wrapper translates the throw
 * it will actually receive into the documented result, and does not report success.
 */

/**
 * The configuration-failure class, owned by the test so the mock module and the thrown value are the
 * SAME class.
 *
 * `actions.ts` distinguishes a configuration failure with `error instanceof ServerEnvError`. Had the
 * mock declared its own class while the test threw a plain `Error`, the wrapper would have taken the
 * `persistence` branch and every assertion below would have been asserting the wrong result all along —
 * a green test proving the opposite of what it claimed. This exact trap is recorded in
 * `allocation-actions-wrapper.test.ts`.
 */
class ServerEnvError extends Error {
  override name = "ServerEnvError";
}

const getServerEnv = vi.fn();
const createSupabaseRepositories = vi.fn();
const runSubmitValidation = vi.fn();
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => getServerEnv(),
  ServerEnvError,
}));

vi.mock("@/lib/repositories/supabase", () => ({
  createSupabaseRepositories: () => createSupabaseRepositories(),
}));

// The core is replaced rather than driven: this file is about the wrapper's own handling, and driving
// the real core would require the repositories this file exists to prove are never reached.
vi.mock("@/lib/validation/validation-actions-core", () => ({
  runSubmitValidation: (...args: unknown[]) => runSubmitValidation(...args),
}));

/** Reproduces the production failure: the environment check raises `ServerEnvError`. */
function throwConfigurationFailure(missing: string): void {
  getServerEnv.mockImplementation(() => {
    throw new ServerEnvError(`${missing} is not set`);
  });
}

/**
 * Reproduces a CONFIGURED deployment: the environment check passes.
 *
 * The first draft of the "something else throws" tests called `throwConfigurationFailure("unused")` and
 * then made the repository factory throw. That is self-defeating: the environment check fires FIRST, so
 * every one of those three tests was asserting `not_configured` while claiming to test a different
 * failure. Two of them failed and one passed for the wrong reason — which is the outcome this
 * repository records as a control that agrees with the wrong thing.
 */
function passEnvironmentCheck(): void {
  getServerEnv.mockImplementation(() => undefined);
}

beforeEach(() => {
  vi.clearAllMocks();
  errorSpy.mockClear();
  runSubmitValidation.mockResolvedValue({
    status: "recorded",
    responseId: "rsp_x",
    datasetEntryId: "OD_0001",
  });
});

describe("submitting a validation with no database configured", () => {
  it("reports `not_configured`, which is a state the CORE can never produce", async () => {
    // The reason this is a separate file rather than a case in the core's tests: the core has no
    // environment, so `not_configured` is a union member nothing in `validation-actions-core.ts`
    // returns. It is produced here, by the only layer that reads the environment.
    throwConfigurationFailure("SUPABASE_URL");

    const { submitValidationAction } = await import("@/lib/validation/actions");
    const result = await submitValidationAction({ batchId: "b", datasetEntryId: "OD_0001" });

    expect(result).toEqual({ status: "failed", reason: "not_configured" });
  });

  it("never REACHES the core, so nothing is read and nothing is written", async () => {
    // The stronger claim, and the one a participant's research record depends on: a deployment with no
    // database must not have attempted a write. Asserted by the call count rather than by the result,
    // because a wrapper that reported `not_configured` AFTER a core call would produce the same result
    // while still having touched the database.
    throwConfigurationFailure("SUPABASE_URL");

    const { submitValidationAction } = await import("@/lib/validation/actions");
    await submitValidationAction({ batchId: "b", datasetEntryId: "OD_0001" });

    expect(runSubmitValidation).not.toHaveBeenCalled();
    expect(createSupabaseRepositories).not.toHaveBeenCalled();
  });

  it("checks the environment BEFORE building a client, so the failure names the variable", async () => {
    // Otherwise the missing credential arrives as a client-construction error indistinguishable from a
    // network fault, and an operator reads a network problem where the answer is a deployment variable.
    throwConfigurationFailure("SUPABASE_SERVICE_ROLE_KEY");

    const { submitValidationAction } = await import("@/lib/validation/actions");
    await submitValidationAction({});

    expect(getServerEnv).toHaveBeenCalledTimes(1);
    expect(createSupabaseRepositories).not.toHaveBeenCalled();
  });

  it("logs for the operator, naming the cause and carrying NO value that could be a credential", async () => {
    // The log line is a FIXED prefix plus the error object as a second argument — the first draft of this
    // test asserted the missing variable's name was in the first argument and failed against correct
    // code, because `logForOperator(message, error)` passes the error separately. Which means the
    // useful diagnostic is the error's own message, so it is asserted where it actually lives.
    //
    // What is asserted NEGATIVELY is the property that matters: a `ServerEnvError` is safe to log by
    // construction, because it carries the NAME of a missing variable and never a value. The first
    // draft asserted the name appeared in the message; the assertion below instead checks the whole
    // serialised log for anything shaped like a credential, which is the claim the comment in
    // `actions.ts` makes.
    throwConfigurationFailure("SUPABASE_ANON_KEY");

    const { submitValidationAction } = await import("@/lib/validation/actions");
    await submitValidationAction({});

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [message, cause] = errorSpy.mock.calls[0] as [string, Error];
    expect(message).toContain("sadino:validation");
    expect(message).toContain("no database configured");

    // The cause names the missing variable, which is the useful part of the diagnostic.
    expect(cause).toBeInstanceOf(ServerEnvError);
    expect(cause.message).toContain("SUPABASE_ANON_KEY");

    // And the pair serialises to nothing shaped like a key. `sb_publishable_…` and `sb_secret_…` are
    // the current Supabase key prefixes; this project has no such value to compare against, so the
    // shape is the only available test, and it is asserted against BOTH arguments together because a
    // credential could only ever appear in the cause.
    expect(`${message} ${String(cause)}`).not.toMatch(/sb_(publishable|secret)_/);
    // A JWT, which is what an older-style `anon` key looks like.
    expect(`${message} ${String(cause)}`).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
  });

  it("reports the SAME result for every missing variable, so no deployment detail leaks to the browser", async () => {
    // Three separate calls, and the results compared to each other rather than to a literal three times:
    // a wrapper that appended the missing variable's name to the RESULT would still pass a
    // per-variable assertion against `not_configured` alone.
    const results: unknown[] = [];
    for (const missing of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
      throwConfigurationFailure(missing);
      vi.resetModules();
      const { submitValidationAction } = await import("@/lib/validation/actions");
      results.push(await submitValidationAction({}));
    }

    expect(results[0]).toEqual({ status: "failed", reason: "not_configured" });
    expect(new Set(results.map((result) => JSON.stringify(result))).size).toBe(1);
  });
});

describe("submitting a validation when something else throws", () => {
  it("reports `persistence` rather than crashing, for a throw that is not a configuration failure", async () => {
    // A participant gets a sentence rather than a stack trace. `not_configured` would be the wrong
    // answer: it would tell an operator to check deployment variables for what is a code defect.
    passEnvironmentCheck();
    createSupabaseRepositories.mockImplementation(() => {
      throw new TypeError("cannot read properties of undefined");
    });

    const { submitValidationAction } = await import("@/lib/validation/actions");
    const result = await submitValidationAction({});

    expect(result).toEqual({ status: "failed", reason: "persistence" });
  });

  it("logs that too, and still reports a failure rather than a success", async () => {
    passEnvironmentCheck();
    createSupabaseRepositories.mockImplementation(() => {
      throw new TypeError("boom");
    });

    const { submitValidationAction } = await import("@/lib/validation/actions");
    const result = await submitValidationAction({});

    expect(result.status).toBe("failed");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(String(errorSpy.mock.calls[0]?.[0] ?? "")).toContain("before reaching the service");
  });

  it("does not mistake a RepositoryError from the CORE for a configuration failure", async () => {
    // The paired opposite, and it is the one that would go unnoticed. The core throws nothing here —
    // it returns failures — but a future refactor could let one escape, and an `instanceof ServerEnvError`
    // test is the only thing standing between a storage fault and a "please contact support" page that
    // sends an operator to the wrong system.
    passEnvironmentCheck();
    createSupabaseRepositories.mockReturnValue({ batches: {}, validations: {} });
    runSubmitValidation.mockRejectedValue(
      Object.assign(new Error("the validations table is unreachable"), {
        name: "RepositoryError",
      }),
    );

    const { submitValidationAction } = await import("@/lib/validation/actions");
    const result = await submitValidationAction({});

    expect(result).toEqual({ status: "failed", reason: "persistence" });
  });
});

describe("submitting a validation on a CONFIGURED deployment", () => {
  it("delegates to the core with the repositories it built, and returns what the core returned", async () => {
    // The path no test has ever exercised in this repository. The reason this file used to give —
    // "because no credential exists" — was false as of 2026-10-03: three credentials exist and are in
    // use. The true reason is that this repository has no integration test that drives a Server
    // Action against a database, which is a gap in the test suite rather than a fact about the
    // environment. Asserted here against mocks rather than against a database; the honest limit of
    // that is the `WEAKNESS` note at the foot of this file.
    getServerEnv.mockImplementation(() => undefined);
    const validations = { insert: vi.fn() };
    const batches = { findById: vi.fn() };
    const entryReservations = { releaseReservation: vi.fn() };
    createSupabaseRepositories.mockReturnValue({ batches, validations, entryReservations });
    runSubmitValidation.mockResolvedValue({
      status: "already_recorded",
      datasetEntryId: "OD_0001",
    });

    const { submitValidationAction } = await import("@/lib/validation/actions");
    const payload = {
      batchId: "b",
      datasetEntryId: "OD_0001",
      response: { evaluation: "correct_natural" },
    };
    const result = await submitValidationAction(payload);

    expect(result).toEqual({ status: "already_recorded", datasetEntryId: "OD_0001" });
    expect(runSubmitValidation).toHaveBeenCalledTimes(1);

    // The dependency SHAPE is the claim: `batches`, `validations`, and `entryReservations`
    // are handed straight through, so the wrapper adds nothing the core did not ask for. A wrapper
    // that passed the whole repository factory, or wrapped any of them in a new object, would fail
    // this and no other assertion here.
    const deps = runSubmitValidation.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(deps).sort()).toEqual([
      "batches",
      "entryReservations",
      "now",
      "validations",
    ]);
    expect(deps["batches"]).toBe(batches);
    expect(deps["validations"]).toBe(validations);
    expect(deps["entryReservations"]).toBe(entryReservations);
    expect(typeof deps["now"]).toBe("function");
  });

  it("supplies a clock, and does not read `Date.now()` itself", async () => {
    // The second fact is what makes "the server derived this timestamp" a claim rather than a hope: a
    // wrapper reading the time and passing a string would put a time source in the trust boundary.
    getServerEnv.mockImplementation(() => undefined);
    createSupabaseRepositories.mockReturnValue({ batches: {}, validations: {} });

    const { submitValidationAction } = await import("@/lib/validation/actions");
    await submitValidationAction({});

    const deps = runSubmitValidation.mock.calls[0]?.[1] as { readonly now: () => Date };
    expect(deps.now()).toBeInstanceOf(Date);
    expect(deps.now()).not.toBe(deps.now());
  });

  it("passes the RAW payload through unaltered, so the core is the only thing that parses it", async () => {
    // A wrapper that parsed or normalised first would create a second place where a payload's meaning
    // is decided, and the core's own refusal tests would then describe a shape nothing ever receives.
    getServerEnv.mockImplementation(() => undefined);
    createSupabaseRepositories.mockReturnValue({ batches: {}, validations: {} });

    const { submitValidationAction } = await import("@/lib/validation/actions");
    const raw = { batchId: "b", datasetEntryId: "OD_0001", response: { evaluation: "nonsense" } };
    await submitValidationAction(raw);

    expect(runSubmitValidation.mock.calls[0]?.[0]).toBe(raw);
  });

  it("logs nothing on the SUCCESS path", async () => {
    // A wrapper that logged every submission would put a line per response into whatever log store the
    // deployment grows later, and a log is a worse place for research metadata than a database with
    // constraints. The negative is weak on its own, so it is paired: `console.error` was spied on and
    // the failure paths above assert it is called exactly once.
    getServerEnv.mockImplementation(() => undefined);
    createSupabaseRepositories.mockReturnValue({ batches: {}, validations: {} });

    const { submitValidationAction } = await import("@/lib/validation/actions");
    await submitValidationAction({});

    expect(errorSpy).not.toHaveBeenCalled();
  });
});

/**
 * WEAKNESS: the configured-deployment tests prove the wrapper BUILDS and DELEGATES. They prove nothing
 * about `getServerEnv` succeeding on a real deployment, nothing about the shape a real
 * `createSupabaseRepositories()` returns, and — because `runSubmitValidation` is mocked out — nothing
 * about the write itself, which is `validation-actions.test.ts`'s subject. The three together close the
 * wrapper's own logic; none of them has ever spoken to Supabase.
 */
