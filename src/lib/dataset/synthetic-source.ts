import {
  datasetEntryInputSchema,
  type DatasetEntryInput,
} from "@/schemas/dataset";

/**
 * Parser for the immutable merged synthetic source dataset.
 *
 * This module is PURE. It reads no file, touches no database, and consults no clock. That is not
 * stylistic: it is what allows the same parsed records to be verified against a real PostgreSQL
 * engine in CI and to be imported into a hosted project later, with no chance that the two paths
 * diverge because one of them did its own I/O.
 *
 * Two rules dominate everything here, and both come from the same place — this is research
 * material, not application data:
 *
 *   1. NOTHING IS NORMALIZED. Ilocano capitalization, punctuation, and spacing are the object of
 *      study. A validator may be reacting to exactly the unnatural capital letter or misplaced
 *      period this dataset exists to collect evidence about, so the parser never rewrites content.
 *      Whitespace trimming is the only sanctioned change, and it is already the domain schema's
 *      behavior via `normalizeResearchText`.
 *
 *   2. NOTHING IS DROPPED. A source field the current domain type does not model is preserved in
 *      `sourcePayload` and named in the report.
 *
 * The source is five named category blocks of 600 entries each, with source-local ids 1..600
 * reused per block. Canonical ids are minted deterministically as `{prefix}_{local:04d}` — never
 * a global 1..3000 renumbering, and the source file's ids are never rewritten. A block with a
 * duplicated, missing, or out-of-range local id, an unknown category name, or a wrong entry
 * count fails the whole parse loudly: 2,999 of 3,000 rows is not an import.
 */

/** Top-level keys of a source record that the importer maps onto typed domain fields. */
export const SYNTHETIC_SOURCE_KNOWN_KEYS = ["id", "instruction", "output"] as const;

/** Keys of a source record's `output` object that the importer maps onto typed domain fields. */
export const SYNTHETIC_SOURCE_OUTPUT_KNOWN_KEYS = [
  "origin",
  "destination",
  "transit_mode",
] as const;

/** Source-local entries per category block. A block holding any other count is refused. */
export const MERGED_SOURCE_ENTRIES_PER_CATEGORY = 600;

/** Source-local ids span exactly this range within every block. */
export const MERGED_SOURCE_LOCAL_ID_MIN = 1;
export const MERGED_SOURCE_LOCAL_ID_MAX = 600;

/**
 * One row of the category mapping table: the human-readable source name to its stable slug
 * and canonical-id prefix.
 *
 * A TABLE rather than derived strings, deliberately: slugs and prefixes are research
 * identifiers downstream (database values, export fields, review URLs), so inventing them by
 * transforming the display name (`lowercase, underscores, initials`) would let a renamed
 * category silently re-identify every row. An unknown name fails parsing instead.
 */
export interface MergedSourceCategory {
  /** The source file's `category_id` (1..5). Carried for diagnostics, never as an identifier. */
  readonly categoryId: number;
  /** The source file's `category_name`, verbatim. */
  readonly name: string;
  /** The stable database/export slug. */
  readonly slug: string;
  /** The canonical-id prefix. */
  readonly prefix: string;
}

