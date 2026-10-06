import type { AnonymousValidatorId, ValidatorProfile } from "@/schemas/validator";

import type { IsoDateTimeString } from "./types";

/**
 * Access to anonymous validator profiles.
 *
 * The surface is four methods wide and there is no field for anything identifying. That is not a
 * missing feature: the anonymity invariant is enforced at the type layer in
 * `@/schemas/validator`, and a repository method that accepted a name or an email could not
 * express it, so no implementation written against this interface can accidentally introduce one.
 *
 * Raises `RepositoryError` on failure — see `@/lib/repositories/errors`.
 */
export interface ValidatorsRepository {
  /** Persists a new anonymous profile. A duplicate ID raises `RepositoryError`; it does not upsert. */
  create(profile: ValidatorProfile): Promise<ValidatorProfile>;

  /** The profile with this ID, or `null` when absent. `null` means absent, not failed. */
  findById(id: AnonymousValidatorId): Promise<ValidatorProfile | null>;

  /**
   * Several profiles by ID. Missing IDs are omitted.
   *
   * Returned in the order the caller asked for, matching `DatasetEntriesRepository.listByIds`:
   * the dashboard resolves the validators behind a response set, and a stable order keeps every
   * figure derived from the list reproducible. An empty `ids` list short-circuits to `[]` without
   * a query, because `.in("id", [])` is malformed rather than empty.
   */
  listByIds(ids: readonly AnonymousValidatorId[]): Promise<ValidatorProfile[]>;

  /**
   * Every enrolled attempt ID in the table.
   *
   * The dashboard needs the enrolled SET, not just profiles behind responses: an attempt that
   * enrolled and never answered is invisible to `listByIds`. IDs only, because counts need no
   * profiles and profiles would widen the privacy surface for nothing. Paged deterministically
   * past the response cap (same pattern as `DatasetEntriesRepository.listAllActive`), so a large
   * attempt population is never truncated.
   */
  listAllIds(): Promise<AnonymousValidatorId[]>;

  /**
   * Records activity. `at` is supplied by the caller rather than read from the database clock so
   * the service controls the authoritative timestamp instead of trusting a client.
   */
  touchLastActive(id: AnonymousValidatorId, at: IsoDateTimeString): Promise<void>;
}
