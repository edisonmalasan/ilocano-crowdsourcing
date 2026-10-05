/**
 * Parser verification against the REAL merged synthetic dataset file.
 *
 * These tests read `data/merged-ilocano-synthetic-data.json` itself rather than a hand-written
 * fixture, because a fixture would only prove the parser handles whatever the fixture happens to
 * contain. The research question is whether all 3,000 real records survive the trip, so that is
 * what is asserted.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalDatasetEntryId,
  DatasetParseError,
  MERGED_SOURCE_CATEGORY_TABLE,
  parseSyntheticDataset,
  type ImportedDatasetEntry,
} from "@/lib/dataset/synthetic-source";

const SOURCE_PATH = path.resolve(process.cwd(), "data", "merged-ilocano-synthetic-data.json");

interface RawRecord {
  id: number;
  instruction: string;
  output: { origin: string | null; destination: string | null; transit_mode: string | null };
}

interface RawBlock {
  category_id: number;
  category_name: string;
  entries: RawRecord[];
}

function readDocument(): { categories: RawBlock[] } {
  return JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as { categories: RawBlock[] };
}

function readSource(): unknown {
  return JSON.parse(readFileSync(SOURCE_PATH, "utf8")) as unknown;
}

/**
 * The typed projection of an entry, without the archival copy.
 *
 * Compared separately from `sourcePayload` because the two are meant to differ in exactly one
 * way: the archival copy records the source record as authored, while the projection is the
 * domain's normalized view of it.
 */
function projectionOf(entry: ImportedDatasetEntry | undefined) {
  if (!entry) return undefined;
  return {
    id: entry.id,
    category: entry.category,
    sourceEntryId: entry.sourceEntryId,
    categoryName: entry.categoryName,
    instruction: entry.instruction,
    origin: entry.origin,
    destination: entry.destination,
    transitMode: entry.transitMode,
  };
}

/** The expected canonical id for every source record, in source order. */
function expectedIdsInSourceOrder(): string[] {
  const ids: string[] = [];
  for (const block of readDocument().categories) {
    const mapping = MERGED_SOURCE_CATEGORY_TABLE.find((row) => row.name === block.category_name);
    if (!mapping) throw new Error(`no mapping for ${block.category_name}`);
    for (const record of block.entries) {
      ids.push(canonicalDatasetEntryId(mapping.prefix, record.id));
    }
  }
  return ids;
}

