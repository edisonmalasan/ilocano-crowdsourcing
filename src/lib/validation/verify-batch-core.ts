import { z } from "zod";

import {
  isRepositoryError,
  type BatchesRepository,
  type ValidationsRepository,
} from "@/lib/repositories";
import { isWriteIntentError, parseWriteIntent } from "@/lib/server/write-intake";
import { validationBatchIdSchema } from "@/schemas/validation";

/**
 * The batch-completion verification core — the testable half of the checkpoint read.
 *
 * No `import "server-only"` in THIS file: the decision — which placements lack a stored
 * response from this batch's own validator — is pure reasoning over injected repositories.
 * The `"use server"` wrapper owns the privileged client and the environment check.
 *
 * The validator is the BATCH's own owner, read from the batch, for the reason
 * `session-service.ts` records: the request carries no identity. Completion is derived
 * from the absence of unanswered placements, never asserted by the client.
 */
const verifyBatchIntentSchema = z.strictObject({
  batchId: validationBatchIdSchema,
});

export interface VerifyBatchDependencies {
  readonly batches: Pick<BatchesRepository, "findById">;
  readonly validations: Pick<ValidationsRepository, "listEntryIdsForValidator">;
}

export interface MissingPlacement {
  readonly datasetEntryId: string;
  readonly position: number;
}

export type VerifyBatchResult =
  | {
      readonly status: "verified";
      readonly complete: boolean;
      readonly missing: readonly MissingPlacement[];
      readonly total: number;
    }
  | {
      readonly status: "failed";
      readonly reason: "invalid" | "not_configured" | "unknown_batch" | "persistence";
    };

export type VerifyBatchFailureReason = Extract<
  VerifyBatchResult,
  { readonly status: "failed" }
>["reason"];

/**
 * Verifies which of a batch's placements have a stored response behind them.
 *
 * A read, not a lifecycle transition: nothing is written, and a complete verdict is a
 * property of the stored responses at the moment of the read. The checkpoint caller
 * combines this with the queue drain — drained AND verified-complete — before enabling
 * the completion controls.
 */
export async function runVerifyBatchResponses(
  raw: unknown,
  deps: VerifyBatchDependencies,
): Promise<VerifyBatchResult> {
  let batchId: string;
  try {
    batchId = parseWriteIntent(verifyBatchIntentSchema, raw, {
      schemaName: "verifyBatchIntent",
    }).batchId;
  } catch (error) {
    if (isWriteIntentError(error)) return { status: "failed", reason: "invalid" };
    throw error;
  }

  try {
    const batch = await deps.batches.findById(batchId);
    if (batch === null) return { status: "failed", reason: "unknown_batch" };

    const completed = new Set(await deps.validations.listEntryIdsForValidator(batch.validatorId));
    const missing = batch.entries
      .filter((placement) => !completed.has(placement.datasetEntryId))
      .map((placement) => ({
        datasetEntryId: placement.datasetEntryId,
        position: placement.position,
      }));

    return {
      status: "verified",
      complete: missing.length === 0,
      missing,
      total: batch.entries.length,
    };
  } catch (error) {
    if (isRepositoryError(error)) return { status: "failed", reason: "persistence" };
    throw error;
  }
}
