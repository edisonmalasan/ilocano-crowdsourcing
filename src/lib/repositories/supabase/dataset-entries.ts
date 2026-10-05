import "server-only";

import {
  RepositoryError,
  type DatasetEntriesRepository,
  type ListDatasetEntriesOptions,
  type RepositoryOperation,
} from "@/lib/repositories";
import { datasetEntrySchema, type DatasetEntry, type DatasetEntryId } from "@/schemas/dataset";

import type { SupabaseClientLike } from "./client";
import {
  assertPageIsComplete,
  awaitQuery,
  parseDomainValue,
  readExactCount,
  readRows,
  readSingleRow,
  toIsoDateTime,
} from "./rows";
import { DATASET_ENTRIES_OPERATIONS as OPS } from "./operations";

/**
 * The `dataset_entries` table as this mapping understands it.
 *
 * Every value is `unknown` on purpose: the column NAMES are the contract with the migration and
 * they are asserted by `pnpm run typecheck`, while the values are validated by
 * `datasetEntrySchema` in `toDomain`. A `text` column that suddenly holds a number, or a
 * `timestamptz` that is not readable, is a data problem to be reported — not a value to coerce.
 */
interface DatasetEntryRow {
  id: unknown;
  category: unknown;
  source_entry_id: unknown;
  category_name: unknown;
  instruction: unknown;
  origin: unknown;
  destination: unknown;
  transit_mode: unknown;
  source_payload: unknown;
  is_active: unknown;
  created_at: unknown;
}

/**
 * The columns a domain `DatasetEntry` is built from.
 *
 * `source_payload` is listed here because it is part of the row that is fetched, but it is
 * deliberately NOT part of the domain object: `DatasetEntry` has no field for it, and inventing
 * one would put a JSON blob every consumer must carry and none of them uses into the type the
 * whole platform is written against. The archival copy is not lost by leaving it out — see the
 * class comment below.
 */
const ENTRY_COLUMNS = [
  "id",
  "category",
  "source_entry_id",
  "category_name",
  "instruction",
  "origin",
  "destination",
  "transit_mode",
  "source_payload",
  "is_active",
  "created_at",
] as const satisfies readonly (keyof DatasetEntryRow)[];

/**
 * Row ⇄ domain translation.
 *
 * `transitMode` is spelled out rather than derived, because this is the whole job of the module: a
 * `snake_case` column name must stop at this line. A SQL `NULL` for `origin`/`destination`/
 * `transit_mode` becomes the domain's `null`, which is how a category without a transit mode is
 * represented honestly instead of with a placeholder string.
 */
function toDomain(
  row: Record<string, unknown>,
  context: string,
  operation: RepositoryOperation,
): DatasetEntry {
  return parseDomainValue(
    datasetEntrySchema,
    {
      id: row.id,
      category: row.category,
      // Legacy rows predate the provenance columns and read NULL here; the schema then rejects
      // the row rather than inventing provenance. That is the correct behaviour: a domain entry
      // without its source-local id is not joinable back to the research source, and silently
      // defaulting it would manufacture the join key.
      sourceEntryId: row.source_entry_id ?? null,
      categoryName: row.category_name ?? null,
      instruction: row.instruction,
      origin: row.origin ?? null,
      destination: row.destination ?? null,
      transitMode: row.transit_mode ?? null,
      createdAt: toIsoDateTime(row.created_at, "created_at", operation),
      isActive: row.is_active,
    },
    operation,
    context,
  );
}

