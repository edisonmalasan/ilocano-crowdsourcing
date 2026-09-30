import "server-only";

import { RepositoryError, type BatchesRepository } from "@/lib/repositories";
import { batchRecordSchema, type BatchRecord } from "@/schemas/batch";

import type { SupabaseClientLike } from "./client";
import {
  awaitQuery,
  parseDomainValue,
  persistenceFailure,
  POSTGREST_UNIQUE_VIOLATION_CODE,
  readRows,
  readSingleRow,
} from "./rows";
import { BATCHES_OPERATIONS as OPS } from "./operations";

/** The `validation_batches` table as this mapping understands it. Every value is validated. */
interface BatchRow {
  id: unknown;
  validator_id: unknown;
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

/** Two columns. `validation_batches` has no timestamp column and none is invented here. */
const BATCH_COLUMNS = ["id", "validator_id"] as const satisfies readonly (keyof BatchRow)[];

const BATCH_ENTRY_COLUMNS = [
  "batch_id",
  "dataset_entry_id",
  "position",
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
  async create(batch: BatchRecord): Promise<BatchRecord> {
    const batchResult = await awaitQuery(OPS.create, "validation_batches.insert", () =>
      this.client
        .from("validation_batches")
        .insert({ id: batch.id, validator_id: batch.validatorId })
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
}