export const MERGED_SOURCE_CATEGORY_TABLE: readonly MergedSourceCategory[] = [
  { categoryId: 1, name: "Destination Only", slug: "destination_only", prefix: "DO" },
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

/**
 * The canonical dataset entry id for one source-local id: `{prefix}_{local:04d}`.
 *
 * Deterministic by construction — same category and local id, same id, every run — which is
 * what makes re-imports idempotent and what lets a test assert the mapping without a database.
 */
export function canonicalDatasetEntryId(prefix: string, localId: number): string {
  return `${prefix}_${String(localId).padStart(4, "0")}`;
}

/**
 * A parsed entry: the validated domain input plus the untouched source record.
 *
 * `sourcePayload` is the archival copy. The typed fields are a query-friendly projection of it,
 * never a replacement for it. That is why the two can be compared: a divergence between them is
 * itself a signal worth investigating.
 */
export type ImportedDatasetEntry = DatasetEntryInput & {
  sourcePayload: Record<string, unknown>;
};

/** A source field the current domain type does not model, aggregated across the whole file. */
export interface PreservedFieldReport {
  /** Dotted path within the record, for example `output.audio_url` or `difficulty`. */
  fieldPath: string;
  /** How many records carried it. */
  recordCount: number;
  /** One real value, so a reader can see what is being preserved without opening the file. */
  sampleValue: unknown;
}

export interface DatasetParseReport {
  /** Records read from the source, which equals `entries.length` on success. */
  recordCount: number;
  /** How many records carried at least one unmodelled field. */
  recordsWithPreservedFields: number;
  /** The unmodelled fields, aggregated. Empty when the source is fully modelled. */
  preservedFields: PreservedFieldReport[];
}

/**
 * Raised when the source cannot be turned into valid domain records.
 *
 * Carries the index and, where it can be recovered, the id of the offending record. An import
 * error that says "invalid input" without saying which record is unusable is not actionable when
 * the input is 600 lines of research data.
 */
export class DatasetParseError extends Error {
  readonly recordIndex: number;
  readonly recordId: string | null;
  readonly fieldPath: string;
  readonly issues: readonly string[];

  constructor(options: {
    recordIndex: number;
    recordId: string | null;
    fieldPath: string;
    issues: readonly string[];
  }) {
    const where = options.recordId
      ? `record ${options.recordId} (index ${options.recordIndex})`
      : `record at index ${options.recordIndex}`;
    super(
      `Cannot import ${where}: ${options.issues.join("; ")} (at ${options.fieldPath}). ` +
        "The record is rejected rather than repaired, because silently defaulting a research " +
        "record would change the data being validated.",
    );
    this.name = "DatasetParseError";
    this.recordIndex = options.recordIndex;
    this.recordId = options.recordId;
    this.fieldPath = options.fieldPath;
    this.issues = options.issues;
  }
}

export interface ParseSyntheticDatasetResult {
  entries: ImportedDatasetEntry[];
  report: DatasetParseReport;
}

/** Best-effort id recovery, so a failure can still name the record it is about. */
function readRecordId(record: unknown): string | null {
  if (typeof record !== "object" || record === null) return null;
  const id = (record as Record<string, unknown>).id;
  if (typeof id === "string") return id;
  if (typeof id === "number" && Number.isInteger(id)) return `#${id}`;
  return null;
}

/** Dotted path to a nested value, or `null` when the path does not resolve. */
function readPath(record: unknown, path: readonly string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Every unmodelled key in a record, as dotted paths.
 *
 * `output` is a nested object rather than a leaf, so its own unmodelled keys are reported
 * individually (`output.audio_url`) instead of collapsing into one opaque `output` entry.
 */
function findUnmodelledPaths(record: Record<string, unknown>): string[] {
  const paths: string[] = [];

  for (const key of Object.keys(record)) {
    if ((SYNTHETIC_SOURCE_KNOWN_KEYS as readonly string[]).includes(key)) continue;
    paths.push(key);
  }

  const output = record.output;
  if (typeof output === "object" && output !== null && !Array.isArray(output)) {
    for (const key of Object.keys(output)) {
      if ((SYNTHETIC_SOURCE_OUTPUT_KNOWN_KEYS as readonly string[]).includes(key)) continue;
      paths.push(`output.${key}`);
    }
  }

  return paths;
}

/**
 * Parses the merged synthetic source dataset into validated, importable domain records.
 *
 * Records are returned in source order — blocks in file order, entries in file order within
 * each block — which is what makes the report's counts and the verification's comparisons
 * meaningful.
 *
 * @throws {DatasetParseError} when the shape, a block, or a record cannot be turned into valid
 * entries. Blocks are never skipped and records are never repaired: a source dataset that is
 * subtly wrong must fail loudly rather than import 2,999 of 3,000 rows.
 */
export function parseSyntheticDataset(raw: unknown): ParseSyntheticDatasetResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DatasetParseError({
      recordIndex: -1,
      recordId: null,
      fieldPath: "$",
      issues: [
        `expected an object with a categories array, received ${raw === null ? "null" : Array.isArray(raw) ? "array" : typeof raw}`,
      ],
    });
  }

  const categories = (raw as Record<string, unknown>).categories;
  if (!Array.isArray(categories)) {
    throw new DatasetParseError({
      recordIndex: -1,
      recordId: null,
      fieldPath: "$.categories",
      issues: ["expected exactly 5 category blocks"],
    });
  }
  if (categories.length !== MERGED_SOURCE_CATEGORY_TABLE.length) {
    throw new DatasetParseError({
      recordIndex: -1,
      recordId: null,
      fieldPath: "$.categories",
      issues: [
        `expected ${MERGED_SOURCE_CATEGORY_TABLE.length} category blocks, received ${categories.length}`,
      ],
    });
  }

  const seenNames = new Set<string>();
  const entries: ImportedDatasetEntry[] = [];
  const preserved = new Map<string, { recordCount: number; sampleValue: unknown }>();
  let recordsWithPreservedFields = 0;
  let recordIndex = 0;

  categories.forEach((block, blockIndex) => {
    const blockPath = `$.categories[${blockIndex}]`;
    if (typeof block !== "object" || block === null || Array.isArray(block)) {
      throw new DatasetParseError({
        recordIndex,
        recordId: null,
        fieldPath: blockPath,
        issues: ["expected a category block object"],
      });
    }
    const source = block as Record<string, unknown>;
    const name = source.category_name;
    if (typeof name !== "string") {
      throw new DatasetParseError({
        recordIndex,
        recordId: null,
        fieldPath: `${blockPath}.category_name`,
        issues: ["expected the block's human-readable category name"],
      });
    }
    if (seenNames.has(name)) {
      throw new DatasetParseError({
        recordIndex,
        recordId: null,
        fieldPath: `${blockPath}.category_name`,
        issues: [`duplicate category block ${JSON.stringify(name)}`],
      });
    }
    seenNames.add(name);
    const mapping = MERGED_SOURCE_CATEGORY_TABLE.find((row) => row.name === name);
    if (mapping === undefined) {
      throw new DatasetParseError({
        recordIndex,
        recordId: null,
        fieldPath: `${blockPath}.category_name`,
        issues: [`unknown category ${JSON.stringify(name)}: no mapping row, and none is invented`],
      });
    }

    const blockEntries = source.entries;
    if (!Array.isArray(blockEntries)) {
      throw new DatasetParseError({
        recordIndex,
        recordId: null,
        fieldPath: `${blockPath}.entries`,
        issues: ["expected an entries array"],
      });
    }
    if (blockEntries.length !== MERGED_SOURCE_ENTRIES_PER_CATEGORY) {
      throw new DatasetParseError({
        recordIndex,
        recordId: null,
        fieldPath: `${blockPath}.entries`,
        issues: [
          `expected ${MERGED_SOURCE_ENTRIES_PER_CATEGORY} entries, received ${blockEntries.length}`,
        ],
      });
    }

    // Local ids must be exactly 1..600: no out-of-range values and no duplicates. Checked
    // as a SET before any record is parsed, so a corrupt block fails naming the id rather than
    // importing rows and stopping at whatever breaks first. The count check above plus
    // uniqueness here imply completeness: 600 unique ids in 1..600 can only be exactly 1..600,
    // so a gap always surfaces as either a short block (count arm) or a duplicate (arm below).
    const localIds = new Set<number>();
    for (const candidate of blockEntries) {
      if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
        throw new DatasetParseError({
          recordIndex,
          recordId: null,
          fieldPath: `${blockPath}.entries`,
          issues: ["expected a record object"],
        });
      }
      const localId = (candidate as Record<string, unknown>).id;
      if (
        typeof localId !== "number" ||
        !Number.isInteger(localId) ||
        localId < MERGED_SOURCE_LOCAL_ID_MIN ||
        localId > MERGED_SOURCE_LOCAL_ID_MAX
      ) {
        throw new DatasetParseError({
          recordIndex,
          recordId: null,
          fieldPath: `${blockPath}.entries`,
          issues: [
            `expected a source-local integer id ${MERGED_SOURCE_LOCAL_ID_MIN}..${MERGED_SOURCE_LOCAL_ID_MAX}, received ${JSON.stringify(localId) ?? "a missing id"}`,
          ],
        });
      }
      if (localIds.has(localId)) {
        throw new DatasetParseError({
          recordIndex,
          recordId: `#${localId}`,
          fieldPath: `${blockPath}.entries`,
          issues: [`duplicate source-local id ${localId} in category ${JSON.stringify(name)}`],
        });
      }
      localIds.add(localId);
    }

    blockEntries.forEach((record) => {
      const source = record as Record<string, unknown>;
      const localId = source.id as number;
      const recordId = readRecordId(source);
      const entryPath = `${blockPath}.entries[id=${localId}]`;

      // Mapped by name, explicitly, rather than by a generic transform. A renamed or removed
      // source field must fail here where the mapping is written, not silently produce an entry
      // with a null field that nobody notices until a validator sees a blank instruction.
      const candidate = {
        id: canonicalDatasetEntryId(mapping.prefix, localId),
        category: mapping.slug,
        sourceEntryId: localId,
        categoryName: mapping.name,
        instruction: source.instruction,
        origin: readPath(source, ["output", "origin"]) ?? null,
        destination: readPath(source, ["output", "destination"]) ?? null,
        transitMode: readPath(source, ["output", "transit_mode"]) ?? null,
      };

      const result = datasetEntryInputSchema.safeParse(candidate);
      if (!result.success) {
        throw new DatasetParseError({
          recordIndex,
          recordId,
          fieldPath: entryPath,
          issues: result.error.issues.map(
            (issue) => `${issue.path.join(".") || "(record)"}: ${issue.message}`,
          ),
        });
      }

      const unmodelledPaths = findUnmodelledPaths(source);
      for (const fieldPath of unmodelledPaths) {
        const existing = preserved.get(fieldPath);
        if (existing) {
          existing.recordCount += 1;
        } else {
          preserved.set(fieldPath, {
            recordCount: 1,
            sampleValue: readPath(source, fieldPath.split(".")),
          });
        }
      }
      if (unmodelledPaths.length > 0) recordsWithPreservedFields += 1;

      entries.push({ ...result.data, sourcePayload: source });
      recordIndex += 1;
    });
  });

  return {
    entries,
    report: {
      recordCount: entries.length,
      recordsWithPreservedFields,
      preservedFields: [...preserved.entries()]
        .map(([fieldPath, detail]) => ({ fieldPath, ...detail }))
        .sort((a, b) => a.fieldPath.localeCompare(b.fieldPath)),
    },
  };
}
