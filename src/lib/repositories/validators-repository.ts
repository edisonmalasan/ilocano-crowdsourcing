import type { AnonymousValidatorId, ValidatorProfile } from "@/schemas/validator";

import type { IsoDateTimeString } from "./types";

/**
 * Access to anonymous validator profiles.
 *
 * The surface is three methods wide and there is no field for anything identifying. That is not a
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
   * Records activity. `at` is supplied by the caller rather than read from the database clock so
   * the service controls the authoritative timestamp instead of trusting a client.
   */
  touchLastActive(id: AnonymousValidatorId, at: IsoDateTimeString): Promise<void>;
}
