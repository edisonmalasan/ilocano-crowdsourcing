import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The next-entry prefetch Server Action WRAPPER — the path that actually runs in production.
 *
 * The core (`next-entry-actions.test.ts`) proves the read's decisions with repositories injected.
 * This file proves the wrapper translates the two failures it can actually receive — a missing
 * deployment and a throw before the core is reached — into the documented results, and never
 * reports an entry it did not resolve.
 *
 * The configuration-failure class is owned by the test so the mock module and the thrown value
 * are the SAME class (the trap recorded in `validation-actions-wrapper.test.ts`).
 */
class ServerEnvError extends Error {
  override name = "ServerEnvError";
}

const getServerEnv = vi.fn();
const createSupabaseRepositories = vi.fn();
const runRequestNextEntry = vi.fn();
vi.spyOn(console, "error").mockImplementation(() => undefined);

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env/server", () => ({
  getServerEnv: () => getServerEnv(),
  ServerEnvError,
}));

vi.mock("@/lib/repositories/supabase", () => ({
  createSupabaseRepositories: () => createSupabaseRepositories(),
}));

vi.mock("@/lib/validation/next-entry-actions-core", () => ({
  runRequestNextEntry: (...args: unknown[]) => runRequestNextEntry(...args),
}));

function throwConfigurationFailure(missing: string): void {
  getServerEnv.mockImplementation(() => {
    throw new ServerEnvError(`${missing} is not set`);
  });
}

function passEnvironmentCheck(): void {
  getServerEnv.mockImplementation(() => undefined);
}

beforeEach(() => {
  getServerEnv.mockReset();
  createSupabaseRepositories.mockReset();
  runRequestNextEntry.mockReset();
});

async function loadWrapper() {
  return import("@/lib/validation/next-entry-actions");
}

describe("requestNextEntryAction", () => {
  it("reports not_configured when no database is configured, and builds nothing", async () => {
    throwConfigurationFailure("SUPABASE_URL");
    const { requestNextEntryAction } = await loadWrapper();

    const result = await requestNextEntryAction({ batchId: "batch_01", position: 1 });

    expect(result).toEqual({ status: "failed", reason: "not_configured" });
    expect(createSupabaseRepositories).not.toHaveBeenCalled();
    expect(runRequestNextEntry).not.toHaveBeenCalled();
  });

  it("delegates to the core with the raw request when configured", async () => {
    passEnvironmentCheck();
    createSupabaseRepositories.mockReturnValue({
      batches: {},
      datasetEntries: {},
      validations: {},
    });
    runRequestNextEntry.mockResolvedValue({ status: "finished" });
    const { requestNextEntryAction } = await loadWrapper();

    const raw = { batchId: "batch_01", position: 2 };
    const result = await requestNextEntryAction(raw);

    expect(result).toEqual({ status: "finished" });
    expect(runRequestNextEntry).toHaveBeenCalledTimes(1);
    expect(runRequestNextEntry).toHaveBeenCalledWith(raw, expect.anything());
  });

  it("reports persistence when the core is never reached because something else threw", async () => {
    passEnvironmentCheck();
    createSupabaseRepositories.mockImplementation(() => {
      throw new Error("client construction failed");
    });
    const { requestNextEntryAction } = await loadWrapper();

    const result = await requestNextEntryAction({ batchId: "batch_01", position: 1 });

    expect(result).toEqual({ status: "failed", reason: "persistence" });
    expect(runRequestNextEntry).not.toHaveBeenCalled();
  });
});
