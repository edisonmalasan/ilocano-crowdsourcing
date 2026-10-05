import { datasetEntryInputSchema, type DatasetEntryInput } from "@/schemas/dataset";
import {
  CANONICAL_SUFFIX_MAX,
  CANONICAL_SUFFIX_MIN,
  categoryRowForName,
  DATASET_CATEGORY_TABLE,
  parseCanonicalEntryId,
} from "@/lib/domain/categories";

/**
 * Parser for the immutable revised synthetic source dataset.
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
 * The source is five named category blocks of 800 entries each. Record ids are READ VERBATIM
 * from the file — never reminted, never zero-padded: `D_1`, `DT_800`, `OD_124`, `ODT_63`,
 * `CPE_700`. The numeric suffix restarts at 1 in every category; the globally unique identity
 * is the whole prefixed id. A block with a duplicated, missing, or out-of-range suffix, a
 * misplaced prefix, an unknown category name, or a wrong entry count fails the whole parse
 * loudly: 3,999 of 4,000 rows is not an import.
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
export const MERGED_SOURCE_ENTRIES_PER_CATEGORY = 800;

/**
 * The transit-mode vocabulary for mode-bearing categories, stated once so the parser and its
 * tests cannot disagree about it. Null-mode categories (Destination Only, Origin +
 * Destination) carry no transit mode at all — `null` means unspecified transport, never a
 * default.
 */
export const MODE_BEARING_TRANSIT_MODES = [
  "walking",
  "jeepney",
  "taxi",
  "private_vehicle",
] as const;

/** Category slugs whose rows must carry no transit mode. */
const NULL_MODE_CATEGORIES = new Set(["destination_only", "origin_destination"]);

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
 * the input is 4,000 records of research data.
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
 * Category-purpose structure for one parsed entry.
 *
 * A destination is required in every category — an entry with nowhere to go gives a validator
 * nothing to judge. Beyond that each category states its shape: null-mode categories refuse a
 * transit mode rather than importing a row that violates their purpose, mode-bearing categories
 * require exactly the four-word vocabulary, and origin follows the category (required for
 * OD/ODT, forbidden for D/DT, free for CPE). Throws a `DatasetParseError` naming the entry on
 * any violation.
 */
function assertCategoryPurpose(
  slug: string,
  data: { origin: string | null; destination: string | null; transitMode: string | null },
  entryPath: string,
  recordIndex: number,
  recordId: string | null,
): void {
  const refuse = (issue: string): never => {
    throw new DatasetParseError({ recordIndex, recordId, fieldPath: entryPath, issues: [issue] });
  };
  if (data.destination === null) {
    refuse(`destination is required in category ${slug}, received null`);
  }
  if (NULL_MODE_CATEGORIES.has(slug)) {
    if (data.transitMode !== null) {
      refuse(
        `transit_mode must be null in null-mode category ${slug}, received ${JSON.stringify(data.transitMode)}`,
      );
    }
    return;
  }
  if (!(MODE_BEARING_TRANSIT_MODES as readonly string[]).includes(data.transitMode ?? "")) {
    refuse(
      `transit_mode must be one of ${MODE_BEARING_TRANSIT_MODES.join(", ")} in category ${slug}, received ${JSON.stringify(data.transitMode)}`,
    );
  }
  if (
    (slug === "origin_destination" || slug === "origin_destination_transit_mode") &&
    data.origin === null
  ) {
    refuse(`origin is required in category ${slug}, received null`);
  }
  if (
    (slug === "destination_only" || slug === "destination_transit_mode") &&
    data.origin !== null
  ) {
    refuse(`origin must be null in category ${slug}, received ${JSON.stringify(data.origin)}`);
  }
}

