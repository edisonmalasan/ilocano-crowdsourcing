import "server-only";

import { getServerEnv } from "@/lib/env/server";
import { createSupabaseRepositories } from "@/lib/repositories/supabase";
import {
  isRepositoryError,
  type BatchesRepository,
  type DatasetEntriesRepository,
  type ValidationsRepository,
} from "@/lib/repositories";
import { allocatedEntrySchema, type AllocatedEntry } from "@/schemas/batch";
import type { DatasetEntry } from "@/schemas/dataset";

import {
  resolveSessionEntry,
  validationSessionRequestSchema,
  type ValidationSessionOutcome,
} from "./session";

/**
 * ============================================================================
 * OPENING A VALIDATION SESSION — the server half of the read
 * ============================================================================
 * The decision of which entry to show is pure and lives in `./session`, so it is testable with no
 * database. This module does the three reads that decision needs and nothing else, and it is
 * deliberately separate from `./validation-actions-core` because a read and a write fail
 * differently: a failed read leaves the participant looking at nothing, a failed write leaves them
 * holding a typed answer that was not saved, and collapsing them into one "session service" would
 * make both error paths report the same sentence.
 *
 * ============================================================================
 * WHO OWNS A BATCH, AND WHY THE ANSWER IS NOT ASKED OF THE CALLER
 * ============================================================================
 * `BatchRecord.validatorId` is the batch's owner, read from the batch itself. The request carries
 * no validator identifier and the session derives none from the browser, because the batch already
 * names its owner: asking for it would add a second, client-supplied claim about identity that the
 * server would then have to reconcile with the first. One source of truth, read rather than
 * asserted.
 *
 * The consequence worth stating plainly: holding a batch id IS the capability to work through that
 * batch, exactly as it is the capability to read it. This platform has no authentication by design
 * — validators are anonymous and there is nothing to authenticate against — and the batch id already
 * embeds the anonymous validator id, so a URL that carried the validator id separately would leak
 * nothing new while adding a second thing to get wrong.
 */
export interface ValidationSessionDependencies {
  readonly batches: Pick<BatchesRepository, "findById">;
  readonly datasetEntries: Pick<DatasetEntriesRepository, "findById">;
  readonly validations: Pick<
    ValidationsRepository,
    "listEntryIdsForValidator" | "countForValidator"
  >;
}

/**
 * The real dependencies, built inside the request.
 *
 * `getServerEnv()` is called here rather than at module scope on purpose: in this environment every
 * `SUPABASE_*` variable is absent, so a module-scope client would make the route unimportable rather
 * than reportable, and the failure would arrive as an import error nobody can attribute.
 */
export function sessionDependencies(): ValidationSessionDependencies {
  getServerEnv();
  return createSessionDependencies();
}

/** Split out so a caller that already holds repositories — and every test — can skip the env check. */
export function createSessionDependencies(): ValidationSessionDependencies {
  const repositories = createSupabaseRepositories();
  return {
    batches: repositories.batches,
    datasetEntries: repositories.datasetEntries,
    validations: repositories.validations,
  };
}

/**
 * The six fields a validation screen may render, and no more.
 *
 * Built through `allocatedEntrySchema` rather than by writing the object out, so the closed set is
 * enforced by the schema that already documents WHY each other field is excluded — `sourcePayload`
 * because it is the archival copy of the source record, `createdAt` because an ingestion timestamp
 * is not a research finding, `isActive` because a persisted batch cannot contain a retired entry.
 * A hand-written projection would have to restate that reasoning and would eventually restate it
 * wrongly.
 */
function toAllocatedEntry(entry: DatasetEntry): AllocatedEntry | null {
  const projected = allocatedEntrySchema.safeParse({
    id: entry.id,
    category: entry.category,
    instruction: entry.instruction,
    origin: entry.origin,
    destination: entry.destination,
    transitMode: entry.transitMode,
  });
  return projected.success ? projected.data : null;
}

/**
 * Opens the session for one batch, at the requested position if it names one.
 *
 * `raw` is untrusted and is parsed HERE rather than at the route boundary, for one reason: the route
 * reads `position` out of a query string, so "the string `3`" and "the number 3" both have to end up
 * at the same schema, and there is exactly one schema they can end up at. A malformed link produces
 * `failed`/`invalid`, which the route renders as a broken link rather than as a study that is down.
 */