describe("parseSyntheticDataset against the real merged dataset", () => {
  it("produces 3,000 entries, 600 per category, in source order", () => {
    const { entries, report } = parseSyntheticDataset(readSource());

    expect(entries).toHaveLength(3000);
    expect(report.recordCount).toBe(3000);
    expect(entries.map((entry) => entry.id)).toEqual(expectedIdsInSourceOrder());
  });

  it("mints globally unique canonical ids with the documented prefixes", () => {
    const { entries } = parseSyntheticDataset(readSource());
    const ids = entries.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(3000);
    for (const mapping of MERGED_SOURCE_CATEGORY_TABLE) {
      const expected = Array.from(
        { length: 600 },
        (_, index) => `${mapping.prefix}_${String(index + 1).padStart(4, "0")}`,
      );
      expect(ids.filter((id) => id.startsWith(`${mapping.prefix}_`)).sort()).toEqual(expected);
    }
  });

  it("recovers the source-local id and category on every entry", () => {
    const { entries } = parseSyntheticDataset(readSource());
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const document = readDocument();

    expect(new Set(entries.map((entry) => entry.category)).size).toBe(5);
    for (const block of document.categories) {
      const mapping = MERGED_SOURCE_CATEGORY_TABLE.find((row) => row.name === block.category_name);
      if (!mapping) throw new Error(`no mapping for ${block.category_name}`);
      for (const record of block.entries) {
        const entry = byId.get(canonicalDatasetEntryId(mapping.prefix, record.id));
        expect(entry, `missing entry for ${mapping.prefix}#${record.id}`).toBeDefined();
        expect(entry?.sourceEntryId).toBe(record.id);
        expect(entry?.category).toBe(mapping.slug);
        expect(entry?.categoryName).toBe(block.category_name);
      }
    }
  });

  it("preserves every instruction exactly, with no normalization applied", () => {
    const document = readDocument();
    const { entries } = parseSyntheticDataset(readSource());
    const byId = new Map(entries.map((entry) => [entry.id, entry]));

    for (const block of document.categories) {
      const mapping = MERGED_SOURCE_CATEGORY_TABLE.find((row) => row.name === block.category_name);
      if (!mapping) throw new Error(`no mapping for ${block.category_name}`);
      for (const record of block.entries) {
        const entry = byId.get(canonicalDatasetEntryId(mapping.prefix, record.id));
        // Byte equality, not a trimmed or case-folded comparison: Ilocano capitalization and
        // punctuation are what validators are judging.
        expect(entry?.instruction).toBe(record.instruction);
      }
    }
  });

  it("takes transit mode from the file rather than inventing or defaulting it", () => {
    const document = readDocument();
    const { entries } = parseSyntheticDataset(readSource());
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const seen = new Set<string | null>();

    for (const block of document.categories) {
      const mapping = MERGED_SOURCE_CATEGORY_TABLE.find((row) => row.name === block.category_name);
      if (!mapping) throw new Error(`no mapping for ${block.category_name}`);
      for (const record of block.entries) {
        const stored = byId.get(canonicalDatasetEntryId(mapping.prefix, record.id))?.transitMode;
        expect(stored).toBe(record.output.transit_mode);
        seen.add(stored ?? null);
      }
    }
    // The file genuinely varies the value, so this assertion would catch a parser that defaulted
    // the column: a constant output over 3,000 varying inputs is the signature of a default.
    expect(seen.size).toBeGreaterThan(1);
  });

  it("maps origin and destination from the nested output object", () => {
    const document = readDocument();
    const { entries } = parseSyntheticDataset(readSource());
    const byId = new Map(entries.map((entry) => [entry.id, entry]));

    for (const block of document.categories) {
      const mapping = MERGED_SOURCE_CATEGORY_TABLE.find((row) => row.name === block.category_name);
      if (!mapping) throw new Error(`no mapping for ${block.category_name}`);
      for (const record of block.entries) {
        const entry = byId.get(canonicalDatasetEntryId(mapping.prefix, record.id));
        expect(entry?.origin).toBe(record.output.origin);
        expect(entry?.destination).toBe(record.output.destination);
      }
    }
  });

  it("reports no unmodelled fields, because the current source has none", () => {
    const { report } = parseSyntheticDataset(readSource());
    // This is a fact about TODAY'S dataset, not a guarantee. It is exactly the assumption a
    // strict parser would make and then break on the next dataset revision, which is why the
    // preservation behaviour is tested separately below rather than inferred from this.
    expect(report.preservedFields).toEqual([]);
    expect(report.recordsWithPreservedFields).toBe(0);
  });

  it("stores the untouched source record alongside the typed projection", () => {
    const document = readDocument();
    const { entries } = parseSyntheticDataset(readSource());

    let index = 0;
    for (const block of document.categories) {
      const mapping = MERGED_SOURCE_CATEGORY_TABLE.find((row) => row.name === block.category_name);
      if (!mapping) throw new Error(`no mapping for ${block.category_name}`);
      for (const record of block.entries) {
        const entry = entries[index];
        // The archival copy must be the record as authored, not the mapped candidate object:
        // local numeric id, no canonical id, no category slug.
        expect(entry?.sourcePayload).toEqual(record);
        expect(entry?.id).toBe(canonicalDatasetEntryId(mapping.prefix, record.id));
        index += 1;
      }
    }
  });
});

