import "server-only";

import type { RecoverableBatch } from "@/lib/domain/batch-recovery";
import {
  RepositoryError,
  type BatchesRepository,
  type IsoDateTimeString,
} from "@/lib/repositories";
import { batchIdSchema, batchRecordSchema, type BatchRecord } from "@/schemas/batch";
import { anonymousValidatorIdSchema } from "@/schemas/validator";
import { datasetEntryIdSchema } from "@/schemas/dataset";

import type { SupabaseClientLike } from "./client";
import {
  awaitQuery,
  parseDomainValue,
  persistenceFailure,
  POSTGREST_UNIQUE_VIOLATION_CODE,
  readRows,
  readSingleRow,
  toIsoDateTime,
} from "./rows";
import { BATCHES_OPERATIONS as OPS } from "./operations";

/**
 * The `validation_batches` table as this mapping understands it. Every value is validated.
 *
 * `created_at` arrived with migration `20261001120000`, by the reasoning recorded there: one column,
 * for one purpose, written by the server rather than defaulted by the database. It is `unknown` here
 * rather than `string` for the same reason every other column is — the translation validates it, so a
 * value the database could not have produced is caught rather than carried.
 */
interface BatchRow {
  id: unknown;
  validator_id: unknown;
  created_at: unknown;
}

/**
 * The `batch_entries` table as this mapping understands it.
 *
 * `position` exists because of the allocation migration `20260930190000`. It arrived by forward
 * migration rather than in the base schema for the reason the base migration's own comment gives:
 * the column was written there first and removed during review, on the grounds that a column
 * carrying no behaviour is a claim about a lifecycle nobody has built. Allocation is the change that
 * owns the behaviour, so the behaviour exists and the column is here.
 */
interface BatchEntryRow {
  batch_id: unknown;
  dataset_entry_id: unknown;
  position: unknown;
}

/**
 * Three columns, and the third arrived with migration `20261001120000`.
 *
 * The old comment here said "two columns, and `validation_batches` has no timestamp column and none is
 * invented here". That was true when written and would have been the right thing to say at the time;
 * what made it stop being true is {@link listForRecovery}, which cannot order by a column it cannot
 * select. The principle it stated survives unchanged — a column exists because code reads it — and the
 * note is rewritten rather than deleted so the next reader can see what stopped being true and why.
 *
 * `created_at` is selected on {@link findById} as well even though that method does not use it. That
 * is deliberate and costs one column: both reads go through this list, so a second list would be a
 * second place to forget a column when one is added, and `batchRecordSchema` is a `strictObject` whose
 * input this file assembles field by field — an unread column is simply never read.
 */
const BATCH_COLUMNS = [
  "id",
  "validator_id",
  "created_at",
] as const satisfies readonly (keyof BatchRow)[];

const BATCH_ENTRY_COLUMNS = [
  "batch_id",
  "dataset_entry_id",
  "position",
] as const satisfies readonly (keyof BatchEntryRow)[];

/**
 * Two columns, for {@link SupabaseBatchesRepository.listForRecovery}, and `position` is deliberately
 * NOT among them.
 *
 * A second column list rather than a narrower use of {@link BATCH_ENTRY_COLUMNS}, because selecting
 * `position` here would fetch the stored order for a read that does not use it — and a value in hand
 * is a value a later edit will start reading. The order is research data; it is read through
 * `findById` by the batch's own route, and by nothing else.
 */
const BATCH_ENTRY_ID_COLUMNS = [
  "batch_id",
  "dataset_entry_id",
] as const satisfies readonly (keyof BatchEntryRow)[];

/**
 * Supabase-backed access to persisted batches and their ordered entries.
 *
 * Constructed with the narrow {@link SupabaseClientLike}, so a test can drive it with a fake and no
 * network. Nothing in this file has ever reached PostgREST: no Supabase project and no credential
 * exist in this environment. See `factory.ts` for the full statement of what is and is not
 * verified, and `client.ts` for why the narrow interface exists instead of the concrete client.
 */
export class SupabaseBatchesRepository implements BatchesRepository {
  private readonly client: SupabaseClientLike;

  constructor(client: SupabaseClientLike) {
    this.client = client;
  }

