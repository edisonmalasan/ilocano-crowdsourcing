/**
 * The canonical dataset categories and the canonical dataset entry id.
 *
 * ONE table and ONE parser, shared by the importer, the domain schema, the export builders,
 * and research-facing ordering — the spec's explicit preference over scattered regexes. A slug,
 * a prefix, or a numeric id invented by transforming another field would let a renamed category
 * silently re-identify every row, so every mapping here is stated, and an unknown value fails
 * rather than defaulting.
 *
 * Canonical ids have the strict form `{prefix}_{suffix}` with an UNPADDED integer suffix:
 * `D_1`, `DT_800`, `OD_124`, `ODT_63`, `CPE_700`. The previous revision's zero-padded minted
 * form (`OD_0001`) is not valid here, and the suffix restarts at 1 in every category — the
 * globally unique research identity is the whole prefixed id, never the bare number.
 *
 * This module is PURE: no file, database, network, or clock. The importer and the export both
 * depend on it remaining so.
 */

/** One row of the canonical category table, in `category_id` file order. */
export interface DatasetCategoryRow {
  /** The source file's numeric `category_id` (1..5). The research-facing order. */
  readonly categoryId: number;
  /** The source file's `category_name`, verbatim. */
  readonly name: string;
  /** The stable database/export slug. */
  readonly slug: string;
  /** The canonical-id prefix. */
  readonly prefix: string;
}

export const DATASET_CATEGORY_TABLE: readonly DatasetCategoryRow[] = [
  { categoryId: 1, name: "Destination Only", slug: "destination_only", prefix: "D" },
  {
    categoryId: 2,
    name: "Destination + Transit Mode",
    slug: "destination_transit_mode",
    prefix: "DT",
  },
  { categoryId: 3, name: "Origin + Destination", slug: "origin_destination", prefix: "OD" },
  {
    categoryId: 4,
    name: "Origin + Destination + Transit Mode",
    slug: "origin_destination_transit_mode",
    prefix: "ODT",
  },
  {
    categoryId: 5,
    name: "Complex/Preference Expressions",
    slug: "complex_preference_expressions",
    prefix: "CPE",
  },
];

/** Source-local suffixes span exactly this range within every category block. */
export const CANONICAL_SUFFIX_MIN = 1;
export const CANONICAL_SUFFIX_MAX = 800;

/** A successfully parsed canonical dataset entry id. */
export interface ParsedCanonicalEntryId {
  /** The category prefix, e.g. `ODT`. Always a known table prefix. */
  readonly prefix: string;
  /** The numeric suffix, e.g. 63. Always an integer in suffix range. */
  readonly suffix: number;
  /** The table row for the prefix. */
  readonly category: DatasetCategoryRow;
}

/**
 * Parses a canonical dataset entry id, or returns `null` when it is not one.
 *
 * Strict by construction: unknown prefixes, zero-padded suffixes (`D_0001`), suffixes
 * outside 1..800, and non-numeric tails all return null rather than a partial answer. A
 * bare-integer id with no prefix is not canonical either — the prefix is what makes ids
 * from different categories distinct.
 */
export function parseCanonicalEntryId(id: unknown): ParsedCanonicalEntryId | null {
  if (typeof id !== "string") return null;
  const match = /^([A-Z]+)_(\d+)$/.exec(id);
  if (match === null) return null;
  const prefix = match[1] as string;
  const digits = match[2] as string;
  // No zero-padding: the canonical form writes the integer plainly, so `D_01` names
  // nothing and `D_1` is the only spelling of suffix 1.
  if (digits.length > 1 && digits.startsWith("0")) return null;
  const suffix = Number(digits);
  if (!Number.isSafeInteger(suffix) || suffix < CANONICAL_SUFFIX_MIN || suffix > CANONICAL_SUFFIX_MAX) {
    return null;
  }
  const category = DATASET_CATEGORY_TABLE.find((row) => row.prefix === prefix);
  if (category === undefined) return null;
  return { prefix, suffix, category };
}

/**
 * Research-facing order for canonical ids: by category file order, then numeric suffix.
 *
 * Ordinary lexical sorting is WRONG for unpadded ids (`D_10` would precede `D_2`), so no
 * caller sorts canonical ids with a bare string comparison. Unknown ids sort after known
 * ones rather than throwing, because ordering must never fail a read — validation is the
 * parser's and the schema's job, not the comparator's.
 */
export function compareCanonicalEntryIds(left: string, right: string): number {
  const parsedLeft = parseCanonicalEntryId(left);
  const parsedRight = parseCanonicalEntryId(right);
  if (parsedLeft === null && parsedRight === null) {
    return left < right ? -1 : left > right ? 1 : 0;
  }
  if (parsedLeft === null) return 1;
  if (parsedRight === null) return -1;
  if (parsedLeft.category.categoryId !== parsedRight.category.categoryId) {
    return parsedLeft.category.categoryId - parsedRight.category.categoryId;
  }
  return parsedLeft.suffix - parsedRight.suffix;
}

/** The table row for a category slug, or `undefined` for an unknown slug. */
export function categoryRowForSlug(slug: string): DatasetCategoryRow | undefined {
  return DATASET_CATEGORY_TABLE.find((row) => row.slug === slug);
}

/** The table row for a human-readable category name, or `undefined` when unknown. */
export function categoryRowForName(name: string): DatasetCategoryRow | undefined {
  return DATASET_CATEGORY_TABLE.find((row) => row.name === name);
}
