"use server";

import { ServerEnvError, getServerEnv } from "@/lib/env/server";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";

import { runVerifyBatchResponses, type VerifyBatchResult } from "./verify-batch-core";

/**
 * The checkpoint read: verifies stored responses for every placement of one batch.
 *
 * A one-shot Server Action, not background transport: it runs once per finished card
 * (plus bounded re-checks while the queue drains), so the Server Action shape is the
 * right one. The queue's per-response writes travel as POSTs; this gate does not.
 */
export async function verifyBatchResponsesAction(raw: unknown): Promise<VerifyBatchResult> {
  try {
    getServerEnv();
    const { batches, validations } = createSupabaseRepositories();
    const startedMs = Date.now();
    const result = await runVerifyBatchResponses(raw, { batches, validations });
    // Operator timing only: verdict and duration. Never entry ids, validator ids, or
    // response text — the missing placements travel back to the checkpoint caller in the
    // result, never into the log.
    const verdict = result.status === "verified" ? `complete=${result.complete}` : "complete=n/a";
    console.info(
      `[sadino:validation] batch verification status=${result.status} ${verdict} durationMs=${Date.now() - startedMs}`,
    );
    return result;
  } catch (error) {
    if (error instanceof ServerEnvError) {
      console.error("[sadino:validation] batch verification with no database configured", error);
      return { status: "failed", reason: "not_configured" };
    }
    console.error(
      "[sadino:validation] batch verification failed before reaching the service",
      error,
    );
    return { status: "failed", reason: "persistence" };
  }
}