  /**
   * Writes the batch row and then its entry rows, and returns what was READ BACK.
   *
   * ==============================================================================================
   * WHY TWO REQUESTS AND NOT ONE, and what a failure between them costs
   * ==============================================================================================
   * "One call" in the interface means one method invocation, not one HTTP request. PostgREST cannot
   * write two tables in a single request, and a `do $$ … $$` function on the database to do it
   * would move research-writing logic out of the application and into SQL — which is the same
   * move this project refuses for the coverage rule, for the same reason: two implementations in
   * two languages that nothing keeps in agreement.
   *
   * So there is no transaction spanning the two writes, and a failure between them leaves a
   * `validation_batches` row with no entries. The residue is inert — the table carries no lifecycle
   * column, and `batch_entries` has nothing pointing into it — and it is DETECTABLE: `findById` on
   * such a row raises rather than returning an empty batch, because `batchRecordSchema` requires at
   * least one entry and the allocation contract forbids reporting a batch that contains none.
   *
   * A compensating delete of the orphan row was considered and rejected. It is batch-lifecycle
   * behaviour, which belongs to the change that owns the lifecycle; and a write that can fail
   * halfway and then try to undo itself is harder to reason about than one that fails loudly and
   * leaves an inert row.
   *
   * ==============================================================================================
   * WHY THE RESULT IS READ BACK RATHER THAN THE ARGUMENT ECHOED
   * ==============================================================================================
   * Because the whole point of reading it back is that the STORED order is what the caller reports.
   * Echoing the argument would let an implementation that stored a different order — or stored
   * nothing — be reported as a successful allocation, and the validator would be handed a batch
   * whose contents no test had ever seen. `enrollValidator` makes the same choice about the
   * identifier it minted.
   */
  async create(batch: BatchRecord, createdAt: IsoDateTimeString): Promise<BatchRecord> {
    const batchResult = await awaitQuery(OPS.create, "validation_batches.insert", () =>
      this.client
        .from("validation_batches")
        // `created_at` is written HERE, explicitly, and is the reason migration
        // `20261001120000` set the column `not null` with no default: the application is the single
        // source of time for this fact, and a default added later would be invisible to the read-back
        // below — the column would simply arrive populated, from somewhere else.
        .insert({ id: batch.id, validator_id: batch.validatorId, created_at: createdAt })
        .select(BATCH_COLUMNS.join(","))
        .single(),
    );

    if (batchResult.error !== null) {
      if (batchResult.error.code === POSTGREST_UNIQUE_VIOLATION_CODE) {
        throw persistenceFailure(
          OPS.create,
          "validation_batches.insert",
          batchResult.error,
          `Batch id ${batch.id} is already in use. Batch identifiers are minted by the allocation ` +
            "service, so a collision here is a server bug rather than expected traffic, and it is " +
            "reported rather than swallowed.",
        );
      }
      throw persistenceFailure(OPS.create, "validation_batches.insert", batchResult.error);
    }

    // The batch row was written; nothing is reported to the caller until its entries are too.
    const storedBatchRow = readSingleRow(batchResult, OPS.create, "validation_batches.insert");
    if (storedBatchRow === null) {
      throw new RepositoryError(
        OPS.create,
        "The batch insert reported success but returned no stored row, so the write is " +
          "unconfirmed. Echoing the argument back would report a batch as persisted that was " +
          "never read.",
        { detail: "validation_batches insert returned no row" },
      );
    }

    // ONE array insert for every entry. A per-row loop was rejected: it would issue up to fifty
    // round trips for a full batch, and a loop that fails halfway writes a partial batch that the
    // caller can no longer distinguish from a complete one.
    const entryResult = await awaitQuery(OPS.create, "validation_batches.insertEntries", () =>
      this.client
        .from("batch_entries")
        .insert(
          batch.entries.map((entry) => ({
            batch_id: batch.id,
            dataset_entry_id: entry.datasetEntryId,
            position: entry.position,
          })),
        )
        .select(BATCH_ENTRY_COLUMNS.join(",")),
    );

    if (entryResult.error !== null) {
      throw persistenceFailure(
        OPS.create,
        "validation_batches.insertEntries",
        entryResult.error,
        `The batch row ${batch.id} was written but its ${batch.entries.length} entries were not, ` +
          "so this allocation is a partial write and is reported as a failure rather than as a " +
          "batch. The residual row carries no entries and no lifecycle state; nothing references " +
          "it, and a later read of it raises rather than returning an empty batch. The `23505` " +
          "this path most likely hit is `batch_entries_batch_position_unique`, which means two " +
          "entries were given the same position.",
      );
    }

    const storedEntryRows = readRows(entryResult, OPS.create, "validation_batches.insertEntries");
    if (storedEntryRows.length !== batch.entries.length) {
      throw new RepositoryError(
        OPS.create,
        `validation_batches wrote ${storedEntryRows.length} of ${batch.entries.length} entries and ` +
          "reported no error, so the stored batch is not the one that was requested.",
        {
          detail: `stored ${storedEntryRows.length} of ${batch.entries.length} entries`,
        },
      );
    }

    // Read the batch back through the same path a later `findById` would use, so a caller can never
    // receive a shape this class could not itself produce.
    const readBack = await this.findById(batch.id);
    if (readBack === null) {
      throw new RepositoryError(
        OPS.create,
        `Batch ${batch.id} was written and read back as absent. Reporting the argument instead ` +
          "would report a batch as persisted on the strength of a write this class could not " +
          "confirm.",
        { detail: "batch absent immediately after insert" },
      );
    }
    return readBack;
  }

