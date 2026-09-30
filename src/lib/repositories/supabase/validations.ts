import "server-only";

import {
  RepositoryError,
  type RepositoryOperation,
  type ValidationsRepository,
} from "@/lib/repositories";
import type { DatasetEntryId } from "@/schemas/dataset";
import type { AnonymousValidatorId } from "@/schemas/validator";
import { validationResponseSchema, type ValidationResponse } from "@/schemas/validation";

import type { SupabaseClientLike } from "./client";
import {
  assertPageIsComplete,
  awaitQuery,
  parseDomainValue,
  persistenceFailure,
  POSTGREST_UNIQUE_VIOLATION_CODE,
  readExactCount,
  readRows,
  readSingleRow,
  toIsoDateTime,
} from "./rows";
import { VALIDATIONS_OPERATIONS as OPS } from "./operations";

/** The `validations` table as this mapping understands it. Every value is validated, not coerced. */
interface ValidationRow {
  id: unknown;
  validator_id: unknown;
  dataset_entry_id: unknown;
  batch_id: unknown;
  evaluation: unknown;
  corrected_instruction: unknown;
  english_translation: unknown;
  filipino_translation: unknown;
  created_at: unknown;
  updated_at: unknown;
}

/** The ten columns of `ValidationResponse`, in `snake_case`. Never `*`. */
const VALIDATION_COLUMNS = [
  "id",
  "validator_id",
  "dataset_entry_id",
  "batch_id",
  "evaluation",
  "corrected_instruction",
  "english_translation",
  "filipino_translation",
  "created_at",
  "updated_at",
] as const satisfies readonly (keyof ValidationRow)[];

/** One column is enough for a count; asking for the whole row to count it would be absurd. */
const COUNT_COLUMN = "validator_id";

/**
 * Row ⇄ domain translation, and the NULL ⇄ absent decision.
 *
 * `corrected_instruction`, `english_translation`, and `filipino_translation` are nullable columns
 * whose domain counterparts are OPTIONAL fields, so the mapping has to decide what a SQL `NULL`
 * means. It means "this validator supplied nothing", which the domain expresses as an ABSENT KEY,
 * not as an explicit `null`:
 *
 *   - `corrected_instruction = NULL` on a `correct_natural` row must become an absent
 *     `correctedInstruction`. Mapping it to `correctedInstruction: null` instead would make every
 *     `correct_natural` response fail its own integrity rule ("a correction is not accepted for
 *     this evaluation") the moment it is read back.
 *   - The same applies to both translations on a `cannot_evaluate` row, and there the stakes are
 *     higher: mapping `NULL` to `{ englishTranslation: null }` would make a perfectly legal
 *     `cannot_evaluate` record fail its own integrity rule ("a translation is not accepted when the
 *     entry cannot be confidently evaluated") on every read. The column can only express absence,
 *     so absence must map to absence.
 *   - A required correction or translation that is absent in the database therefore also fails to
 *     translate, which is correct: `correct_unnatural` with no correction is not a record the
 *     research can use, and it should be loud rather than quietly loadable.
 *
 * This is the one asymmetry in the pair of directions, and it is deliberate: the column can only
 * express absence, so the domain's richer distinction between "absent" and "present but empty"
 * cannot be reconstructed from a `correct_unnatural` row. The domain's `normalizeResearchText`
 * keeps that distinction on the way IN, where the validator's actual input is still available.
 *
 * The absence-key decision is asserted in `repositories-supabase.test.ts` by a read that expects the
 * key to be ABSENT rather than `null`, and the assertion distinguishes the two with `in`. A test
 * written as `toBeNull()` would pass for both, so it would prove nothing about the decision this
 * mapping exists to make.
 */
