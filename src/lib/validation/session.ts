import { z } from "zod";

import {
  batchEntryPositionSchema,
  batchIdSchema,
  type AllocatedEntry,
  type BatchEntryPlacement,
} from "@/schemas/batch";
import type { DatasetEntryId } from "@/schemas/dataset";

/**
 * ============================================================================
 * WHICH ENTRY A VALIDATION SESSION PRESENTS — AS A PURE DECISION
 * ============================================================================
 * Nothing in this module reads, writes, or knows how to reach a database. The whole question
 * "given the batch the server allocated, the entries this validator has already finished, and an
 * optional position, what should be on screen?" is answered here, from plain data, so every branch
 * is assertable in this repository with no Supabase project, no credential, and no network.
 *
 * The alternative — resolving the entry inside the route — would put the one decision that has
 * research-integrity weight behind a component that can only be exercised by rendering it, and the
 * decision here is exactly the kind that must be provable rather than merely observed.
 *
 * ============================================================================
 * THE ORDER IS THE SERVER'S, AND THE ABSENCE OF AN ORDER INPUT IS THE GUARANTEE
 * ============================================================================
 * `batch_entries.position` is the order allocation chose. This module reads that order and offers
 * no way to supply one. There is deliberately no `clientOrder`, no explicit entry list, and no
 * "start from here" that is not a position INTO that order, because a caller who could pick which
 * entry they are shown is a caller who could pick which entry they never see. See
 * `SessionOrderingKeyIsPositionOnly` for the type-level pin, and `validationSessionRequestSchema`
 * for the runtime one.
 *
 * ============================================================================
 * "THIS BATCH IS FINISHED" IS DERIVED FROM THE ABSENCE OF WORK, NEVER FROM A POSITION
 * ============================================================================
 * This is the single most important line in the file. If a bookmarked or mistyped position sits
 * past the last remaining entry, the session still presents the first entry that has not been
 * answered, and only reports the batch finished when `remainingCount` is genuinely zero. A screen
 * that said "nothing left to do" while a real response is uncollected would be a false statement
 * about a participant's research record, produced by a URL.
 */

/**
 * The only thing a client may say about the session it wants: WHICH BATCH, and — optionally — a
 * position within the order that batch's own entries already carry.
 *
 * `strictObject`, for the reason every payload in this codebase is a `strictObject`: an attempt to
 * dictate the order is `undefined` here and stripped into nothing elsewhere. A stripped field looks
 * from the outside exactly like a request whose extra values were ignored, which is indistinguishable
 * from a successful request whose values happened not to matter — and that is precisely the moment
 * somebody adds an `entryIds` the service really does read and no request looks different.
 */
export const validationSessionRequestSchema = z.strictObject({
  batchId: batchIdSchema,
  /**
   * A 1-based position WITHIN the server-allocated order, not an index into "what is left". The
   * distinction is what makes a stale link safe: the server resolves it against the completed set
   * itself, so a position that pointed at a finished entry lands on the next one that is not.
   */
  position: batchEntryPositionSchema.optional(),
});

export type ValidationSessionRequest = z.infer<typeof validationSessionRequestSchema>;

/**
 * Type-level pin on the ordering input (`design.md` D1).
 *
 * A behavioural test cannot pin the absence of a parameter, because a mutation may name its field
 * anything and enumeration of plausible names cannot close the gap. The type layer can see a key
 * that does not exist yet, so the pin lives here: `Exclude<..., "batchId" | "position">` is `never`
 * while the request carries nothing but its batch and an optional position, and resolves to `never`
 * the moment a third key appears. A consumer declaring `const pin: SessionOrderingKeyIsPositionOnly =
 * true` then fails `pnpm run typecheck` with `TS2322: Type 'true' is not assignable to type
 * 'never'`.
 *
 * `batchId` is excluded from the pin because it is the subject of the request rather than an
 * instruction about order; the guarantee being pinned is "nothing tells the server what order to
 * present entries in except a position into the order it already chose".
 */
export type SessionOrderingKeyIsPositionOnly =
  Exclude<keyof ValidationSessionRequest, "batchId" | "position"> extends never ? true : never;

