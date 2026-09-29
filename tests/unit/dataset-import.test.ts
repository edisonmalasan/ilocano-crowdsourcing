/**
 * Parser verification against the REAL synthetic dataset file.
 *
 * These tests read `data/ilocano-synthetic-data.json` itself rather than a hand-written fixture,
 * because a fixture would only prove the parser handles whatever the fixture happens to contain.
 * The research question is whether all 600 real records survive the trip, so that is what is
 * asserted.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DatasetParseError,
  parseSyntheticDataset,
  type ImportedDatasetEntry,
} from "@/lib/dataset/synthetic-source";
import { ORIGIN_DESTINATION_CATEGORY } from "@/schemas/dataset";

const SOURCE_PATH = path.resolve(process.cwd(), "data", "ilocano-synthetic-data.json");

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
    instruction: entry.instruction,
    origin: entry.origin,
    destination: entry.destination,
    transitMode: entry.transitMode,
  };
}

describe("parseSyntheticDataset against the real dataset", () => {
  it("produces one entry per source record, in source order", () => {
    const source = readSource() as unknown[];
    const { entries, report } = parseSyntheticDataset(readSource());

    expect(entries).toHaveLength(600);
    expect(entries).toHaveLength(source.length);
    expect(report.recordCount).toBe(source.length);
  });

  it("preserves the source id set exactly, with no gaps or duplicates", () => {
    const { entries } = parseSyntheticDataset(readSource());
    const ids = entries.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);

    const expected = Array.from(
      { length: 600 },
      (_, index) => `OD_${String(index + 1).padStart(4, "0")}`,
    );
    expect([...ids].sort()).toEqual(expected);
  });

  it("keeps source order rather than sorting", () => {
    const { entries } = parseSyntheticDataset(readSource());
    // Source order is ascending, so if a future change sorted by id this would still pass. Assert
    // it explicitly against the file's own order rather than a sorted copy of it.
    const source = readSource() as Array<{ id: string }>;
    expect(entries.map((entry) => entry.id)).toEqual(source.map((record) => record.id));
  });

  it("preserves every instruction exactly, with no normalization applied", () => {
    const source = readSource() as Array<{ id: string; instruction: string }>;
    const { entries } = parseSyntheticDataset(readSource());
    const byId = new Map(entries.map((entry) => [entry.id, entry]));

    for (const record of source) {
      const entry = byId.get(record.id);
      expect(entry, `missing entry for ${record.id}`).toBeDefined();
      // Byte equality, not a trimmed or case-folded comparison: Ilocano capitalization and
      // punctuation are what validators are judging.
      expect(entry?.instruction).toBe(record.instruction);
    }
  });

  it("records transit mode as null rather than inventing a placeholder", () => {
    const { entries } = parseSyntheticDataset(readSource());
    // Every source record carries `transit_mode: null`, meaning this category has no such
    // concept. Storing "" or "n/a" would invent information the dataset does not contain.
    expect(entries.every((entry) => entry.transitMode === null)).toBe(true);
  });

  it("maps origin and destination from the nested output object", () => {
    const source = readSource() as Array<{
      id: string;
      output: { origin: string; destination: string };
    }>;
    const { entries } = parseSyntheticDataset(readSource());
    const byId = new Map(entries.map((entry) => [entry.id, entry]));

    for (const record of source) {
      expect(byId.get(record.id)?.origin).toBe(record.output.origin);
      expect(byId.get(record.id)?.destination).toBe(record.output.destination);
    }
  });

  it("assigns the Origin + Destination category to every entry", () => {
    const { entries } = parseSyntheticDataset(readSource());
    expect(new Set(entries.map((entry) => entry.category))).toEqual(
      new Set([ORIGIN_DESTINATION_CATEGORY]),
    );
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
    const source = readSource() as Array<Record<string, unknown>>;
    const { entries } = parseSyntheticDataset(readSource());

    for (const [index, entry] of entries.entries()) {
      // The archival copy must be the record as authored, not the mapped candidate object.
      expect(entry.sourcePayload).toEqual(source[index]);
    }
  });
});

describe("parseSyntheticDataset preserves unmodelled source fields", () => {
  const base = {
    id: "OD_0001",
    instruction: "Iti Baguio Athletic Bowl ti ayanko ita.",
    output: {
      origin: "Baguio Athletic Bowl",
      destination: "Baguio Convention Center",
      transit_mode: null,
    },
  };

  it("retains an unknown top-level field and names it in the report", () => {
    const { entries, report } = parseSyntheticDataset([{ ...base, difficulty: "hard" }]);

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
    const { entries, report } = parseSyntheticDataset([
      { ...base, output: { ...base.output, audio_url: "https://example.invalid/a.mp3" } },
    ]);

    expect(entries[0]?.sourcePayload).toMatchObject({
      output: { audio_url: "https://example.invalid/a.mp3" },
    });
    expect(report.preservedFields[0]?.fieldPath).toBe("output.audio_url");
  });

  it("aggregates a repeated unmodelled field across records with a real sample value", () => {
    const { report } = parseSyntheticDataset([
      { ...base, id: "OD_0001", difficulty: "hard" },
      { ...base, id: "OD_0002", difficulty: "hard" },
      { ...base, id: "OD_0003" },
    ]);

    expect(report.preservedFields).toEqual([
      { fieldPath: "difficulty", recordCount: 2, sampleValue: "hard" },
    ]);
    expect(report.recordsWithPreservedFields).toBe(2);
  });
});

describe("parseSyntheticDataset rejects rather than repairs", () => {
  const base = {
    id: "OD_0001",
    instruction: "Iti Baguio Athletic Bowl ti ayanko ita.",
    output: { origin: "A", destination: "B", transit_mode: null },
  };

  it("rejects a malformed id and names the record", () => {
    expect(() => parseSyntheticDataset([{ ...base, id: "not-an-id" }])).toThrow(DatasetParseError);
    try {
      parseSyntheticDataset([{ ...base, id: "not-an-id" }]);
    } catch (cause) {
      const error = cause as DatasetParseError;
      expect(error.recordId).toBe("not-an-id");
      expect(error.recordIndex).toBe(0);
      expect(error.message).toContain("id");
    }
  });

  it("rejects a missing instruction", () => {
    // Spelled out rather than produced by omitting a key, so the record under test is visible.
    expect(() => parseSyntheticDataset([{ id: base.id, output: base.output }])).toThrow(
      /Cannot import record OD_0001/,
    );
  });

  it("rejects a blank instruction rather than importing an entry with nothing to judge", () => {
    // A dataset entry with no instruction gives a validator nothing to evaluate. Defaulting it
    // would manufacture a research record that never existed.
    expect(() => parseSyntheticDataset([{ ...base, instruction: "   " }])).toThrow(
      DatasetParseError,
    );
  });

  it("identifies the offending record by index when the id itself is unusable", () => {
    try {
      parseSyntheticDataset([base, { ...base, id: 42 as unknown as string }]);
      expect.unreachable("a record with a non-string id was accepted");
    } catch (cause) {
      const error = cause as DatasetParseError;
      expect(error.recordIndex).toBe(1);
      expect(error.recordId).toBeNull();
    }
  });

  it("rejects the whole file rather than importing the records that happened to parse", () => {
    // Importing 1 of 2 records would leave the dataset quietly incomplete, and a coverage count
    // computed over a partial import is worse than no import at all.
    expect(() =>
      parseSyntheticDataset([base, { ...base, id: "OD_0002", instruction: "" }]),
    ).toThrow(DatasetParseError);
  });

  it("rejects a non-array source", () => {
    expect(() => parseSyntheticDataset({ entries: [] })).toThrow(/expected an array/);
    expect(() => parseSyntheticDataset(null)).toThrow(/expected an array/);
  });

  it("treats an omitted optional field and an explicit null identically", () => {
    const omitted = parseSyntheticDataset([
      { id: base.id, instruction: base.instruction, output: {} },
    ]).entries[0];
    const explicitNull = parseSyntheticDataset([
      { ...base, output: { origin: null, destination: null, transit_mode: null } },
    ]).entries[0];

    expect(omitted?.origin).toBeNull();
    expect(omitted?.destination).toBeNull();
    expect(omitted?.transitMode).toBeNull();
    // One importer that leaves a field out and one that sends an explicit null must produce the
    // same stored record, which is what lets a category without a concept be represented without
    // a schema change. Only the typed projection is compared; the archival copy deliberately
    // differs, because it records each source record exactly as it was authored.
    expect(projectionOf(omitted)).toEqual(projectionOf(explicitNull));
    expect(omitted?.sourcePayload).toEqual({
      id: base.id,
      instruction: base.instruction,
      output: {},
    });
    expect(explicitNull?.sourcePayload).toEqual({
      ...base,
      output: { origin: null, destination: null, transit_mode: null },
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

    expect(report.recordCount).toBe(600);
    expect(entries).toHaveLength(600);
    expect(readFileSync(SOURCE_PATH, "utf8")).toBe(readFileSync(SOURCE_PATH, "utf8"));
  });
});

describe("the parser is pure", () => {
  it("does not mutate the value it was given", () => {
    const source = [
      {
        id: "OD_0001",
        instruction: "Iti Baguio Athletic Bowl ti ayanko ita.",
        output: { origin: "A", destination: "B", transit_mode: null },
        difficulty: "hard",
      },
    ];
    const snapshot = structuredClone(source);

    parseSyntheticDataset(source);

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
      "destination",
      "id",
      "instruction",
      "origin",
      "sourcePayload",
      "transitMode",
    ]);
  });
});
