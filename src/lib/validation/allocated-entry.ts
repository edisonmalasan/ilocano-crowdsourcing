import { allocatedEntrySchema, type AllocatedEntry } from "@/schemas/batch";
import type { DatasetEntry } from "@/schemas/dataset";

/**
 * The six fields a validation screen may render, and no more.
 *
 * Built through `allocatedEntrySchema` rather than by writing the object out, so the closed set is
 * enforced by the schema that already documents WHY each other field is excluded — `sourcePayload`
 * because it is the archival copy of the source record, `createdAt` because an ingestion timestamp
 * is not a research finding, `isActive` because a persisted batch cannot contain a retired entry.
 * A hand-written projection would have to restate that reasoning and would eventually restate it
 * wrongly.
 *
 * Shared by the session read (`session-service.ts`) and the next-entry prefetch
 * (`next-entry-actions-core.ts`): two producers of screen data must not hold two projections that
 * can disagree about which fields a participant may see. Moved here — rather than imported from
 * the session service — because that module carries `import "server-only"` and the prefetch core
 * must not inherit a marker; the decisions here are pure reasoning over injected repositories.
 */
export function projectAllocatedEntry(entry: DatasetEntry): AllocatedEntry | null {
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
