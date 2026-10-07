import "server-only";

import {
  isRepositoryError,
  RepositoryError,
  type BatchesRepository,
  type DatasetEntriesRepository,
  type ValidatorsRepository,
} from "@/lib/repositories";
import { projectAllocatedEntry } from "@/lib/validation/allocated-entry";
import {
  resolveBatchSize,
  type AllocationConfig,
  type AllocationFailureReason,
  type AllocationOutcome,
} from "@/schemas/batch";
import type { AnonymousValidatorId } from "@/schemas/validator";

/**
 * Coverage-aware batch allocation, served by the versioned database function.
 *
 * ============================================================================
 * WHAT THE CLIENT SENDS AND WHAT IT GETS BACK
 * ============================================================================
 * The request carries an identifier and, at most, a *preference* for how many entries it would
 * like. Everything that decides the batch is derived server-side. There is no parameter through
 * which a caller could supply an entry list, an order, a per-entry coverage figure, or a
 * coverage target, and that is the guarantee rather than a convenience. There is not even a
 * target to supply — the corrected methodology holds none.
 *
 * `requestedSize` is capped by `resolveBatchSize` against the server's configuration, so a client
 * can ask for FEWER entries and never for more.
 *
 * ============================================================================
 * WHERE EACH DECISION LIVES NOW
 * ============================================================================
 * The order of operations is the specification:
 *
 *   1. Confirm the validator exists (`unknown_validator` before anything else, exactly as
 *      before — no batch, no reservation, nothing read past the profile).
 *   2. Enforce the proficiency gate (`screening_required` on the profile read alone).
 *   3. Resolve the effective size against the server's configuration.
 *   4. ONE database call — `allocate_validation_batch_v1` — computes eligible entries with the
 *      pooled-completion pillars, excludes this attempt's answered/assigned entries and
 *      others' active reservations, randomizes, claims with bounded in-function backfill, and
 *      persists the batch with 1-based positions, returning only the granted placements.
 *   5. Read the batch back through `findById` (never echo) and project the granted entries.
 *
 * Steps 1–3 perform no write; the allocation call in step 4 is the first one. The ordinary
 * path is four round trips: profile read, allocation call, batch read-back, granted-entry
 * projection. The 4,800-row pool transfer and the 200-id chunk loops are gone from this path;
 * they remain the fallback/recovery/export reads, not allocation's.
 *
 * ============================================================================
 * WHY COMPLETION IS EVALUATED IN SQL HERE, DESPITE THE STANDING RULE
 * ============================================================================
 * This module used to read the whole pool plus the pool's responses and reduce completion
 * with the TypeScript definition, refusing on principle to express the predicate in SQL —
 * two implementations in two languages drift, and drifted coverage is invisible. That
 * refusal cost ~37 round trips per batch and is SUPERSEDED for the allocation-time
 * evaluation by explicit task requirement, with the safeguard the refusal was standing in
 * for: the pillars live in exactly ONE SQL place (the versioned function), and the parity
 * suite `tests/integration/allocation-rpc-parity.test.ts` proves the function and the
 * TypeScript definition classify every response combination identically. A drift in either
 * direction fails loudly rather than retiring entries quietly.
 *
 * The TypeScript definition is unchanged and remains the definition for every other
 * consumer (dashboard, export, review). This module does not reimplement it; it calls the
 * function that embodies it and reads the answer back.
 *
 * ============================================================================
 * WHY `unknown_validator` IS NOT `persistence`
 * ============================================================================
 * A returning browser with a stale local-storage identifier is the single most likely thing to go
 * wrong, and the correct response is to offer a fresh identity. Reporting it as a database fault
 * would tell a participant the study is broken when nothing is.
 */

/** What a caller asks for. An identifier and a preference; nothing authoritative. */
export interface AllocationRequest {
  readonly validatorId: AnonymousValidatorId;
  /**
   * A PREFERENCE, capped by `resolveBatchSize`. `undefined` means "whatever the configuration
   * says". There is deliberately no way to ask for more than the configured batch size.
   */
  readonly requestedSize?: number;
}

