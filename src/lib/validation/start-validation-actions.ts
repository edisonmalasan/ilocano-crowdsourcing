"use server";

import { headers } from "next/headers";

import { resolveOriginKey } from "@/lib/admin/origin";
import { ServerEnvError, getServerEnv } from "@/lib/env/server";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";
import { allocationConfigSchema } from "@/schemas/batch";
import { sharedPublicThrottle } from "@/lib/validators/public-throttle";

import { defaultBatch } from "@/lib/allocation/allocate-batch";
import { runStartValidation, type StartValidationOutcome } from "./start-validation-core";

/**
 * The public Server Action for validation start.
 *
 * This file is the ONLY place in the start path that constructs a privileged Supabase client,
 * and it does so inside the request, never at module scope, so a missing credential produces
 * a nameable `ServerEnvError` rather than an import that throws the moment the module graph
 * is evaluated.
 *
 * Every decision lives in `start-validation-core.ts`, which takes its dependencies as
 * arguments and is therefore unit-tested with no database and no credential. This function
 * does exactly three things: read the environment, build the repositories, delegate.
 *
 * The service-role credential bypasses Row Level Security, so this action is reachable only
 * from the server and only through a service that has already decided what the caller is
 * allowed to do. See `@/lib/supabase/admin`.
 *
 * ============================================================================
 * ONE-SHOT WORKFLOW, NOT A BACKGROUND WRITE
 * ============================================================================
 * This action is a client-called Server Action because starting validation is a one-shot
 * workflow: one press, one orchestration, one navigation. It is NOT the transport for
 * individual background response writes — those travel as same-origin POSTs to the
 * response-submit Route Handler (`data-access-boundary`). The distinction is load-bearing:
 * a start is issued once per batch by an explicit control, while saves are issued per entry
 * from a queue; collapsing them into one transport would put high-frequency writes behind
 * a Server Action the posture forbids them from using.
 *
 * ============================================================================
 * NO NEW RPC AND NO NEW PRIVILEGE
 * ============================================================================
 * Persistence behind this action is the EXISTING versioned allocation function plus
 * read-only lookups, all executed with the privileged path server-side. The browser never
 * calls the allocation function directly and never supplies entry lists, ordering,
 * coverage, batch ownership, or timestamps — the strict intent refuses those before any
 * database work, and the server derives the authoritative values itself.
 */

/** Logs the underlying failure for the operator. Never rendered to a participant. */
function logForOperator(message: string, error: unknown): void {
  // No error-monitoring dependency exists yet. `ServerEnvError`'s message names a MISSING
  // VARIABLE and no value; a `RepositoryError` message describes an operation, not a
  // credential. See the identical helper in `@/lib/allocation/actions`.
  console.error(`[sadino:start-validation] ${message}`, error);
}

export async function requestStartValidationAction(raw: unknown): Promise<StartValidationOutcome> {
  try {
    // `getServerEnv()` is called EXPLICITLY, before the repositories are constructed, so a
    // missing credential is a named configuration error rather than a client-construction
    // failure — the two are indistinguishable to a caller otherwise, and they have different
    // fixes. The ORDER is asserted in `start-validation-actions-wrapper.test.ts`, not here,
    // because only that file can see it.
    getServerEnv();
    const { validators, validations, batches, datasetEntries } = createSupabaseRepositories();
    const jar = await headers();

    return await runStartValidation(
      raw,
      {
        validators,
        validations,
        batches,
        datasetEntries,
        // The schema's own defaults, parsed through the schema rather than written as
        // literals, so that when the approved batch size arrives it changes in
        // `allocationConfigSchema` and nowhere else.
        config: allocationConfigSchema.parse({}),
        // ONE `Date` per batch, for the identifier AND the `created_at` the migration
        // requires the server to write. Two reads of the clock would let a batch's id and
        // its column disagree, and the column is the one that orders.
        newBatch: (validatorId) => defaultBatch(validatorId, new Date()),
        ConfigurationFailure: ServerEnvError,
      },
      {
        throttle: sharedPublicThrottle,
        originKey: resolveOriginKey((name) => jar.get(name)),
      },
    );
  } catch (error) {
    // A configuration failure is thrown while BUILDING dependencies, so it never reaches
    // the core. Translate it here, and log the real cause.
    if (error instanceof ServerEnvError) {
      logForOperator("validation start requested with no database configured", error);
      return { status: "failed", reason: "not_configured" };
    }
    logForOperator("validation start request failed before reaching the service", error);
    return { status: "failed", reason: "persistence" };
  }
}
