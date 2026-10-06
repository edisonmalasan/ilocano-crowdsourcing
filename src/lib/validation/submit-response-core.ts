import { createValidationResponseId } from "@/lib/domain/validation-response-id";
import {
  isRepositoryError,
  type SubmitResponseInput,
  type ValidationsRepository,
} from "@/lib/repositories";
import { isWriteIntentError, parseWriteIntent } from "@/lib/server/write-intake";
import { datasetEntryIdSchema } from "@/schemas/dataset";
import { validationBatchIdSchema, validationResponseInputSchema } from "@/schemas/validation";
import { z } from "zod";

import type {
  SubmitValidationFailureReason,
  SubmitValidationResult,
} from "./validation-actions-core";

/**
 * The single-RPC submit core — the testable half of the background write path.
 *
 * No `import "server-only"` in THIS file, for the same reason
 * `validation-actions-core.ts` carries none: the decisions here — is this payload
 * acceptable, what does the function's answer mean — are pure reasoning over an injected
 * repository, so a unit test reaches every branch with no credential and no network.
 * The Route Handler owns the privileged client and the environment check, and does
 * nothing else.
 *
 * The intent schema is the SAME three keys the Server Action accepts (`batchId`,
 * `datasetEntryId`, `response`), under `strictObject`, so an attempt to smuggle a
 * validator id, a response id, timestamps, or a position is REFUSED with nothing
 * written. The validator is derived from the stored batch inside the function; the
 * response id and timestamps are minted here, from a CSPRNG and an injected clock.
 */
const submitResponseIntentSchema = z.strictObject({
  batchId: validationBatchIdSchema,
  datasetEntryId: datasetEntryIdSchema,
  response: validationResponseInputSchema,
});

export type SubmitResponseIntent = z.output<typeof submitResponseIntentSchema>;

export interface SubmitResponseDependencies {
  readonly validations: Pick<ValidationsRepository, "submitResponse">;
  /** Injected rather than read from `Date.now()` inside, so timestamps are testable. */
  readonly now: () => Date;
}

export type { SubmitValidationFailureReason, SubmitValidationResult };

/** Builds the RPC input: the participant's answer plus the server's own minted facts. */
function buildRpcInput(
  intent: SubmitResponseIntent,
  responseId: string,
  timestamp: string,
): SubmitResponseInput {
  return {
    responseId,
    batchId: intent.batchId,
    datasetEntryId: intent.datasetEntryId,
    evaluation: intent.response.evaluation,
    correctedInstruction: intent.response.correctedInstruction ?? null,
    englishTranslation: intent.response.englishTranslation ?? null,
    filipinoTranslation: intent.response.filipinoTranslation ?? null,
    createdAt: timestamp,
  };
}

/**
 * Persists one completed response through exactly one versioned function call.
 *
 * "Immediately" is not a comment: this is called once per finished entry, so a validator
 * who closes the tab after the third of five has still banked three responses. There is no
 * batch-end flush anywhere in this module, and nothing here knows how many entries the
 * batch holds.
 */
export async function runSubmitResponse(
  raw: unknown,
  deps: SubmitResponseDependencies,
): Promise<SubmitValidationResult> {
  let intent: SubmitResponseIntent;
  try {
    intent = parseWriteIntent(submitResponseIntentSchema, raw, {
      schemaName: "submitResponseIntent",
    });
  } catch (error) {
    if (isWriteIntentError(error)) {
      return { status: "failed", reason: "invalid", issues: error.issues };
    }
    throw error;
  }

  const timestamp = deps.now().toISOString();
  const input = buildRpcInput(intent, createValidationResponseId(), timestamp);

  try {
    const outcome = await deps.validations.submitResponse(input);
    // `refused` is checked FIRST, deliberately: it is the only variant whose `status`
    // is a single literal, so it narrows cleanly. Checking `recorded` first does not —
    // that variant shares one object shape across two literals — and the fallthrough
    // then cannot name `reason`.
    if (outcome.status === "refused") {
      return { status: "failed", reason: outcome.reason };
    }
    if (outcome.status === "already_recorded") {
      return { status: "already_recorded", datasetEntryId: intent.datasetEntryId };
    }
    return {
      status: "recorded",
      responseId: outcome.responseId,
      datasetEntryId: intent.datasetEntryId,
    };
  } catch (error) {
    if (isRepositoryError(error)) return { status: "failed", reason: "persistence" };
    throw error;
  }
}