export async function openValidationSession(
  raw: unknown,
  dependencies: ValidationSessionDependencies,
): Promise<ValidationSessionOutcome> {
  const parsed = validationSessionRequestSchema.safeParse(raw);
  if (!parsed.success) return { status: "failed", reason: "invalid" };

  const { batchId, position } = parsed.data;

  try {
    const batch = await dependencies.batches.findById(batchId);
    if (batch === null) return { status: "absent" };

    const completedEntryIds = new Set(
      await dependencies.validations.listEntryIdsForValidator(batch.validatorId),
    );

    const choice = resolveSessionEntry(batch.entries, completedEntryIds, position);
    if (choice === null) {
      // THE LIFETIME FIGURE IS READ HERE, AND ONLY HERE, and the placement is the whole argument
      // (`design.md` D7). A lifetime total that climbs while somebody is answering sentences is a
      // volume counter competing for attention with the sentence in front of them, which is the
      // mechanic the existing design-system rule exists to prevent. Reading it on the `presenting`
      // path would mean the number is one refactor away from a screen that renders it mid-activity —
      // so the presenting branch never fetches it, and there is nothing there to display.
      //
      // The validator is the BATCH's own owner, read from the batch, for the reason the module header
      // gives: the request carries no identity and the server derives none from the browser.
      //
      // WHY ONE READ IN THE SAME REQUEST IS FRESH ENOUGH (this answers `design.md` open question 2).
      // Every response is persisted by the write that precedes this screen — each entry is saved as it
      // is answered — and the finished screen is only ever reached by a navigation issued AFTER that
      // write resolved. So a read taken now is necessarily after the last response this validator
      // submitted, and the figure shown includes the submit that produced the screen. A second read,
      // or a read earlier in the request, would return the same number: the validator cannot answer
      // anything between the write and this render, because they are not holding a screen with a form
      // on it. Reading it EARLIER would be the version that could actually be stale — a count taken
      // before the completed-set read could in principle miss a response that the completed set — read
      // just after it — already saw, and then the two figures on one screen would disagree.
      //
      // A failure here propagates to the `RepositoryError` branch below and is reported as
      // `failed`/`persistence`, deliberately. Substituting `0` for an unreadable count would tell a
      // validator who has answered forty sentences that they have answered none, which is the same
      // false statement `countForEntry`'s own comment refuses to make.
      const lifetimeAnsweredCount = await dependencies.validations.countForValidator(
        batch.validatorId,
      );

      return {
        status: "finished",
        batchId,
        // Every placement is complete, so the count is the batch's own size. It is not read back
        // from `resolveSessionEntry`, which returns nothing at all in this case by design.
        completedCount: batch.entries.length,
        total: batch.entries.length,
        lifetimeAnsweredCount,
      };
    }

    const stored = await dependencies.datasetEntries.findById(choice.placement.datasetEntryId);
    if (stored === null) {
      // A batch placement with no dataset entry behind it cannot be skipped and cannot be reported
      // as "finished": doing either would understate the work this validator still owes, in the
      // research record and on their screen. `batch_entries.dataset_entry_id` is a foreign key, so
      // this is a bug or a database that is not the one these tests assume — both are failures, and
      // the honest participant-facing sentence for one is "we could not read your batch".
      return { status: "failed", reason: "persistence" };
    }

    const entry = toAllocatedEntry(stored);
    if (entry === null) return { status: "failed", reason: "persistence" };

    return {
      status: "presenting",
      session: {
        batchId,
        entry,
        position: choice.placement.position,
        total: choice.total,
        completedCount: choice.completedCount,
        remainingCount: choice.remainingCount,
      },
    };
  } catch (error) {
    if (isRepositoryError(error)) return { status: "failed", reason: "persistence" };
    // A throw that reaches here is not a repository failure — it is a bug. Reporting it as
    // `persistence` would send an operator looking at a database for a defect in the code, so it
    // propagates and the route's own boundary decides what to log.
    throw error;
  }
}
