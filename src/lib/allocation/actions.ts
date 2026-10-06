"use server";

import { ServerEnvError, getServerEnv } from "@/lib/env/server";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";
import { allocationConfigSchema } from "@/schemas/batch";

import { runAllocateBatch, type AllocationActionDependencies } from "./allocation-actions-core";
import { defaultBatch } from "./allocate-batch";
import type { AllocationOutcome } from "@/schemas/batch";

/**
 * The public Server Action for batch allocation.
 *
 * This file is the ONLY place in the allocation path that constructs a privileged Supabase client,
 * and it does so inside the request, never at module scope, so a missing credential produces a
 * nameable `ServerEnvError` rather than an import that throws the moment the module graph is
 * evaluated. That distinction is not cosmetic: in the current environment all three `SUPABASE_*`
 * variables are absent, so throwing at import would make the whole route unreachable rather than
 * reportable.
 *
 * Every decision lives in `allocation-actions-core.ts`, which takes its dependencies as arguments and
 * is therefore unit-tested with no database and no credential. This function does exactly three
 * things: read the environment, build the repositories, delegate.
 *
 * The service-role credential bypasses Row Level Security, so this action is reachable only from the
 * server and only through a service that has already decided what the caller is allowed to do. See
 * `@/lib/supabase/admin`.
 *
 * ============================================================================
 * WHERE `not_configured` IS ACTUALLY PRODUCED, because the core's branch is not it
 * ============================================================================
 * `runAllocateBatch` has a `ConfigurationFailure` branch, and in this deployment that branch is
 * unreachable: `actionDependencies()` below calls `getServerEnv()` while building the argument, so a
 * missing credential throws before the core is entered. `not_configured` is therefore returned HERE.
 *
 * That is why there are two tests for what sounds like one behaviour. `allocation-actions.test.ts`
 * drives the core and proves the classification; `allocation-actions-wrapper.test.ts` drives this file
 * with the environment module stubbed to throw, which is the only reproduction of production that is
 * possible without a credential. A test of the core alone would be green while the path that actually
 * runs stayed untested — the exact gap a green checkmark once hid in this repository.
 */

/**
 * Builds the action dependencies, or throws `ServerEnvError` when this deployment has no database
 * configured.
 *
 * `getServerEnv()` is called explicitly BEFORE constructing the client, so the failure is a named
 * configuration error rather than a client-construction failure that would be indistinguishable from a
 * network fault. The order is asserted by a test that fails if `createSupabaseRepositories` is ever
 * called after the check has already thrown.
 */
function actionDependencies(): AllocationActionDependencies {
  getServerEnv();
  const { validators, datasetEntries, batches } = createSupabaseRepositories();
  return {
    validators,
    datasetEntries,
    batches,
    // The schema's own defaults, parsed through the schema rather than written as literals, so
    // that when the approved batch size arrives it changes in `allocationConfigSchema` and nowhere
    // else. It remains pending thesis-team and adviser approval; there is no second number, because
    // the corrected methodology holds no validation target.
    config: allocationConfigSchema.parse({}),
    // ONE `Date` per batch, for the identifier AND the `created_at` the migration requires the
    // server to write. Two reads of the clock would let a batch's id and its column disagree, and the
    // column is the one that orders.
    newBatch: (validatorId) => defaultBatch(validatorId, new Date()),
    ConfigurationFailure: ServerEnvError,
  };
}

/** Logs the underlying failure for the operator. Never rendered to a participant. */
function logForOperator(message: string, error: unknown): void {
  // No error-monitoring dependency exists yet. The message names no value: `ServerEnvError` is safe
  // to log by construction, and a `RepositoryError` message describes an operation, not a credential.
  console.error(`[sadino:allocation] ${message}`, error);
}

export async function requestBatchAction(raw: unknown): Promise<AllocationOutcome> {
  try {
    return await runAllocateBatch(raw, actionDependencies());
  } catch (error) {
    // A configuration failure is thrown while BUILDING dependencies, so it never reaches the core.
    // Translate it here, and log the real cause.
    if (error instanceof ServerEnvError) {
      logForOperator("batch requested with no database configured", error);
      return { status: "failed", reason: "not_configured" };
    }
    logForOperator("batch request failed before reaching the service", error);
    return { status: "failed", reason: "persistence" };
  }
}