function toDomain(
  row: Record<string, unknown>,
  context: string,
  operation: RepositoryOperation,
): ValidationResponse {
  const candidate: Record<string, unknown> = {
    id: row.id,
    validatorId: row.validator_id,
    datasetEntryId: row.dataset_entry_id,
    batchId: row.batch_id,
    evaluation: row.evaluation,
    createdAt: toIsoDateTime(row.created_at, "created_at", operation),
    updatedAt: toIsoDateTime(row.updated_at, "updated_at", operation),
  };
  if (row.corrected_instruction !== null && row.corrected_instruction !== undefined) {
    candidate.correctedInstruction = row.corrected_instruction;
  }
  if (row.english_translation !== null && row.english_translation !== undefined) {
    candidate.englishTranslation = row.english_translation;
  }
  if (row.filipino_translation !== null && row.filipino_translation !== undefined) {
    candidate.filipinoTranslation = row.filipino_translation;
  }
  return parseDomainValue(validationResponseSchema, candidate, operation, context);
}

/**
 * Domain ⇄ row.
 *
 * An absent optional becomes an explicit SQL `NULL`, so the stored record says "nothing here"
 * rather than leaving the column to its default. Nothing in this mapping writes
 * `dataset_entries.instruction`: a correction is response data, and the write path for the
 * imported instruction does not exist in this directory.
 */
function toRow(response: ValidationResponse): Record<string, unknown> {
  return {
    id: response.id,
    validator_id: response.validatorId,
    dataset_entry_id: response.datasetEntryId,
    batch_id: response.batchId,
    evaluation: response.evaluation,
    corrected_instruction: response.correctedInstruction ?? null,
    english_translation: response.englishTranslation ?? null,
    filipino_translation: response.filipinoTranslation ?? null,
    created_at: response.createdAt,
    updated_at: response.updatedAt,
  };
}

/**
 * Supabase-backed access to persisted validation responses.
 *
 * The client is the narrow {@link SupabaseClientLike}, so this is testable with a fake and no
 * network. `factory.ts` is where the real service-role client enters, and it asserts at compile
 * time that the real client still exposes every member of that interface — member names only,
 * for the reason given there.
 */
export class SupabaseValidationsRepository implements ValidationsRepository {
  private readonly client: SupabaseClientLike;

  constructor(client: SupabaseClientLike) {
    this.client = client;
  }

  /**
   * Persists one completed entry's response and returns what was stored.
   *
   * A uniqueness violation — PostgreSQL SQLSTATE `23505`, which PostgREST reports as `code` —
   * becomes a `RepositoryError` naming `validations.insert`. That is the whole point of the
   * mapping: "this validator already validated this entry" is an outcome a service must be able
   * to report and branch on, and it must not arrive as a generic failure or, worse, as a silent
   * success. The same `RepositoryError` type and the same `operation` are what the in-memory fake
   * raises, so a service cannot tell the two implementations apart.
   *
   * TWO CAUSES SHARE THAT CODE, and this method does NOT tell them apart. On this table a `23505`
   * is either the `(validator_id, dataset_entry_id)` constraint or a primary-key collision, and
   * the two are indistinguishable from the envelope: PostgREST reports the SQLSTATE, and
   * separating them would mean parsing the constraint name out of `message`. The message therefore
   * names both possibilities rather than asserting the first. The cost of that imprecision is
   * small and deliberate — a duplicate *id* is a server bug (ids are generated), while a duplicate
   * *pair* is expected traffic — and the alternative is a message that lies whenever a different
   * constraint fires.
   */
  async insert(response: ValidationResponse): Promise<ValidationResponse> {
    const result = await awaitQuery(OPS.insert, "validations.insert", () =>
      this.client
        .from("validations")
        .insert(toRow(response))
        .select(VALIDATION_COLUMNS.join(","))
        .single(),
    );

    if (result.error !== null) {
      if (result.error.code === POSTGREST_UNIQUE_VIOLATION_CODE) {
        throw persistenceFailure(
          OPS.insert,
          "validations.insert",
          result.error,
          `This validator already has a validation for dataset entry ${response.datasetEntryId}, ` +
            "or the response id is already in use. A `23505` on this table is one of those two, " +
            "and this mapping does not claim to know which. The uniqueness constraint on " +
            "(validator_id, dataset_entry_id) was not swallowed either way.",
        );
      }
      throw persistenceFailure(OPS.insert, "validations.insert", result.error);
    }

    const row = readSingleRow(result, OPS.insert, "validations.insert");
    if (row === null) {
      throw new RepositoryError(
        OPS.insert,
        "The insert reported success but returned no stored row, so the write is unconfirmed. " +
          "Echoing the argument back would report a research response as persisted that was " +
          "never read.",
        { detail: "insert returned no row" },
      );
    }
    return toDomain(row, "validations.insert", OPS.insert);
  }