export interface AllocationDependencies {
  readonly validators: Pick<ValidatorsRepository, "findById">;
  readonly batches: Pick<BatchesRepository, "allocate" | "findById">;
  readonly datasetEntries: Pick<DatasetEntriesRepository, "listByIds">;
  /**
   * The research parameters, injected rather than imported as constants.
   *
   * `batchSize` is pending thesis-team and adviser approval, so hard-coding it would freeze a
   * provisional number into code. The corrected methodology holds no other research parameter:
   * there is no target for a future caller to pass *around*, because there is no target at all.
   */
  readonly config: AllocationConfig;
  /**
   * A batch's identity at the moment it is created: its identifier AND its creation instant.
   *
   * The two facts are deliberately DIFFERENT kinds of value now. The identifier is a fresh
   * opaque capability (`BAT_` + 32 CSPRNG hex, see `createBatchId`): it carries neither the
   * validator's identity nor the creation instant, so it cannot be read for either. The
   * instant is the `created_at` column's value and nothing else. They are still returned
   * together because they describe one event — a batch coming into existence — and the
   * dependency's return type says so.
   *
   * The earlier scheme minted `<validatorId>-<ISO>` for the identifier and paired it with
   * `created_at` from the same `Date` so the two instants could not disagree. That pairing
   * rationale is RETIRED with the scheme: the identifier no longer embeds an instant, so
   * there is exactly one instant (the column) and nothing to disagree with. What is kept is
   * the single-`Date` discipline — the stored instant comes from the one `Date` handed to
   * `defaultBatch`, never from a second clock read.
   */
  readonly newBatch: (validatorId: AnonymousValidatorId) => MintedBatchIdentity;
}

/** A freshly minted batch's identifier and creation instant. See {@link AllocationDependencies}. */
export interface MintedBatchIdentity {
  readonly id: string;
  /** ISO 8601, as `Date.prototype.toISOString()` produces it. */
  readonly createdAt: string;
}

/**
 * New batch identifiers are independent opaque capabilities: `BAT_` plus 32 lowercase hex
 * characters drawn fresh from the CSPRNG at batch creation (16 bytes, 128 bits of entropy).
 *
 * The identifier is NEVER derived from, hashed from, or encoded from the validator ID, the
 * creation instant, entry IDs, or a counter. Concealment of the old shape (encoding or
 * hashing the validator ID into the batch ID) is explicitly rejected: this is a fresh
 * random value, not a disguised old one. Lowercase hex is URL-safe with no reserved
 * characters, so the existing exact-once-decode route round trip holds trivially.
 */
export const BATCH_ID_PATTERN = /^BAT_[0-9a-f]{32}$/;

/** Bytes of entropy per batch identifier (128 bits), matching the attempt mint. */
const BATCH_RANDOM_BYTE_COUNT = 16;

/** Lowercase hex, so the token is stable in URLs, logs, and case-sensitive comparisons. */
const BATCH_HEX = "0123456789abcdef";

/**
 * Draws `byteCount` CSPRNG bytes and renders them as lowercase hex.
 *
 * Throws when no CSPRNG is reachable rather than falling back to `Math.random()`: a
 * predictable batch identifier would let anyone open another attempt's batch, which is a
 * worse outcome than a failed request.
 */
function randomHexToken(byteCount: number): string {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.getRandomValues !== "function") {
    throw new Error(
      "createBatchId requires Web Crypto (globalThis.crypto.getRandomValues). " +
        "A predictable batch identifier would let batches be enumerated, so there is " +
        "no non-cryptographic fallback.",
    );
  }

  const bytes = new Uint8Array(byteCount);
  cryptoApi.getRandomValues(bytes);

  let token = "";
  for (const byte of bytes) {
    token += BATCH_HEX[byte >> 4]! + BATCH_HEX[byte & 0x0f]!;
  }

  return token;
}

/**
 * Mints a new opaque batch identifier, independent of every other fact about the batch.
 */
export function createBatchId(): string {
  return `BAT_${randomHexToken(BATCH_RANDOM_BYTE_COUNT)}`;
}

/**
 * The `validatorId-timestamp` batch scheme (`<validatorId>-<ISO>`) is RETIRED for new
 * batches: it embedded the owner's identifier and the creation instant in the address, so
 * possession of the URL was both identity and authorization.
 *
 * This name keeps its `(validatorId, now)` signature so existing callers and tests keep
 * compiling, but the construction is the `BAT_` mint: both parameters are now threaded
 * through to `defaultBatch` (which still needs `now` for `createdAt`) and neither one
 * reaches the identifier.
 */
export function defaultBatchId(validatorId: AnonymousValidatorId, now: Date): string {
  return defaultBatch(validatorId, now).id;
}

/**
 * The production `newBatch`: a fresh opaque batch identifier plus its creation instant.
 *
 * The identifier comes from the CSPRNG and the instant from the one `Date` handed in —
 * a single clock read for the single stored instant, so `createdAt` cannot disagree with
 * a second read. `validatorId` is accepted for caller compatibility and is NOT consulted:
 * the owner is persisted as the separate `validator_id` fact by the allocation call, never
 * encoded into the address. (It precedes the used `now` parameter, so it is lint-quiet
 * without an ignore comment — and a future removal must update every `newBatch` caller.)
 *
 * Exported rather than inlined in `actions.ts` so that the pairing — one instant, one
 * stored fact — is a named thing a test can check rather than a detail of a dependency object.
 */