  /**
   * The stored batch and its entries, ordered by `position`, or `null` when absent.
   *
   * TWO READS, because a batch spans two tables. The entry read asks the server to order by
   * `position`, and the rows are SORTED AGAIN IN MEMORY before they are translated.
   *
   * The second sort looks redundant and is not. `.order()` is a guarantee PostgREST does keep, but
   * the ORDER OF A BATCH IS RESEARCH DATA — it is the order the allocation service chose, and it is
   * what a validator actually worked through — while this class's contract to its caller is that the
   * returned order is the stored one. Making that a property of the RETURNED VALUE rather than of a
   * wire behaviour means a future implementation of {@link SupabaseClientLike} that forgets
   * `.order()`, a proxy that drops it, or a narrow-interface inaccuracy cannot quietly reorder a
   * batch. The cost is a sort of at most fifty rows that are already in memory.
   *
   * A batch that exists with NO entries raises. `null` means absent; it must not also mean "here is
   * an empty batch", because an empty allocation is reported as `exhausted` by the service and a
   * partial write reported as an empty batch would present a database fault as "nothing was left
   * for you".
   */
  async findById(id: string): Promise<BatchRecord | null> {
    const batchResult = await awaitQuery(OPS.findById, "validation_batches.findById", () =>
      this.client
        .from("validation_batches")
        .select(BATCH_COLUMNS.join(","))
        .eq("id", id)
        .maybeSingle(),
    );
    const batchRow = readSingleRow(batchResult, OPS.findById, "validation_batches.findById");
    if (batchRow === null) return null;

    const entryResult = await awaitQuery(OPS.findById, "validation_batches.findByIdEntries", () =>
      this.client
        .from("batch_entries")
        .select(BATCH_ENTRY_COLUMNS.join(","))
        .eq("batch_id", id)
        .order("position", { ascending: true }),
    );
    const entryRows = readRows(entryResult, OPS.findById, "validation_batches.findByIdEntries");

    return parseDomainValue(
      batchRecordSchema,
      {
        id: batchRow.id,
        validatorId: batchRow.validator_id,
        // Sorted BEFORE translation, so the ordering holds even for a row whose `position` is not a
        // number: `NaN` sorts to the end rather than corrupting the comparator, and the value is
        // still rejected by `batchEntryPositionSchema` on the way through.
        entries: [...entryRows]
          .sort((left, right) => Number(left.position) - Number(right.position))
          .map((row) => ({
            datasetEntryId: row.dataset_entry_id,
            position: row.position,
          })),
      },
      OPS.findById,
      `validation_batches.findById ${id}`,
    );
  }

