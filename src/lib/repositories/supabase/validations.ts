import "server-only";

import {
  RepositoryError,
  type RepositoryOperation,
  type ValidationsRepository,
} from "@/lib/repositories";
import { datasetEntryIdSchema, type DatasetEntryId } from "@/schemas/dataset";
import { anonymousValidatorIdSchema, type AnonymousValidatorId } from "@/schemas/validator";
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
 * The single column `listEntryIdsForValidator` needs. It genuinely selects one column, unlike
 * `listForEntries` — see that method's comment for why the asymmetry is a decision rather than an
 * oversight.
 */
const ENTRY_ID_COLUMN = "dataset_entry_id";

/**
 * PostgREST's default maximum rows per response, and therefore the page size used to read a
 * candidate pool's responses.
 *
 * WHY THIS READ PAGES AT ALL, which `findByEntry` does not have to
 * --------------------------------------------------
 * `findByEntry` reads one entry's responses and asserts the read was complete. This method reads
 * the responses of an ENTIRE POOL: 4,800 entries with several responses each is thousands of rows
 * filtered out, and PostgREST caps a response at the project's configured maximum (1000 by
 * default) while signalling the cap only by returning fewer rows than match.
 *
 * The consequence if this did not page is not a slow query. It is a coverage number computed over a
 * truncated set: entries late in the pool would look less covered than they are, allocation would
 * keep serving them, and the research would record over-collection as diligence. That is the exact
 * silent-wrong-answer failure `assertPageIsComplete` exists for, and raising on it — the obvious
 * alternative — would mean allocation fails outright once the dataset exceeds ~333 fully-covered
 * entries, which is a functional break rather than a safety property.
 *
 * So the read pages, and the pages are driven by the `count: "exact"` the first page already
 * returns. Unverified: the configured maximum on a real project. If it is higher than 1000, this
 * simply fetches smaller pages than it needs to.
 */
const RESPONSE_PAGE_SIZE = 1000;

/**
 * Maximum filter values per `.in()` request.
 *
 * The range paging above handles many matching ROWS, but the filter list itself travels in the
 * URL: 3,000 entry ids in one `.in()` drew a 400 Bad Request from the hosted gateway. 200 ids
 * keep the URL to a few kilobytes with wide margin, and chunking is semantics-preserving
 * because each chunk carries its own exact count to page against.
 */
