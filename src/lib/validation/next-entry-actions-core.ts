import { z } from "zod";

import {
  isRepositoryError,
  type BatchesRepository,
  type DatasetEntriesRepository,
  type ValidationsRepository,
} from "@/lib/repositories";
import { isWriteIntentError, parseWriteIntent } from "@/lib/server/write-intake";
import { batchEntryPositionSchema, type AllocatedEntry } from "@/schemas/batch";
import { validationBatchIdSchema } from "@/schemas/validation";

import { projectAllocatedEntry } from "./allocated-entry";
import { resolveSessionEntry } from "./session";

/**
 * ============================================================================
 * THE NEXT-ENTRY PREFETCH CORE — the testable half of the prefetch read
 * ============================================================================
 * No `import "server-only"` in THIS file, for the same reason
 * `validation-actions-core.ts` carries none: the decisions here — which entry
 * comes next, and whether there is one — are pure reasoning over injected
 * repositories. The `"use server"` wrapper in `next-entry-actions.ts` owns the
 * privileged client and the environment check, and does nothing else.
 *
 * ============================================================================
 * WHAT THIS READ IS, AND WHAT IT IS NOT
 * ============================================================================
 * It is the same three reads `openValidationSession` performs — batch,
 * completed set, one entry — resolved one position ahead of the entry the
 * participant is currently answering, through the same `resolveSessionEntry`
 * and the same `projectAllocatedEntry` projection. A prefetch that resolved
 * differently from the route would show a sentence the route would never have
 * shown, so sharing the decider and the projection is the guarantee rather
 * than a convenience.
 *
 * It is NOT a second order: there is no `clientOrder`, no entry id, and no
 * entry list in the request. The client says which batch and which position it
 * is looking at; the server adds one and resolves against its own record.
 * The response carries ONE entry — the immediate next one — plus the figures
 * the progress readout needs. The whole batch never crosses this boundary,
 * and neither does anything past the next entry.
 *
 * `strictObject`, so an attempt to steer the read with an extra field is
 * REFUSED with nothing read. A stripped extra field would look exactly like a
 * request whose values happened not to matter.
 */
const requestNextEntryIntentSchema = z.strictObject({
  batchId: validationBatchIdSchema,
  /** The position currently on screen. The server resolves the entry after it. */
  position: batchEntryPositionSchema,
});

export type RequestNextEntryIntent = z.output<typeof requestNextEntryIntentSchema>;

export interface NextEntryDependencies {
  readonly batches: Pick<BatchesRepository, "findById">;
  readonly datasetEntries: Pick<DatasetEntriesRepository, "findById">;
  readonly validations: Pick<ValidationsRepository, "listEntryIdsForValidator">;
}

/**
 * Every outcome, and every one of them is produced.
 *
 *   `ready`             — the next entry, in the server-allocated order, with the figures the
 *                         progress readout renders. The entry is the `AllocatedEntry` projection:
 *                         six renderable fields, no source payload, no coverage, no order.
 *   `finished`          — no entry remains after the current position. The caller flushes its
 *                         save queue and navigates, and the ROUTE decides what that means: the
 *                         finished screen when nothing remains at all, or the first remaining entry
 *                         when earlier positions are still unanswered. This response never declares
 *                         the batch finished itself, so it cannot manufacture a false completion.
 *   `failed`/`invalid`  — the request did not parse. Nothing was read.
 *   `failed`/`not_configured` — added by the wrapper, which is the only layer that can know.
 *   `failed`/`unknown_batch`  — no such batch. A stale session, not a study that is down.
 *   `failed`/`persistence`    — a read failed. The entry is NOT reported, because a participant
 *                         must never be shown a sentence the server could not resolve.
 */
export type RequestNextEntryResult =
  | {
      readonly status: "ready";
      readonly entry: AllocatedEntry;
      readonly position: number;
      readonly total: number;
      readonly completedCount: number;
    }
  | { readonly status: "finished" }
  | {
      readonly status: "failed";
      readonly reason: "invalid" | "not_configured" | "unknown_batch" | "persistence";
    };

export type RequestNextEntryFailureReason = Extract<
  RequestNextEntryResult,
  { readonly status: "failed" }
>["reason"];

/**
 * Resolves the single entry after the one the participant is answering.
 *
 * The current entry is deliberately NOT required to be complete: that is the whole of the
 * optimistic change. The completed set is read as stored, and the request resolves at-or-after
 * `position + 1` — the same rule the route applies to a navigation — so a prefetch taken while
 * the current save is still in flight names the entry the route would name after that save
 * resolves. When the current entry IS already stored, it is simply absent from the remaining
 * set and the same arithmetic lands in the same place: one rule, not two.
 */
export async function runRequestNextEntry(
  raw: unknown,
  deps: NextEntryDependencies,
): Promise<RequestNextEntryResult> {
  let intent: RequestNextEntryIntent;
  try {
    intent = parseWriteIntent(requestNextEntryIntentSchema, raw, {
      schemaName: "requestNextEntryIntent",
    });
  } catch (error) {
    if (isWriteIntentError(error)) return { status: "failed", reason: "invalid" };
    throw error;
  }

  try {
    const batch = await deps.batches.findById(intent.batchId);
    if (batch === null) return { status: "failed", reason: "unknown_batch" };

    const completedEntryIds = new Set(
      await deps.validations.listEntryIdsForValidator(batch.validatorId),
    );

    const choice = resolveSessionEntry(batch.entries, completedEntryIds, intent.position + 1);
    if (choice === null) return { status: "finished" };

    // The prefetched entry must be strictly ahead of the current one. `resolveSessionEntry`
    // falls back to the first remaining entry when the requested position runs past the end —
    // which, with an unsaved current entry still outstanding, can only be an entry at or before
    // the current position when everything after it is already complete. Serving that as "next"
    // would present an entry out of order or a duplicate of work already shown, so it is refused
    // here and the caller falls back to navigation, where the route applies the same fallback
    // with a full render around it.
    if (choice.placement.position <= intent.position) return { status: "finished" };

    const stored = await deps.datasetEntries.findById(choice.placement.datasetEntryId);
    if (stored === null) return { status: "failed", reason: "persistence" };

    const entry = projectAllocatedEntry(stored);
    if (entry === null) return { status: "failed", reason: "persistence" };

    return {
      status: "ready",
      entry,
      position: choice.placement.position,
      total: choice.total,
      completedCount: choice.completedCount,
    };
  } catch (error) {
    if (isRepositoryError(error)) return { status: "failed", reason: "persistence" };
    throw error;
  }
}