export function defaultBatch(validatorId: AnonymousValidatorId, now: Date): MintedBatchIdentity {
  return { id: createBatchId(), createdAt: now.toISOString() };
}

/**
 * Allocates a coverage-aware batch for one validator.
 *
 * Contention-collapse as well as pool exhaustion collapse to `exhausted`: when nothing could be
 * granted — nobody else's fault and nothing persisted — the honest outcome is exhaustion, never
 * an empty batch.
 */
export async function allocateBatch(
  request: AllocationRequest,
  dependencies: AllocationDependencies,
): Promise<AllocationOutcome> {
  try {
    const profile = await dependencies.validators.findById(request.validatorId);
    if (profile === null) {
      return { status: "failed", reason: "unknown_validator" satisfies AllocationFailureReason };
    }

    // The methodology gate: no recorded proficiency answer, no sentences. Rows
    // without an answer predate the correction and stay valid rows — this
    // refuses the REQUEST, it does not judge, migrate, or rewrite the profile.
    // Placed before every other read so the refusal costs exactly the profile
    // read above: no allocation call, no batch persisted, no reservation claimed.
    if (profile.ilocanoProficiency === null) {
      return { status: "failed", reason: "screening_required" satisfies AllocationFailureReason };
    }

    const size = resolveBatchSize(request.requestedSize, dependencies.config);
    const minted = dependencies.newBatch(request.validatorId);

    // The single allocation call: selection, claims, and persistence commit atomically inside
    // the versioned function. An empty grant is exhaustion-or-total-contention, never failure.
    const placements = await dependencies.batches.allocate({
      batchId: minted.id,
      validatorId: request.validatorId,
      size,
      ttlSeconds: dependencies.config.reservationTtlSeconds,
      createdAt: minted.createdAt,
    });
    if (placements.length === 0) return { status: "exhausted" };

    // READ BACK, not the placements echoed. The function returns what it stored, and this
    // confirms it through the same path a later `findById` would use — a batch this class
    // could not itself produce is never reported.
    const stored = await dependencies.batches.findById(minted.id);
    if (stored === null) {
      throw new RepositoryError(
        "validation_batches.findById",
        `Batch ${minted.id} was allocated and reads back as absent. Reporting the placements ` +
          "instead would report a batch as persisted on the strength of a call this class could " +
          "not confirm.",
        { detail: "batch absent immediately after allocate" },
      );
    }

    // Project the STORED placements against the granted entries, in stored order. The read is
    // bounded by the grant (at most the effective size), never by the pool: the 4,800-row
    // transfer this replaces is exactly what this change removes. A stored id with no entry
    // behind it fails loudly rather than returning a shorter batch.
    const granted = await dependencies.datasetEntries.listByIds(
      stored.entries.map((entry) => entry.datasetEntryId),
    );
    if (granted.length !== stored.entries.length) {
      throw new RepositoryError(
        "dataset_entries.listByIds",
        `Batch ${minted.id} stores ${stored.entries.length} entries but only ${granted.length} ` +
          "resolve. Filtering the missing id out would return a batch the validator never " +
          "received.",
        {
          detail: `resolved ${granted.length} of ${stored.entries.length} granted entries`,
        },
      );
    }
    const byId = new Map(granted.map((entry) => [entry.id, entry]));
    const entries = stored.entries.map((placement) => {
      const found = byId.get(placement.datasetEntryId);
      if (found === undefined) {
        throw new RepositoryError(
          "dataset_entries.listByIds",
          `Batch ${minted.id} references ${placement.datasetEntryId}, which the granted-entry ` +
            "read did not return.",
          { detail: `granted entry ${placement.datasetEntryId} unresolved` },
        );
      }
      // Schema-enforced projection (six renderable fields, never the source payload), shared
      // with the session read so the two producers cannot disagree about what a participant
      // may see. A `null` here is a stored row the schema refuses — a bug or a database that
      // is not the one these tests assume — and it fails loudly rather than serving a partial
      // batch.
      const projected = projectAllocatedEntry(found);
      if (projected === null) {
        throw new RepositoryError(
          "dataset_entries.listByIds",
          `Batch ${minted.id} references ${placement.datasetEntryId}, which does not project ` +
            "to a renderable entry.",
          { detail: `granted entry ${placement.datasetEntryId} unprojectable` },
        );
      }
      return projected;
    });

    return {
      status: "allocated",
      batchId: stored.id,
      entries,
    };
  } catch (error) {
    // A `RepositoryError` is an expected outcome of an ordinary network call and the caller has to
    // be able to distinguish it from a programming error, which should stay loud. Anything else
    // propagates: swallowing an unknown throwable is how a real bug becomes a "persistence
    // failure" that nobody investigates.
    if (!isRepositoryError(error)) throw error;
    return { status: "failed", reason: "persistence" };
  }
}