const FILTER_VALUE_CHUNK_SIZE = 200;

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
   * Every stored response for a set of entries, across all validators, UNFILTERED.
   *
   * ============================================================================================
   * WHY TEN COLUMNS WHEN THE PREDICATE READS FIVE, AND WHY NOTHING IS FILTERED
   * ============================================================================================
   *
   * THE FILTERING. The interface forbids this method from dropping non-qualifying responses,
   * because the qualifying rule is defined once, in `@/lib/domain/validation-response`, and a
   * `where` clause here would be that rule in SQL: a second copy, in a second language, with
   * nothing keeping the two in agreement — and a drifted copy fails by producing a plausible wrong
   * coverage number rather than an error. The interface comment carries the full argument.
   *
   * THE COLUMN LIST. `isQualifyingValidation` reads `evaluation`, `corrected_instruction`,
   * `english_translation`, and `filipino_translation`; `countQualifyingValidations` adds
   * `validator_id`. `ValidationResponse` also carries `batch_id`, `createdAt`, and `updatedAt`, so a
   * five-column projection would mean either fabricating those three values or introducing a second
   * domain type with its own NULL ⇄ absent rules — a second place to get the bilingual rules wrong,
   * for the sake of a few hundred bytes. `toDomain` is the already-tested code that knows a NULL
   * translation column means an ABSENT key, and reusing it is worth more than the bytes. The
   * narrower projection is the right revisit at a larger scale (`design.md` D1), and it should be a
   * projection of COLUMNS, never a re-implementation of the predicate.
   *
   * The paging is explained at `RESPONSE_PAGE_SIZE` above, and it is why this is not a two-liner.
   *
   * An empty pool short-circuits to `[]` without a query: `.in("dataset_entry_id", [])` is a
   * malformed filter, not an empty one.
   */
  async listForEntries(entryIds: readonly DatasetEntryId[]): Promise<ValidationResponse[]> {
    if (entryIds.length === 0) return [];

    // Chunked by FILTER VALUES as well as by rows. The range paging below handles many matching
    // rows, but `.in("dataset_entry_id", ids)` with 3,000 ids builds a URL PostgREST refuses
    // (measured: 400 Bad Request on the hosted project against the merged corpus), so the id
    // list itself is bounded per request. 200 ids keep the URL to a few kilobytes; the per-chunk
    // count below is independent per chunk, so chunking changes no semantics.
    const collected: Record<string, unknown>[] = [];
    for (let start = 0; start < entryIds.length; start += FILTER_VALUE_CHUNK_SIZE) {
      const chunk = entryIds.slice(start, start + FILTER_VALUE_CHUNK_SIZE);
      collected.push(...(await this.listForEntriesChunk(chunk)));
    }

    return collected.map((row, index) =>
      toDomain(row, `validations.listForEntries row ${index}`, OPS.listForEntries),
    );
  }

  /**
   * One id chunk, fully paged by rows.
   *
   * Returns RAW rows rather than domain values so the caller's row indices stay stable across
   * chunks: mapping per chunk would restart the index at zero and two chunks could then report
   * the same "row 7" in two different failures.
   */
  private async listForEntriesChunk(
    entryIds: readonly DatasetEntryId[],
  ): Promise<Record<string, unknown>[]> {
    const collected: Record<string, unknown>[] = [];

    for (let from = 0; ; from += RESPONSE_PAGE_SIZE) {
      const result = await awaitQuery(OPS.listForEntries, "validations.listForEntries", () =>
        this.client
          .from("validations")
          .select(VALIDATION_COLUMNS.join(","), { count: "exact" })
          .in("dataset_entry_id", entryIds)
          .range(from, from + RESPONSE_PAGE_SIZE - 1),
      );

      const rows = readRows(result, OPS.listForEntries, "validations.listForEntries");
      const pageTotal = readExactCount(result, OPS.listForEntries, "validations.listForEntries");
      collected.push(...rows);

      if (collected.length >= pageTotal) break;
      // A short page that has not reached the exact count means the server stopped returning rows
      // without saying why. Looping again would reissue the identical request forever, so this is
      // stated rather than waited out.
      if (rows.length === 0) {
        throw new RepositoryError(
          OPS.listForEntries,
          `validations.listForEntries received an empty page at offset ${from} with ` +
            `${collected.length} of ${pageTotal} rows read. The server is truncating without ` +
            "reporting a count, so the remaining responses cannot be read, and a coverage number " +
            "computed from a partial pool would be silently wrong.",
          { detail: `empty page at offset ${from} of ${pageTotal} rows` },
        );
      }
    }

    return collected;
  }

  /**
   * The entry ids one validator has already answered.
   *
   * One column, because the result IS one column. The other coverage read selects ten for the
   * reasons above; widening this one would fetch data the exclusion rule does not read, which is
   * how a method that exists to keep the response out of allocation's way starts leaking it.
   *
   * It does NOT request `count: "exact"`. The bound here is the number of responses one validator
   * has, which grows with their participation and is small. If a project's maximum rows were ever
   * below that, the result would be SHORT rather than wrong — the missing entries would be offered
   * again, and `validations_validator_entry_unique` would then refuse the second response. A
   * duplicate request for an already-answered entry is therefore a loud, database-enforced outcome
   * rather than a silent double count, which is why paging is not needed to make this safe.
   */
  async listEntryIdsForValidator(validatorId: AnonymousValidatorId): Promise<DatasetEntryId[]> {
    const result = await awaitQuery(
      OPS.listEntryIdsForValidator,
      "validations.listEntryIdsForValidator",
      () => this.client.from("validations").select(ENTRY_ID_COLUMN).eq("validator_id", validatorId),
    );
    const rows = readRows(
      result,
      OPS.listEntryIdsForValidator,
      "validations.listEntryIdsForValidator",
    );

    return rows.map((row, index) =>
      parseDomainValue(
        datasetEntryIdSchema,
        row.dataset_entry_id,
        OPS.listEntryIdsForValidator,
        `validations.listEntryIdsForValidator row ${index}`,
      ),
    );
  }

  /**
   * Every stored response's author ID, across the whole table.
   *
   * One column, because the result IS one column. Ordered by the primary key so pages are
   * stable, paged at the response cap with per-page exact-count agreement: a study with more
   * responses than one page holds would otherwise undercount distinct attempts. Duplicates are
   * kept — one attempt may own many responses — and the caller deduplicates with a `Set`,
   * which is exact over complete pages. Each ID is validated, so a stored value that is not
   * an anonymous identifier raises rather than flowing into a figure.
   */
  async listAllValidatorIds(): Promise<AnonymousValidatorId[]> {
    const collected: AnonymousValidatorId[] = [];
    let expectedTotal: number | null = null;

    for (let from = 0; ; from += RESPONSE_PAGE_SIZE) {
      const result = await awaitQuery(
        OPS.listAllValidatorIds,
        "validations.listAllValidatorIds",
        () =>
          this.client
            .from("validations")
            .select(COUNT_COLUMN, { count: "exact" })
            .order("id", { ascending: true })
            .range(from, from + RESPONSE_PAGE_SIZE - 1),
      );

      const rows = readRows(result, OPS.listAllValidatorIds, "validations.listAllValidatorIds");
      const pageTotal = readExactCount(
        result,
        OPS.listAllValidatorIds,
        "validations.listAllValidatorIds",
      );
      if (expectedTotal === null) {
        expectedTotal = pageTotal;
      } else if (pageTotal !== expectedTotal) {
        throw new RepositoryError(
          OPS.listAllValidatorIds,
          `validations.listAllValidatorIds saw ${pageTotal} matching rows after seeing ` +
            `${expectedTotal}: the table changed mid-read, so stitched pages would duplicate one ` +
            "author and drop another. Re-run the read rather than trusting a shifted result.",
          { detail: `count moved from ${expectedTotal} to ${pageTotal}` },
        );
      }
      for (const [index, row] of rows.entries()) {
        collected.push(
          parseDomainValue(
            anonymousValidatorIdSchema,
            row.validator_id,
            OPS.listAllValidatorIds,
            `validations.listAllValidatorIds row ${from + index}`,
          ),
        );
      }

      if (collected.length >= pageTotal) break;
      if (rows.length === 0) {
        throw new RepositoryError(
          OPS.listAllValidatorIds,
          `validations.listAllValidatorIds received an empty page at offset ${from} with ` +
            `${collected.length} of ${pageTotal} rows read. The server is truncating without ` +
            "reporting a count, so the remaining authors cannot be read, and an attempt figure " +
            "computed from a partial set would be silently wrong.",
          { detail: `empty page at offset ${from} of ${pageTotal} rows` },
        );
      }
    }

    return collected;
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
   *
   * IT IS NOT THE COVERAGE NUMBER, and that is the property to preserve the next time this method
   * is edited. It counts validators who responded AT ALL, including those whose `cannot_evaluate`
   * response contributes nothing to qualifying coverage. It is a legitimate diagnostic for review
   * and disagreement inspection, which is why it stays; it is the WRONG number for allocation, which
   * is why allocation reads `listForEntries` and reduces it with the one in-force definition.
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
