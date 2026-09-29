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

  /** The single entry with this source ID, or `null` when no such entry exists. `null` means absent, not failed. */
  findById(id: DatasetEntryId): Promise<DatasetEntry | null>;

  /** Several entries by source ID, for resolving a batch. Missing IDs are omitted from the result. */
  listByIds(ids: readonly DatasetEntryId[]): Promise<DatasetEntry[]>;
}
