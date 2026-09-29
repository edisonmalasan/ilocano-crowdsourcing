/**
 * Shared repository value types.
 *
 * Deliberately small. Anything added here is part of the seam every domain service depends on, so
 * a type is added only when a caller already needs it — not in anticipation.
 */

/** ISO 8601 datetime string, matching the representation the schemas use. */
export type IsoDateTimeString = string;

export interface ListDatasetEntriesOptions {
  /**
   * Restrict to a category. Optional because the allocation and admin paths legitimately operate
   * across all categories; it exists so a caller that does know its category can be explicit rather
   * than relying on a hard-coded default.
   */
  category?: string;
  /** Cap on returned rows. Optional: "no cap" and "cap" are different queries, not the same one. */
  limit?: number;
  /** Zero-based offset, for paging through a large import. */
  offset?: number;
}