  /** The stored response with this ID, or `null` when absent. */
  async findById(id: string): Promise<ValidationResponse | null> {
    const result = await awaitQuery(OPS.findById, "validations.findById", () =>
      this.client
        .from("validations")
        .select(VALIDATION_COLUMNS.join(","))
        .eq("id", id)
        .maybeSingle(),
    );
    const row = readSingleRow(result, OPS.findById, "validations.findById");
    return row === null ? null : toDomain(row, "validations.findById", OPS.findById);
  }

  /**
   * Every response for one entry, across all validators.
   *
   * Ordered by `created_at` so the reviewer sees responses in the order they were given, which is
   * the order a disagreement is read in. This is the one place an order is applied, and it is
   * applied to a set whose members are timestamps of independent submissions, not to the
   * allocation pool.
   *
   * The exact count is requested so a response list silently cut off at the server's row limit
   * raises instead of looking like consensus.
   */
  async findByEntry(entryId: DatasetEntryId): Promise<ValidationResponse[]> {
    const result = await awaitQuery(OPS.findByEntry, "validations.findByEntry", () =>
      this.client
        .from("validations")
        .select(VALIDATION_COLUMNS.join(","), { count: "exact" })
        .eq("dataset_entry_id", entryId)
        .order("created_at", { ascending: true }),
    );
    const rows = readRows(result, OPS.findByEntry, "validations.findByEntry");
    assertPageIsComplete(result, rows, undefined, OPS.findByEntry, "validations.findByEntry");
    return rows.map((row, index) =>
      toDomain(row, `validations.findByEntry row ${index}`, OPS.findByEntry),
    );
  }

  /**
   * How many independent validators have responded for an entry.
   *
   * WHY THE COUNT CANNOT BE A ROW COUNT BY ACCIDENT, AND WHY IT IS NOT COMPUTED HERE. The
   * database enforces `UNIQUE (validator_id, dataset_entry_id)`, so for one fixed entry there is
   * at most one row per validator and the row count IS the distinct-validator count. The distinct
   * part is therefore a property of the migration (verified by the PGlite test for
   * `validations_validator_entry_unique`, not by anything in this file), and this method asks
   * Postgres for the exact count of matching rows in one round trip instead of fetching the
   * validator ids and deduplicating them in JavaScript.
   *
   * The rejected alternative is worth recording: fetching `validator_id` values and counting a
   * `Set` would be self-evidently correct here and would also be wrong in production, because
   * PostgREST caps a response at a configured maximum (1000 rows by default) and the
   * deduplication would silently under-count any entry past that cap. A count the database
   * computes is not truncated.
   *
   * A missing count raises rather than becoming `0`: a `0` here would tell allocation that an entry
   * is uncovered when the server simply did not answer, and allocation would then hand the entry
   * to more validators.
   */
  async countForEntry(entryId: DatasetEntryId): Promise<number> {
    const result = await awaitQuery(OPS.countForEntry, "validations.countForEntry", () =>
      this.client
        .from("validations")
        .select(COUNT_COLUMN, { count: "exact", head: true })
        .eq("dataset_entry_id", entryId),
    );
    return readExactCount(result, OPS.countForEntry, "validations.countForEntry");
  }

  /**
   * How many entries a validator has completed.
   *
   * Rows and distinct entries are the same number for one validator, for the same uniqueness
   * constraint, and again the count comes from the database rather than from a page of rows.
   */
  async countForValidator(validatorId: AnonymousValidatorId): Promise<number> {
    const result = await awaitQuery(OPS.countForValidator, "validations.countForValidator", () =>
      this.client
        .from("validations")
        .select(COUNT_COLUMN, { count: "exact", head: true })
        .eq("validator_id", validatorId),
    );
    return readExactCount(result, OPS.countForValidator, "validations.countForValidator");
  }
}
