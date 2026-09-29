import {
  datasetEntryInputSchema,
  ORIGIN_DESTINATION_CATEGORY,
  type DatasetEntryInput,
} from "@/schemas/dataset";

/**
 * Parser for the immutable synthetic source dataset.
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
 *      `sourcePayload` and named in the report. The dataset happens to have exactly three
 *      top-level keys today, so a strict parser would pass every test and still be one dataset
 *      revision away from destroying data.
 */

/** Top-level keys of a source record that the importer maps onto typed domain fields. */
export const SYNTHETIC_SOURCE_KNOWN_KEYS = ["id", "instruction", "output"] as const;

/** Keys of a source record's `output` object that the importer maps onto typed domain fields. */
export const SYNTHETIC_SOURCE_OUTPUT_KNOWN_KEYS = [
  "origin",
  "destination",
  "transit_mode",
] as const;

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
  return typeof id === "string" ? id : null;
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
 * Parses the synthetic source dataset into validated, importable domain records.
 *
 * Records are returned in source order, which is what makes the report's counts and the
 * verification's comparisons meaningful.
 *
 * @throws {DatasetParseError} when a record cannot be turned into a valid entry. Records are
 * never skipped, defaulted, or repaired: a source dataset that is subtly wrong must fail loudly
 * rather than import 599 of 600 rows.
 */
export function parseSyntheticDataset(raw: unknown): ParseSyntheticDatasetResult {
  if (!Array.isArray(raw)) {
    throw new DatasetParseError({
      recordIndex: -1,
      recordId: null,
      fieldPath: "$",
      issues: [`expected an array of records, received ${raw === null ? "null" : typeof raw}`],
    });
  }

  const entries: ImportedDatasetEntry[] = [];
  const preserved = new Map<string, { recordCount: number; sampleValue: unknown }>();
  let recordsWithPreservedFields = 0;

  raw.forEach((record, recordIndex) => {
    if (typeof record !== "object" || record === null || Array.isArray(record)) {
      throw new DatasetParseError({
        recordIndex,
        recordId: null,
        fieldPath: `$[${recordIndex}]`,
        issues: ["expected a record object"],
      });
    }

    const source = record as Record<string, unknown>;
    const recordId = readRecordId(source);

    // Mapped by name, explicitly, rather than by a generic transform. A renamed or removed
    // source field must fail here where the mapping is written, not silently produce an entry
    // with a null field that nobody notices until a validator sees a blank instruction.
    const candidate = {
      id: source.id,
      category: ORIGIN_DESTINATION_CATEGORY,
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
        fieldPath: `$[${recordIndex}]`,
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
  });

  return {
    entries,
    report: {
      recordCount: raw.length,
      recordsWithPreservedFields,
      preservedFields: [...preserved.entries()]
        .map(([fieldPath, detail]) => ({ fieldPath, ...detail }))
        .sort((a, b) => a.fieldPath.localeCompare(b.fieldPath)),
    },
  };
}
