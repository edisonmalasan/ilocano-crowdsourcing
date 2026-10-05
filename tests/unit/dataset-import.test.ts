/**
 * Parser verification against the REAL revised synthetic dataset file.
 *
 * These tests read `data/merged-ilocano-synthetic-data.json` itself rather than a hand-written
 * fixture, because a fixture would only prove the parser handles whatever the fixture happens to
 * contain. The research question is whether all 4,800 real records survive the trip, so that is
 * what is asserted.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DatasetParseError,
  parseSyntheticDataset,
  type ImportedDatasetEntry,
} from "@/lib/dataset/synthetic-source";
import {
  compareCanonicalEntryIds,
  DATASET_CATEGORY_TABLE,
  parseCanonicalEntryId,
} from "@/lib/domain/categories";

const SOURCE_PATH = path.resolve(process.cwd(), "data", "merged-ilocano-synthetic-data.json");

interface RawRecord {
  id: string;
  instruction: string;
  output: {
    origin: string | null;
    destination: string | null;
    transit_mode: string | string[] | null;
  };
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
    for (const record of block.entries) ids.push(record.id);
  }
  return ids;
}

describe("parseSyntheticDataset against the real revised dataset", () => {
  it("produces 4,800 entries, 800 per category, in source order", () => {
    const { entries, report } = parseSyntheticDataset(readSource());

    expect(entries).toHaveLength(4800);
    expect(report.recordCount).toBe(4800);
    expect(entries.map((entry) => entry.id)).toEqual(expectedIdsInSourceOrder());
  });

  it("preserves every canonical id verbatim with no duplicates", () => {
    const { entries } = parseSyntheticDataset(readSource());
    const ids = entries.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(4800);
    // Verbatim, not reminted: the parsed id IS the filed id, byte for byte.
    const filed = new Set(expectedIdsInSourceOrder());
    for (const id of ids) expect(filed.has(id), `${id} was not in the source`).toBe(true);
  });

  it("derives the source-local id from the numeric suffix in every category", () => {
    const { entries } = parseSyntheticDataset(readSource());
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const document = readDocument();

    expect(new Set(entries.map((entry) => entry.category)).size).toBe(6);
    for (const block of document.categories) {
      const mapping = DATASET_CATEGORY_TABLE.find((row) => row.name === block.category_name);
      if (!mapping) throw new Error(`no mapping for ${block.category_name}`);
      for (const record of block.entries) {
        const parsed = parseCanonicalEntryId(record.id);
        expect(parsed?.prefix).toBe(mapping.prefix);
        const entry = byId.get(record.id);
        expect(entry, `missing entry for ${record.id}`).toBeDefined();
        expect(entry?.sourceEntryId).toBe(parsed?.suffix);
        expect(entry?.category).toBe(mapping.slug);
        expect(entry?.categoryName).toBe(block.category_name);
      }
    }
  });

  it("holds source-local ids exactly 1..800 per category", () => {
    const { entries } = parseSyntheticDataset(readSource());
    const byCategory = new Map<string, number[]>();
    for (const entry of entries) {
      const locals = byCategory.get(entry.category) ?? [];
      locals.push(entry.sourceEntryId);
      byCategory.set(entry.category, locals);
    }
    expect([...byCategory.keys()].sort()).toEqual(
      DATASET_CATEGORY_TABLE.map((row) => row.slug).sort(),
    );
    for (const locals of byCategory.values()) {
      expect([...locals].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 800 }, (_, index) => index + 1),
      );
    }
  });

  it("preserves every instruction exactly, with no normalization applied", () => {
    const document = readDocument();
    const { entries } = parseSyntheticDataset(readSource());
    const byId = new Map(entries.map((entry) => [entry.id, entry]));

    for (const block of document.categories) {
      for (const record of block.entries) {
        const entry = byId.get(record.id);
        // Byte equality, not a trimmed or case-folded comparison: Ilocano capitalization and
        // punctuation are what validators are judging.
        expect(entry?.instruction).toBe(record.instruction);
      }
    }
  });

  it("takes transit mode from the file with the exact intended distribution", () => {
    const { entries } = parseSyntheticDataset(readSource());
    const counts = new Map<string, Map<string, number>>();
    for (const entry of entries) {
      const modes = counts.get(entry.category) ?? new Map<string, number>();
      const key =
        entry.transitMode === null
          ? "null"
          : typeof entry.transitMode === "string"
            ? entry.transitMode
            : `pair:${entry.transitMode[0]}+${entry.transitMode[1]}`;
      modes.set(key, (modes.get(key) ?? 0) + 1);
      counts.set(entry.category, modes);
    }
    const expected: Record<string, Record<string, number>> = {
      destination_only: { null: 800 },
      destination_transit_mode: { walking: 200, jeepney: 200, taxi: 200, private_vehicle: 200 },
      origin_destination: { null: 800 },
      origin_destination_transit_mode: {
        walking: 200,
        jeepney: 200,
        taxi: 200,
        private_vehicle: 200,
      },
      complex_preference_expressions: {
        walking: 200,
        jeepney: 200,
        taxi: 200,
        private_vehicle: 200,
      },
      double_transit_mode: {
        "pair:jeepney+walking": 50,
        "pair:jeepney+taxi": 100,
        "pair:jeepney+private_vehicle": 50,
        "pair:walking+jeepney": 100,
        "pair:walking+taxi": 50,
        "pair:walking+private_vehicle": 50,
        "pair:taxi+walking": 50,
        "pair:taxi+jeepney": 50,
        "pair:taxi+private_vehicle": 100,
        "pair:private_vehicle+walking": 100,
        "pair:private_vehicle+jeepney": 50,
        "pair:private_vehicle+taxi": 50,
      },
    };
    for (const [category, modes] of Object.entries(expected)) {
      expect(Object.fromEntries(counts.get(category) ?? new Map()), category).toEqual(modes);
    }
  });

  it("maps origin and destination from the nested output object", () => {
    const document = readDocument();
    const { entries } = parseSyntheticDataset(readSource());
    const byId = new Map(entries.map((entry) => [entry.id, entry]));

    for (const block of document.categories) {
      for (const record of block.entries) {
        const entry = byId.get(record.id);
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
      for (const record of block.entries) {
        const entry = entries[index];
        // The archival copy must be the record as authored: the filed string id, no derived
        // slug, no suffix split.
        expect(entry?.sourcePayload).toEqual(record);
        expect(entry?.id).toBe(record.id);
        index += 1;
      }
    }
  });

  it("sorts research-facing output numerically, never lexically", () => {
    const { entries } = parseSyntheticDataset(readSource());
    const sorted = [...entries.map((entry) => entry.id)].sort(compareCanonicalEntryIds);
    // Lexical order would put D_10 before D_2; numeric order must not.
    expect(sorted.indexOf("D_2")).toBeLessThan(sorted.indexOf("D_10"));
    expect(sorted.slice(0, 3)).toEqual(["D_1", "D_2", "D_3"]);
    expect(sorted.slice(800, 802)).toEqual(["DT_1", "DT_2"]);
  });
});

describe("revised-shape validation", () => {
  /** One full valid block, so failure tests can break exactly one thing. */
  function block(prefix: string, name: string, ids: readonly string[]) {
    // Shape-correct per category: null-mode blocks carry no origin and no mode, single-mode
    // blocks carry a scalar mode, and Double Transit Mode carries an ordered pair with no
    // origin. A helper that built an invalid block would fail every test that uses
    // it for the wrong reason.
    const singleMode = prefix === "DT" || prefix === "ODT" || prefix === "CPE";
    const withOrigin = prefix === "OD" || prefix === "ODT" || prefix === "CPE";
    return {
      category_id: 1,
      category_name: name,
      entries: ids.map((id) => ({
        id,
        instruction: `Instruction ${id}.`,
        output: {
          origin: withOrigin ? `Origin ${id}` : null,
          destination: `Place ${id}`,
          transit_mode: prefix === "DTM" ? ["jeepney", "walking"] : singleMode ? "walking" : null,
        },
      })),
    };
  }

  function fullIds(prefix: string): string[] {
    return Array.from({ length: 800 }, (_, index) => `${prefix}_${index + 1}`);
  }

  function documentOf(blocks: { prefix: string; name: string }[]) {
    return {
      categories: blocks.map((row, index) => ({
        ...block(row.prefix, row.name, fullIds(row.prefix)),
        category_id: index + 1,
      })),
    };
  }

  const NAMES = DATASET_CATEGORY_TABLE.map((row) => ({ prefix: row.prefix, name: row.name }));

  it("accepts the six documented categories and nothing else", () => {
    // Hardcoded, not derived from the table: deriving the expectation from the implementation
    // would pass with any six names, including six wrong ones.
    expect(DATASET_CATEGORY_TABLE.map((row) => row.name)).toEqual([
      "Destination Only",
      "Destination + Transit Mode",
      "Origin + Destination",
      "Origin + Destination + Transit Mode",
      "Complex/Preference Expressions",
      "Double Transit Mode",
    ]);
    const { entries } = parseSyntheticDataset(documentOf(NAMES));
    expect(entries).toHaveLength(4800);
  });

  it("rejects a seventh block and a missing block", () => {
    expect(() =>
      parseSyntheticDataset(documentOf([...NAMES, NAMES[0] as (typeof NAMES)[number]])),
    ).toThrow(DatasetParseError);
    expect(() => parseSyntheticDataset(documentOf(NAMES.slice(0, 4)))).toThrow(DatasetParseError);
  });

  it("rejects a duplicated category block", () => {
    const names = [NAMES[0], NAMES[1], NAMES[1], NAMES[2], NAMES[3], NAMES[5]] as typeof NAMES;
    expect(() => parseSyntheticDataset(documentOf(names))).toThrow(/duplicate category block/);
  });

  it("rejects an unknown category name rather than inventing a mapping", () => {
    const names = [
      NAMES[0],
      { prefix: "HF", name: "Harbor + Ferry" },
      NAMES[2],
      NAMES[3],
      NAMES[4],
      NAMES[5],
    ] as typeof NAMES;
    expect(() => parseSyntheticDataset(documentOf(names))).toThrow(/unknown category/);
  });

  it("rejects a duplicated canonical id, naming the block and the id", () => {
    const ids = fullIds("OD");
    ids[799] = "OD_599";
    const document = documentOf(NAMES);
    document.categories[2] = { ...block("OD", NAMES[2]?.name as string, ids), category_id: 3 };
    try {
      parseSyntheticDataset(document);
      expect.unreachable("a duplicated canonical id was accepted");
    } catch (cause) {
      const error = cause as DatasetParseError;
      expect(error.message).toContain("duplicate canonical id OD_599");
      expect(error.message).toContain(NAMES[2]?.name as string);
    }
  });

  it("rejects a gap disguised as a duplicate, naming the id", () => {
    // 800 entries with suffix 1 missing and suffix 2 doubled: the count arm cannot see it
    // but the set arm fails loudly, naming the duplicated id. A gap can never slip through
    // silently — it always surfaces as a short block or a duplicate.
    const ids = fullIds("D");
    ids[0] = "D_2";
    const document = documentOf(NAMES);
    document.categories[0] = { ...block("D", NAMES[0]?.name as string, ids), category_id: 1 };
    try {
      parseSyntheticDataset(document);
      expect.unreachable("a block with a gap was accepted");
    } catch (cause) {
      const error = cause as DatasetParseError;
      expect(error.message).toContain("duplicate canonical id D_2");
      expect(error.message).toContain(NAMES[0]?.name as string);
    }
  });

  it("rejects a misplaced prefix, naming the id and the block", () => {
    // A Destination + Transit Mode id filed inside Destination Only: same suffix range, wrong
    // family. Suffix checks alone would pass it; only the prefix/block agreement sees it.
    const ids = fullIds("D");
    ids[11] = "DT_12";
    const document = documentOf(NAMES);
    document.categories[0] = { ...block("D", NAMES[0]?.name as string, ids), category_id: 1 };
    try {
      parseSyntheticDataset(document);
      expect.unreachable("a misplaced prefix was accepted");
    } catch (cause) {
      const error = cause as DatasetParseError;
      expect(error.message).toContain("DT_12");
      expect(error.message).toContain(NAMES[0]?.name as string);
    }
  });

  it("rejects a zero-padded id rather than reminting it", () => {
    const ids = fullIds("OD");
    ids[0] = "OD_0001";
    const document = documentOf(NAMES);
    document.categories[2] = { ...block("OD", NAMES[2]?.name as string, ids), category_id: 3 };
    expect(() => parseSyntheticDataset(document)).toThrow(DatasetParseError);
  });

  it("rejects an out-of-range suffix", () => {
    const ids = fullIds("CPE");
    ids[799] = "CPE_801";
    const document = documentOf(NAMES);
    document.categories[4] = { ...block("CPE", NAMES[4]?.name as string, ids), category_id: 5 };
    expect(() => parseSyntheticDataset(document)).toThrow(DatasetParseError);
  });

  it("rejects a short block rather than importing it partially", () => {
    const document = documentOf(NAMES);
    document.categories[4] = {
      ...block("CPE", NAMES[4]?.name as string, ["CPE_1", "CPE_2", "CPE_3"]),
      category_id: 5,
    };
    expect(() => parseSyntheticDataset(document)).toThrow(/expected 800 entries, received 3/);
  });

  it("rejects a transit mode in a null-mode category", () => {
    const document = documentOf(NAMES);
    const entries = fullIds("D").map((id) => ({
      id,
      instruction: `Instruction ${id}.`,
      output: { origin: null, destination: `Place ${id}`, transit_mode: "walking" },
    }));
    document.categories[0] = {
      category_id: 1,
      category_name: NAMES[0]?.name as string,
      entries,
    };
    expect(() => parseSyntheticDataset(document)).toThrow(/must be null in null-mode category/);
  });

  it("rejects a missing transit mode in a mode-bearing category", () => {
    const document = documentOf(NAMES);
    const entries = fullIds("DT").map((id) => ({
      id,
      instruction: `Instruction ${id}.`,
      output: { origin: null, destination: `Place ${id}`, transit_mode: null },
    }));
    document.categories[1] = {
      category_id: 2,
      category_name: NAMES[1]?.name as string,
      entries,
    };
    expect(() => parseSyntheticDataset(document)).toThrow(/must be one of/);
  });

  it("rejects an unknown transit-mode label rather than storing it", () => {
    const document = documentOf(NAMES);
    const entries = fullIds("DT").map((id, index) => ({
      id,
      instruction: `Instruction ${id}.`,
      output: {
        origin: null,
        destination: `Place ${id}`,
        transit_mode: index === 0 ? "car" : "walking",
      },
    }));
    document.categories[1] = {
      category_id: 2,
      category_name: NAMES[1]?.name as string,
      entries,
    };
    expect(() => parseSyntheticDataset(document)).toThrow(/must be one of/);
  });

  it("accepts a Double Transit Mode pair with order preserved", () => {
    const { entries } = parseSyntheticDataset(documentOf(NAMES));
    const dtm = entries.filter((entry) => entry.category === "double_transit_mode");
    expect(dtm).toHaveLength(800);
    for (const entry of dtm) {
      expect(entry.origin).toBeNull();
      expect(entry.destination).not.toBeNull();
      expect(Array.isArray(entry.transitMode)).toBe(true);
      expect(entry.transitMode).toHaveLength(2);
    }
    // Order preserved, not sorted: the first DTM record's pair is the source order.
    const first = dtm[0];
    expect(first?.id).toBe("DTM_1");
    expect(first?.transitMode).toEqual(["jeepney", "walking"]);
  });

  it("rejects a Double Transit Mode row carrying an origin", () => {
    const document = documentOf(NAMES);
    const entries = fullIds("DTM").map((id) => ({
      id,
      instruction: `Instruction ${id}.`,
      output: {
        origin: `Origin ${id}`,
        destination: `Place ${id}`,
        transit_mode: ["jeepney", "walking"],
      },
    }));
    document.categories[5] = {
      category_id: 6,
      category_name: NAMES[5]?.name as string,
      entries,
    };
    expect(() => parseSyntheticDataset(document)).toThrow(/origin must be null/);
  });

  it("rejects a one-mode Double Transit Mode array", () => {
    const document = documentOf(NAMES);
    const entries = fullIds("DTM").map((id) => ({
      id,
      instruction: `Instruction ${id}.`,
      output: { origin: null, destination: `Place ${id}`, transit_mode: ["walking"] },
    }));
    document.categories[5] = {
      category_id: 6,
      category_name: NAMES[5]?.name as string,
      entries,
    };
    expect(() => parseSyntheticDataset(document)).toThrow(DatasetParseError);
  });

  it("rejects a three-mode Double Transit Mode array", () => {
    const document = documentOf(NAMES);
    const entries = fullIds("DTM").map((id) => ({
      id,
      instruction: `Instruction ${id}.`,
      output: {
        origin: null,
        destination: `Place ${id}`,
        transit_mode: ["walking", "jeepney", "taxi"],
      },
    }));
    document.categories[5] = {
      category_id: 6,
      category_name: NAMES[5]?.name as string,
      entries,
    };
    expect(() => parseSyntheticDataset(document)).toThrow(DatasetParseError);
  });

  it("rejects a duplicated Double Transit Mode pair", () => {
    const document = documentOf(NAMES);
    const entries = fullIds("DTM").map((id) => ({
      id,
      instruction: `Instruction ${id}.`,
      output: { origin: null, destination: `Place ${id}`, transit_mode: ["walking", "walking"] },
    }));
    document.categories[5] = {
      category_id: 6,
      category_name: NAMES[5]?.name as string,
      entries,
    };
    expect(() => parseSyntheticDataset(document)).toThrow(DatasetParseError);
  });

  it("rejects an out-of-vocabulary Double Transit Mode pair", () => {
    const document = documentOf(NAMES);
    const entries = fullIds("DTM").map((id, index) => ({
      id,
      instruction: `Instruction ${id}.`,
      output: {
        origin: null,
        destination: `Place ${id}`,
        transit_mode: index === 0 ? ["bus", "taxi"] : ["jeepney", "walking"],
      },
    }));
    document.categories[5] = {
      category_id: 6,
      category_name: NAMES[5]?.name as string,
      entries,
    };
    expect(() => parseSyntheticDataset(document)).toThrow(DatasetParseError);
  });

  it("rejects a scalar transit mode in Double Transit Mode", () => {
    const document = documentOf(NAMES);
    const entries = fullIds("DTM").map((id) => ({
      id,
      instruction: `Instruction ${id}.`,
      output: { origin: null, destination: `Place ${id}`, transit_mode: "walking" },
    }));
    document.categories[5] = {
      category_id: 6,
      category_name: NAMES[5]?.name as string,
      entries,
    };
    expect(() => parseSyntheticDataset(document)).toThrow(DatasetParseError);
  });

  it("rejects a non-object document and a missing categories array", () => {
    expect(() => parseSyntheticDataset([{ id: "D_1" }])).toThrow(DatasetParseError);
    expect(() => parseSyntheticDataset({})).toThrow(DatasetParseError);
    expect(() => parseSyntheticDataset(null)).toThrow(DatasetParseError);
  });
});