/** The one entry a session is presenting, plus the server's figures about the batch around it. */
export interface ValidationSessionEntry {
  /** The batch this entry belongs to. The route's own parameter; never client-supplied. */
  readonly batchId: string;
  /** The single entry to render. Its `instruction` is research material and is rendered verbatim. */
  readonly entry: AllocatedEntry;
  /** 1-based position WITHIN the batch, read from `batch_entries.position`. */
  readonly position: number;
  /** How many entries the allocated batch holds in total. */
  readonly total: number;
  /** How many of them this validator has already completed, from `listEntryIdsForValidator`. */
  readonly completedCount: number;
  /** How many have not. Zero is the only thing that makes the batch finished. */
  readonly remainingCount: number;
}

/**
 * Every way a session can resolve. A closed union rather than a nullable view, because "there is
 * nothing to show" has three genuinely different reasons and a participant-facing screen must say
 * which one it is.
 *
 *   `presenting` — exactly one entry, and the facts needed to render progress.
 *   `finished`   — this validator has completed every entry in this batch. Not a failure, and not
 *                  something to apologise for.
 *   `absent`     — no such batch. A bookmark or a mistyped id, not a broken study.
 *   `failed`     — nothing could be read. `invalid` is a malformed request and nothing was read;
 *                  `persistence` is a read that failed and the entry is NOT reported; and
 *                  `not_configured` is added by the ROUTE, which is the only layer that has read
 *                  the environment and therefore the only one that can know a deployment has no
 *                  database at all.
 */
export type ValidationSessionOutcome =
  | { readonly status: "presenting"; readonly session: ValidationSessionEntry }
  | {
      readonly status: "finished";
      readonly batchId: string;
      readonly completedCount: number;
      readonly total: number;
    }
  | { readonly status: "absent" }
  | {
      readonly status: "failed";
      readonly reason: "invalid" | "persistence" | "not_configured";
    };

/** What `resolveSessionEntry` found, with the counts a caller needs to render progress. */
export interface SessionEntryChoice {
  /** The entry to present, in the server's own recorded order. */
  readonly placement: BatchEntryPlacement;
  /** How many of the batch's entries this validator has already completed. */
  readonly completedCount: number;
  /** How many have not, which is zero only when the batch is finished. */
  readonly remainingCount: number;
  /** The batch's total size, so progress reads "N of M" without the caller re-deriving it. */
  readonly total: number;
}

/**
 * Decides which entry a session presents, and how far through the batch it is.
 *
 * `entries` are the batch's own placements. They are sorted by `position` here rather than trusted
 * to arrive sorted, because the value of a decision this consequential should not depend on a
 * repository's `ORDER BY`; the schema does not promise an order, and a service that reads one
 * anyway is relying on an accident.
 *
 * Returns `null` in exactly one situation: every entry in the batch has been completed by this
 * validator. A requested position beyond the last remaining entry does NOT return `null` — it
 * presents the first remaining entry, because a URL must never be able to declare a validator's
 * work finished.
 */
export function resolveSessionEntry(
  entries: readonly BatchEntryPlacement[],
  completedEntryIds: ReadonlySet<string>,
  requestedPosition: number | undefined,
): SessionEntryChoice | null {
  const ordered = [...entries].sort((a, b) => a.position - b.position);
  const completedCount = ordered.filter((placement) =>
    completedEntryIds.has(placement.datasetEntryId),
  ).length;
  const remaining = ordered.filter((placement) => !completedEntryIds.has(placement.datasetEntryId));

  if (remaining.length === 0) return null;

  // An unknown or past-the-end position falls back to the first entry that still needs an answer.
  // The alternative — treating it as "finished" — is the false statement this function exists to
  // avoid making.
  const placement =
    requestedPosition === undefined
      ? remaining[0]
      : (remaining.find((candidate) => candidate.position >= requestedPosition) ?? remaining[0]);

  return {
    placement,
    completedCount,
    remainingCount: remaining.length,
    total: ordered.length,
  };
}

/**
 * Which entry the NEXT screen should show, after one has just been completed.
 *
 * This exists as its own function rather than as a call with `requestedPosition: position + 1` at
 * each of two call sites, because the arithmetic is only right if the position the participant was
 * on really is the placement that was just answered — and because the advance must be derived from
 * the server's order in exactly one place. It is the same decision `resolveSessionEntry` makes, with
 * the entry just completed added to the completed set; expressing it as a separate named function
 * means the set is extended in one place instead of two.
 */
export function resolveNextSessionEntry(
  entries: readonly BatchEntryPlacement[],
  completedEntryIds: ReadonlySet<string>,
  completedDatasetEntryId: DatasetEntryId,
): SessionEntryChoice | null {
  const next = new Set(completedEntryIds);
  next.add(completedDatasetEntryId);
  return resolveSessionEntry(entries, next, undefined);
}
