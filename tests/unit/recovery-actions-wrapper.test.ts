import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The recovery Server Action WRAPPER's own failure handling — the path that actually runs here.
 *
 * =================================================================================================
 * WHY THIS FILE EXISTS, because `recovery-actions.test.ts` covers the same ground and the two are not
 * redundant
 * =================================================================================================
 * `recovery-actions.test.ts` covers the CORE with dependencies injected. It proves the core maps a
 * thrown configuration failure to `not_configured`.
 *
 * But in the real deployment that branch is UNREACHABLE. This wrapper calls `getServerEnv()` while
 * building the argument to the core, so a missing credential throws before `runRecoveryLookup` is ever
 * entered. Driving only the core therefore leaves the one code path that exists in this environment
 * untested — and all three `SUPABASE_*` variables are absent, so it is the ONLY path that runs.
 *
 * =================================================================================================
 * WHAT THE FIRST DRAFT OF THE WRAPPER GOT WRONG, because it is the reason this file exists twice over
 * =================================================================================================
 * The first version had no `try`. A missing credential therefore made the action REJECT rather than
 * resolve, and the island calls it with `.then()` and no `.catch()`. The screen still rendered correctly
 * — `outcome` stayed `null`, and `null` collapses to `none` — so `design.md` D4 was satisfied *by
 * accident*. Nothing failed, and nothing would have failed.
 *
 * That is the failure mode this repository treats as worst: not a red, but a requirement held up by
 * coincidence. A requirement met by an accident is not met, because either file can be edited next and
 * remove it without turning anything red. It was found by asking a question the core's tests cannot
 * answer — what does the CALL SITE see when this action rejects? — and the answer was an unhandled
 * rejection.
 *
 * So `recovery-actions.test.ts` alone could never have found it, which is the argument for this file
 * existing rather than for a comment in the core.
 *
 * =================================================================================================
 * WHAT THIS DOES NOT PROVE
 * =================================================================================================
 * That `getServerEnv()` throws for the right reason, that the env module's own validation works (that is
 * `env.test.ts`'s job), or that a Supabase client can be constructed — nothing here has ever constructed
 * one. It proves the wrapper translates the throw it will actually receive into the documented result,
 * does not report success, and never rejects.
 */

const getServerEnv = vi.fn();
const createSupabaseRepositories = vi.fn();

/**
 * The configuration-failure class, owned by the test so the mock module and the thrown value are the
 * SAME class.
 *
 * This matters and cost a failing test elsewhere in this repository: the wrapper distinguishes a
 * configuration failure with `error instanceof ServerEnvError`. Had the mock declared its own class
 * while the test threw a plain `Error`, the wrapper would have taken the `unavailable` branch and the
 * test would have been asserting the wrong result all along — a green test proving the opposite of what
 * it claimed.
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

/** The repositories the wrapper destructures. Three, because the lookup needs exactly three. */
function fakeRepositories() {
  return {
    validators: { findById: () => Promise.resolve(null) },
    validations: { listEntryIdsForValidator: () => Promise.resolve([]) },
    batches: { listForRecovery: () => Promise.resolve([]) },
  };
}

/** Imported after the mocks so the module graph picks them up. */
async function loadAction() {
  return import("@/lib/validation/recovery-actions");
}

const VALIDATOR = "VAL_a81d92c1";