describe("merged-shape validation", () => {
  /** One full valid block, so failure tests can break exactly one thing. */
  function block(
    name: string,
    ids: readonly number[] = Array.from({ length: 600 }, (_, index) => index + 1),
  ) {
    return {
      category_id: 1,
      category_name: name,
      entries: ids.map((id) => ({
        id,
        instruction: `Instruction ${id}.`,
        output: { origin: null, destination: `Place ${id}`, transit_mode: null },
      })),
    };
  }

  function documentOf(names: readonly string[]) {
    return { categories: names.map((name) => block(name)) };
  }

  const NAMES = MERGED_SOURCE_CATEGORY_TABLE.map((row) => row.name);

  it("accepts the five documented categories and nothing else", () => {
    // Hardcoded, not derived from the table: deriving the expectation from the implementation
    // would pass with any five names, including five wrong ones.
    expect(MERGED_SOURCE_CATEGORY_TABLE.map((row) => row.name)).toEqual([
      "Destination Only",
      "Destination + Transit Mode",
      "Origin + Destination",
      "Origin + Destination + Transit Mode",
      "Complex/Preference Expressions",
    ]);
    const { entries } = parseSyntheticDataset(documentOf(NAMES));
    expect(entries).toHaveLength(3000);
  });

  it("rejects a sixth block and a missing block", () => {
    expect(() => parseSyntheticDataset(documentOf([...NAMES, NAMES[0] as string]))).toThrow(
      DatasetParseError,
    );
    expect(() => parseSyntheticDataset(documentOf(NAMES.slice(0, 4)))).toThrow(DatasetParseError);
  });

  it("rejects a duplicated category block", () => {
    const names = [
      NAMES[0] as string,
      NAMES[1] as string,
      NAMES[1] as string,
      NAMES[2] as string,
      NAMES[3] as string,
    ];
    expect(() => parseSyntheticDataset(documentOf(names))).toThrow(/duplicate category block/);
  });

  it("rejects an unknown category name rather than inventing a mapping", () => {
    const names = [
      NAMES[0] as string,
      "Harbor + Ferry",
      NAMES[2] as string,
      NAMES[3] as string,
      NAMES[4] as string,
    ];
    expect(() => parseSyntheticDataset(documentOf(names))).toThrow(/unknown category/);
  });

  it("rejects a duplicated local id, naming the block and the id", () => {
    const ids = Array.from({ length: 600 }, (_, index) => (index < 599 ? index + 1 : 599));
    const document = documentOf(NAMES);
    document.categories[2] = block(NAMES[2] as string, ids);
    try {
      parseSyntheticDataset(document);
      expect.unreachable("a duplicated local id was accepted");
    } catch (cause) {
      const error = cause as DatasetParseError;
      expect(error.message).toContain("duplicate source-local id 599");
      expect(error.message).toContain(NAMES[2] as string);
    }
  });

  it("rejects a gap disguised as a duplicate, naming the id", () => {
    // 600 entries with id 1 missing and id 2 doubled: the count arm cannot see it (600 entries)
    // but the set arm fails loudly, naming the duplicated id. A gap can never slip through
    // silently — it always surfaces as a short block or a duplicate.
    const ids = Array.from({ length: 600 }, (_, index) => (index === 0 ? 2 : index + 1));
    const document = documentOf(NAMES);
    document.categories[0] = block(NAMES[0] as string, ids);
    try {
      parseSyntheticDataset(document);
      expect.unreachable("a block with a gap was accepted");
    } catch (cause) {
      const error = cause as DatasetParseError;
      expect(error.message).toContain("duplicate source-local id 2");
      expect(error.message).toContain(NAMES[0] as string);
    }
  });

  it("rejects a short block rather than importing it partially", () => {
    const document = documentOf(NAMES);
    document.categories[4] = block(NAMES[4] as string, [1, 2, 3]);
    expect(() => parseSyntheticDataset(document)).toThrow(/expected 600 entries, received 3/);
  });

  it("rejects a non-object document and a missing categories array", () => {
    expect(() => parseSyntheticDataset([{ id: 1 }])).toThrow(DatasetParseError);
    expect(() => parseSyntheticDataset({})).toThrow(DatasetParseError);
    expect(() => parseSyntheticDataset(null)).toThrow(DatasetParseError);
  });

  it("mints canonical ids deterministically across runs", () => {
    const first = parseSyntheticDataset(documentOf(NAMES));
    const second = parseSyntheticDataset(documentOf(NAMES));
    expect(first.entries.map((entry) => entry.id)).toEqual(second.entries.map((entry) => entry.id));
    expect(first.entries[0]?.id).toBe("DO_0001");
    expect(first.entries[600]?.id).toBe("DT_0001");
    expect(first.entries[1200]?.id).toBe("OD_0001");
    expect(first.entries[1800]?.id).toBe("ODT_0001");
    expect(first.entries[2400]?.id).toBe("CPE_0001");
  });
});

