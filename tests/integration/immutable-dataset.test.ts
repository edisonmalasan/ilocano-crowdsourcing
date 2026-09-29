import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Immutable research-source guard.
 *
 * `data/ilocano-synthetic-data.json` is the starting research artifact for the thesis. It is the
 * *input* to the platform, not a working file: a validator's corrections are stored as separate
 * response data and must never be written back into it. `AGENTS.md` lists this file under
 * "Boundaries — do not touch", and the roadmap requires the source dataset to stay immutable.
 *
 * This test is the mechanical version of that rule. If a later change accidentally rewrites the
 * dataset — while "importing" it, while "normalising" it, or while fixing a typo — CI fails
 * here instead of the damage being discovered at adjudication time.
 *
 * It lives in the `integration` project because it reads the real repository file, not a fixture.
 */

const DATASET_PATH = path.resolve(process.cwd(), "data", "ilocano-synthetic-data.json");

/**
 * SHA-256 of the committed file. Recorded from the file as it exists at
 * `main` commit `81b3115` (and unchanged since).
 *
 * If this constant ever needs updating, that is a deliberate, reviewable act — it is the record
 * that the immutable research source changed. It must not be updated casually to silence a
 * failure.
 */
const EXPECTED_SHA256 = "39f757e61b70386b87ec1bb9410e881df342027bf580bed9c2f9beeb2f2e8965";

const EXPECTED_RECORD_COUNT = 600;

interface RawDatasetRecord {
  id: string;
  instruction: string;
  output: { origin: string; destination: string; transit_mode: string | null };
}

async function readDatasetBytes(): Promise<Buffer> {
  return readFile(DATASET_PATH);
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("immutable research source", () => {
  it("has not been modified", async () => {
    const bytes = await readDatasetBytes();
    expect(sha256(bytes)).toBe(EXPECTED_SHA256);
  });

  it("contains exactly 600 records", async () => {
    const records = JSON.parse((await readDatasetBytes()).toString("utf8")) as RawDatasetRecord[];
    expect(records).toHaveLength(EXPECTED_RECORD_COUNT);
  });

  it("has unique, well-formed entry IDs spanning OD_0001 to OD_0600", async () => {
    const records = JSON.parse((await readDatasetBytes()).toString("utf8")) as RawDatasetRecord[];
    const ids = records.map((record) => record.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids).size).toBe(EXPECTED_RECORD_COUNT);

    for (const id of ids) {
      expect(id).toMatch(/^OD_\d{4}$/);
    }

    const sorted = [...ids].sort();
    expect(sorted[0]).toBe("OD_0001");
    expect(sorted[sorted.length - 1]).toBe("OD_0600");
  });

  it("has a non-empty instruction and non-null origin/destination on every record", async () => {
    const records = JSON.parse((await readDatasetBytes()).toString("utf8")) as RawDatasetRecord[];

    for (const record of records) {
      expect(record.instruction.trim().length).toBeGreaterThan(0);
      expect(record.output.origin).not.toBeNull();
      expect(record.output.destination).not.toBeNull();
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

    const records = JSON.parse(original.toString("utf8")) as RawDatasetRecord[];
    records[0] = { ...records[0], instruction: `${records[0].instruction} EDITED` };
    const tampered = Buffer.from(JSON.stringify(records, null, 4), "utf8");

    expect(sha256(tampered)).not.toBe(EXPECTED_SHA256);
  });

  it("fails when a record is added", async () => {
    const original = await readDatasetBytes();
    const records = JSON.parse(original.toString("utf8")) as RawDatasetRecord[];
    records.push({ ...records[0], id: "OD_0999" });
    const tampered = Buffer.from(JSON.stringify(records, null, 4), "utf8");

    expect(records).toHaveLength(EXPECTED_RECORD_COUNT + 1);
    expect(sha256(tampered)).not.toBe(EXPECTED_SHA256);
  });

  it("fails when a record's ID is rewritten, even with the same instruction", async () => {
    const original = await readDatasetBytes();
    const records = JSON.parse(original.toString("utf8")) as RawDatasetRecord[];
    records[0] = { ...records[0], id: "OD_0601" };
    const tampered = Buffer.from(JSON.stringify(records, null, 4), "utf8");

    expect(sha256(tampered)).not.toBe(EXPECTED_SHA256);
  });
});
