import { readFile } from "node:fs/promises";

import {
  parseSyntheticDataset,
  type ImportedDatasetEntry,
  type DatasetParseReport,
} from "@/lib/dataset/synthetic-source";

/**
 * Importing the parsed dataset into a store.
 *
 * Split from the parser on purpose. Parsing is pure and therefore verifiable with no database at
 * all; importing is the only part that needs a store. Keeping them apart means the PGlite
 * verification and a future hosted Supabase run execute the SAME parsed records, so a green
 * verification says something about the import that actually ships.
 *
 * The importer never writes the source dataset. `data/merged-ilocano-synthetic-data.json`
 * is read-only research material, and this module has no code path that opens it for writing.
 */

/** What an upsert did, so the caller can report honestly rather than counting attempts. */
export type DatasetEntryWriteOutcome = "inserted" | "updated";

/**
 * Where entries are written.
 *
 * Deliberately minimal: one method. An importer that knew about Supabase, batching, and
 * transactions would be unverifiable until a Supabase project exists, which is the situation this
 * split exists to avoid.
 */
export interface DatasetEntrySink {
  /**
   * Writes one entry, keyed on its source id.
   *
   * MUST be idempotent: writing an entry that already exists updates it rather than creating a
   * second row. MUST NOT overwrite a stored `instruction` — the imported instruction is immutable
   * research material, and a later edit to the source file must not retroactively change what a
   * validator was shown.
   */
  upsert(entry: ImportedDatasetEntry): Promise<DatasetEntryWriteOutcome>;
}

export interface DatasetImportResult {
  /** Entries handed to the importer. */
  parsed: number;
  /** Entries that created a row. */
  inserted: number;
  /** Entries that matched an existing row. */
  updated: number;
  /** The parse report, carried through so a caller can surface unmodelled source fields. */
  report: DatasetParseReport;
}

/**
 * Writes every entry through the sink and reports what it did.
 *
 * The report exists so a run that silently did nothing is distinguishable from a run that
 * succeeded. A researcher importing a research dataset needs to be able to say "3000 parsed, 3000
 * inserted" and mean it.
 */
export async function importDatasetEntries(
  entries: readonly ImportedDatasetEntry[],
  sink: DatasetEntrySink,
  report?: DatasetParseReport,
): Promise<DatasetImportResult> {
  let inserted = 0;
  let updated = 0;

  for (const entry of entries) {
    const outcome = await sink.upsert(entry);
    if (outcome === "inserted") {
      inserted += 1;
    } else {
      updated += 1;
    }
  }

  return {
    parsed: entries.length,
    inserted,
    updated,
    report: report ?? {
      recordCount: entries.length,
      recordsWithPreservedFields: 0,
      preservedFields: [],
    },
  };
}

/**
 * Reads and parses the synthetic source file.
 *
 * This is the only I/O in the import path, and it is one-directional: the file is opened for
 * reading and never for writing. JSON parse errors are wrapped so a malformed file names itself
 * rather than surfacing a bare `SyntaxError`.
 */
export async function readAndParseDatasetFile(
  filePath: string,
): Promise<{ entries: ImportedDatasetEntry[]; report: DatasetParseReport }> {
  let contents: string;
  try {
    contents = await readFile(filePath, "utf8");
  } catch (cause) {
    throw new Error(
      `Cannot read the synthetic dataset at ${filePath}. The source dataset is immutable research ` +
        "material; if it is missing, restore it rather than regenerating it.",
      { cause },
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(contents) as unknown;
  } catch (cause) {
    throw new Error(`The synthetic dataset at ${filePath} is not valid JSON.`, { cause });
  }

  return parseSyntheticDataset(raw);
}