describe("parseSyntheticDataset preserves unmodelled source fields", () => {
  function validRecord(id: number): Record<string, unknown> {
    return {
      id,
      instruction: `Instruction ${id}.`,
      output: { origin: null, destination: `Place ${id}`, transit_mode: null },
    };
  }

  function fullBlock(category_id: number, category_name: string) {
    return {
      category_id,
      category_name,
      entries: Array.from({ length: 600 }, (_, index) => validRecord(index + 1)),
    };
  }

  function wrapped(firstRecord: Record<string, unknown>) {
    const entries = Array.from({ length: 600 }, (_, index) => validRecord(index + 1));
    entries[0] = firstRecord;
    return {
      categories: [
        { category_id: 3, category_name: "Origin + Destination", entries },
        fullBlock(1, "Destination Only"),
        fullBlock(2, "Destination + Transit Mode"),
        fullBlock(4, "Origin + Destination + Transit Mode"),
        fullBlock(5, "Complex/Preference Expressions"),
      ],
    };
  }

  it("retains an unknown top-level field and names it in the report", () => {
    const { entries, report } = parseSyntheticDataset(
      wrapped({ ...validRecord(1), difficulty: "hard" }),
    );

    // The whole point of the rule: a field the domain type does not model survives in the stored
    // source record. A strict parser would have thrown here, and a lenient one would have dropped
    // `difficulty` with no trace.
    expect(entries[0]?.sourcePayload).toMatchObject({ difficulty: "hard" });
    expect(report.preservedFields).toEqual([
      { fieldPath: "difficulty", recordCount: 1, sampleValue: "hard" },
    ]);
    expect(report.recordsWithPreservedFields).toBe(1);
  });

  it("retains an unknown nested output field under a dotted path", () => {
    const { entries, report } = parseSyntheticDataset(
      wrapped({
        ...validRecord(1),
        output: {
          origin: null,
          destination: "X",
          transit_mode: null,
          audio_url: "https://example.invalid/a.mp3",
        },
      }),
    );

    expect(entries[0]?.sourcePayload).toMatchObject({
      output: { audio_url: "https://example.invalid/a.mp3" },
    });
    expect(report.preservedFields[0]?.fieldPath).toBe("output.audio_url");
  });
});