  /**
   * Every batch belonging to one validator, newest first, each with its entry ids.
   *
   * ==============================================================================================
   * TWO READS, because a batch spans two tables and this is the same reason `findById` takes two
   * ==============================================================================================
   * The alternative is one request with an embedded resource — `select("id, validator_id, created_at,
   * batch_entries(dataset_entry_id)")` — which is genuinely one round trip and is what a hand-written
   * query would do. It was rejected because this project cannot verify a single PostgREST behaviour
   * about embedded selects: there is no Supabase project here, so the shape of the nested rows, the
   * `null` an absent relationship produces, and the ordering of a nested array are all untested
   * assumptions that would sit underneath a research decision. Two flat reads use only `.eq`, `.in`,
   * `.order` and `.select(cols)`, every one of which this directory already depends on, and the
   * grouping of rows back onto their batches is done in JavaScript where a test can observe it.
   *
   * ==============================================================================================
   * THE ORDER IS ASKED FOR AND THEN RE-DERIVED, which looks redundant and is the point
   * ==============================================================================================
   * `.order("created_at", { ascending: false }).order("id", { ascending: false })` is the query. It is
   * also a WIRE BEHAVIOUR, and `findById` already learned the lesson this copies: the order of a
   * batch is research data, so a guarantee this class's callers rely on must be a property of the
   * RETURNED VALUE rather than of a request a proxy or a future implementation of
   * `SupabaseClientLike` could forget. `recognizeInterruptedBatch` re-derives the winner from the
   * rows anyway — the spec requires the choice to be total and independent of arrival order — so the
   * sort here is not what makes the answer correct; it is what makes the FIRST row the right one for
   * a reader who trusts the array order, which is worth having and is worth having honestly.
   *
   * The entry ids are NOT sorted. They arrive in whatever order the database returned them, and the
   * recognition rule only ever asks whether a set contains one, so sorting them would imply an order
   * this read does not have a reason to establish. Positions are not selected at all: see the
   * interface's note on why.
   *
   * ==============================================================================================
   * AN ENTRY-LESS BATCH COMES BACK WITH AN EMPTY `entryIds`, AND THAT IS THE DESIGN
   * ==============================================================================================
   * `findById` RAISES on such a row. This method returns it. The two differ because they answer
   * different questions: `findById` backs a route that will render a batch, and rendering a batch with
   * no entries would present a database fault as "nothing was left for you"; `listForRecovery` feeds a
   * rule whose job is to decide whether there is any work at all, and a rule that cannot SEE the
   * residue cannot decide that. Filtering it out here would move a research decision into the
   * persistence layer, where the answered set that would justify the filter does not exist.
   *
   * ==============================================================================================
   * WHAT A TRUNCATED RESPONSE WOULD DO HERE, AND WHY IT IS NOT GUARDED THE WAY `findById` GUARDS IT
   * ==============================================================================================
   * PostgREST caps a response at the project's maximum rows. A short read of BATCHES would hide a
   * newer batch and could report `none` while an interrupted batch existed; a short read of ENTRIES
   * would understate what remains and could offer work that does not exist. Both are wrong, and
   * neither is guarded by `assertPageIsComplete`, which needs a `count` this read does not request.
   * That is a real gap and it is stated rather than hidden. It is bounded in the same way
   * `listEntryIdsForValidator` states its bound: one row per allocation, and no validator's rows
   * approach a thousand in a study of 4,800 entries, because the database refuses to let anyone answer
   * an entry twice.
   */
  async listForRecovery(validatorId: string): Promise<RecoverableBatch[]> {
    const batchResult = await awaitQuery(
      OPS.listForRecovery,
      "validation_batches.listForRecovery",
      () =>
        this.client
          .from("validation_batches")
          .select(BATCH_COLUMNS.join(","))
          .eq("validator_id", validatorId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }),
    );

    const batchRows = readRows(
      batchResult,
      OPS.listForRecovery,
      "validation_batches.listForRecovery",
    );

    // No batches is a NORMAL answer, not a reason to skip the second read and not a failure: it is
    // exactly what "no interrupted batch" looks like from the persistence layer.
    if (batchRows.length === 0) return [];

    const entryResult = await awaitQuery(
      OPS.listForRecovery,
      "validation_batches.listForRecoveryEntries",
      () =>
        this.client
          .from("batch_entries")
          .select(BATCH_ENTRY_ID_COLUMNS.join(","))
          .in(
            "batch_id",
            batchRows.map((row) => row.id),
          ),
    );
    const entryRows = readRows(
      entryResult,
      OPS.listForRecovery,
      "validation_batches.listForRecoveryEntries",
    );

    // Grouped here rather than in the query, so the grouping is something a test can watch. A batch
    // with no rows on the left keeps its EMPTY list rather than disappearing — that absence is the
    // residue this method exists to make visible.
    const entryIdsByBatchId = new Map<unknown, unknown[]>();
    for (const row of entryRows) {
      const existing = entryIdsByBatchId.get(row.batch_id);
      if (existing === undefined) entryIdsByBatchId.set(row.batch_id, [row.dataset_entry_id]);
      else existing.push(row.dataset_entry_id);
    }

    return batchRows.map((row, index) => ({
      id: parseDomainValue(
        batchIdSchema,
        row.id,
        OPS.listForRecovery,
        `validation_batches.listForRecovery row ${index} id`,
      ),
      validatorId: parseDomainValue(
        anonymousValidatorIdSchema,
        row.validator_id,
        OPS.listForRecovery,
        `validation_batches.listForRecovery row ${index} validator_id`,
      ),
      // Normalised, so the domain holds ONE representation of an instant and the recognition rule's
      // `Date.parse` is not the only thing standing between a `+08:00` offset and a correct order.
      createdAt: toIsoDateTime(
        row.created_at,
        "validation_batches.created_at",
        OPS.listForRecovery,
      ),
      entryIds: (entryIdsByBatchId.get(row.id) ?? []).map((entryId, entryIndex) =>
        parseDomainValue(
          datasetEntryIdSchema,
          entryId,
          OPS.listForRecovery,
          `validation_batches.listForRecovery row ${index} entry ${entryIndex}`,
        ),
      ),
    }));
  }
}
