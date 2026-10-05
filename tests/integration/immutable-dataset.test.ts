import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Immutable research-source guard.
 *
 * `data/merged-ilocano-synthetic-data.json` is the research artifact for the thesis: five
 * category blocks of 800 entries each, the *input* to the platform, not a working file. A
 * validator's corrections are stored as separate response data and must never be written back
 * into it. `AGENTS.md` lists the `data/` source under "Boundaries — do not touch", and the
 * roadmap requires the source dataset to stay immutable.
 *
 * This test is the mechanical version of that rule. If a later change accidentally rewrites the
 * dataset — while "importing" it, while "normalising" it, or while fixing a typo — CI fails
 * here instead of the damage being discovered at adjudication time.
 *
 * It lives in the `integration` project because it reads the real repository file, not a fixture.
 *
 * (History, recorded rather than deleted: this guard previously pinned the 3,000-entry source
 * at SHA-256 `f7015b1b…` with 600 `DO_0001`-style records per block. The pre-study revision
 * replaced that file with the 4,000-entry verbatim-ID source below; the old constant described
 * a file that no longer exists, so it was replaced rather than kept.)
 */

const DATASET_PATH = path.resolve(process.cwd(), "data", "merged-ilocano-synthetic-data.json");

/**
 * SHA-256 of the committed file, read directly off the committed bytes.
 *
 * If this constant ever needs updating, that is a deliberate, reviewable act — it is the record
 * that the immutable research source changed. It must not be updated casually to silence a
 * failure.
 */
const EXPECTED_SHA256 = "0fc905d59af703bd9e876fe50d50667c15f499de351b9680434bbd0541927989";

const EXPECTED_CATEGORIES = [
  "Destination Only",
  "Destination + Transit Mode",
  "Origin + Destination",
  "Origin + Destination + Transit Mode",
  "Complex/Preference Expressions",
] as const;

const EXPECTED_ENTRIES_PER_CATEGORY = 800;

interface RawDatasetRecord {
  id: string;
  instruction: string;
  output: { origin: string | null; destination: string | null; transit_mode: string | null };
}

interface RawDatasetBlock {
  category_id: number;
  category_name: string;
  entries: RawDatasetRecord[];
}

async function readDatasetBytes(): Promise<Buffer> {
  return readFile(DATASET_PATH);
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readBlocks(): Promise<RawDatasetBlock[]> {
  const document = JSON.parse((await readDatasetBytes()).toString("utf8")) as {
    categories: RawDatasetBlock[];
  };
  return document.categories;
}

describe("immutable research source", () => {
  it("has not been modified", async () => {
    const bytes = await readDatasetBytes();
    expect(sha256(bytes)).toBe(EXPECTED_SHA256);
  });

  it("contains exactly five category blocks of 800 entries", async () => {
    const blocks = await readBlocks();
    expect(blocks.map((block) => block.category_name)).toEqual([...EXPECTED_CATEGORIES]);
    for (const block of blocks) {
      expect(block.entries).toHaveLength(EXPECTED_ENTRIES_PER_CATEGORY);
    }
  });

  it("holds the exact canonical id set with no gaps or duplicates per block", async () => {
    // Canonical ids carry their category prefix, so the per-block check also proves no id from
    // one category leaked into another.
    const expectedPrefixes = ["D_", "DT_", "OD_", "ODT_", "CPE_"];
    const blocks = await readBlocks();
    for (const [index, block] of blocks.entries()) {
      const ids = block.entries.map((record) => record.id);
      expect(new Set(ids).size).toBe(EXPECTED_ENTRIES_PER_CATEGORY);
      const expected = new Set(
        Array.from(
          { length: EXPECTED_ENTRIES_PER_CATEGORY },
          (_, n) => `${expectedPrefixes[index]}${n + 1}`,
        ),
      );
      expect(new Set(ids)).toEqual(expected);
    }
  });

  it("has a non-empty instruction on every record", async () => {
    const blocks = await readBlocks();
    for (const block of blocks) {
      for (const record of block.entries) {
        expect(record.instruction.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("the guard actually detects tampering", () => {
  /**
   * Proves the hash comparison is load-bearing rather than vacuously true, by running the same
   * check against a deliberately altered COPY held in memory. The real file is never written to —
   * `AGENTS.md` forbids modifying it, and a test that modifies research source to test its own
   * guard would be self-defeating.
   */
  it("fails when a record's instruction is altered", async () => {
    const original = await readDatasetBytes();
    expect(sha256(original)).toBe(EXPECTED_SHA256);

    const document = JSON.parse(original.toString("utf8")) as {
      categories: RawDatasetBlock[];
    };
    const first = document.categories[0]?.entries[0];
    if (first === undefined) throw new Error("expected at least one entry");
    first.instruction = `${first.instruction} EDITED`;
    const tampered = Buffer.from(JSON.stringify(document), "utf8");

    expect(sha256(tampered)).not.toBe(EXPECTED_SHA256);
  });

  it("fails when a record is added", async () => {
    const original = await readDatasetBytes();
    const document = JSON.parse(original.toString("utf8")) as {
      categories: RawDatasetBlock[];
    };
    const first = document.categories[0]?.entries[0];
    if (first === undefined) throw new Error("expected at least one entry");
    document.categories[0]?.entries.push({ ...first });

    const total = document.categories.reduce((sum, block) => sum + block.entries.length, 0);
    expect(total).toBe(5 * EXPECTED_ENTRIES_PER_CATEGORY + 1);
    expect(sha256(Buffer.from(JSON.stringify(document), "utf8"))).not.toBe(EXPECTED_SHA256);
  });

  it("fails when a record's ID is rewritten, even with the same instruction", async () => {
    const original = await readDatasetBytes();
    const document = JSON.parse(original.toString("utf8")) as {
      categories: RawDatasetBlock[];
    };
    const first = document.categories[0]?.entries[0];
    if (first === undefined) throw new Error("expected at least one entry");
    first.id = "D_801";

    expect(sha256(Buffer.from(JSON.stringify(document), "utf8"))).not.toBe(EXPECTED_SHA256);
  });
});
