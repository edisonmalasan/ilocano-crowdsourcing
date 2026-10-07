import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The start orchestration adds no RPC and no privilege.
 *
 * The data-access-boundary scenario "The start orchestration adds no privilege" requires
 * that the persistence calls reachable from the orchestration are the existing versioned
 * allocation function plus read-only lookups, all executed with the privileged path
 * server-side. This file is the source half of that proof: it enumerates what the
 * orchestration's own modules can reach. The migration half lives in
 * `tests/integration/start-validation-migration.test.ts`, which asserts no migration
 * introduces a start-validation function.
 *
 * WHAT THIS DOES NOT PROVE: that the repositories the core calls do what their names
 * say on the wire. That is the parity suite's job, unchanged by this change.
 */

const CORE_PATH = "src/lib/validation/start-validation-core.ts";
const WRAPPER_PATH = "src/lib/validation/start-validation-actions.ts";

describe("the start orchestration reaches persistence only through the existing seam", () => {
  it("the core delegates allocation to the existing service, it does not reimplement it", () => {
    const contents = readFileSync(CORE_PATH, "utf8");

    // The single allocation call, by its own name, imported from the module that owns it.
    expect(contents).toContain("allocateBatch(");
    expect(contents).toContain('from "@/lib/allocation/allocate-batch"');
    // First-entry resolution and the renderable projection are shared, not duplicated.
    expect(contents).toContain("resolveSessionEntry");
    expect(contents).toContain("projectAllocatedEntry");
    expect(contents).toContain("recognizeInterruptedBatch");
  });

  it("the core issues no RPC of its own", () => {
    const contents = readFileSync(CORE_PATH, "utf8");

    // No direct RPC call, no new function name, no SQL text: the only database write the
    // orchestration can perform is the one `allocateBatch` performs inside the existing
    // versioned function.
    expect(contents).not.toMatch(/\.rpc\(/);
    expect(contents).not.toMatch(/allocate_validation_batch_v2/);
    expect(contents).not.toMatch(/start_validation/);
    expect(contents).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
  });

  it("the wrapper builds privileged repositories server-side and nothing else", () => {
    const contents = readFileSync(WRAPPER_PATH, "utf8");

    expect(contents).toContain("createSupabaseRepositories");
    expect(contents).toContain("getServerEnv");
    expect(contents).toContain("runStartValidation");
    // The browser never calls the allocation function directly: the wrapper reaches it
    // only through the core, and names no RPC itself.
    expect(contents).not.toMatch(/\.rpc\(/);
    // No credential VALUE is read here: the wrapper names the privileged path only in
    // prose (as the allocation wrapper does) and reaches it through the repository
    // factory, never by reading the service-role key itself.
    expect(contents).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("the old allocation and recovery actions remain for non-start callers", () => {
    // Task 4.2's enumeration, asserted rather than assumed: both modules still exist and
    // still export their actions. Whether any caller remains is counted in the Apply
    // report; what must not happen silently is their deletion under this change.
    const allocation = readFileSync("src/lib/allocation/actions.ts", "utf8");
    const recovery = readFileSync("src/lib/validation/recovery-actions.ts", "utf8");
    expect(allocation).toContain("export async function requestBatchAction");
    expect(recovery).toContain("export async function requestInterruptedBatchAction");
  });
});