beforeEach(() => {
  getServerEnv.mockReset();
  createSupabaseRepositories.mockReset();
  createSupabaseRepositories.mockImplementation(() => fakeRepositories());
  getServerEnv.mockImplementation(() => ({}));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("requestInterruptedBatchAction with no database configured", () => {
  it("RESOLVES to not_configured rather than rejecting at the call site", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { requestInterruptedBatchAction } = await loadAction();

    // `.resolves`, not `.rejects` — and not `await expect(...).toEqual(...)` either, because that form
    // passes on a rejection too in some shapes and hides which one happened. The distinction between
    // "rejects" and "resolves to a typed failure" is the entire subject of this file.
    await expect(requestInterruptedBatchAction({ validatorId: VALIDATOR })).resolves.toEqual({
      status: "failed",
      reason: "not_configured",
    });
  });

  it("never constructs a Supabase client once the environment check has failed", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { requestInterruptedBatchAction } = await loadAction();
    await requestInterruptedBatchAction({ validatorId: VALIDATOR });

    // Building the client after the check would mean the order guarantee in the wrapper's comment is
    // not what its comment says it is.
    expect(createSupabaseRepositories).not.toHaveBeenCalled();
  });

  it("reports the same result whatever the payload says", async () => {
    // Nothing about the payload should change the outcome when there is no database. Notably a
    // MALFORMED payload also reports `not_configured` rather than `invalid`, because the environment
    // check runs before the payload is parsed — which is the honest answer, since whether the request
    // was well formed was never established.
    throwConfigurationFailure("SUPABASE_URL");

    const { requestInterruptedBatchAction } = await loadAction();

    const given = await requestInterruptedBatchAction({ validatorId: VALIDATOR });
    const malformed = await requestInterruptedBatchAction({ nonsense: true });
    const hostile = await requestInterruptedBatchAction({
      validatorId: VALIDATOR,
      batchId: "VAL_a81d92c1-2026-10-01T00:00:00.000Z",
    });

    expect(given).toEqual(malformed);
    expect(given).toEqual(hostile);
  });

  it("reports a non-configuration failure as unavailable, not as not_configured", async () => {
    getServerEnv.mockImplementation(() => {
      throw new TypeError("something unexpected");
    });

    const { requestInterruptedBatchAction } = await loadAction();

    // The two must stay distinguishable: "this deployment has no database" is an operator problem with
    // one fix, and a read that failed is another. Collapsing them would make the operator log useless,
    // which is the only place the distinction survives.
    await expect(requestInterruptedBatchAction({ validatorId: VALIDATOR })).resolves.toEqual({
      status: "failed",
      reason: "unavailable",
    });
  });

  it("never reports `none` on a failure, and never reports an offer", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { requestInterruptedBatchAction } = await loadAction();
    const result = await requestInterruptedBatchAction({ validatorId: VALIDATOR });

    // The claim D4 is built on, asserted at the one layer where it could be violated: `none` is an
    // ANSWER, and a participant cannot tell a database fault from a true answer. A failure that
    // returned `none` would state, as a research finding, that this validator had nothing to finish.
    expect(result.status).not.toBe("none");
    expect(result).not.toHaveProperty("offer");
  });
});

describe("what the operator is told, and what the caller is not", () => {
  it("logs the real cause while returning a typed result", async () => {
    throwConfigurationFailure("SUPABASE_URL");

    const { requestInterruptedBatchAction } = await loadAction();
    await requestInterruptedBatchAction({ validatorId: VALIDATOR });

    // An operator needs the actual missing variable. A participant must never see it, which is why the
    // log call and the return value are separate concerns.
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).toMatch(/SUPABASE_URL/);
  });

  it("keeps the credential name and the table names out of the value returned", async () => {
    throwConfigurationFailure("SUPABASE_SERVICE_ROLE_KEY");

    const { requestInterruptedBatchAction } = await loadAction();
    const result = await requestInterruptedBatchAction({ validatorId: VALIDATOR });

    // The result crosses to the browser. No environment variable name, host, or table may appear in it.
    expect(JSON.stringify(result)).not.toMatch(
      /SUPABASE|service_role|validation_batches|batch_entries|validators/i,
    );
  });

  it("never rejects, whatever the environment module or the client factory throws", async () => {
    // The call site has no `.catch`, so a rejection becomes an unhandled promise rejection in the
    // browser. Driven over the two places a throw can originate that the core never sees, plus a
    // non-`Error` value.
    //
    // NOT driven with a REJECTED PROMISE from `getServerEnv`. The wrapper calls it synchronously and
    // ignores the return, so a rejected promise would not be observed here at all — the first draft of
    // this test asserted `not_configured` for exactly that case and got `unknown_validator` instead,
    // because the rejection flew past and the lookup ran normally against the fake repositories. That
    // is the recorded trap this repository calls a green test proving the opposite of its claim: the
    // right assertion for a hypothetical is no assertion at all.
    createSupabaseRepositories.mockImplementation(() => {
      throw new Error("the client factory exploded");
    });
    const clientFailed = await loadAction();

    await expect(
      clientFailed.requestInterruptedBatchAction({ validatorId: VALIDATOR }),
    ).resolves.toEqual({
      status: "failed",
      reason: "unavailable",
    });

    getServerEnv.mockImplementation(() => {
      throw null;
    });
    const threwNull = await loadAction();

    // `null` is not an `Error` and not a `ServerEnvError`, so it takes the generic branch. If a future
    // edit read `error.message` unguarded, this is the value that would make it throw.
    await expect(
      threwNull.requestInterruptedBatchAction({ validatorId: VALIDATOR }),
    ).resolves.toEqual({
      status: "failed",
      reason: "unavailable",
    });
  });
});