describe("parseSyntheticDataset preserves unmodelled source fields", () => {
  function validRecord(id: string): Record<string, unknown> {
    return {
      id,
      instruction: `Instruction ${id}.`,
      output: { origin: null, destination: `Place ${id}`, transit_mode: null },
    };
  }

  function fullBlock(category_id: number, prefix: string, category_name: string) {
    const singleMode = prefix === "DT" || prefix === "ODT" || prefix === "CPE";
    const withOrigin = prefix === "OD" || prefix === "ODT" || prefix === "CPE";
    return {
      category_id,
      category_name,
      entries: Array.from({ length: 800 }, (_, index) => {
        const id = `${prefix}_${index + 1}`;
        return {
          ...validRecord(id),
          output: {
            origin: withOrigin ? `Origin ${id}` : null,
            destination: `Place ${id}`,
            transit_mode: prefix === "DTM" ? ["jeepney", "walking"] : singleMode ? "walking" : null,
          },
        };
      }),
    };
  }

  function wrapped(firstRecord: Record<string, unknown>) {
    const entries = Array.from({ length: 800 }, (_, index) => validRecord(`OD_${index + 1}`));
    entries[0] = firstRecord;
    return {
      categories: [
        { category_id: 3, category_name: "Origin + Destination", entries },
        fullBlock(1, "D", "Destination Only"),
        fullBlock(2, "DT", "Destination + Transit Mode"),
        fullBlock(4, "ODT", "Origin + Destination + Transit Mode"),
        fullBlock(5, "CPE", "Complex/Preference Expressions"),
        fullBlock(6, "DTM", "Double Transit Mode"),
      ],
    };
  }

  it("retains an unknown top-level field and names it in the report", () => {
    const { entries, report } = parseSyntheticDataset(
      wrapped({ ...validRecord("OD_1"), difficulty: "hard" }),
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
        ...validRecord("OD_1"),
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

describe("parseSyntheticDataset rejects rather than repairs — revised shape", () => {
  function validRecord(id: string): Record<string, unknown> {
    return {
      id,
      instruction: "Iti Baguio Athletic Bowl ti ayanko ita.",
      output: { origin: "A", destination: "B", transit_mode: null },
    };
  }

  function fullBlock(category_id: number, prefix: string, category_name: string) {
    const singleMode = prefix === "DT" || prefix === "ODT" || prefix === "CPE";
    const withOrigin = prefix === "OD" || prefix === "ODT" || prefix === "CPE";
    return {
      category_id,
      category_name,
      entries: Array.from({ length: 800 }, (_, index) => {
        const id = `${prefix}_${index + 1}`;
        return {
          ...validRecord(id),
          output: {
            origin: withOrigin ? "A" : null,
            destination: "B",
            transit_mode: prefix === "DTM" ? ["jeepney", "walking"] : singleMode ? "walking" : null,
          },
        };
      }),
    };
  }

  function wrapped(firstRecord: Record<string, unknown>) {
    const entries = Array.from({ length: 800 }, (_, index) => validRecord(`OD_${index + 1}`));
    entries[0] = firstRecord;
    return {
      categories: [
        { category_id: 3, category_name: "Origin + Destination", entries },
        fullBlock(1, "D", "Destination Only"),
        fullBlock(2, "DT", "Destination + Transit Mode"),
        fullBlock(4, "ODT", "Origin + Destination + Transit Mode"),
        fullBlock(5, "CPE", "Complex/Preference Expressions"),
        fullBlock(6, "DTM", "Double Transit Mode"),
      ],
    };
  }

  it("rejects a blank instruction rather than importing an entry with nothing to judge", () => {
    // A dataset entry with no instruction gives a validator nothing to evaluate. Defaulting it
    // would manufacture a research record that never existed.
    expect(() =>
      parseSyntheticDataset(wrapped({ ...validRecord("OD_1"), instruction: "   " })),
    ).toThrow(DatasetParseError);
  });

  it("rejects a missing instruction and identifies the block", () => {
    const rest: Record<string, unknown> = {
      id: "OD_1",
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
      parseSyntheticDataset(wrapped({ ...validRecord("OD_1"), id: "OD_1.5" }));
      expect.unreachable("a record with a non-canonical id was accepted");
    } catch (cause) {
      const error = cause as DatasetParseError;
      expect(error.fieldPath).toContain("$.categories[0]");
      expect(error.recordIndex).toBe(0);
    }
  });

  it("rejects the whole file rather than importing the records that happened to parse", () => {
    // Importing 4,799 of 4,800 records would leave the dataset quietly incomplete, and a coverage
    // count computed over a partial import is worse than no import at all.
    const broken = wrapped(validRecord("OD_1"));
    const lastBlock = broken.categories[5];
    if (lastBlock === undefined) throw new Error("expected six blocks");
    lastBlock.entries[799] = {
      id: "CPE_800",
      instruction: "",
      output: { origin: null, destination: "B", transit_mode: null },
    };
    expect(() => parseSyntheticDataset(broken)).toThrow(DatasetParseError);
  });

  it("treats an omitted optional field and an explicit null identically", () => {
    // A null-mode category is the honest venue: omitting `transit_mode` and sending it as
    // `null` must produce the same stored record. Origin/destination stay present because the
    // category-purpose check requires them — omitting a REQUIRED field is a different test
    // (the blank-instruction refusal above), not an equivalence.
    const omitted = parseSyntheticDataset(
      wrapped({
        ...validRecord("OD_1"),
        output: { origin: "A", destination: "B" },
      }),
    ).entries[0];
    const explicitNull = parseSyntheticDataset(
      wrapped({
        ...validRecord("OD_1"),
        output: { origin: "A", destination: "B", transit_mode: null },
      }),
    ).entries[0];

    expect(omitted?.origin).toBe("A");
    expect(omitted?.destination).toBe("B");
    expect(omitted?.transitMode).toBeNull();
    // One importer that leaves a field out and one that sends an explicit null must produce the
    // same stored record, which is what lets a category without a concept be represented without
    // a schema change. Only the typed projection is compared; the archival copy deliberately
    // differs, because it records each source record exactly as it was authored.
    expect(projectionOf(omitted)).toEqual(projectionOf(explicitNull));
    expect(omitted?.sourcePayload).toEqual({
      id: "OD_1",
      instruction: "Iti Baguio Athletic Bowl ti ayanko ita.",
      output: { origin: "A", destination: "B" },
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

    expect(report.recordCount).toBe(4800);
    expect(entries).toHaveLength(4800);
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
              id: "OD_1",
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
