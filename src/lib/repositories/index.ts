/**
 * Persistence seam.
 *
 * This package exports INTERFACES ONLY. No module in it imports Supabase, `createClient`, or any
 * persistence client, and none may be imported by a client component — the seam is what makes a
 * domain service testable against an in-memory fake with no database present.
 *
 * The implementations live one level down, in `src/lib/repositories/supabase/**`, and satisfy these
 * same interfaces. They are deliberately NOT re-exported here: a caller that imports from this
 * module gets interfaces it can substitute, and a caller that needs a real database composes one
 * explicitly from `src/lib/repositories/factory.ts`. Nothing in the seam can reach a client.
 *
 * Every implementation of these interfaces is bound by four rules:
 *
 *  1. It TRANSLATES between persistence records and domain types. A row shape (`snake_case`
 *     columns, a joined relation, a PostgREST envelope) MUST NOT leak to a caller.
 *  2. It RAISES `RepositoryError` on failure. It MUST NOT return an empty result to mean "the query
 *     failed", because "no data" and "the query failed" must stay distinguishable.
 *  3. It MUST NOT SILENTLY DROP UNKNOWN FIELDS. When a persistence record carries a field the
 *     current domain type does not model, the value is preserved and surfaced for migration
 *     analysis rather than discarded — a dropped field is an unrecoverable research record.
 *  4. It derives authoritative state server-side. Nothing a client sends about coverage, position,
 *     completion, or eligibility is trusted.
 */

export { POSTGREST_UNIQUE_VIOLATION_CODE, RepositoryError, isRepositoryError } from "./errors";
export type { RepositoryErrorOptions, RepositoryOperation } from "./errors";

export type { DatasetEntriesRepository } from "./dataset-entries-repository";
export type { EntryReservationsRepository } from "./entry-reservations-repository";
export type { ValidatorsRepository } from "./validators-repository";
export type {
  ValidationsRepository,
  SubmitResponseInput,
  SubmitResponseOutcome,
} from "./validations-repository";
export type {
  BatchesRepository,
  AllocateBatchInput,
  AllocatedPlacement,
} from "./batches-repository";
export type { SignInAttemptsRepository } from "./sign-in-attempts-repository";

export type { IsoDateTimeString, ListDatasetEntriesOptions } from "./types";