/**
 * Parses the revised synthetic source dataset into validated, importable domain records.
 *
 * Records are returned in source order — blocks in file order, entries in file order within
 * each block — which is what makes the report's counts and the verification's comparisons
 * meaningful.
 *
 * @throws {DatasetParseError} when the shape, a block, or a record cannot be turned into valid
 * entries. Blocks are never skipped and records are never repaired: a source dataset that is
 * subtly wrong must fail loudly rather than import 3,999 of 4,000 rows.
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
  if (categories.length !== DATASET_CATEGORY_TABLE.length) {
    throw new DatasetParseError({
      recordIndex: -1,
      recordId: null,
      fieldPath: "$.categories",
      issues: [
        `expected ${DATASET_CATEGORY_TABLE.length} category blocks, received ${categories.length}`,
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
    const mapping = categoryRowForName(name);
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

    // Canonical ids are read verbatim and must form exactly the block's set: no gaps, no
    // duplicates, no out-of-range suffixes, and no prefix from another category. Checked as a
    // SET before any record is parsed, so a corrupt block fails naming the id rather than
    // importing rows and stopping at whatever breaks first. The count check above plus
    // uniqueness here imply completeness: 800 unique in-range suffixes under one prefix can
    // only be exactly 1..800, so a gap always surfaces as either a short block (count arm)
    // or a duplicate (arm below).
    const seenSuffixes = new Set<number>();
    for (const candidate of blockEntries) {
      if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
        throw new DatasetParseError({
          recordIndex,
          recordId: null,
          fieldPath: `${blockPath}.entries`,
          issues: ["expected a record object"],
        });
      }
      const rawId = (candidate as Record<string, unknown>).id;
      const parsed = parseCanonicalEntryId(rawId);
      if (parsed === null) {
        throw new DatasetParseError({
          recordIndex,
          recordId: typeof rawId === "string" ? rawId : null,
          fieldPath: `${blockPath}.entries`,
          issues: [
            `expected a canonical id with prefix ${mapping.prefix} and suffix ${CANONICAL_SUFFIX_MIN}..${CANONICAL_SUFFIX_MAX}, received ${JSON.stringify(rawId) ?? "a missing id"}`,
          ],
        });
      }
      if (parsed.prefix !== mapping.prefix) {
        throw new DatasetParseError({
          recordIndex,
          recordId: `${parsed.prefix}_${parsed.suffix}`,
          fieldPath: `${blockPath}.entries`,
          issues: [
            `id prefix ${parsed.prefix} disagrees with enclosing category ${JSON.stringify(name)} (expected ${mapping.prefix})`,
          ],
        });
      }
      if (seenSuffixes.has(parsed.suffix)) {
        throw new DatasetParseError({
          recordIndex,
          recordId: `${parsed.prefix}_${parsed.suffix}`,
          fieldPath: `${blockPath}.entries`,
          issues: [
            `duplicate canonical id ${parsed.prefix}_${parsed.suffix} in category ${JSON.stringify(name)}`,
          ],
        });
      }
      seenSuffixes.add(parsed.suffix);
    }

    blockEntries.forEach((record) => {
      const source = record as Record<string, unknown>;
      const parsed = parseCanonicalEntryId(source.id);
      // Reachable only for ids the set check above accepted: the prefix agrees with the block
      // and the suffix is in range. Unreachable states throw rather than defaulting, because a
      // second implementation of the rule here is exactly the drift the shared helper exists
      // to prevent.
      if (parsed === null || parsed.prefix !== mapping.prefix) {
        throw new DatasetParseError({
          recordIndex,
          recordId: readRecordId(source),
          fieldPath: `${blockPath}.entries`,
          issues: ["id rejected on re-read after passing the block's id set check"],
        });
      }
      const localId = parsed.suffix;
      const recordId = readRecordId(source);
      const entryPath = `${blockPath}.entries[id=${source.id}]`;

      // Mapped by name, explicitly, rather than by a generic transform. A renamed or removed
      // source field must fail here where the mapping is written, not silently produce an entry
      // with a null field that nobody notices until a validator sees a blank instruction.
      const candidate = {
        id: source.id,
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

      // Category purpose, structurally: a mode where none belongs, or none where one is
      // required, is a corrupt row, not a judgment call. Sentence-level agreement beyond this
      // is audit evidence, not a parse rule — keyword scans cannot prove Ilocano.
      assertCategoryPurpose(mapping.slug, result.data, entryPath, recordIndex, recordId);

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