describe("parseSyntheticDataset rejects rather than repairs — merged shape", () => {
  function validRecord(id: number): Record<string, unknown> {
    return {
      id,
      instruction: "Iti Baguio Athletic Bowl ti ayanko ita.",
      output: { origin: "A", destination: "B", transit_mode: null },
    };
  }

  function fullBlock(category_id: number, category_name: string) {
    return {
      category_id,
      category_name,
      entries: Array.from({ length: 600 }, (_, index) => validRecord(index + 1)),
    };
  }

  function wrapped(firstRecord: Record<string, unknown>) {
    const entries = Array.from({ length: 600 }, (_, index) => validRecord(index + 1));
    entries[0] = firstRecord;
    return {
      categories: [
        { category_id: 3, category_name: "Origin + Destination", entries },
        fullBlock(1, "Destination Only"),
        fullBlock(2, "Destination + Transit Mode"),
        fullBlock(4, "Origin + Destination + Transit Mode"),
        fullBlock(5, "Complex/Preference Expressions"),
      ],
    };
  }

  it("rejects a blank instruction rather than importing an entry with nothing to judge", () => {
    // A dataset entry with no instruction gives a validator nothing to evaluate. Defaulting it
    // would manufacture a research record that never existed.
    expect(() => parseSyntheticDataset(wrapped({ ...validRecord(1), instruction: "   " }))).toThrow(
      DatasetParseError,
    );
  });

  it("rejects a missing instruction and identifies the block", () => {
    const rest: Record<string, unknown> = {
      id: 1,
      output: { origin: "A", destination: "B", transit_mode: null },
    };
    try {
      parseSyntheticDataset(wrapped(rest));
      expect.unreachable("a record with no instruction was accepted");
    } catch (cause) {
      const error = cause as DatasetParseError;
      expect(error.fieldPath).toContain("$.categories[0]");
    }
  });

  it("identifies the offending record when the id itself is unusable", () => {
    try {
      parseSyntheticDataset(wrapped({ ...validRecord(1), id: 42.5 }));
      expect.unreachable("a record with a non-integer id was accepted");
    } catch (cause) {
      const error = cause as DatasetParseError;
      expect(error.fieldPath).toContain("$.categories[0]");
      expect(error.recordIndex).toBe(0);
    }
  });

  it("rejects the whole file rather than importing the records that happened to parse", () => {
    // Importing 2,999 of 3,000 records would leave the dataset quietly incomplete, and a coverage
    // count computed over a partial import is worse than no import at all.
    const broken = wrapped(validRecord(1));
    const lastBlock = broken.categories[4];
    if (lastBlock === undefined) throw new Error("expected five blocks");
    lastBlock.entries[599] = {
      id: 600,
      instruction: "",
      output: { origin: null, destination: "B", transit_mode: null },
    };
    expect(() => parseSyntheticDataset(broken)).toThrow(DatasetParseError);
  });

  it("treats an omitted optional field and an explicit null identically", () => {
    const omitted = parseSyntheticDataset(wrapped({ ...validRecord(1), output: {} })).entries[0];
    const explicitNull = parseSyntheticDataset(
      wrapped({
        ...validRecord(1),
        output: { origin: null, destination: null, transit_mode: null },
      }),
    ).entries[0];

    expect(omitted?.origin).toBeNull();
    expect(omitted?.destination).toBeNull();
    expect(omitted?.transitMode).toBeNull();
    // One importer that leaves a field out and one that sends an explicit null must produce the
    // same stored record, which is what lets a category without a concept be represented without
    // a schema change. Only the typed projection is compared; the archival copy deliberately
    // differs, because it records each source record exactly as it was authored.
    expect(projectionOf(omitted)).toEqual(projectionOf(explicitNull));
    expect(omitted?.sourcePayload).toEqual({
      id: 1,
      instruction: "Iti Baguio Athletic Bowl ti ayanko ita.",
      output: {},
    });
  });
});

