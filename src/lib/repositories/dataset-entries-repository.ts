import type { DatasetEntry, DatasetEntryId } from "@/schemas/dataset";

import type { ListDatasetEntriesOptions } from "./types";

/**
 * Read access to imported dataset entries.
 *
 * Returns domain types (`DatasetEntry`), not persistence rows. A `SupabaseRow` with `snake_case`
 * keys is a detail of one implementation and must not cross this seam.
 *
 * Every method raises `RepositoryError` on failure rather than returning an empty result — see
 * `@/lib/repositories/errors`.
 *
 * No coverage, count, or allocation method appears here. Counting validations per entry is
 * allocation's concern and belongs with the validations repository, so that the coverage rule has
 * exactly one owner and cannot be computed two slightly different ways.
 */
export interface DatasetEntriesRepository {
  /**
   * Active entries, optionally narrowed by category. The result is unordered with respect to any
   * research meaning: allocation applies its own coverage-aware ordering and randomization, and
   * this repository must not pre-sort in a way that looks authoritative.
   */
  listActive(options?: ListDatasetEntriesOptions): Promise<DatasetEntry[]>;

  /**
   * Every active entry, optionally narrowed by category, across as many pages as it takes.
   *
   * `listActive` without a limit refuses a truncated response rather than returning it, so it
   * cannot serve a pool larger than PostgREST's per-request cap (1000 by default; the corpus is
   * 4,800). This pages with `range` and stitches the pages, refusing rather than returning a
   * short or shifted result: the exact count must agree on every page (a concurrent operator
   * import mid-read would move rows between pages), every page must make progress, and the
   * stitched length must equal the count. Like `listActive`, the result is unordered with
   * respect to any research meaning.
   */
  listAllActive(options?: Pick<ListDatasetEntriesOptions, "category">): Promise<DatasetEntry[]>;

  /** The single entry with this source ID, or `null` when no such entry exists. `null` means absent, not failed. */
  findById(id: DatasetEntryId): Promise<DatasetEntry | null>;

  /** Several entries by source ID, for resolving a batch. Missing IDs are omitted from the result. */
  listByIds(ids: readonly DatasetEntryId[]): Promise<DatasetEntry[]>;
}