/**
 * Supabase-backed read access to imported dataset entries.
 *
 * Constructed with the narrow {@link SupabaseClientLike} rather than a concrete client so a test
 * can supply a fake with no network. `factory.ts` is where the real service-role client enters,
 * and it asserts at compile time that the real client still exposes every member of that
 * interface — member names only, for the reason given there.
 *
 * There is no write method on purpose. `DatasetEntriesRepository` is a read interface: imported
 * entries are written by the importer's own upsert path, which is a different concern and is not
 * allowed to be reachable from a request path.
 *
 * WHERE THE ARCHIVAL COPY LIVES, AND WHY IT IS NOT READ HERE
 * ----------------------------------------------------------
 * `source_payload` holds the source record exactly as imported, including any field this domain
 * type does not model. That is where an unmodelled source field is PRESERVED, and it is the
 * importer's report that SURFACES one at the moment a dataset revision introduces it
 * (`src/lib/dataset/synthetic-source.ts`). A repository read is not that surface, and pretending
 * otherwise would add a method returning a raw `Record<string, unknown>` keyed partly by column
 * names — a persistence record crossing the seam that exists to keep persistence records out.
 *
 * The related temptation was to "surface" unmodelled COLUMNS here by folding any key the row
 * carries into the returned payload. That code would be unreachable: every read in this file names
 * an explicit column list, so PostgREST cannot return a column that list does not ask for. It
 * would be covered only by a fake invented to satisfy it.
 */
export class SupabaseDatasetEntriesRepository implements DatasetEntriesRepository {
  private readonly client: SupabaseClientLike;

  constructor(client: SupabaseClientLike) {
    this.client = client;
  }

  /**
   * Active entries, optionally narrowed by category.
   *
   * ROW LIMIT. PostgREST caps a response at the project's maximum rows per request (1000 by
   * default) and signals the cap only by returning fewer rows than match. Allocation reads the
   * whole active pool, so a silent cap would look like a smaller dataset and would quietly reduce
   * coverage. The exact count is therefore requested in the same round trip and a short read
   * raises `RepositoryError` rather than returning the truncated list. The merged corpus is
   * 4,000 active entries across five categories — past the default cap — so this guard is live
   * rather than hypothetical.
   *
   * ORDER. No `order()` is applied, following the interface: the result carries no research
   * meaning, and allocation applies its own coverage-aware ordering and randomization. The
   * consequence, recorded because it is a real limitation rather than a preference, is that
   * `offset` paging over a table with no total order is not stable between calls. `limit`/
   * `offset` exist for the import and admin paging paths, not for allocation.
   */
  async listActive(options?: ListDatasetEntriesOptions): Promise<DatasetEntry[]> {
    // `offset` without `limit` is a rejected request rather than a failed one: PostgREST's `range`
    // needs both bounds, and inventing the missing one would silently change the page size.
    if (options?.offset !== undefined && options.limit === undefined) {
      throw new RepositoryError(
        OPS.listActive,
        "`offset` was requested without a `limit`, so the end of the range is unknown. " +
          "PostgREST needs both bounds, and guessing one would silently change the page size.",
      );
    }

    const result = await awaitQuery(OPS.listActive, "dataset_entries.listActive", () => {
      let handle = this.client
        .from("dataset_entries")
        .select(ENTRY_COLUMNS.join(","), { count: "exact" })
        .eq("is_active", true);

      if (options?.category !== undefined) {
        handle = handle.eq("category", options.category);
      }
      // `range` already encodes the page size, and `limit` also writes PostgREST's `limit`
      // parameter — applying both would put the same bound on the query twice, so exactly one of
      // the two is used.
      if (options?.limit !== undefined) {
        handle =
          options.offset === undefined
            ? handle.limit(options.limit)
            : handle.range(options.offset, options.offset + options.limit - 1);
      }
      return handle;
    });

    const rows = readRows(result, OPS.listActive, "dataset_entries.listActive");
    assertPageIsComplete(
      result,
      rows,
      options?.limit,
      OPS.listActive,
      "dataset_entries.listActive",
    );
    return rows.map((row, index) =>
      toDomain(row, `dataset_entries.listActive row ${index}`, OPS.listActive),
    );
  }