describe("the source dataset is never opened for writing", () => {
  /**
   * Every module that participates in the import path.
   *
   * Not a hand-picked list: read from the directory, so a new file in the import path is covered
   * the moment it exists. A module that opened the dataset for writing and was left out of this
   * list would make the whole check vacuous.
   */
  const IMPORT_PATH_MODULES = [
    "src/lib/dataset/import-dataset.ts",
    "src/lib/dataset/synthetic-source.ts",
  ];

  it("ships modules that exist, so the check below cannot pass on an empty list", () => {
    // A path typo or a module rename would otherwise reduce the scan to nothing and report a
    // clean result, which is the failure mode this whole block exists to prevent.
    for (const relative of IMPORT_PATH_MODULES) {
      expect(existsSync(path.resolve(process.cwd(), relative)), relative).toBe(true);
    }
  });

  it("contains no filesystem write, rename, or delete call in the import path", () => {
    // The claim being tested is that the dataset is never opened FOR WRITING, which is stronger
    // than "the file still has the same bytes" — a write that opens, truncates, and restores would
    // leave the content identical while destroying the file's identity. The integration test
    // compares SHA-256 before and after, which proves the content; this proves there is no code
    // path capable of touching it.
    //
    // Scanned as source text rather than by running the import under a patched `fs`, because
    // monkey-patching a module can only observe the paths the test happens to execute, and an
    // unexecuted write path is exactly what this is looking for. A textual scan sees code that is
    // not currently reachable.
    const writeApis = [
      /\bwriteFile(?:Sync)?\b/,
      /\bappendFile(?:Sync)?\b/,
      /\bcreateWriteStream\b/,
      /\bopen(?:Sync)?\s*\([^)]*['"`]w/,
      /\btruncate(?:Sync)?\b/,
      /\bunlink(?:Sync)?\b/,
      /\brm(?:Sync)?\b/,
      /\brename(?:Sync)?\b/,
      /\bcp(?:Sync)?\b/,
      /\bcopyFile(?:Sync)?\b/,
      /\bchmod(?:Sync)?\b/,
      /\bchown(?:Sync)?\b/,
    ];

    for (const relative of IMPORT_PATH_MODULES) {
      const source = readFileSync(path.resolve(process.cwd(), relative), "utf8");
      for (const pattern of writeApis) {
        expect(pattern.test(source), `${relative} must not match ${pattern}`).toBe(false);
      }
    }
  });

  it("reads the dataset through the one documented entry point, which is read-only", async () => {
    // Belt to the scan's braces: the only `node:fs` import the import path has is `readFile` from
    // `node:fs/promises`, and calling it returns the file's content without a write handle.
    const { readAndParseDatasetFile } = await import("@/lib/dataset/import-dataset");
    const { entries, report } = await readAndParseDatasetFile(SOURCE_PATH);

    expect(report.recordCount).toBe(3000);
    expect(entries).toHaveLength(3000);
    expect(readFileSync(SOURCE_PATH, "utf8")).toBe(readFileSync(SOURCE_PATH, "utf8"));
  });
});

describe("the parser is pure", () => {
  it("does not mutate the value it was given", () => {
    const source = {
      categories: [
        {
          category_id: 3,
          category_name: "Origin + Destination",
          entries: [
            {
              id: 1,
              instruction: "Iti Baguio Athletic Bowl ti ayanko ita.",
              output: { origin: "A", destination: "B", transit_mode: null },
              difficulty: "hard",
            },
          ],
        },
      ],
    };
    const snapshot = structuredClone(source);

    expect(() => parseSyntheticDataset(source)).toThrow(DatasetParseError);

    expect(source).toEqual(snapshot);
  });

  it("returns an independent result for the same input", () => {
    const source = readSource();
    const first = parseSyntheticDataset(source);
    const second = parseSyntheticDataset(source);

    expect(first.entries).toEqual(second.entries);
    expect(first.entries).not.toBe(second.entries);
  });

  it("carries no field beyond the domain input and the archival copy", () => {
    // Guards against the parser quietly adding derived columns — a quality score, a length, a
    // language tag. Nothing may be inferred from the research text here.
    const { entries } = parseSyntheticDataset(readSource());
    const entry = entries[0] as ImportedDatasetEntry;
    expect(Object.keys(entry).sort()).toEqual([
      "category",
      "categoryName",
      "destination",
      "id",
      "instruction",
      "origin",
      "sourceEntryId",
      "sourcePayload",
      "transitMode",
    ]);
  });
});
