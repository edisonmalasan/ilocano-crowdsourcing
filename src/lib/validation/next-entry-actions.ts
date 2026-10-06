"use server";

import { ServerEnvError, getServerEnv } from "@/lib/env/server";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";

import {
  runRequestNextEntry,
  type NextEntryDependencies,
  type RequestNextEntryResult,
} from "./next-entry-actions-core";

/**
 * The public Server Action for prefetching the next validation entry.
 *
 * The same three-thing shape as `actions.ts`: read the environment, build the repositories,
 * delegate. The core owns every decision and is reachable without a credential; this wrapper is
 * the only layer that can report `not_configured`, and it performs no writes — the read-only
 * guard in `tests/unit/validation-read-only.test.ts` asserts that the prefetch modules reach no
 * write path.
 */

/** Builds the action dependencies, or throws `ServerEnvError` when no database is configured. */
function nextEntryDependencies(): NextEntryDependencies {
  getServerEnv();
  const { batches, datasetEntries, validations } = createSupabaseRepositories();
  return { batches, datasetEntries, validations };
}

/** Logs the underlying failure for the operator. Never rendered to a participant. */
function logForOperator(message: string, error: unknown): void {
  console.error(`[sadino:validation] ${message}`, error);
}

export async function requestNextEntryAction(raw: unknown): Promise<RequestNextEntryResult> {
  try {
    return await runRequestNextEntry(raw, nextEntryDependencies());
  } catch (error) {
    if (error instanceof ServerEnvError) {
      logForOperator("next entry requested with no database configured", error);
      return { status: "failed", reason: "not_configured" };
    }
    logForOperator("next entry request failed before reaching the service", error);
    return { status: "failed", reason: "persistence" };
  }
}