  /**
   * Every active entry, stitched across pages.
   *
   * The page size matches PostgREST's default cap rather than exceeding it: a page that returns
   * fewer rows than the cap is a last page, and a page that returns the cap is followed. The
   * exact count is requested on every page and must agree everywhere — `dataset_entries` is
   * operator-written, so a mid-read import is possible in principle, and rows shifting between
   * pages would otherwise duplicate one entry and drop another with no error.
   */
  async listAllActive(
    options?: Pick<ListDatasetEntriesOptions, "category">,
  ): Promise<DatasetEntry[]> {
    const PAGE_SIZE = 1000;
    const context = "dataset_entries.listAllActive";
    const all: DatasetEntry[] = [];
    let expectedTotal: number | null = null;

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const result = await awaitQuery(OPS.listAllActive, context, () => {
        let handle = this.client
          .from("dataset_entries")
          .select(ENTRY_COLUMNS.join(","), { count: "exact" })
          .eq("is_active", true);
        if (options?.category !== undefined) {
          handle = handle.eq("category", options.category);
        }
        return handle.range(offset, offset + PAGE_SIZE - 1);
      });

      const rows = readRows(result, OPS.listAllActive, context);
      const total = readExactCount(result, OPS.listAllActive, context);
      if (expectedTotal === null) {
        expectedTotal = total;
      } else if (total !== expectedTotal) {
        throw new RepositoryError(
          OPS.listAllActive,
          `${context} saw ${total} matching rows after seeing ${expectedTotal}: the pool ` +
            "changed mid-read, so stitched pages would duplicate one entry and drop another. " +
            "Re-run the read rather than trusting a shifted result.",
          { detail: `count moved from ${expectedTotal} to ${total}` },
        );
      }
      if (rows.length === 0 && all.length < expectedTotal) {
        throw new RepositoryError(
          OPS.listAllActive,
          `${context} made no progress at offset ${offset} with ${expectedTotal - all.length} ` +
            "rows still unread. Re-run the read rather than returning a short pool.",
          { detail: `empty page at offset ${offset}` },
        );
      }
      for (const [index, row] of rows.entries()) {
        all.push(toDomain(row, `${context} row ${offset + index}`, OPS.listAllActive));
      }
      if (all.length >= expectedTotal) break;
    }

    if (all.length !== expectedTotal) {
      throw new RepositoryError(
        OPS.listAllActive,
        `${context} stitched ${all.length} rows against a count of ${expectedTotal}. ` +
          "Re-run the read rather than trusting a short pool.",
        { detail: `stitched ${all.length} of ${expectedTotal}` },
      );
    }
    return all;
  }

  /** The single entry with this source ID, or `null` when absent. */
  async findById(id: DatasetEntryId): Promise<DatasetEntry | null> {
    // `maybeSingle()`, not `single()`: `single()` reports an absent row as `PGRST116`, which would
    // make "no such entry" arrive at the service as a failure.
    const result = await awaitQuery(OPS.findById, "dataset_entries.findById", () =>
      this.client
        .from("dataset_entries")
        .select(ENTRY_COLUMNS.join(","))
        .eq("id", id)
        .maybeSingle(),
    );
    const row = readSingleRow(result, OPS.findById, "dataset_entries.findById");
    return row === null ? null : toDomain(row, "dataset_entries.findById", OPS.findById);
  }

  /**
   * Several entries by source ID. Missing IDs are omitted.
   *
   * Returned in the order the caller asked for, not in whatever order PostgREST returned them: this
   * method exists to resolve a batch, and a batch has a defined order. The re-ordering happens
   * here, on the caller's list, so it is not a repository-imposed sort and cannot be mistaken for
   * one.
   *
   * An empty `ids` list short-circuits to `[]` without a query. `.in("id", [])` is not an empty
   * filter, it is a malformed one, so issuing it would turn a legitimately empty request into a
   * server error.
   */
  async listByIds(ids: readonly DatasetEntryId[]): Promise<DatasetEntry[]> {
    if (ids.length === 0) return [];

    const result = await awaitQuery(OPS.listByIds, "dataset_entries.listByIds", () =>
      this.client.from("dataset_entries").select(ENTRY_COLUMNS.join(",")).in("id", ids),
    );
    const rows = readRows(result, OPS.listByIds, "dataset_entries.listByIds");

    // Bounded by the number of ids requested, so the response cap cannot silently shorten it the
    // way it can for `listActive`. No `assertPageIsComplete` call is needed, and adding one would
    // need an exact count it does not have.
    const byId = new Map(
      rows.map((row) => [
        String(row.id),
        toDomain(row, "dataset_entries.listByIds", OPS.listByIds),
      ]),
    );
    return ids.flatMap((id) => {
      const found = byId.get(id);
      return found ? [found] : [];
    });
  }
}
